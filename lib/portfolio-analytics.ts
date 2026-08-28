export const PORTFOLIO_ASSET_TYPES = ["국내 주식", "해외 주식", "채권·현금성", "대체자산", "펀드", "가상자산"] as const;

export type PortfolioAssetType = (typeof PORTFOLIO_ASSET_TYPES)[number];

export type AnalyticsAccount = {
  id: number;
  type: string;
  name: string;
  amount: number;
  returnRate: number;
};

export type AnalyticsHolding = {
  symbol: string;
  name: string;
  quantity: number;
  averagePrice: number;
  fallbackPrice: number;
  accountId?: number;
  market?: string;
};

export type PortfolioSnapshot = {
  date: string;
  accountAmounts?: Record<string, number>;
  holdingAmounts?: Record<string, number>;
};

export type HoldingSource = { holdings: AnalyticsHolding[]; exchangeRate?: number };
export type AssetTypeResolver = (account: AnalyticsAccount, holding?: AnalyticsHolding) => PortfolioAssetType;
export type AssetWeightResolver = (account: AnalyticsAccount, holding: AnalyticsHolding) => Array<[PortfolioAssetType, number]>;

export type AggregatedHolding = {
  id: string;
  name: string;
  ticker?: string;
  assetType: PortfolioAssetType;
  market: string;
  evaluationAmount: number;
  costAmount: number;
  portfolioWeight: number;
  returnRate: number | null;
  accountIds: number[];
};

export type DailyContribution = AggregatedHolding & {
  previousAmount: number;
  amountChange: number;
  contributionPct: number | null;
};

export type TargetAllocationGap = {
  assetType: PortfolioAssetType;
  currentAmount: number;
  currentWeight: number;
  targetWeight: number;
  gapPct: number;
  targetAmount: number;
  adjustmentAmount: number;
};

const holdingKey = (accountId: number, holding: AnalyticsHolding) => `${accountId}:${holding.symbol}:${holding.name}`;
const numberOrZero = (value: number | undefined) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const normalizedHoldingName = (name: string) => name.trim().toLocaleLowerCase("ko-KR").replace(/[\s··_\-()]/g, "");
const holdingIdentity = (holding: AnalyticsHolding) => holding.symbol.trim() || normalizedHoldingName(holding.name);
const CONCENTRATION_LIMITS = {
  equity: { high: 70, veryHigh: 85 },
  single: { caution: 10, high: 20 },
  topFive: { caution: 40, high: 60 },
} as const;
const marketFor = (account: AnalyticsAccount, holding?: AnalyticsHolding) => {
  if (holding?.market) return holding.market;
  if (account.type === "미국 주식") return "US";
  if (account.type === "코인") return "CRYPTO";
  return "KR";
};

function positionsByAccount(accounts: AnalyticsAccount[], sources: HoldingSource[]) {
  const grouped = new Map<number, Array<{ holding: AnalyticsHolding; value: number; cost: number }>>();
  sources.forEach(({ holdings, exchangeRate = 1 }) => holdings.forEach(holding => {
    if (!holding.accountId) return;
    const rows = grouped.get(holding.accountId) ?? [];
    rows.push({
      holding,
      value: holding.quantity * holding.fallbackPrice * exchangeRate,
      cost: holding.quantity * holding.averagePrice * exchangeRate,
    });
    grouped.set(holding.accountId, rows);
  }));
  return new Map(accounts.map(account => [account.id, grouped.get(account.id) ?? []]));
}

