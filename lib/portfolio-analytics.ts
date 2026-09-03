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
  holdingStatus?: string;
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
  lots: HoldingLot[];
};

export type HoldingLot = {
  accountId: number;
  accountName: string;
  holdingStatus: string;
  quantity: number;
  evaluationAmount: number;
  costAmount: number;
};

export type DailyContribution = AggregatedHolding & {
  previousAmount: number;
  amountChange: number;
  contributionPct: number | null;
  dailyRate: number | null;
  valid: boolean;
};

export type DailyContributionResult = {
  items: DailyContribution[];
  currentTotal: number;
  previousTotal: number;
  changeAmount: number;
  changeRate: number | null;
  priceChangeProfit: number | null;
  contributionTotal: number;
  cashFlowAdjustment: number | null;
  calculationBasis: "price_change" | "evaluation_delta";
  reconciliationDifference: number;
  reconciliationTolerance: number;
  reconciled: boolean;
  qualityWarnings: string[];
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
const holdingStatusPattern = /(^|[\s·ㆍ()[\]_-])(대여|현금|담보|대용|신용|융자|대주)(?=$|[\s·ㆍ()[\]_-])/gu;
const normalizedHoldingName = (name: string) => name.trim().toLocaleLowerCase("ko-KR").replace(/[\s··_\-()]/g, "");
export const holdingStatusFor = (holding: AnalyticsHolding) => holding.holdingStatus?.trim() || [...holding.name.matchAll(holdingStatusPattern)][0]?.[2] || "기타";
export const assetDisplayName = (holding: AnalyticsHolding) => holding.name.replace(holdingStatusPattern, "$1").replace(/\s{2,}/g, " ").trim();
const holdingIdentity = (holding: AnalyticsHolding) => holding.symbol.trim() || normalizedHoldingName(assetDisplayName(holding));
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
        lots: [{ accountId: account.id, accountName: account.name, holdingStatus: "기타", quantity: 0, evaluationAmount: account.amount, costAmount: account.returnRate > -100 ? account.amount / (1 + account.returnRate / 100) : 0 }],
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
        name: assetDisplayName(holding),
        ticker: holding.symbol,
        assetType,
        market,
        evaluationAmount: (prior?.evaluationAmount ?? 0) + nextAmount,
        costAmount: (prior?.costAmount ?? 0) + nextCost,
        accountIds: [...new Set([...(prior?.accountIds ?? []), account.id])],
        lots: [...(prior?.lots ?? []), { accountId: account.id, accountName: account.name, holdingStatus: holdingStatusFor(holding), quantity: holding.quantity * weight, evaluationAmount: nextAmount, costAmount: nextCost }],
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
  assetWeightsFor,
}: {
  accounts: AnalyticsAccount[];
  sources: HoldingSource[];
  latest?: PortfolioSnapshot;
  previous?: PortfolioSnapshot;
  assetWeightsFor: AssetWeightResolver;
}): DailyContributionResult | null {
  if (!latest?.holdingAmounts || !previous?.holdingAmounts || !latest.accountAmounts || !previous.accountAmounts) return null;
  const latestHoldingAmounts = latest.holdingAmounts;
  const previousHoldingAmounts = previous.holdingAmounts;
  const latestAccountAmounts = latest.accountAmounts;
  const previousAccountAmounts = previous.accountAmounts;
  const byAccount = positionsByAccount(accounts, sources);
  const results = new Map<string, DailyContribution>();
  const previousPortfolioAmount = accounts.reduce((sum, account) => sum + numberOrZero(previousAccountAmounts[String(account.id)]), 0);
  const currentPortfolioAmount = accounts.reduce((sum, account) => sum + numberOrZero(latestAccountAmounts[String(account.id)]), 0);
  const qualityWarnings: string[] = [];
  accounts.forEach(account => {
    const positions = byAccount.get(account.id) ?? [];
    const currentAccountAmount = numberOrZero(latestAccountAmounts[String(account.id)]);
    const previousAccountAmount = numberOrZero(previousAccountAmounts[String(account.id)]);
    if (!positions.length) {
      if (currentAccountAmount || previousAccountAmount) {
        const id = `account:${account.id}`;
        results.set(id, {
          id, name: account.name, assetType: assetTypeForFallback(account), market: marketFor(account), evaluationAmount: currentAccountAmount,
          costAmount: 0, previousAmount: previousAccountAmount, amountChange: 0, contributionPct: null, dailyRate: null, valid: false,
          portfolioWeight: currentPortfolioAmount > 0 ? currentAccountAmount / currentPortfolioAmount * 100 : 0, returnRate: null, accountIds: [account.id], lots: [],
        });
        qualityWarnings.push(`${account.name}: 종목별 스냅샷이 없어 계좌 증감으로 보정했습니다.`);
      }
      return;
    }
    const latestRawTotal = positions.reduce((sum, position) => sum + numberOrZero(latestHoldingAmounts[holdingKey(account.id, position.holding)]), 0);
    const previousRawTotal = positions.reduce((sum, position) => sum + numberOrZero(previousHoldingAmounts[holdingKey(account.id, position.holding)]), 0);
    const latestScale = latestRawTotal > 0 ? currentAccountAmount / latestRawTotal : 1;
    const previousScale = previousRawTotal > 0 ? previousAccountAmount / previousRawTotal : 1;
    if (latestRawTotal <= 0 || previousRawTotal <= 0) qualityWarnings.push(`${account.name}: 직전 또는 현재 종목별 스냅샷이 불완전합니다.`);
    positions.forEach(({ holding, cost }) => assetWeightsFor(account, holding).forEach(([assetType, weight]) => {
      const key = holdingKey(account.id, holding);
      const latestAmount = numberOrZero(latestHoldingAmounts[key]) * latestScale * weight;
      const previousAmount = numberOrZero(previousHoldingAmounts[key]) * previousScale * weight;
      if (latestAmount === 0 && previousAmount === 0) return;
      const market = marketFor(account, holding);
      const id = `${assetType}:${market}:${holdingIdentity(holding)}`;
      const item = results.get(id);
      results.set(id, {
        id,
        name: assetDisplayName(holding),
        ticker: holding.symbol,
        assetType,
        market,
        evaluationAmount: (item?.evaluationAmount ?? 0) + latestAmount,
        costAmount: (item?.costAmount ?? 0) + cost * weight,
        previousAmount: (item?.previousAmount ?? 0) + previousAmount,
        amountChange: 0,
        contributionPct: null,
        dailyRate: null,
        valid: true,
        portfolioWeight: 0,
        returnRate: null,
        accountIds: [...new Set([...(item?.accountIds ?? []), account.id])],
        lots: [],
      });
    }));
  });
  const total = [...results.values()].reduce((sum, item) => sum + item.evaluationAmount, 0);
  const items = [...results.values()].map(item => {
    const amountChange = item.evaluationAmount - item.previousAmount;
    return {
      ...item,
      amountChange,
      contributionPct: previousPortfolioAmount > 0 ? amountChange / previousPortfolioAmount * 100 : null,
      dailyRate: item.previousAmount > 0 ? amountChange / item.previousAmount * 100 : null,
      portfolioWeight: total > 0 ? item.evaluationAmount / total * 100 : 0,
      returnRate: item.costAmount > 0 ? (item.evaluationAmount / item.costAmount - 1) * 100 : null,
    };
  }).filter(item => Number.isFinite(item.evaluationAmount) && Number.isFinite(item.previousAmount) && Number.isFinite(item.amountChange)).sort((left, right) => right.amountChange - left.amountChange);
  const changeAmount = currentPortfolioAmount - previousPortfolioAmount;
  const contributionTotal = items.reduce((sum, item) => sum + item.amountChange, 0);
  const reconciliationDifference = contributionTotal - changeAmount;
  const reconciliationTolerance = Math.max(1000, Math.abs(changeAmount) * 0.001);
  const reconciled = Math.abs(reconciliationDifference) <= reconciliationTolerance;
  if (!reconciled) qualityWarnings.push("종목 기여금액 합계와 포트폴리오 증감의 정합성이 허용 범위를 벗어났습니다.");
  // 현재 저장소에는 신뢰 가능한 거래·입출금·대여 변동 이력이 없으므로 가격 변동 손익으로 단정하지 않습니다.
  return {
    items,
    currentTotal: currentPortfolioAmount,
    previousTotal: previousPortfolioAmount,
    changeAmount,
    changeRate: previousPortfolioAmount > 0 ? changeAmount / previousPortfolioAmount * 100 : null,
    priceChangeProfit: null,
    contributionTotal,
    cashFlowAdjustment: null,
    calculationBasis: "evaluation_delta",
    reconciliationDifference,
    reconciliationTolerance,
    reconciled,
    qualityWarnings,
  };
}

function assetTypeForFallback(account: AnalyticsAccount): PortfolioAssetType {
  if (account.type === "코인") return "가상자산";
  if (account.type === "펀드") return "펀드";
  if (["채권", "IRP"].includes(account.type)) return "채권·현금성";
  if (account.type === "미국 주식") return "해외 주식";
  return "국내 주식";
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
