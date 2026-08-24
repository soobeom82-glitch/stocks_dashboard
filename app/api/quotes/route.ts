const MAX_SYMBOLS = 30;

type Quote = { price: number; previousClose: number | null };

async function latestDomesticQuote(symbol: string): Promise<Quote | null> {
  const code = symbol.replace(/\.KS$/, "");
  const response = await fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, { cache: "no-store" });
  if (!response.ok) return null;
  const body = await response.json() as { closePrice?: string; compareToPreviousClosePrice?: string };
  const price = Number(body.closePrice?.replaceAll(",", ""));
  const change = Number(body.compareToPreviousClosePrice?.replaceAll(",", ""));
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(change)) return null;
  const previousClose = price - change;
  return { price, previousClose: previousClose > 0 ? previousClose : null };
}

async function latestQuote(symbol: string): Promise<Quote | null> {
  if (/^\d{6}\.KS$/.test(symbol)) return latestDomesticQuote(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const response = await fetch(url, {
    headers: { "User-Agent": "PortfolioDashboard/1.0" },
    next: { revalidate: 21600 },
  });
  if (!response.ok) return null;
  const body = await response.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; regularMarketPreviousClose?: number; previousClose?: number; chartPreviousClose?: number }; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
  const result = body.chart?.result?.[0];
  const marketPrice = result?.meta?.regularMarketPrice;
  const price = typeof marketPrice === "number" && Number.isFinite(marketPrice) && marketPrice > 0
    ? marketPrice
    : result?.indicators?.quote?.[0]?.close?.filter((value): value is number => typeof value === "number" && value > 0).at(-1) ?? null;
  if (!price) return null;
  const previousClose = [result?.meta?.regularMarketPreviousClose, result?.meta?.previousClose, result?.meta?.chartPreviousClose]
    .find((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0) ?? null;
  return { price, previousClose };
}

async function usdKrwRate(): Promise<number | null> {
  return (await latestQuote("KRW=X"))?.price ?? null;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const raw = params.get("symbols") ?? "";
  const includeExchangeRate = params.get("includeExchangeRate") === "1";
  const symbols = [...new Set(raw.split(",").map(value => value.trim().toUpperCase()).filter(value => /^[A-Z0-9.^-]{1,15}$/.test(value)))].slice(0, MAX_SYMBOLS);
  const entries = await Promise.all(symbols.map(async symbol => [symbol, await latestQuote(symbol)] as const));
  const available = entries.filter((entry): entry is [string, Quote] => entry[1] !== null);
  const quotes = Object.fromEntries(available.map(([symbol, quote]) => [symbol, quote.price]));
  const previousCloses = Object.fromEntries(available.flatMap(([symbol, quote]) => quote.previousClose === null ? [] : [[symbol, quote.previousClose]]));
  const exchangeRate = includeExchangeRate ? await usdKrwRate() : null;
  // 국내 주식은 네이버 실시간 시세, 해외 주식·환율은 Yahoo 시세를 사용합니다.
  return Response.json({ quotes, previousCloses, exchangeRate, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
