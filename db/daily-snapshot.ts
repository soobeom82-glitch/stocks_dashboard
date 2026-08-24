type Holding = { symbol: string; name?: string; quantity: number; averagePrice: number; fallbackPrice: number; accountId?: number; assetClass?: string; marketPrice?: number };
type Account = { id: number; type: string; amount: number; returnRate: number; portfolioId?: string };
type ProfitPeak = { profit: number; date: string };
type PortfolioState = { portfolios?: Array<{ id: string; name: string }>; accounts: Account[]; holdings?: Holding[]; usdHoldings?: Holding[]; fundHoldings?: Holding[]; coinHoldings?: Holding[]; pensionHoldings?: Holding[]; isaHoldings?: Holding[]; irpHoldings?: Holding[]; snapshots?: Array<{ date: string; total: number; cost?: number; accountAmounts?: Record<string, number>; accountCosts?: Record<string, number>; assetAmounts?: Record<string, number>; assetCosts?: Record<string, number>; holdingAmounts?: Record<string, number>; holdingCosts?: Record<string, number> }>; profitPeaks?: Record<string, ProfitPeak>; telegramReportDate?: string };

const KST_DATE = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
const holdingSnapshotKey = (accountId: number, holding: Holding) => `${accountId}:${holding.symbol}:${holding.name ?? ""}`;
const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const signed = (value: number) => `${value >= 0 ? "+" : ""}${number.format(value)}`;
const percent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

function telegramReports(state: PortfolioState, accounts: Account[], date: string) {
  const names = new Map([["kim-soobeom", "김수범"], ["kim-seoha", "김서하"], ["kim-eunho", "김은호"]]);
  state.portfolios?.forEach(portfolio => names.set(portfolio.id, portfolio.name));
  const groups = new Map<string, { amount: number; cost: number }>();
  accounts.forEach(account => {
    const id = account.portfolioId ?? "kim-soobeom";
    const group = groups.get(id) ?? { amount: 0, cost: 0 };
    group.amount += account.amount;
    group.cost += account.returnRate > -100 ? account.amount / (1 + account.returnRate / 100) : 0;
    groups.set(id, group);
  });
  return [...groups.entries()].map(([id, group]) => [
    `📊 ${names.get(id) ?? id} 포트폴리오 일일 스냅샷`,
    `${date} KST`,
    "",
    `평가금액  ${number.format(group.amount)}원`,
    `수익률  ${group.cost > 0 ? percent((group.amount / group.cost - 1) * 100) : "-"}`,
    `평가손익  ${signed(group.amount - group.cost)}원`,
  ].join("\n"));
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

async function quote(symbol: string): Promise<number | null> {
  if (/^\d{6}\.KS$/.test(symbol)) {
    const code = symbol.replace(/\.KS$/, "");
    const response = await fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json() as { closePrice?: string };
    const price = Number(data.closePrice?.replaceAll(",", ""));
    return Number.isFinite(price) && price > 0 ? price : null;
  }
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, { headers: { "User-Agent": "PortfolioDashboard/1.0" }, next: { revalidate: 21600 } });
  if (!response.ok) return null;
  const data = await response.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
  const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
  return typeof price === "number" && price > 0 ? price : null;
}

async function refreshStockPrices(holdings: Holding[], exchangeRate = 1) {
  const quotes = await Promise.all(holdings.map(async holding => [holding.symbol, await quote(holding.symbol)] as const));
  const prices = Object.fromEntries(quotes.filter((entry): entry is [string, number] => entry[1] !== null));
  const next = holdings.map(holding => ({ ...holding, fallbackPrice: prices[holding.symbol] ?? holding.fallbackPrice }));
  return { holdings: next, exchangeRate };
}

async function refreshCoinPrices(holdings: Holding[]) {
  if (!holdings.length) return holdings;
  const markets = holdings.map(holding => `KRW-${holding.symbol}`).join(",");
  const response = await fetch(`https://api.upbit.com/v1/ticker?markets=${encodeURIComponent(markets)}`, { next: { revalidate: 21600 } });
  if (!response.ok) return holdings;
  const data = await response.json() as Array<{ market: string; trade_price: number }>;
  const prices = Object.fromEntries(data.map(item => [item.market, item.trade_price]));
  return holdings.map(holding => ({ ...holding, fallbackPrice: prices[`KRW-${holding.symbol}`] ?? holding.fallbackPrice }));
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
  const amounts: Record<string, number> = { "국내 주식": 0, "해외 주식": 0, "채권·현금성": 0, "대체자산": 0, "펀드": 0, "가상자산": 0 };
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

export async function saveDailyPortfolioSnapshot() {
  const saved = await loadDashboardState();
  if (!saved) return;
  const state = JSON.parse(saved.payload) as PortfolioState;
  if (!Array.isArray(state.accounts)) return;

  const domestic = await refreshStockPrices(state.holdings ?? []);
  const isa = await refreshStockPrices(state.isaHoldings ?? []);
  const pension = await refreshStockPrices(state.pensionHoldings ?? []);
  const usd = await refreshStockPrices(state.usdHoldings ?? []);
  const usdKrw = await quote("KRW=X") ?? 1380;
  const coins = await refreshCoinPrices(state.coinHoldings ?? []);
  const irpHoldings = state.irpHoldings ?? [];
  const irpQuoted = await refreshStockPrices(irpHoldings.filter(holding => holding.assetClass === "ETF·주식" && holding.symbol.endsWith(".KS")));
  const irpPrices = Object.fromEntries(irpQuoted.holdings.map(holding => [holding.symbol, holding.fallbackPrice]));
  const irp = irpHoldings.map(holding => irpPrices[holding.symbol] ? { ...holding, fallbackPrice: irpPrices[holding.symbol], marketPrice: irpPrices[holding.symbol] } : holding);
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
  const profitPeaks = updateProfitPeaks(state, accounts, [{ type: "국내 주식", holdings: domestic.holdings }, { type: "ISA", holdings: isa.holdings }, { type: "연금저축", holdings: pension.holdings }, { type: "IRP", holdings: irp }], date);
  const nextState = { ...state, accounts, holdings: domestic.holdings, isaHoldings: isa.holdings, pensionHoldings: pension.holdings, usdHoldings: usd.holdings, coinHoldings: coins, irpHoldings: irp, snapshots, profitPeaks };
  const payload = JSON.stringify(nextState);
  await saveDashboardState(payload);
  if (state.telegramReportDate === date) return { telegramReport: "already-sent" as const };
  try {
    const sent = await sendTelegramReports(telegramReports(state, accounts, date));
    if (!sent) return { telegramReport: "failed" as const };
    await saveDashboardState(JSON.stringify({ ...nextState, telegramReportDate: date }));
    return { telegramReport: "sent" as const };
  } catch (error) {
    console.error("Telegram daily report failed", error);
    return { telegramReport: "failed" as const };
  }
}
import { loadDashboardState, saveDashboardState } from "./index";
