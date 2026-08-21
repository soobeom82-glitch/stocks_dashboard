import { loadDashboardState, saveDashboardState } from "./index";

type Holding = { symbol: string; name?: string; quantity: number; averagePrice: number; fallbackPrice: number; accountId?: number; assetClass?: string };
type Account = { id: number; type: string; amount: number; returnRate: number };
type Snapshot = { date: string; total: number; cost?: number; accountAmounts?: Record<string, number>; accountCosts?: Record<string, number>; assetAmounts?: Record<string, number>; assetCosts?: Record<string, number>; holdingAmounts?: Record<string, number>; holdingCosts?: Record<string, number> };
type State = { accounts: Account[]; holdings?: Holding[]; usdHoldings?: Holding[]; fundHoldings?: Holding[]; coinHoldings?: Holding[]; pensionHoldings?: Holding[]; isaHoldings?: Holding[]; irpHoldings?: Holding[]; snapshots?: Snapshot[]; historicalBackfillVersion?: number };
type AssetType = "국내 주식" | "해외 주식" | "채권·현금성" | "대체자산" | "펀드" | "가상자산";

const KST_DATE = (date = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(date);
const assetTypes: AssetType[] = ["국내 주식", "해외 주식", "채권·현금성", "대체자산", "펀드", "가상자산"];
const emptyAssetMap = () => Object.fromEntries(assetTypes.map(type => [type, 0])) as Record<AssetType, number>;
const holdingKey = (accountId: number, holding: Holding) => `${accountId}:${holding.symbol}:${holding.name ?? ""}`;
const recentDates = (count: number) => Array.from({ length: count }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - (count - 1 - index)); return KST_DATE(date); });

function assetTypeFor(account: Account, holding?: Holding): AssetType {
  if (holding?.symbol === "CASH-KRW" || holding?.name === "예수금") return "채권·현금성";
  if (account.type === "코인") return "가상자산";
  if (account.type === "펀드") return "펀드";
  if (holding?.assetClass === "현금성·금융상품") return "채권·현금성";
  const text = `${holding?.name ?? ""} ${holding?.symbol ?? ""}`.toLowerCase();
  if (/금|gold|iau|gdx|리츠|reit|원자재|commodity/.test(text)) return "대체자산";
  if (/국채|채권|bond|미국채/.test(text)) return "채권·현금성";
  if (account.type === "미국 주식" || /미국|나스닥|s&p|nifty|차이나|글로벌|msci|해외|인도/.test(text)) return "해외 주식";
  return "국내 주식";
}
function assetWeightsFor(account: Account, holding?: Holding): Array<[AssetType, number]> {
  return holding?.symbol === "284430.KS"
    ? [["국내 주식", 0.5], ["채권·현금성", 0.5]]
    : [[assetTypeFor(account, holding), 1]];
}

async function yahooHistory(symbol: string, count: number) {
  const end = Math.floor(Date.now() / 1000) + 86_400;
  const start = end - (count + 14) * 86_400;
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${start}&period2=${end}&interval=1d`, { headers: { "User-Agent": "PortfolioDashboard/1.0" }, cache: "no-store" });
  if (!response.ok) return new Map<string, number>();
  const data = await response.json() as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
  const result = data.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  return new Map((result?.timestamp ?? []).flatMap((stamp, index) => typeof closes[index] === "number" && closes[index]! > 0 ? [[KST_DATE(new Date(stamp * 1000)), closes[index]!] as const] : []));
}

async function upbitHistory(symbol: string) {
  const response = await fetch(`https://api.upbit.com/v1/candles/days?market=KRW-${encodeURIComponent(symbol)}&count=22`, { cache: "no-store" });
  if (!response.ok) return new Map<string, number>();
  const data = await response.json() as Array<{ candle_date_time_kst?: string; trade_price?: number }>;
  return new Map(data.flatMap(item => typeof item.candle_date_time_kst === "string" && typeof item.trade_price === "number" ? [[item.candle_date_time_kst.slice(0, 10), item.trade_price] as const] : []));
}

function latestOnOrBefore(history: Map<string, number>, date: string, fallback: number) {
  return [...history.entries()].filter(([recorded]) => recorded <= date).sort(([a], [b]) => a.localeCompare(b)).at(-1)?.[1] ?? fallback;
}

