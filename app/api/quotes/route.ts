const MAX_SYMBOLS = 30;

async function latestPrice(symbol: string): Promise<number | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const response = await fetch(url, {
    headers: { "User-Agent": "PortfolioDashboard/1.0" },
    next: { revalidate: 21600 },
  });
  if (!response.ok) return null;
  const body = await response.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number }; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
  const result = body.chart?.result?.[0];
  const marketPrice = result?.meta?.regularMarketPrice;
  if (typeof marketPrice === "number" && Number.isFinite(marketPrice) && marketPrice > 0) return marketPrice;
  return result?.indicators?.quote?.[0]?.close?.filter((value): value is number => typeof value === "number" && value > 0).at(-1) ?? null;
}

async function usdKrwRate(): Promise<number | null> {
  return latestPrice("KRW=X");
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const raw = params.get("symbols") ?? "";
  const includeExchangeRate = params.get("includeExchangeRate") === "1";
  const symbols = [...new Set(raw.split(",").map(value => value.trim().toUpperCase()).filter(value => /^[A-Z0-9.^-]{1,15}$/.test(value)))].slice(0, MAX_SYMBOLS);
  const entries = await Promise.all(symbols.map(async symbol => [symbol, await latestPrice(symbol)] as const));
  const quotes = Object.fromEntries(entries.filter((entry): entry is [string, number] => entry[1] !== null));
  const exchangeRate = includeExchangeRate ? await usdKrwRate() : null;
  return Response.json({ quotes, exchangeRate, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "public, max-age=21600" } });
}
