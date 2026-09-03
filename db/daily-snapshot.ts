import { PORTFOLIO_ASSET_TYPES, aggregateHoldingsByAsset, calculateConcentrationMetrics, calculateDailyContributions, calculatePortfolioWeights, type AnalyticsAccount, type AnalyticsHolding, type PortfolioAssetType } from "../lib/portfolio-analytics";

type Holding = { symbol: string; name?: string; quantity: number; averagePrice: number; fallbackPrice: number; previousClose?: number; previousCloseDate?: string; quoteDate?: string; market?: string; accountId?: number; assetClass?: string; marketPrice?: number };
type Account = { id: number; type: string; name?: string; amount: number; returnRate: number; portfolioId?: string };
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

function contributionTelegramReports(state: PortfolioState, accounts: Account[], latest: Snapshot, previous: Snapshot, sources: Array<{ holdings: Holding[]; exchangeRate?: number }>, portfolioId?: string) {
  const names = portfolioNames(state);
  const portfolioIds = [...new Set(accounts.map(account => account.portfolioId ?? "kim-soobeom"))].filter(id => !portfolioId || id === portfolioId);
  return portfolioIds.flatMap(id => {
    const portfolioAccounts = accounts.filter(account => (account.portfolioId ?? "kim-soobeom") === id);
    const analyticsAccounts: AnalyticsAccount[] = portfolioAccounts.map(account => ({ ...account, name: account.name ?? account.type }));
    const contribution = calculateDailyContributions({
      accounts: analyticsAccounts,
      sources: sources.map(source => ({ ...source, holdings: source.holdings as AnalyticsHolding[] })),
      latest,
      previous,
      assetWeightsFor: (account, holding) => assetWeightsFor(account.type, holding as Holding) as Array<[PortfolioAssetType, number]>,
    });
    if (!contribution || contribution.currentTotal <= 0 || contribution.previousTotal <= 0) {
      console.warn(JSON.stringify({ event: "telegram_daily_report_skipped", portfolioId: id, evaluationDate: latest.date, reason: "missing-valid-snapshot" }));
      return [];
    }
    const currentItems = aggregateHoldingsByAsset({
      accounts: analyticsAccounts,
      sources: sources.map(source => ({ ...source, holdings: source.holdings as AnalyticsHolding[] })),
      assetTypeFor: (account, holding) => assetTypeFor(account.type, holding as Holding) as PortfolioAssetType,
      assetWeightsFor: (account, holding) => assetWeightsFor(account.type, holding as Holding) as Array<[PortfolioAssetType, number]>,
    });
    const { weights } = calculatePortfolioWeights(currentItems);
    const concentration = calculateConcentrationMetrics(currentItems);
    const valid = contribution.items.filter(item => item.valid && item.name && Number.isFinite(item.amountChange) && item.amountChange !== 0);
    const losses = valid.filter(item => item.amountChange < 0).sort((a, b) => a.amountChange - b.amountChange).slice(0, 5);
    const gains = valid.filter(item => item.amountChange > 0).sort((a, b) => b.amountChange - a.amountChange).slice(0, 5);
    // 등락률 순위는 실질 포트폴리오 영향 순위가 아니므로 참고 정보로만 제공합니다.
    const rateItems = valid.filter(item => item.dailyRate !== null && Number.isFinite(item.dailyRate) && item.previousAmount > 0);
    const gainers = rateItems.filter(item => item.dailyRate! > 0).sort((a, b) => b.dailyRate! - a.dailyRate!).slice(0, 3);
    const losers = rateItems.filter(item => item.dailyRate! < 0).sort((a, b) => a.dailyRate! - b.dailyRate!).slice(0, 3);
    const pointThreshold = Number(process.env.TELEGRAM_CONTRIBUTION_PERCENTAGE_POINT_THRESHOLD ?? "0.01");
    const contributionLines = (items: typeof valid) => items.length ? items.map((item, index) => `${index + 1}. ${item.name}\n   ${signed(item.amountChange)}원${item.contributionPct !== null && Number.isFinite(item.contributionPct) && Math.abs(item.contributionPct) >= pointThreshold ? ` · ${item.contributionPct >= 0 ? "+" : ""}${item.contributionPct.toFixed(2)}%p` : ""}`) : ["- 해당 없음"];
    const rateLines = (items: typeof rateItems) => items.length ? items.map((item, index) => `${index + 1}. [${item.assetType}] ${item.name} ${percent(item.dailyRate!)}`) : ["- 해당 없음"];
    const lossNames = losses.slice(0, 3).map(item => item.name).join("·");
    const gainNames = gains.slice(0, 2).map(item => item.name).join("·");
    const summary = valid.length ? `${lossNames || "손실 기여 종목"}${lossNames ? "이 하락을 주도했고, " : ""}${gainNames || "수익 기여 종목"}${gainNames ? "이 일부 상쇄했습니다." : " 유효한 수익 기여가 없습니다."}` : "유효한 종목별 기여도 데이터가 부족합니다.";
    const allocation = PORTFOLIO_ASSET_TYPES.filter(type => weights[type] > 0).map(type => `${type} ${weights[type].toFixed(1)}%`).join(" · ") || "계산 불가";
    const basis = contribution.calculationBasis === "price_change" && contribution.reconciled ? "가격 변동 손익" : "전일 평가금액 증감 기준";
    if (!contribution.reconciled || contribution.qualityWarnings.length) console.warn(JSON.stringify({ event: "telegram_daily_report_quality", portfolioId: id, evaluationDate: latest.date, basis, reconciliationDifference: contribution.reconciliationDifference, reconciliationTolerance: contribution.reconciliationTolerance, warnings: contribution.qualityWarnings }));
    return [[
      `📊 ${names.get(id) ?? id} 포트폴리오 일일 스냅샷`,
      `${previous.date} → ${latest.date} (KST)`,
      "",
      "💰 전체 자산",
      `${number.format(contribution.currentTotal)}원`,
      `전일 대비 ${signed(contribution.changeAmount)}원${contribution.changeRate === null ? "" : ` (${percent(contribution.changeRate)})`}`,
      `기준: ${basis}`,
      "",
      "📝 오늘의 요약",
      summary,
      "",
      "🔻 오늘 손실 기여 Top 5",
      ...contributionLines(losses),
      "",
      "🚀 오늘 수익 기여 Top 5",
      ...contributionLines(gains),
      "",
      "📈 종목 등락률 Top 3 (참고)",
      ...rateLines(gainers),
      "",
      "📉 종목 등락률 Bottom 3 (참고)",
      ...rateLines(losers),
      "",
      "🧩 자산배분",
      allocation,
      "",
      "🎯 집중도",
      `주식 비중 ${concentration.equityWeight.toFixed(1)}% · 최대 종목 ${concentration.topOneName} ${concentration.topOneWeight.toFixed(1)}% · Top 5 ${concentration.topFiveWeight.toFixed(1)}%`,
    ].join("\n")];
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
  const latestSnapshot = snapshots.at(-1);
  const previousSnapshot = snapshots.filter(snapshot => snapshot.date < date && Object.keys(snapshot.accountAmounts ?? {}).length > 0).at(-1);
  const profitPeaks = updateProfitPeaks(state, accounts, [{ type: "국내 주식", holdings: domestic.holdings }, { type: "ISA", holdings: isa.holdings }, { type: "연금저축", holdings: pension.holdings }, { type: "IRP", holdings: irp }], date);
  const nextState = { ...state, accounts, holdings: domestic.holdings, isaHoldings: isa.holdings, pensionHoldings: pension.holdings, usdHoldings: usd.holdings, coinHoldings: coins, irpHoldings: irp, snapshots, profitPeaks };
  const payload = JSON.stringify(nextState);
  await saveDashboardState(payload);
  if (!latestSnapshot || !previousSnapshot || latestSnapshot.date === previousSnapshot.date) {
    console.warn(JSON.stringify({ event: "telegram_daily_report_skipped", evaluationDate: date, reason: "missing-distinct-evaluation-snapshot" }));
    return { telegramReport: "missing-comparison-snapshot" as const };
  }
  const idempotencyKey = `telegram-daily-portfolio:${latestSnapshot.date}`;
  if (!options.forceTelegram && state.telegramReportDate === latestSnapshot.date) return { telegramReport: "already-sent" as const };
  if (!(await claimTelegramReportDelivery(idempotencyKey))) return { telegramReport: "already-sent" as const };
  try {
    const reports = contributionTelegramReports(state, accounts, latestSnapshot, previousSnapshot, holdingSources, options.portfolioId);
    if (!reports.length) {
      await releaseTelegramReportDelivery(idempotencyKey);
      return { telegramReport: "portfolio-not-found" as const };
    }
    if (reports.some(report => !report.trim() || /(?:NaN|Infinity|undefined|null)/.test(report))) {
      console.error(JSON.stringify({ event: "telegram_daily_report_invalid", evaluationDate: latestSnapshot.date, reason: "unsafe-message-content" }));
      await releaseTelegramReportDelivery(idempotencyKey);
      return { telegramReport: "invalid-message" as const };
    }
    const sent = await sendTelegramReports(reports);
    if (!sent) {
      await releaseTelegramReportDelivery(idempotencyKey);
      return { telegramReport: "failed" as const };
    }
    await saveDashboardState(JSON.stringify({ ...nextState, telegramReportDate: latestSnapshot.date }));
    await completeTelegramReportDelivery(idempotencyKey);
    return { telegramReport: "sent" as const };
  } catch (error) {
    console.error("Telegram daily report failed", error);
    await releaseTelegramReportDelivery(idempotencyKey);
    return { telegramReport: "failed" as const };
  }
}
import { claimTelegramReportDelivery, completeTelegramReportDelivery, loadDashboardState, releaseTelegramReportDelivery, saveDashboardState } from "./index";
