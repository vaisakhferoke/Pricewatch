import axios from "axios";
import * as cheerio from "cheerio";

const UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
];
const LANGS = ["en-IN,en;q=0.9", "en-US,en;q=0.9,hi;q=0.6", "en-GB,en;q=0.8"];
const REFERERS = ["https://www.google.com/", "https://www.google.co.in/", "https://www.bing.com/"];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const jitter = (min, max) => min + Math.random() * (max - min);

export class ScrapeError extends Error {
  // code: BLOCKED | NOT_FOUND | HTTP_ERROR | NETWORK | PARSE | UNSUPPORTED
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function siteOf(url) {
  let h;
  try { h = new URL(url).hostname.toLowerCase(); } catch { return null; }
  if (/(^|\.)amazon\.[a-z.]+$|(^|\.)amzn\.(in|to|com)$/.test(h)) return "amazon";
  if (/(^|\.)flipkart\.com$|(^|\.)fkrt\.[a-z]+$/.test(h)) return "flipkart";
  return null;
}

export function parsePrice(text) {
  if (text == null) return null;
  const m = String(text).replace(/,/g, "").match(/\d+(\.\d+)?/);
  const n = m ? parseFloat(m[0]) : NaN;
  return n > 0 ? n : null;
}

const SELECTORS = {
  amazon: {
    title: ["#productTitle", "#title"],
    price: [
      "#corePrice_feature_div .a-price .a-offscreen",
      "span.priceToPay .a-offscreen",
      "#corePriceDisplay_desktop_feature_div .a-offscreen",
      "#priceblock_dealprice",
      "#priceblock_ourprice",
      ".a-price .a-offscreen",
    ],
  },
  flipkart: {
    // Flipkart class names are obfuscated and change often, so JSON-LD is tried first.
    title: ["span.VU-ZEz", "span.B_NuCI", "h1"],
    price: ["div.Nx9bqj.CxhGGd", "div._30jeq3._16Jk6d", "div.Nx9bqj", "div._30jeq3"],
  },
};

const BLOCK_MARKERS = [
  "validateCaptcha",
  "Enter the characters you see below",
  "api-services-support@amazon.com",
  "Sorry, we just need to make sure you're not a robot",
  "Access Denied",
  "Are you a human",
];

function requestHeaders() {
  return {
    "User-Agent": pick(UAS),
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": pick(LANGS),
    "Accept-Encoding": "gzip, deflate, br",
    Referer: pick(REFERERS),
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
  };
}

async function get(url, viaProxy) {
  const target = viaProxy
    ? `https://api.scraperapi.com/?api_key=${process.env.SCRAPER_API_KEY}&country_code=in&url=${encodeURIComponent(url)}`
    : url;
  return axios.get(target, {
    headers: viaProxy ? undefined : requestHeaders(),
    timeout: 15000,
    maxRedirects: 5,
    validateStatus: () => true,
    responseType: "text",
  });
}

async function fetchHtml(url, { retries = 3 } = {}) {
  let lastErr = new ScrapeError("NETWORK", "Request failed");
  for (let attempt = 1; attempt <= retries; attempt++) {
    // Escalate to the proxy on the last attempt if one is configured.
    const viaProxy = attempt === retries && !!process.env.SCRAPER_API_KEY;
    try {
      await sleep(jitter(400, 1500) * attempt);
      const res = await get(url, viaProxy);
      const html = typeof res.data === "string" ? res.data : "";
      const blocked = res.status === 429 || res.status === 503 || BLOCK_MARKERS.some((m) => html.includes(m));
      if (res.status === 404) throw new ScrapeError("NOT_FOUND", "Page not found (404)");
      if (blocked) {
        lastErr = new ScrapeError("BLOCKED", `Blocked or CAPTCHA served (HTTP ${res.status})`);
      } else if (res.status >= 400) {
        lastErr = new ScrapeError("HTTP_ERROR", `HTTP ${res.status}`);
      } else if (html.length < 2000) {
        lastErr = new ScrapeError("BLOCKED", "Suspiciously empty response");
      } else {
        return html;
      }
    } catch (e) {
      if (e instanceof ScrapeError && e.code === "NOT_FOUND") throw e;
      lastErr = e instanceof ScrapeError ? e : new ScrapeError("NETWORK", e.message);
    }
    await sleep(jitter(1500, 3500) * attempt); // back off before the next attempt
  }
  throw lastErr;
}

function fromJsonLd($) {
  let found = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    try {
      const data = JSON.parse($(el).contents().text());
      const nodes = [].concat(data, data?.["@graph"] || []).flat();
      for (const n of nodes) {
        const types = [].concat(n?.["@type"] || []);
        if (!types.includes("Product")) continue;
        const offer = [].concat(n.offers || [])[0];
        const price = parsePrice(offer?.price ?? offer?.lowPrice);
        if (price) { found = { title: n.name || null, price }; return; }
      }
    } catch { /* ignore malformed JSON-LD */ }
  });
  return found;
}

const firstText = ($, sels) => {
  for (const s of sels) {
    const t = $(s).first().text().trim();
    if (t) return t;
  }
  return null;
};

export async function scrapeProduct(url) {
  const site = siteOf(url);
  if (!site) throw new ScrapeError("UNSUPPORTED", "Only Amazon and Flipkart URLs are supported");

  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const sel = SELECTORS[site];

  const ld = fromJsonLd($);
  const title =
    firstText($, sel.title) || ld?.title || $('meta[property="og:title"]').attr("content") || null;
  const price =
    (site === "flipkart" && ld?.price) ||
    parsePrice(firstText($, sel.price)) ||
    ld?.price ||
    parsePrice($('meta[itemprop="price"]').attr("content")) ||
    null;

  if (!price) {
    throw new ScrapeError("PARSE", "Price not found: layout changed, out of stock, or a bot-check page");
  }
  return { title: title?.slice(0, 200) || null, price };
}
