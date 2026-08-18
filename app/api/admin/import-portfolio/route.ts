import { saveDashboardState } from "../../../../db";

const MAX_PAYLOAD_SIZE = 1_000_000;

function authorized(request: Request) {
  const secret = process.env.MIGRATION_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

function validState(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return Array.isArray(state.accounts) && Array.isArray(state.holdings) && Array.isArray(state.imports);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const state = await request.json() as unknown;
    if (!validState(state)) return Response.json({ error: "올바른 내보내기 파일이 아닙니다." }, { status: 400 });
    const payload = JSON.stringify(state);
    if (payload.length > MAX_PAYLOAD_SIZE) return Response.json({ error: "가져올 데이터가 너무 큽니다." }, { status: 413 });
    await saveDashboardState(payload);
    return Response.json({ imported: true });
  } catch {
    return Response.json({ error: "데이터를 저장하지 못했습니다." }, { status: 500 });
  }
}
