const MAX_MARKETS = 30;

async function usdKrwRate() {
  const response = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/KRW%3DX?range=1d&interval=1d", {
    headers: { "User-Agent": "PortfolioDashboard/1.0" }, cache: "no-store",
  });
  if (!response.ok) return 1380;
  const data = await response.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
  const rate = data.chart?.result?.[0]?.meta?.regularMarketPrice;
  return typeof rate === "number" && rate > 0 ? rate : 1380;
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("markets") ?? "";
  const requested = [...new Set(raw.split(",").map(value => value.trim().toUpperCase()))].slice(0, MAX_MARKETS);
  const upbitMarkets = requested.filter(value => /^KRW-[A-Z0-9]{2,15}$/.test(value));
  const okxMarkets = requested.filter(value => /^OKX:[A-Z0-9]{2,20}-USDT$/.test(value));
  if (upbitMarkets.length + okxMarkets.length === 0) return Response.json({ quotes: {}, fetchedAt: new Date().toISOString() });

  try {
    const [upbitResult, okxResults, exchangeRate] = await Promise.all([
      upbitMarkets.length ? fetch(`https://api.upbit.com/v1/ticker?markets=${encodeURIComponent(upbitMarkets.join(","))}`, { cache: "no-store" }) : null,
      Promise.all(okxMarkets.map(market => fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(market.slice(4))}`, { cache: "no-store" }).then(async response => [market, response.ok ? await response.json() : null] as const))),
      okxMarkets.length ? usdKrwRate() : Promise.resolve(1),
    ]);
    const quotes: Record<string, number> = {};
    const previousCloses: Record<string, number> = {};
    if (upbitResult) {
      if (!upbitResult.ok) throw new Error("Upbit quote request failed");
      const rows = await upbitResult.json() as Array<{ market?: string; trade_price?: number; prev_closing_price?: number }>;
      rows.forEach(row => {
        if (typeof row.market === "string" && typeof row.trade_price === "number" && row.trade_price > 0) quotes[row.market] = row.trade_price;
        if (typeof row.market === "string" && typeof row.prev_closing_price === "number" && row.prev_closing_price > 0) previousCloses[row.market] = row.prev_closing_price;
      });
    }
    okxResults.forEach(([market, payload]) => {
      const item = (payload as { data?: Array<{ last?: string; open24h?: string }> } | null)?.data?.[0];
      const last = Number(item?.last);
      const previous = Number(item?.open24h);
      if (Number.isFinite(last) && last > 0) quotes[market] = last * exchangeRate;
      if (Number.isFinite(previous) && previous > 0) previousCloses[market] = previous * exchangeRate;
    });
    return Response.json({ quotes, previousCloses, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "코인 현재가를 불러오지 못했습니다." }, { status: 502 });
  }
}
