type Holding = { symbol: string; name?: string; quantity: number; averagePrice: number; fallbackPrice: number; previousClose?: number; previousCloseDate?: string; quoteDate?: string; market?: string; accountId?: number; assetClass?: string; marketPrice?: number };
type Account = { id: number; type: string; amount: number; returnRate: number; portfolioId?: string };
type ProfitPeak = { profit: number; date: string };
type Snapshot = { date: string; total: number; cost?: number; accountAmounts?: Record<string, number>; accountCosts?: Record<string, number>; assetAmounts?: Record<string, number>; assetCosts?: Record<string, number>; holdingAmounts?: Record<string, number>; holdingCosts?: Record<string, number> };
type PortfolioState = { portfolios?: Array<{ id: string; name: string }>; accounts: Account[]; holdings?: Holding[]; usdHoldings?: Holding[]; fundHoldings?: Holding[]; coinHoldings?: Holding[]; pensionHoldings?: Holding[]; isaHoldings?: Holding[]; irpHoldings?: Holding[]; snapshots?: Snapshot[]; profitPeaks?: Record<string, ProfitPeak>; telegramReportDate?: string };

const KST_DATE = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
const holdingSnapshotKey = (accountId: number, holding: Holding) => `${accountId}:${holding.symbol}:${holding.name ?? ""}`;
const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const signed = (value: number) => `${value >= 0 ? "+" : ""}${number.format(value)}`;
const percent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const assetTypes = ["국내 주식", "해외 주식", "채권·현금성", "대체자산", "펀드", "가상자산"];
type AssetAmounts = Record<string, number>;
type DailyMove = { name: string; symbol: string; rate: number };

const displayDate = (date?: string) => date?.replaceAll("-", ".") ?? "";
const previousWeekday = (date: string) => {
  const prior = new Date(`${date}T12:00:00+09:00`);
  do prior.setDate(prior.getDate() - 1); while (prior.getDay() === 0 || prior.getDay() === 6);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(prior);
};
const previousCalendarDay = (date: string) => {
  const prior = new Date(`${date}T12:00:00+09:00`);
  prior.setDate(prior.getDate() - 1);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(prior);
};
const kstDateFromTimestamp = (timestamp: number, timeZone = "Asia/Seoul") => new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date(timestamp * 1000));

function emptyAssetAmounts(): AssetAmounts {
  return Object.fromEntries(assetTypes.map(type => [type, 0]));
}

function portfolioNames(state: PortfolioState) {
  const names = new Map([["kim-soobeom", "김수범"], ["kim-seoha", "김서하"], ["kim-eunho", "김은호"]]);
  state.portfolios?.forEach(portfolio => names.set(portfolio.id, portfolio.name));
  return names;
}

