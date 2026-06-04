import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public health-check endpoint for uptime monitoring (Railway, UptimeRobot,
// BetterStack, etc.). Returns 200 only if the app can reach the database;
// 503 otherwise. Intentionally leaks no internal detail — just ok/degraded.
//
// Must be public, so it's added to the middleware allowlist alongside the
// other infra routes.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Cheapest possible round-trip that proves the DB connection is alive.
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}
