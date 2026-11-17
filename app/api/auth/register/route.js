import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { hashPassword, signToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");
    const chatId = String(body.chat_id || "").trim();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters long." }, { status: 400 });
    }

    const d = await initDb();
    const existing = await d.execute({
      sql: "SELECT id FROM users WHERE email = ?",
      args: [email],
    });
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const passwordHash = hashPassword(password);
    const result = await d.execute({
      sql: "INSERT INTO users (email, password_hash, chat_id) VALUES (?, ?, ?)",
      args: [email, passwordHash, chatId || null],
    });

    const userId = Number(result.lastInsertRowid);
    const token = signToken({ userId, email });

    const res = NextResponse.json({
      ok: true,
      user: { id: userId, email, chat_id: chatId || null },
    });

    res.cookies.set("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return res;
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json({ error: err.message || "Registration failed." }, { status: 500 });
  }
}
