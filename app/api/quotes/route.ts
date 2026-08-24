const MAX_SYMBOLS = 30;

type Quote = { price: number; previousClose: number | null; previousCloseDate: string | null };

const isoDateInTimeZone = (timestamp: number, timeZone = "Asia/Seoul") => new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date(timestamp * 1000));

const previousWeekday = (date = new Date()) => {
  const prior = new Date(date);
  do prior.setDate(prior.getDate() - 1); while (prior.getDay() === 0 || prior.getDay() === 6);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(prior);
};

async function latestDomesticQuote(symbol: string): Promise<Quote | null> {
  const code = symbol.replace(/\.KS$/, "");
  const response = await fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, { cache: "no-store" });
  if (!response.ok) return null;
  const body = await response.json() as { closePrice?: string; compareToPreviousClosePrice?: string; localTradedAt?: string };
  const price = Number(body.closePrice?.replaceAll(",", ""));
  const change = Number(body.compareToPreviousClosePrice?.replaceAll(",", ""));
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(change)) return null;
  const previousClose = price - change;
  const tradedAt = body.localTradedAt ? new Date(body.localTradedAt) : null;
  const prior = tradedAt && !Number.isNaN(tradedAt.getTime()) ? previousWeekday(tradedAt) : previousWeekday();
  return { price, previousClose: previousClose > 0 ? previousClose : null, previousCloseDate: prior };
}

async function latestQuote(symbol: string): Promise<Quote | null> {
  if (/^\d{6}\.KS$/.test(symbol)) return latestDomesticQuote(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const response = await fetch(url, {
    headers: { "User-Agent": "PortfolioDashboard/1.0" },
    next: { revalidate: 21600 },
  });
  if (!response.ok) return null;
  const body = await response.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; regularMarketPreviousClose?: number; previousClose?: number; chartPreviousClose?: number; exchangeTimezoneName?: string }; timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
  const result = body.chart?.result?.[0];
  const marketPrice = result?.meta?.regularMarketPrice;
  const price = typeof marketPrice === "number" && Number.isFinite(marketPrice) && marketPrice > 0
    ? marketPrice
    : result?.indicators?.quote?.[0]?.close?.filter((value): value is number => typeof value === "number" && value > 0).at(-1) ?? null;
  if (!price) return null;
  const previousClose = [result?.meta?.regularMarketPreviousClose, result?.meta?.previousClose, result?.meta?.chartPreviousClose]
    .find((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0) ?? null;
  const historicalCloses = result?.indicators?.quote?.[0]?.close ?? [];
  const historicalDates = result?.timestamp ?? [];
  const validIndices = historicalCloses.reduce<number[]>((indices, close, index) => typeof close === "number" && close > 0 && historicalDates[index] ? [...indices, index] : indices, []);
  const previousIndex = validIndices.at(-2);
  const previousCloseDate = previousIndex === undefined ? null : isoDateInTimeZone(historicalDates[previousIndex], result?.meta?.exchangeTimezoneName ?? "Asia/Seoul");
  return { price, previousClose, previousCloseDate };
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
  const previousCloseDates = Object.fromEntries(available.flatMap(([symbol, quote]) => quote.previousCloseDate === null ? [] : [[symbol, quote.previousCloseDate]]));
  const exchangeRate = includeExchangeRate ? await usdKrwRate() : null;
  // 국내 주식은 네이버 실시간 시세, 해외 주식·환율은 Yahoo 시세를 사용합니다.
  return Response.json({ quotes, previousCloses, previousCloseDates, exchangeRate, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
