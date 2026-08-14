type Holding = { symbol: string; quantity: number; averagePrice: number; fallbackPrice: number; accountId?: number };
type Account = { id: number; type: string; amount: number; returnRate: number };
type PortfolioState = { accounts: Account[]; holdings?: Holding[]; usdHoldings?: Holding[]; coinHoldings?: Holding[]; pensionHoldings?: Holding[]; isaHoldings?: Holding[]; snapshots?: Array<{ date: string; total: number }> };

const KST_DATE = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());

async function quote(symbol: string): Promise<number | null> {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, { headers: { "User-Agent": "PortfolioDashboard/1.0" }, cf: { cacheTtl: 60 * 60 * 6, cacheEverything: true } });
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
  const response = await fetch(`https://api.upbit.com/v1/ticker?markets=${encodeURIComponent(markets)}`, { cf: { cacheTtl: 60 * 60 * 6, cacheEverything: true } });
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

export async function saveDailyPortfolioSnapshot(db: D1Database) {
  const saved = await db.prepare("SELECT payload FROM dashboard_state WHERE scope = ? LIMIT 1").bind("owner").first<{ payload: string }>();
  if (!saved) return;
  const state = JSON.parse(saved.payload) as PortfolioState;
  if (!Array.isArray(state.accounts)) return;

  const domestic = await refreshStockPrices(state.holdings ?? []);
  const isa = await refreshStockPrices(state.isaHoldings ?? []);
  const pension = await refreshStockPrices(state.pensionHoldings ?? []);
  const usd = await refreshStockPrices(state.usdHoldings ?? []);
  const usdKrw = await quote("KRW=X") ?? 1380;
  const coins = await refreshCoinPrices(state.coinHoldings ?? []);
  let accounts = accountPerformance(state.accounts, "국내 주식", domestic.holdings);
  accounts = accountPerformance(accounts, "ISA", isa.holdings);
  accounts = accountPerformance(accounts, "연금저축", pension.holdings);
  accounts = accountPerformance(accounts, "미국 주식", usd.holdings, usdKrw);
  accounts = accountPerformance(accounts, "코인", coins);
  const total = accounts.reduce((sum, account) => sum + account.amount, 0);
  const date = KST_DATE();
  const snapshots = [...(state.snapshots ?? []).filter(snapshot => snapshot.date !== date), { date, total }].sort((a, b) => a.date.localeCompare(b.date)).slice(-366);
  const payload = JSON.stringify({ ...state, accounts, holdings: domestic.holdings, isaHoldings: isa.holdings, pensionHoldings: pension.holdings, usdHoldings: usd.holdings, coinHoldings: coins, snapshots });
  await db.prepare("UPDATE dashboard_state SET payload = ?, updated_at = ? WHERE scope = ?").bind(payload, new Date().toISOString(), "owner").run();
}
