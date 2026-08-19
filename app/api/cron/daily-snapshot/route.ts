import { saveDailyPortfolioSnapshot } from "../../../../db/daily-snapshot";
import { backfillRecentSnapshots } from "../../../../db/historical-backfill";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const backfillDays = Number(new URL(request.url).searchParams.get("backfillDays"));
    if (Number.isInteger(backfillDays) && backfillDays > 0 && backfillDays <= 10) {
      const result = await backfillRecentSnapshots(backfillDays);
      return Response.json({ saved: true, backfilled: true, ...result, completedAt: new Date().toISOString() });
    }
    await saveDailyPortfolioSnapshot();
    return Response.json({ saved: true, completedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Daily portfolio snapshot failed", error);
    return Response.json({ error: "Snapshot failed" }, { status: 500 });
  }
}