function telegramReports(
  state: PortfolioState,
  accounts: Account[],
  date: string,
  allocations: Map<string, AssetAmounts>,
  previousAllocations: Map<string, AssetAmounts>,
  movers: Map<string, { gainers: DailyMove[]; losers: DailyMove[] }>,
  previousSnapshot?: Snapshot,
  portfolioId?: string,
) {
  const names = portfolioNames(state);
  const groups = new Map<string, { amount: number; cost: number }>();
  accounts.forEach(account => {
    const id = account.portfolioId ?? "kim-soobeom";
    const group = groups.get(id) ?? { amount: 0, cost: 0 };
    group.amount += account.amount;
    group.cost += account.returnRate > -100 ? account.amount / (1 + account.returnRate / 100) : 0;
    groups.set(id, group);
  });
  return [...groups.entries()].filter(([id]) => !portfolioId || id === portfolioId).map(([id, group]) => {
    const allocation = allocations.get(id) ?? emptyAssetAmounts();
    const previousAllocation = previousAllocations.get(id);
    const allocationTotal = Object.values(allocation).reduce((sum, value) => sum + value, 0);
    const previousTotal = Object.values(previousAllocation ?? {}).reduce((sum, value) => sum + value, 0);
    const allocationLines = Object.entries(allocation)
      .filter(([, amount]) => amount > 0)
      .sort(([, left], [, right]) => right - left)
      .map(([type, amount]) => {
        const weight = amount / allocationTotal * 100;
        const previousWeight = previousTotal && previousAllocation ? (previousAllocation[type] ?? 0) / previousTotal * 100 : null;
        return `• ${type} ${weight.toFixed(1)}%${previousWeight === null ? "" : ` (${(weight - previousWeight >= 0 ? "+" : "") + (weight - previousWeight).toFixed(1)}%p)`}`;
      });
    const movement = movers.get(id) ?? { gainers: [], losers: [] };
    const previousAmount = previousSnapshot ? accounts.filter(account => (account.portfolioId ?? "kim-soobeom") === id).reduce((sum, account) => sum + (previousSnapshot.accountAmounts?.[String(account.id)] ?? 0), 0) : 0;
    const previousCost = previousSnapshot ? accounts.filter(account => (account.portfolioId ?? "kim-soobeom") === id).reduce((sum, account) => sum + (previousSnapshot.accountCosts?.[String(account.id)] ?? 0), 0) : 0;
    const hasPreviousPerformance = previousAmount > 0 && previousCost > 0;
    const currentRate = group.cost > 0 ? (group.amount / group.cost - 1) * 100 : null;
    const previousRate = hasPreviousPerformance ? (previousAmount / previousCost - 1) * 100 : null;
    const currentProfit = group.amount - group.cost;
    const previousProfit = previousAmount - previousCost;
    const comparisonBasis = previousSnapshot
      ? `${displayDate(previousSnapshot.date)} 장 마감 → ${displayDate(date)} 장 마감 (KST)`
      : `${displayDate(date)} 장 마감 (비교 기준 생성 중)`;
    const moveLines = (items: DailyMove[]) => items.length
      ? items.map((item, index) => `${index + 1}. ${item.name} ${percent(item.rate)}`)
      : ["- 해당 없음"];
    return [
      `📊 ${names.get(id) ?? id} 포트폴리오 일일 스냅샷`,
      `평가 기준  ${comparisonBasis}`,
      "",
      `평가금액  ${number.format(group.amount)}원${hasPreviousPerformance ? `  (${signed(group.amount - previousAmount)}원, ${percent((group.amount / previousAmount - 1) * 100)})` : ""}`,
      `수익률  ${currentRate === null ? "-" : percent(currentRate)}${previousRate === null || currentRate === null ? "" : `  (${currentRate - previousRate >= 0 ? "+" : ""}${(currentRate - previousRate).toFixed(2)}%p)`}`,
      `평가손익  ${signed(currentProfit)}원${hasPreviousPerformance ? `  (${signed(currentProfit - previousProfit)}원)` : ""}`,
      "",
      "📈 상승 Top 3",
      ...moveLines(movement.gainers),
      "",
      "📉 하락 Top 3",
      ...moveLines(movement.losers),
      "",
      `🧩 자산 유형별 비중 (${previousSnapshot ? `${displayDate(previousSnapshot.date)} → ${displayDate(date)}` : `${displayDate(date)} 기준`})`,
      ...(allocationLines.length ? allocationLines : ["- 보유 자산 없음"]),
    ].join("\n");
  });
}

async function sendTelegramReports(messages: string[]) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  const results = await Promise.all(messages.map(message => fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
    cache: "no-store",
  })));
  return results.every(response => response.ok);
}

type MarketQuote = { price: number; previousClose?: number; previousCloseDate?: string; quoteDate?: string };

