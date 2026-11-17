import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { verifyPassword, signToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json({ error: "Please enter your email and password." }, { status: 400 });
    }

    const d = await initDb();
    const { rows } = await d.execute({
      sql: "SELECT id, email, password_hash, chat_id FROM users WHERE email = ?",
      args: [email],
    });

    if (!rows.length) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const user = rows[0];
    const valid = verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const token = signToken({ userId: user.id, email: user.email });

    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, chat_id: user.chat_id },
    });

    res.cookies.set("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return res;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: err.message || "Login failed." }, { status: 500 });
  }
}
