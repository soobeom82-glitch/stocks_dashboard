import { neon } from "@neondatabase/serverless";

const OWNER_SCOPE = "owner";

type StateRow = { payload: string; updated_at: string };

function sql() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("Neon database URL is unavailable. Connect Neon in Vercel and add DATABASE_URL (or POSTGRES_URL).");
  return neon(url);
}

async function ensureDashboardStateTable() {
  await sql()`CREATE TABLE IF NOT EXISTS dashboard_state (scope TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
}

export async function loadDashboardState() {
  await ensureDashboardStateTable();
  const rows = (await sql()`SELECT payload, updated_at FROM dashboard_state WHERE scope = ${OWNER_SCOPE} LIMIT 1`) as StateRow[];
  return rows[0] ?? null;
}

export async function saveDashboardState(payload: string) {
  await ensureDashboardStateTable();
  await sql()`INSERT INTO dashboard_state (scope, payload, updated_at) VALUES (${OWNER_SCOPE}, ${payload}, NOW()) ON CONFLICT (scope) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`;
}
