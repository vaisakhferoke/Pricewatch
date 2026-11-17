import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const user = await getUserFromRequest(req);
  return NextResponse.json({ user });
}

export async function PATCH(req) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const chatId = String(body.chat_id || "").trim();

    if (chatId && !/^-?\d{5,20}$/.test(chatId)) {
      return NextResponse.json({ error: "Invalid Telegram Chat ID format. Must be numeric." }, { status: 400 });
    }

    const d = await initDb();
    await d.execute({
      sql: "UPDATE users SET chat_id = ? WHERE id = ?",
      args: [chatId || null, user.id],
    });

    // Also update any products belonging to this user or link them
    if (chatId) {
      await d.execute({
        sql: "UPDATE products SET chat_id = ? WHERE user_id = ?",
        args: [chatId, user.id],
      });
    }

    return NextResponse.json({
      ok: true,
      user: { ...user, chat_id: chatId || null },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
