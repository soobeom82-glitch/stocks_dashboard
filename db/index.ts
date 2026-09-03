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

async function ensureTelegramReportDeliveryTable() {
  await sql()`CREATE TABLE IF NOT EXISTS telegram_report_deliveries (idempotency_key TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
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

export async function claimTelegramReportDelivery(idempotencyKey: string) {
  await ensureTelegramReportDeliveryTable();
  const rows = await sql()`INSERT INTO telegram_report_deliveries (idempotency_key, status) VALUES (${idempotencyKey}, 'sending') ON CONFLICT (idempotency_key) DO UPDATE SET status = 'sending', updated_at = NOW() WHERE telegram_report_deliveries.status = 'failed' OR (telegram_report_deliveries.status = 'sending' AND telegram_report_deliveries.updated_at < NOW() - INTERVAL '15 minutes') RETURNING idempotency_key`;
  return rows.length > 0;
}

export async function completeTelegramReportDelivery(idempotencyKey: string) {
  await ensureTelegramReportDeliveryTable();
  await sql()`UPDATE telegram_report_deliveries SET status = 'sent', updated_at = NOW() WHERE idempotency_key = ${idempotencyKey} AND status = 'sending'`;
}

export async function releaseTelegramReportDelivery(idempotencyKey: string) {
  await ensureTelegramReportDeliveryTable();
  await sql()`UPDATE telegram_report_deliveries SET status = 'failed', updated_at = NOW() WHERE idempotency_key = ${idempotencyKey} AND status = 'sending'`;
}
