import { NextResponse } from "next/server";
import { checkDue, checkAll } from "@/lib/checker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const force = new URL(req.url).searchParams.get("force") === "true";
  const result = force ? await checkAll() : await checkDue();
  return NextResponse.json(result);
}
