import { Telegraf } from "telegraf";
import { initDb } from "./db";

let bot;
let wired = false;

export function getBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN) return null;
  bot ??= new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
  return bot;
}

export const inr = (n) => (n == null ? "-" : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendMessage(chatId, html) {
  const b = getBot();
  if (!b) {
    console.warn("⚠️  [Telegram] Cannot send message: TELEGRAM_BOT_TOKEN not configured");
    return false;
  }
  try {
    await b.telegram.sendMessage(chatId, html, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    console.log(`📱 [Telegram Alert Sent] Delivered notification to chat ID: ${chatId}`);
    return true;
  } catch (e) {
    console.error("❌ Telegram send failed:", chatId, e.message);
    return false;
  }
}

export function sendPriceAlert({ chatId, title, url, price, previous, target, reason }) {
  const headline = reason === "target" ? "🎯 Target price reached" : "📉 Big price drop";
  const lines = [
    `<b>${headline}</b>`,
    esc(title || url),
    "",
    `Now: <b>${inr(price)}</b>`,
    previous ? `Was: ${inr(previous)} (−${(((previous - price) / previous) * 100).toFixed(1)}%)` : null,
    `Your target: ${inr(target)}`,
    "",
    `<a href="${esc(url)}">Open product</a>`,
  ].filter((l) => l !== null);
  return sendMessage(chatId, lines.join("\n"));
}

// Commands: /start tells people their chat ID, /list shows what they track.
export function getWiredBot() {
  const b = getBot();
  if (!b || wired) return b;
  b.start((ctx) =>
    ctx.replyWithHTML(`Your chat ID is <code>${ctx.chat.id}</code>.\nPaste it into the dashboard to get price alerts here.`)
  );
  b.command("list", async (ctx) => {
    const d = await initDb();
    const { rows } = await d.execute({
      sql: "SELECT title, url, current_price, target_price FROM products WHERE chat_id = ? ORDER BY id DESC LIMIT 20",
      args: [String(ctx.chat.id)],
    });
    if (!rows.length) return ctx.reply("You aren't tracking anything yet.");
    return ctx.replyWithHTML(
      rows.map((r) => `• ${esc(r.title || r.url)}\n  ${inr(r.current_price)} (target ${inr(r.target_price)})`).join("\n"),
      { link_preview_options: { is_disabled: true } }
    );
  });
  wired = true;
  return b;
}
