import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { scrapeProduct, siteOf, ScrapeError } from "@/lib/scraper";
import { sendMessage, inr } from "@/lib/telegram";
import { ensureSchedulerRunning } from "@/lib/scheduler";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const validChat = (c) => /^-?\d{5,20}$/.test(String(c || ""));

export async function GET(req) {
  try {
    ensureSchedulerRunning();
    const d = await initDb();
    const user = await getUserFromRequest(req);
    let chatId = new URL(req.url).searchParams.get("chat_id");
    if (!chatId && user?.chat_id) {
      chatId = user.chat_id;
    }

    let rows = [];
    if (user) {
      const q = chatId
        ? "SELECT * FROM products WHERE user_id = ? OR chat_id = ? ORDER BY id DESC"
        : "SELECT * FROM products WHERE user_id = ? ORDER BY id DESC";
      const args = chatId ? [user.id, chatId] : [user.id];
      const r = await d.execute({ sql: q, args });
      rows = r.rows;
    } else if (validChat(chatId)) {
      const r = await d.execute({ sql: "SELECT * FROM products WHERE chat_id = ? ORDER BY id DESC", args: [chatId] });
      rows = r.rows;
    } else {
      return NextResponse.json({ products: [] });
    }

    if (!rows.length) return NextResponse.json({ products: [] });

    const ids = rows.map((r) => Number(r.id));
    const hist = await d.execute({
      sql: `SELECT product_id, price, checked_at FROM price_history
            WHERE product_id IN (${ids.map(() => "?").join(",")}) ORDER BY checked_at ASC, id ASC`,
      args: ids,
    });
    const byProduct = {};
    for (const h of hist.rows) (byProduct[h.product_id] ??= []).push({ price: h.price, checked_at: h.checked_at });

    return NextResponse.json({
      products: rows.map((r) => ({
        ...r,
        check_interval: Number(r.check_interval) || 60,
        history: (byProduct[r.id] || []).slice(-30),
      })),
    });
  } catch (e) {
    console.error("GET /api/products error:", e);
    return NextResponse.json({ error: e.message || "Failed to fetch products" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    ensureSchedulerRunning();
    const user = await getUserFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const url = String(body.url || "").trim();
    const target = Number(body.target_price);
    let chatId = String(body.chat_id || "").trim();
    if (!chatId && user?.chat_id) {
      chatId = user.chat_id;
    }
    const checkInterval = Math.max(1, Number(body.check_interval) || 60);

    if (!siteOf(url)) return NextResponse.json({ error: "Enter an Amazon or Flipkart product link." }, { status: 400 });
    if (!(target > 0)) return NextResponse.json({ error: "Target price must be greater than 0." }, { status: 400 });
    if (!validChat(chatId)) return NextResponse.json({ error: "A valid Telegram Chat ID is required. Link your Telegram account or enter your chat ID." }, { status: 400 });

    // Try to read the current price now; if the site blocks us, save anyway and let the cron retry.
    let scraped = null;
    let warning = null;
    try {
      scraped = await scrapeProduct(url);
    } catch (e) {
      warning = e instanceof ScrapeError ? e.message : "Could not read the page.";
    }

    const d = await initDb();
    if (user && chatId && !user.chat_id) {
      await d.execute({ sql: "UPDATE users SET chat_id = ? WHERE id = ?", args: [chatId, user.id] });
    }

    const res = await d.execute({
      sql: "INSERT INTO products (url, title, current_price, target_price, chat_id, check_interval, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [url, scraped?.title ?? null, scraped?.price ?? null, target, chatId, checkInterval, user?.id ?? null],
    });
    const id = Number(res.lastInsertRowid);
    if (scraped) await d.execute({ sql: "INSERT INTO price_history (product_id, price) VALUES (?, ?)", args: [id, scraped.price] });

    await sendMessage(
      chatId,
      `✅ Tracking started\n${scraped?.title || url}\nNow: ${scraped ? inr(scraped.price) : "pending"} · Target: ${inr(target)}\nChecking every: ${checkInterval} minutes`
    );
    return NextResponse.json({ id, warning }, { status: 201 });
  } catch (e) {
    console.error("POST /api/products error:", e);
    return NextResponse.json({ error: e.message || "Failed to add product" }, { status: 500 });
  }
}
