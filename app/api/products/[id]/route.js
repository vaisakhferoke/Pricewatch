import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { checkProduct } from "@/lib/checker";

export const dynamic = "force-dynamic";

export async function DELETE(req, { params }) {
  const chatId = new URL(req.url).searchParams.get("chat_id");
  const d = await initDb();
  const own = await d.execute({ sql: "SELECT id FROM products WHERE id = ? AND chat_id = ?", args: [params.id, chatId] });
  if (!own.rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await d.batch(
    [
      { sql: "DELETE FROM price_history WHERE product_id = ?", args: [params.id] },
      { sql: "DELETE FROM products WHERE id = ?", args: [params.id] },
    ],
    "write"
  );
  return NextResponse.json({ ok: true });
}

export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const { chat_id, check_interval, target_price } = body;
    const d = await initDb();
    const own = await d.execute({ sql: "SELECT id FROM products WHERE id = ? AND chat_id = ?", args: [params.id, String(chat_id || "").trim()] });
    if (!own.rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updates = [];
    const args = [];
    if (check_interval !== undefined) {
      const interval = Math.max(1, Number(check_interval));
      updates.push("check_interval = ?");
      args.push(interval);
    }
    if (target_price !== undefined) {
      const target = Number(target_price);
      if (target > 0) {
        updates.push("target_price = ?");
        args.push(target);
      }
    }
    if (!updates.length) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    args.push(params.id);
    await d.execute({
      sql: `UPDATE products SET ${updates.join(", ")} WHERE id = ?`,
      args,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Manually trigger an immediate price check for this product
export async function POST(req, { params }) {
  try {
    const chatId = new URL(req.url).searchParams.get("chat_id");
    const d = await initDb();
    const { rows } = await d.execute({ sql: "SELECT * FROM products WHERE id = ? AND chat_id = ?", args: [params.id, chatId] });
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const result = await checkProduct(rows[0]);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
