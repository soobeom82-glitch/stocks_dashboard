const MAX_MARKETS = 30;

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("markets") ?? "";
  const markets = [...new Set(raw.split(",").map(value => value.trim().toUpperCase()).filter(value => /^KRW-[A-Z0-9]{2,15}$/.test(value)))].slice(0, MAX_MARKETS);
  if (markets.length === 0) return Response.json({ quotes: {}, fetchedAt: new Date().toISOString() });

  try {
    const response = await fetch(`https://api.upbit.com/v1/ticker?markets=${encodeURIComponent(markets.join(","))}`, {
      next: { revalidate: 21600 },
    });
    if (!response.ok) throw new Error("Upbit quote request failed");
    const rows = await response.json() as Array<{ market?: string; trade_price?: number; prev_closing_price?: number }>;
    const quotes = Object.fromEntries(rows.filter((row): row is { market: string; trade_price: number } => typeof row.market === "string" && typeof row.trade_price === "number" && row.trade_price > 0).map(row => [row.market, row.trade_price]));
    const previousCloses = Object.fromEntries(rows.filter((row): row is { market: string; prev_closing_price: number } => typeof row.market === "string" && typeof row.prev_closing_price === "number" && row.prev_closing_price > 0).map(row => [row.market, row.prev_closing_price]));
    // 현재가 반영 버튼에서는 이전 응답을 재사용하지 않아야 합니다.
    // 업비트 원본 호출은 6시간 재검증으로 유지합니다.
    return Response.json({ quotes, previousCloses, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "코인 현재가를 불러오지 못했습니다." }, { status: 502 });
  }
}