export async function backfillRecentSnapshots(count = 10) {
  const saved = await loadDashboardState();
  if (!saved) throw new Error("No dashboard state");
  const state = JSON.parse(saved.payload) as State;
  if (!Array.isArray(state.accounts)) throw new Error("Invalid dashboard state");
  const dates = recentDates(count);
  const allHoldings = [...(state.holdings ?? []), ...(state.usdHoldings ?? []), ...(state.fundHoldings ?? []), ...(state.coinHoldings ?? []), ...(state.pensionHoldings ?? []), ...(state.isaHoldings ?? []), ...(state.irpHoldings ?? [])];
  const stockSymbols = [...new Set(allHoldings.filter(item => item.accountId !== 7 && item.assetClass !== "현금성·금융상품" && item.symbol && !item.symbol.startsWith("IRP-")).map(item => item.symbol))];
  const [stockEntries, exchangeHistory, coinEntries] = await Promise.all([
    Promise.all(stockSymbols.map(async symbol => [symbol, await yahooHistory(symbol, count)] as const)),
    yahooHistory("KRW=X", count),
    Promise.all((state.coinHoldings ?? []).map(async item => [item.symbol, await upbitHistory(item.symbol)] as const)),
  ]);
  const stockHistory = new Map(stockEntries);
  const coinHistory = new Map(coinEntries);
  const snapshots = new Map((state.snapshots ?? []).map(snapshot => [snapshot.date, snapshot]));

  dates.forEach(date => {
    const exchangeRate = latestOnOrBefore(exchangeHistory, date, 1380);
    const accountAmounts: Record<string, number> = {};
    const accountCosts: Record<string, number> = {};
    const holdingAmounts: Record<string, number> = {};
    const holdingCosts: Record<string, number> = {};
    const assetAmounts = emptyAssetMap();
    const assetCosts = emptyAssetMap();
    state.accounts.forEach(account => {
      const positions = allHoldings.filter(holding => holding.accountId === account.id);
      if (!positions.length) {
        accountAmounts[String(account.id)] = account.amount;
        accountCosts[String(account.id)] = account.returnRate > -100 ? account.amount / (1 + account.returnRate / 100) : 0;
        assetAmounts[assetTypeFor(account)] += account.amount;
        assetCosts[assetTypeFor(account)] += accountCosts[String(account.id)];
        return;
      }
      const rows = positions.map(holding => {
        const isUsd = account.type === "미국 주식";
        const isCoin = account.type === "코인";
        const unitPrice = isCoin ? latestOnOrBefore(coinHistory.get(holding.symbol) ?? new Map(), date, holding.fallbackPrice) : (holding.assetClass === "ETF·주식" || ["국내 주식", "미국 주식", "ISA", "연금저축"].includes(account.type) ? latestOnOrBefore(stockHistory.get(holding.symbol) ?? new Map(), date, holding.fallbackPrice) : holding.fallbackPrice);
        const multiplier = isUsd ? exchangeRate : 1;
        return { holding, value: holding.quantity * unitPrice * multiplier, cost: holding.quantity * holding.averagePrice * multiplier };
      });
      const amount = rows.reduce((sum, row) => sum + row.value, 0);
      const cost = rows.reduce((sum, row) => sum + row.cost, 0);
      accountAmounts[String(account.id)] = amount;
      accountCosts[String(account.id)] = cost;
      rows.forEach(row => {
        const key = holdingKey(account.id, row.holding);
        holdingAmounts[key] = row.value;
        holdingCosts[key] = row.cost;
        assetWeightsFor(account, row.holding).forEach(([type, weight]) => {
          assetAmounts[type] += row.value * weight;
          assetCosts[type] += row.cost * weight;
        });
      });
    });
    const total = Object.values(accountAmounts).reduce((sum, value) => sum + value, 0);
    const cost = Object.values(accountCosts).reduce((sum, value) => sum + value, 0);
    snapshots.set(date, { date, total, cost, accountAmounts, accountCosts, assetAmounts, assetCosts, holdingAmounts, holdingCosts });
  });
  const nextSnapshots = [...snapshots.values()].sort((a, b) => a.date.localeCompare(b.date));
  await saveDashboardState(JSON.stringify({ ...state, snapshots: nextSnapshots, historicalBackfillVersion: 1 }));
  return { snapshots: nextSnapshots, addedDates: dates.filter(date => nextSnapshots.some(snapshot => snapshot.date === date)) };
}
