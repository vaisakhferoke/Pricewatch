import { NextResponse } from "next/server";
import { getWiredBot } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const bot = getWiredBot();
  if (!bot) return NextResponse.json({ error: "Bot token not set" }, { status: 503 });
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await bot.handleUpdate(await req.json());
  return NextResponse.json({ ok: true });
}