export function aggregateHoldingsByAsset({
  accounts,
  sources,
  assetTypeFor,
  assetWeightsFor,
}: {
  accounts: AnalyticsAccount[];
  sources: HoldingSource[];
  assetTypeFor: AssetTypeResolver;
  assetWeightsFor: AssetWeightResolver;
}): AggregatedHolding[] {
  const records = new Map<string, Omit<AggregatedHolding, "portfolioWeight" | "returnRate">>();
  const byAccount = positionsByAccount(accounts, sources);
  accounts.forEach(account => {
    const positions = byAccount.get(account.id) ?? [];
    const rawAmount = positions.reduce((sum, position) => sum + position.value, 0);
    const scale = rawAmount > 0 ? account.amount / rawAmount : 1;
    if (!positions.length && account.amount > 0) {
      const assetType = assetTypeFor(account);
      const id = `account:${account.id}`;
      records.set(id, {
        id,
        name: account.name,
        assetType,
        market: marketFor(account),
        evaluationAmount: account.amount,
        costAmount: account.returnRate > -100 ? account.amount / (1 + account.returnRate / 100) : 0,
        accountIds: [account.id],
      });
      return;
    }
    positions.forEach(({ holding, value, cost }) => assetWeightsFor(account, holding).forEach(([assetType, weight]) => {
      const market = marketFor(account, holding);
      const id = `${assetType}:${market}:${holdingIdentity(holding)}`;
      const prior = records.get(id);
      const nextAmount = value * scale * weight;
      const nextCost = cost * scale * weight;
      records.set(id, {
        id,
        name: holding.name,
        ticker: holding.symbol,
        assetType,
        market,
        evaluationAmount: (prior?.evaluationAmount ?? 0) + nextAmount,
        costAmount: (prior?.costAmount ?? 0) + nextCost,
        accountIds: [...new Set([...(prior?.accountIds ?? []), account.id])],
      });
    }));
  });
  const total = [...records.values()].reduce((sum, item) => sum + item.evaluationAmount, 0);
  return [...records.values()].map(item => ({
    ...item,
    portfolioWeight: total > 0 ? item.evaluationAmount / total * 100 : 0,
    returnRate: item.costAmount > 0 ? (item.evaluationAmount / item.costAmount - 1) * 100 : null,
  })).sort((left, right) => right.evaluationAmount - left.evaluationAmount);
}

export function calculatePortfolioWeights(items: AggregatedHolding[]) {
  const values = Object.fromEntries(PORTFOLIO_ASSET_TYPES.map(type => [type, 0])) as Record<PortfolioAssetType, number>;
  items.forEach(item => { values[item.assetType] += item.evaluationAmount; });
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  const weights = Object.fromEntries(PORTFOLIO_ASSET_TYPES.map(type => [type, total > 0 ? values[type] / total * 100 : 0])) as Record<PortfolioAssetType, number>;
  return { total, amounts: values, weights };
}

export function calculateConcentrationMetrics(items: AggregatedHolding[]) {
  const { weights } = calculatePortfolioWeights(items);
  const topOne = items[0];
  return {
    equityWeight: weights["국내 주식"] + weights["해외 주식"],
    domesticWeight: weights["국내 주식"],
    topOneWeight: topOne?.portfolioWeight ?? 0,
    topOneName: topOne?.name ?? "-",
    topFiveWeight: items.slice(0, 5).reduce((sum, item) => sum + item.portfolioWeight, 0),
  };
}

export function concentrationTone(kind: "equity" | "single" | "topFive", value: number) {
  if (kind === "equity") {
    if (value > CONCENTRATION_LIMITS.equity.veryHigh) return "매우 높음";
    return value >= CONCENTRATION_LIMITS.equity.high ? "높음" : "보통";
  }
  const limits = kind === "single" ? CONCENTRATION_LIMITS.single : CONCENTRATION_LIMITS.topFive;
  return value > limits.high ? "높음" : value >= limits.caution ? "주의" : "보통";
}

export function portfolioSummary(items: AggregatedHolding[]) {
  const metrics = calculateConcentrationMetrics(items);
  const profile = metrics.equityWeight > 85 ? "공격적" : metrics.equityWeight >= 70 ? "성장형" : "균형형";
  const domestic = metrics.domesticWeight > 55 ? "국내 비중 높음" : "국내 비중 보통";
  const singleSummary = metrics.topOneWeight > CONCENTRATION_LIMITS.single.high ? "높음" : metrics.topOneWeight >= CONCENTRATION_LIMITS.single.caution ? "주의" : "낮음";
  return `${profile} · 주식 ${metrics.equityWeight.toFixed(1)}% · ${domestic} · 단일 종목 집중 ${singleSummary}`;
}

