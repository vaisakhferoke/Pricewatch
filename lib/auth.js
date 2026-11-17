import crypto from "crypto";
import { initDb } from "./db";

const SECRET = process.env.SESSION_SECRET || process.env.CRON_SECRET || "pricewatch_default_secret_key_849204";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [salt, key] = stored.split(":");
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, "hex");
    const hashBuffer = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, hashBuffer);
  } catch {
    return false;
  }
}

export function signToken(payload, expiresInDays = 30) {
  const data = {
    ...payload,
    exp: Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyToken(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, signature] = parts;
    const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null;
    }
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export async function getUserFromRequest(req) {
  try {
    // 1. Try reading cookie
    let token = null;
    const cookieHeader = req.headers.get("cookie") || "";
    const cookies = Object.fromEntries(
      cookieHeader
        .split(";")
        .map((c) => c.trim().split("="))
        .filter(([k]) => Boolean(k))
    );
    token = cookies["auth_token"];

    // 2. Try Authorization header
    if (!token) {
      const auth = req.headers.get("authorization");
      if (auth?.startsWith("Bearer ")) {
        token = auth.slice(7).trim();
      }
    }

    if (!token) return null;
    const payload = verifyToken(token);
    if (!payload?.userId) return null;

    const d = await initDb();
    const { rows } = await d.execute({
      sql: "SELECT id, email, chat_id, created_at FROM users WHERE id = ?",
      args: [payload.userId],
    });
    if (!rows.length) return null;
    return rows[0];
  } catch (err) {
    console.error("getUserFromRequest error:", err);
    return null;
  }
}
