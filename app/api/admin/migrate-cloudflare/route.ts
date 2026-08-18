import { saveDashboardState } from "../../../../db";

export const runtime = "nodejs";

type D1Response = { success?: boolean; errors?: Array<{ message?: string }>; result?: Array<{ results?: Array<{ payload?: string }> }> };

export async function POST(request: Request) {
  const migrationSecret = process.env.MIGRATION_SECRET;
  if (!migrationSecret || request.headers.get("authorization") !== `Bearer ${migrationSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  if (!token || !accountId || !databaseId) {
    return Response.json({ error: "Cloudflare D1 migration environment variables are missing." }, { status: 503 });
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql: "SELECT payload FROM dashboard_state WHERE scope = ? LIMIT 1", params: ["owner"] }),
    cache: "no-store",
  });
  const result = (await response.json()) as D1Response;
  const payload = result.result?.[0]?.results?.[0]?.payload;

  if (!response.ok || !result.success || !payload) {
    return Response.json({ error: result.errors?.[0]?.message ?? "Cloudflare D1 state was not found." }, { status: 502 });
  }

  try {
    const state = JSON.parse(payload) as { accounts?: unknown[]; holdings?: unknown[]; imports?: unknown[] };
    if (!Array.isArray(state.accounts) || !Array.isArray(state.holdings) || !Array.isArray(state.imports)) throw new Error("Invalid portfolio state");
    await saveDashboardState(payload);
    return Response.json({ migrated: true, accounts: state.accounts.length, holdings: state.holdings.length });
  } catch {
    return Response.json({ error: "Cloudflare D1 state format is invalid." }, { status: 502 });
  }
}