async function quote(symbol: string): Promise<MarketQuote | null> {
  if (/^\d{6}\.KS$/.test(symbol)) {
    const code = symbol.replace(/\.KS$/, "");
    const response = await fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json() as { closePrice?: string; compareToPreviousClosePrice?: string; localTradedAt?: string };
    const price = Number(data.closePrice?.replaceAll(",", ""));
    const change = Number(data.compareToPreviousClosePrice?.replaceAll(",", ""));
    const quoteDate = data.localTradedAt ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(data.localTradedAt)) : KST_DATE();
    return Number.isFinite(price) && price > 0 ? { price, previousClose: Number.isFinite(change) ? price - change : undefined, previousCloseDate: previousWeekday(quoteDate), quoteDate } : null;
  }
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`, { headers: { "User-Agent": "PortfolioDashboard/1.0" }, next: { revalidate: 21600 } });
  if (!response.ok) return null;
  const data = await response.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; regularMarketPreviousClose?: number; previousClose?: number; exchangeTimezoneName?: string }; timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
  const result = data.chart?.result?.[0];
  const meta = result?.meta;
  const price = meta?.regularMarketPrice;
  const previousClose = meta?.regularMarketPreviousClose ?? meta?.previousClose;
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const timestamps = result?.timestamp ?? [];
  const indices = closes.reduce<number[]>((list, close, index) => typeof close === "number" && close > 0 && timestamps[index] ? [...list, index] : list, []);
  const quoteIndex = indices.at(-1);
  const previousIndex = indices.at(-2);
  const zone = meta?.exchangeTimezoneName ?? "Asia/Seoul";
  return typeof price === "number" && price > 0 ? { price, previousClose: typeof previousClose === "number" && previousClose > 0 ? previousClose : undefined, previousCloseDate: previousIndex === undefined ? undefined : kstDateFromTimestamp(timestamps[previousIndex], zone), quoteDate: quoteIndex === undefined ? undefined : kstDateFromTimestamp(timestamps[quoteIndex], zone) } : null;
}

async function refreshStockPrices(holdings: Holding[], exchangeRate = 1) {
  const quotes = await Promise.all(holdings.map(async holding => [holding.symbol, await quote(holding.symbol)] as const));
  const prices = Object.fromEntries(quotes.filter((entry): entry is [string, MarketQuote] => entry[1] !== null));
  const next = holdings.map(holding => {
    const latest = prices[holding.symbol];
    return latest ? { ...holding, fallbackPrice: latest.price, previousClose: latest.previousClose ?? holding.previousClose, previousCloseDate: latest.previousCloseDate ?? holding.previousCloseDate, quoteDate: latest.quoteDate ?? holding.quoteDate } : holding;
  });
  return { holdings: next, exchangeRate };
}

async function refreshCoinPrices(holdings: Holding[]) {
  if (!holdings.length) return holdings;
  const upbitHoldings = holdings.filter(holding => !holding.market);
  const okxHoldings = holdings.filter(holding => holding.market?.startsWith("OKX:"));
  const [upbit, okx, usdQuote] = await Promise.all([
    upbitHoldings.length ? fetch(`https://api.upbit.com/v1/ticker?markets=${encodeURIComponent(upbitHoldings.map(holding => `KRW-${holding.symbol}`).join(","))}`, { next: { revalidate: 21600 } }) : null,
    Promise.all(okxHoldings.map(async holding => [holding.market!, await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(holding.market!.slice(4))}`, { next: { revalidate: 21600 } })] as const)),
    quote("KRW=X"),
  ]);
  const quoteDate = KST_DATE();
  const prices: Record<string, { price: number; previousClose?: number; previousCloseDate?: string; quoteDate?: string }> = {};
  if (upbit?.ok) {
    const data = await upbit.json() as Array<{ market: string; trade_price: number; prev_closing_price?: number }>;
    data.forEach(item => { prices[item.market] = { price: item.trade_price, previousClose: item.prev_closing_price, previousCloseDate: previousCalendarDay(quoteDate), quoteDate }; });
  }
  const exchangeRate = usdQuote?.price ?? 1380;
  await Promise.all(okx.map(async ([market, response]) => {
    if (!response.ok) return;
    const data = await response.json() as { data?: Array<{ last?: string; open24h?: string }> };
    const item = data.data?.[0];
    const price = Number(item?.last);
    const previousClose = Number(item?.open24h);
    if (Number.isFinite(price) && price > 0) prices[market] = { price: price * exchangeRate, previousClose: Number.isFinite(previousClose) && previousClose > 0 ? previousClose * exchangeRate : undefined, previousCloseDate: previousCalendarDay(quoteDate), quoteDate };
  }));
  return holdings.map(holding => {
    const latest = prices[holding.market ?? `KRW-${holding.symbol}`];
    return latest ? { ...holding, fallbackPrice: latest.price, previousClose: latest.previousClose ?? holding.previousClose, previousCloseDate: latest.previousCloseDate ?? holding.previousCloseDate, quoteDate: latest.quoteDate ?? holding.quoteDate } : holding;
  });
}

function accountPerformance(accounts: Account[], type: string, holdings: Holding[], exchangeRate = 1) {
  return accounts.map(account => {
    if (account.type !== type) return account;
    const positions = holdings.filter(holding => holding.accountId === account.id);
    if (!positions.length) return account;
    const amount = positions.reduce((sum, holding) => sum + holding.quantity * holding.fallbackPrice * exchangeRate, 0);
    const cost = positions.reduce((sum, holding) => sum + holding.quantity * holding.averagePrice * exchangeRate, 0);
    return { ...account, amount, returnRate: cost > 0 ? (amount / cost - 1) * 100 : 0 };
  });
}

function isDomesticHolding(accountType: string, holding: Holding) {
  if (["005935.KS", "086790.KS", "293940.KS"].includes(holding.symbol)) return true;
  if (/msci\s*korea|korea\s*tr|(?:kodex|tiger)-msci-kr/i.test(`${holding.name ?? ""} ${holding.symbol}`)) return true;
  if (accountType === "코인" || accountType === "펀드" || holding.assetClass === "현금성·금융상품") return false;
  const text = `${holding.name ?? ""} ${holding.symbol}`.toLowerCase();
  if (/금|gold|iau|gdx|리츠|reit|원자재|commodity|국채|채권|bond|미국채/.test(text)) return false;
  if (accountType === "미국 주식" || /미국|나스닥|s&p|nifty|차이나|글로벌|msci|해외|인도/.test(text)) return false;
  return true;
}

function assetTypeFor(accountType: string, holding?: Holding) {
  if (holding?.symbol === "CASH-KRW" || holding?.name === "예수금") return "채권·현금성";
  if (["005935.KS", "086790.KS", "293940.KS"].includes(holding?.symbol ?? "")) return "국내 주식";
  if (/msci\s*korea|korea\s*tr|(?:kodex|tiger)-msci-kr/i.test(`${holding?.name ?? ""} ${holding?.symbol ?? ""}`)) return "국내 주식";
  if (accountType === "코인") return "가상자산";
  if (accountType === "펀드") return "펀드";
  if (holding?.assetClass === "현금성·금융상품") return "채권·현금성";
  const text = `${holding?.name ?? ""} ${holding?.symbol ?? ""}`.toLowerCase();
  if (/금|gold|iau|gdx|리츠|reit|원자재|commodity/.test(text)) return "대체자산";
  if (/국채|채권|bond|미국채/.test(text)) return "채권·현금성";
  if (accountType === "미국 주식") return "해외 주식";
  if (/미국|나스닥|s&p|nifty|차이나|글로벌|msci|해외|인도/.test(text)) return "해외 주식";
  return "국내 주식";
}
function assetWeightsFor(accountType: string, holding?: Holding): Array<[string, number]> {
  return holding?.symbol === "284430.KS"
    ? [["국내 주식", 0.5], ["채권·현금성", 0.5]]
    : [[assetTypeFor(accountType, holding), 1]];
}

function computeAssetAmounts(accounts: Account[], sources: Array<{ holdings: Holding[]; exchangeRate?: number }>) {
  const amounts = emptyAssetAmounts();
  const positionsByAccount = new Map<number, Array<{ holding: Holding; value: number }>>();
  sources.forEach(({ holdings, exchangeRate = 1 }) => holdings.forEach(holding => {
    if (!holding.accountId) return;
    const positions = positionsByAccount.get(holding.accountId) ?? [];
    positions.push({ holding, value: holding.quantity * holding.fallbackPrice * exchangeRate });
    positionsByAccount.set(holding.accountId, positions);
  }));
  accounts.forEach(account => {
    const positions = positionsByAccount.get(account.id) ?? [];
    const positionsTotal = positions.reduce((sum, position) => sum + position.value, 0);
    if (!positionsTotal) { amounts[assetTypeFor(account.type)] += account.amount; return; }
    positions.forEach(position => assetWeightsFor(account.type, position.holding).forEach(([type, weight]) => { amounts[type] += account.amount * position.value / positionsTotal * weight; }));
  });
  return amounts;
}

function positionsForAccounts(sources: Array<{ holdings: Holding[]; exchangeRate?: number }>) {
  const positionsByAccount = new Map<number, Array<{ holding: Holding; value: number }>>();
  sources.forEach(({ holdings, exchangeRate = 1 }) => holdings.forEach(holding => {
    if (!holding.accountId) return;
    const positions = positionsByAccount.get(holding.accountId) ?? [];
    positions.push({ holding, value: holding.quantity * holding.fallbackPrice * exchangeRate });
    positionsByAccount.set(holding.accountId, positions);
  }));
  return positionsByAccount;
}

function portfolioAssetAmounts(accounts: Account[], sources: Array<{ holdings: Holding[]; exchangeRate?: number }>) {
  const output = new Map<string, AssetAmounts>();
  const positionsByAccount = positionsForAccounts(sources);
  accounts.forEach(account => {
    const portfolioId = account.portfolioId ?? "kim-soobeom";
    const amounts = output.get(portfolioId) ?? emptyAssetAmounts();
    const positions = positionsByAccount.get(account.id) ?? [];
    const total = positions.reduce((sum, position) => sum + position.value, 0);
    if (!total) amounts[assetTypeFor(account.type)] += account.amount;
    else positions.forEach(position => assetWeightsFor(account.type, position.holding).forEach(([type, weight]) => {
      amounts[type] += account.amount * position.value / total * weight;
    }));
    output.set(portfolioId, amounts);
  });
  return output;
}

function previousPortfolioAssetAmounts(
  previous: Snapshot | undefined,
  accounts: Account[],
  sources: Array<{ holdings: Holding[]; exchangeRate?: number }>,
) {
  const output = new Map<string, AssetAmounts>();
  if (!previous?.accountAmounts) return output;
  const positionsByAccount = new Map<number, Array<{ holding: Holding; snapshotValue: number }>>();
  sources.forEach(({ holdings }) => holdings.forEach(holding => {
    if (!holding.accountId) return;
    const snapshotValue = previous.holdingAmounts?.[holdingSnapshotKey(holding.accountId, holding)];
    if (!snapshotValue) return;
    const positions = positionsByAccount.get(holding.accountId) ?? [];
    positions.push({ holding, snapshotValue });
    positionsByAccount.set(holding.accountId, positions);
  }));
  accounts.forEach(account => {
    const accountAmount = previous.accountAmounts?.[String(account.id)];
    if (typeof accountAmount !== "number") return;
    const portfolioId = account.portfolioId ?? "kim-soobeom";
    const amounts = output.get(portfolioId) ?? emptyAssetAmounts();
    const positions = positionsByAccount.get(account.id) ?? [];
    const total = positions.reduce((sum, position) => sum + position.snapshotValue, 0);
    if (!total) amounts[assetTypeFor(account.type)] += accountAmount;
    else positions.forEach(position => assetWeightsFor(account.type, position.holding).forEach(([type, weight]) => {
      amounts[type] += accountAmount * position.snapshotValue / total * weight;
    }));
    output.set(portfolioId, amounts);
  });
  return output;
}

function portfolioDailyMovers(accounts: Account[], sources: Array<{ holdings: Holding[] }>) {
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  const candidates = new Map<string, DailyMove>();
  sources.forEach(({ holdings }) => holdings.forEach(holding => {
    if (!holding.accountId || !holding.previousClose || holding.previousClose <= 0 || holding.fallbackPrice <= 0) return;
    const account = accountsById.get(holding.accountId);
    if (!account || account.type === "펀드" || holding.symbol === "CASH-KRW") return;
    const id = account.portfolioId ?? "kim-soobeom";
    const rate = (holding.fallbackPrice / holding.previousClose - 1) * 100;
    const key = `${id}:${holding.symbol}`;
    candidates.set(key, { name: holding.name ?? holding.symbol, symbol: holding.symbol, rate });
  }));
  const grouped = new Map<string, DailyMove[]>();
  candidates.forEach((move, key) => {
    const id = key.slice(0, key.indexOf(":"));
    const items = grouped.get(id) ?? [];
    items.push(move);
    grouped.set(id, items);
  });
  return new Map([...grouped.entries()].map(([id, items]) => [id, {
    gainers: items.filter(item => item.rate > 0).sort((left, right) => right.rate - left.rate).slice(0, 3),
    losers: items.filter(item => item.rate < 0).sort((left, right) => left.rate - right.rate).slice(0, 3),
  }]));
}

function computeHoldingAmounts(sources: Array<{ holdings: Holding[]; exchangeRate?: number }>) {
  const amounts: Record<string, number> = {};
  sources.forEach(({ holdings, exchangeRate = 1 }) => holdings.forEach(holding => {
    if (!holding.accountId) return;
    const key = holdingSnapshotKey(holding.accountId, holding);
    amounts[key] = (amounts[key] ?? 0) + holding.quantity * holding.fallbackPrice * exchangeRate;
  }));
  return amounts;
}

function computeHoldingCosts(sources: Array<{ holdings: Holding[]; exchangeRate?: number }>) {
  const costs: Record<string, number> = {};
  sources.forEach(({ holdings, exchangeRate = 1 }) => holdings.forEach(holding => {
    if (!holding.accountId) return;
    const key = holdingSnapshotKey(holding.accountId, holding);
    costs[key] = (costs[key] ?? 0) + holding.quantity * holding.averagePrice * exchangeRate;
  }));
  return costs;
}

function computeAssetCosts(accounts: Account[], sources: Array<{ holdings: Holding[]; exchangeRate?: number }>) {
  const costs: Record<string, number> = { "국내 주식": 0, "해외 주식": 0, "채권·현금성": 0, "대체자산": 0, "펀드": 0, "가상자산": 0 };
  const positionsByAccount = new Map<number, Array<{ holding: Holding; value: number; cost: number }>>();
  sources.forEach(({ holdings, exchangeRate = 1 }) => holdings.forEach(holding => {
    if (!holding.accountId) return;
    const positions = positionsByAccount.get(holding.accountId) ?? [];
    positions.push({ holding, value: holding.quantity * holding.fallbackPrice * exchangeRate, cost: holding.quantity * holding.averagePrice * exchangeRate });
    positionsByAccount.set(holding.accountId, positions);
  }));
  accounts.forEach(account => {
    const positions = positionsByAccount.get(account.id) ?? [];
    const positionsTotal = positions.reduce((sum, position) => sum + position.value, 0);
    const accountCost = account.returnRate > -100 ? account.amount / (1 + account.returnRate / 100) : 0;
    if (!positionsTotal) { costs[assetTypeFor(account.type)] += accountCost; return; }
    positions.forEach(position => assetWeightsFor(account.type, position.holding).forEach(([type, weight]) => { costs[type] += accountCost * position.value / positionsTotal * weight; }));
  });
  return costs;
}

function updateProfitPeaks(state: PortfolioState, accounts: Account[], groups: Array<{ type: string; holdings: Holding[] }>, date: string) {
  const profits = new Map<string, number>();
  groups.forEach(({ type, holdings }) => holdings.forEach(holding => {
    const account = accounts.find(item => item.id === holding.accountId);
    if (!isDomesticHolding(account?.type ?? type, holding)) return;
    const key = holding.symbol || holding.name || "unknown";
    profits.set(key, (profits.get(key) ?? 0) + holding.quantity * (holding.fallbackPrice - holding.averagePrice));
  }));
  const peaks = { ...(state.profitPeaks ?? {}) };
  profits.forEach((profit, symbol) => {
    if (!peaks[symbol] || profit > peaks[symbol].profit) peaks[symbol] = { profit, date };
  });
  return peaks;
}

export async function saveDailyPortfolioSnapshot(options: { forceTelegram?: boolean; portfolioId?: string } = {}) {
  const saved = await loadDashboardState();
  if (!saved) return;
  const state = JSON.parse(saved.payload) as PortfolioState;
  if (!Array.isArray(state.accounts)) return;

  const domestic = await refreshStockPrices(state.holdings ?? []);
  const isa = await refreshStockPrices(state.isaHoldings ?? []);
  const pension = await refreshStockPrices(state.pensionHoldings ?? []);
  const usd = await refreshStockPrices(state.usdHoldings ?? []);
  const usdKrw = (await quote("KRW=X"))?.price ?? 1380;
  const coins = await refreshCoinPrices(state.coinHoldings ?? []);
  const irpHoldings = state.irpHoldings ?? [];
  const irpQuoted = await refreshStockPrices(irpHoldings.filter(holding => holding.assetClass === "ETF·주식" && holding.symbol.endsWith(".KS")));
  const irpPrices = Object.fromEntries(irpQuoted.holdings.map(holding => [holding.symbol, holding]));
  const irp = irpHoldings.map(holding => {
    const latest = irpPrices[holding.symbol];
    return latest ? { ...holding, fallbackPrice: latest.fallbackPrice, previousClose: latest.previousClose ?? holding.previousClose, marketPrice: latest.fallbackPrice } : holding;
  });
  let accounts = accountPerformance(state.accounts, "국내 주식", domestic.holdings);
  accounts = accountPerformance(accounts, "ISA", isa.holdings);
  accounts = accountPerformance(accounts, "연금저축", pension.holdings);
  accounts = accountPerformance(accounts, "미국 주식", usd.holdings, usdKrw);
  accounts = accountPerformance(accounts, "코인", coins);
  accounts = accountPerformance(accounts, "IRP", irp);
  const total = accounts.reduce((sum, account) => sum + account.amount, 0);
  const cost = accounts.reduce((sum, account) => sum + (account.returnRate > -100 ? account.amount / (1 + account.returnRate / 100) : 0), 0);
  const date = KST_DATE();
  const accountAmounts = Object.fromEntries(accounts.map(account => [String(account.id), account.amount]));
  const holdingSources = [
    { holdings: domestic.holdings }, { holdings: usd.holdings, exchangeRate: usdKrw }, { holdings: state.fundHoldings ?? [] },
    { holdings: coins }, { holdings: pension.holdings }, { holdings: isa.holdings }, { holdings: irp },
  ];
  const assetAmounts = computeAssetAmounts(accounts, holdingSources);
  const holdingAmounts = computeHoldingAmounts(holdingSources);
  const accountCosts = Object.fromEntries(accounts.map(account => [String(account.id), account.returnRate > -100 ? account.amount / (1 + account.returnRate / 100) : 0]));
  const assetCosts = computeAssetCosts(accounts, holdingSources);
  const holdingCosts = computeHoldingCosts(holdingSources);
  const snapshots = [...(state.snapshots ?? []).filter(snapshot => snapshot.date !== date), { date, total, cost, accountAmounts, accountCosts, assetAmounts, assetCosts, holdingAmounts, holdingCosts }].sort((a, b) => a.date.localeCompare(b.date));
  // 오전 리포트는 장 시작 전이므로 현재 날짜가 아닌, 가장 최근 국내 주식 마감일을 기준으로 비교합니다.
  // 예: 월요일 발송은 목요일 마감 → 금요일 마감, 화요일 발송은 금요일 마감 → 월요일 마감입니다.
  const latestMarketDate = previousWeekday(date);
  const comparisonStartDate = previousWeekday(latestMarketDate);
  const previousSnapshot = [...(state.snapshots ?? [])].filter(snapshot => snapshot.date <= comparisonStartDate).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const currentPortfolioAllocations = portfolioAssetAmounts(accounts, holdingSources);
  const previousPortfolioAllocations = previousPortfolioAssetAmounts(previousSnapshot, accounts, holdingSources);
  const dailyMovers = portfolioDailyMovers(accounts, holdingSources);
  const profitPeaks = updateProfitPeaks(state, accounts, [{ type: "국내 주식", holdings: domestic.holdings }, { type: "ISA", holdings: isa.holdings }, { type: "연금저축", holdings: pension.holdings }, { type: "IRP", holdings: irp }], date);
  const nextState = { ...state, accounts, holdings: domestic.holdings, isaHoldings: isa.holdings, pensionHoldings: pension.holdings, usdHoldings: usd.holdings, coinHoldings: coins, irpHoldings: irp, snapshots, profitPeaks };
  const payload = JSON.stringify(nextState);
  await saveDashboardState(payload);
  if (!options.forceTelegram && state.telegramReportDate === date) return { telegramReport: "already-sent" as const };
  try {
    const reports = telegramReports(state, accounts, latestMarketDate, currentPortfolioAllocations, previousPortfolioAllocations, dailyMovers, previousSnapshot, options.portfolioId);
    if (!reports.length) return { telegramReport: "portfolio-not-found" as const };
    const sent = await sendTelegramReports(reports);
    if (!sent) return { telegramReport: "failed" as const };
    await saveDashboardState(JSON.stringify({ ...nextState, telegramReportDate: date }));
    return { telegramReport: "sent" as const };
  } catch (error) {
    console.error("Telegram daily report failed", error);
    return { telegramReport: "failed" as const };
  }
}
import { loadDashboardState, saveDashboardState } from "./index";
