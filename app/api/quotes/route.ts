const MAX_SYMBOLS = 30;

type Quote = { price: number; previousClose: number | null };

async function latestQuote(symbol: string): Promise<Quote | null> {
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
  return Response.json({ quotes, previousCloses, exchangeRate, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "public, max-age=21600" } });
}
