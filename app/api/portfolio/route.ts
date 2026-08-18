import { loadDashboardState, saveDashboardState } from "../../../db";

const MAX_PAYLOAD_SIZE = 1_000_000;

type DashboardPayload = {
  accounts: unknown[];
  holdings: unknown[];
  imports: unknown[];
};

function isPayload(value: unknown): value is DashboardPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return Array.isArray(payload.accounts) && Array.isArray(payload.holdings) && Array.isArray(payload.imports);
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return Response.json(
      { error: "대시보드 데이터 저장소를 준비하는 중입니다. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }
  return Response.json({ error: "대시보드 데이터를 불러오지 못했습니다." }, { status: 500 });
}

export async function GET() {
  try {
    const saved = await loadDashboardState();

    if (!saved) return Response.json({ hasData: false });
    const state = JSON.parse(saved.payload) as unknown;
    if (!isPayload(state)) throw new Error("Invalid dashboard payload");
    return Response.json({ hasData: true, state, updatedAt: saved.updated_at });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const state = (await request.json()) as unknown;
    if (!isPayload(state)) {
      return Response.json({ error: "저장할 데이터 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const payload = JSON.stringify(state);
    if (payload.length > MAX_PAYLOAD_SIZE) {
      return Response.json({ error: "저장할 데이터가 너무 큽니다." }, { status: 413 });
    }

    await saveDashboardState(payload);

    return Response.json({ saved: true });
  } catch (error) {
    return errorResponse(error);
  }
}