export function calculateDailyContributions({
  accounts,
  sources,
  latest,
  previous,
  assetTypeFor,
  assetWeightsFor,
}: {
  accounts: AnalyticsAccount[];
  sources: HoldingSource[];
  latest?: PortfolioSnapshot;
  previous?: PortfolioSnapshot;
  assetTypeFor: AssetTypeResolver;
  assetWeightsFor: AssetWeightResolver;
}) {
  if (!latest?.holdingAmounts || !previous?.holdingAmounts) return null;
  const byAccount = positionsByAccount(accounts, sources);
  const results = new Map<string, DailyContribution>();
  const previousPortfolioAmount = accounts.reduce((sum, account) => sum + numberOrZero(previous.accountAmounts?.[String(account.id)]), 0);
  accounts.forEach(account => {
    const positions = byAccount.get(account.id) ?? [];
    const latestRawTotal = positions.reduce((sum, position) => sum + numberOrZero(latest.holdingAmounts?.[holdingKey(account.id, position.holding)]), 0);
    const previousRawTotal = positions.reduce((sum, position) => sum + numberOrZero(previous.holdingAmounts?.[holdingKey(account.id, position.holding)]), 0);
    const latestScale = latestRawTotal > 0 ? numberOrZero(latest.accountAmounts?.[String(account.id)]) / latestRawTotal : 1;
    const previousScale = previousRawTotal > 0 ? numberOrZero(previous.accountAmounts?.[String(account.id)]) / previousRawTotal : 1;
    positions.forEach(({ holding, cost }) => assetWeightsFor(account, holding).forEach(([assetType, weight]) => {
      const key = holdingKey(account.id, holding);
      const latestAmount = numberOrZero(latest.holdingAmounts?.[key]) * latestScale * weight;
      const previousAmount = numberOrZero(previous.holdingAmounts?.[key]) * previousScale * weight;
      if (latestAmount === 0 && previousAmount === 0) return;
      const market = marketFor(account, holding);
      const id = `${assetType}:${market}:${holdingIdentity(holding)}`;
      const item = results.get(id);
      results.set(id, {
        id,
        name: holding.name,
        ticker: holding.symbol,
        assetType,
        market,
        evaluationAmount: (item?.evaluationAmount ?? 0) + latestAmount,
        costAmount: (item?.costAmount ?? 0) + cost * weight,
        previousAmount: (item?.previousAmount ?? 0) + previousAmount,
        amountChange: 0,
        contributionPct: null,
        portfolioWeight: 0,
        returnRate: null,
        accountIds: [...new Set([...(item?.accountIds ?? []), account.id])],
      });
    }));
  });
  const total = [...results.values()].reduce((sum, item) => sum + item.evaluationAmount, 0);
  return [...results.values()].map(item => {
    const amountChange = item.evaluationAmount - item.previousAmount;
    return {
      ...item,
      amountChange,
      contributionPct: previousPortfolioAmount > 0 ? amountChange / previousPortfolioAmount * 100 : null,
      portfolioWeight: total > 0 ? item.evaluationAmount / total * 100 : 0,
      returnRate: item.costAmount > 0 ? (item.evaluationAmount / item.costAmount - 1) * 100 : null,
    };
  }).sort((left, right) => right.amountChange - left.amountChange);
}

export function calculateTargetAllocationGap({
  items,
  targets,
}: {
  items: AggregatedHolding[];
  targets: Partial<Record<PortfolioAssetType, number>>;
}): TargetAllocationGap[] {
  const { total, amounts, weights } = calculatePortfolioWeights(items);
  return PORTFOLIO_ASSET_TYPES.map(assetType => {
    const targetWeight = targets[assetType] ?? 0;
    const targetAmount = total * targetWeight / 100;
    return {
      assetType,
      currentAmount: amounts[assetType],
      currentWeight: weights[assetType],
      targetWeight,
      gapPct: weights[assetType] - targetWeight,
      targetAmount,
      adjustmentAmount: targetAmount - amounts[assetType],
    };
  });
}
