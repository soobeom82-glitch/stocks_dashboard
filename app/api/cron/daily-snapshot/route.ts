import { saveDailyPortfolioSnapshot } from "../../../../db/daily-snapshot";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await saveDailyPortfolioSnapshot();
    return Response.json({ saved: true, completedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Daily portfolio snapshot failed", error);
    return Response.json({ error: "Snapshot failed" }, { status: 500 });
  }
}
