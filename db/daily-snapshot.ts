type Holding = { symbol: string; name?: string; quantity: number; averagePrice: number; fallbackPrice: number; accountId?: number; assetClass?: string; marketPrice?: number };
type Account = { id: number; type: string; amount: number; returnRate: number };
type ProfitPeak = { profit: number; date: string };
type PortfolioState = { accounts: Account[]; holdings?: Holding[]; usdHoldings?: Holding[]; fundHoldings?: Holding[]; coinHoldings?: Holding[]; pensionHoldings?: Holding[]; isaHoldings?: Holding[]; irpHoldings?: Holding[]; snapshots?: Array<{ date: string; total: number; cost?: number; accountAmounts?: Record<string, number>; accountCosts?: Record<string, number>; assetAmounts?: Record<string, number>; assetCosts?: Record<string, number>; holdingAmounts?: Record<string, number>; holdingCosts?: Record<string, number> }>; profitPeaks?: Record<string, ProfitPeak> };

const KST_DATE = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
const holdingSnapshotKey = (accountId: number, holding: Holding) => `${accountId}:${holding.symbol}:${holding.name ?? ""}`;

async function quote(symbol: string): Promise<number | null> {
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
    positions.forEach(position => { amounts[assetTypeFor(account.type, position.holding)] += account.amount * position.value / positionsTotal; });
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
    positions.forEach(position => { costs[assetTypeFor(account.type, position.holding)] += accountCost * position.value / positionsTotal; });
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
  const payload = JSON.stringify({ ...state, accounts, holdings: domestic.holdings, isaHoldings: isa.holdings, pensionHoldings: pension.holdings, usdHoldings: usd.holdings, coinHoldings: coins, irpHoldings: irp, snapshots, profitPeaks });
  await saveDashboardState(payload);
}
import { loadDashboardState, saveDashboardState } from "./index";
