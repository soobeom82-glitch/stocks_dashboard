"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PORTFOLIO_ASSET_TYPES,
  aggregateHoldingsByAsset,
  calculateConcentrationMetrics,
  calculateDailyContributions,
  calculateTargetAllocationGap,
  concentrationTone,
  portfolioSummary,
  type AnalyticsAccount,
  type AnalyticsHolding,
  type PortfolioAssetType,
} from "../lib/portfolio-analytics";
import "./holdings.css";
import "./reset.css";
import "./empty.css";
import "./account-manager.css";
import "./accounts.css";
import "./trend.css";

type Portfolio = { id: string; name: string };
type Account = { id: number; type: string; broker: string; name: string; amount: number; returnRate: number; color: string; portfolioId?: string };
type Holding = { symbol: string; name: string; quantity: number; averagePrice: number; fallbackPrice: number; previousClose?: number; previousCloseDate?: string; quoteUpdatedAt?: string; market?: string; accountId?: number; unit?: string; assetClass?: "ETF·주식" | "현금성·금융상품"; marketPrice?: number; holdingStatus?: string };
type ScreenshotImport = { id: number; accountId: number; fileName: string; createdAt: string; status: "추출 대기" | "검토 필요"; summary?: string };
type Snapshot = { date: string; total: number; cost?: number; accountAmounts?: Record<string, number>; accountCosts?: Record<string, number>; assetAmounts?: Partial<Record<AssetType, number>>; assetCosts?: Partial<Record<AssetType, number>>; holdingAmounts?: Record<string, number>; holdingCosts?: Record<string, number> };
type ProfitPeak = { value: number; date: string };
type AssetType = "국내 주식" | "해외 주식" | "채권·현금성" | "대체자산" | "펀드" | "가상자산";

const initialAccounts: Account[] = [
  { id: 1, type: "미국 주식", broker: "미연결", name: "미국 주식 계좌", amount: 0, returnRate: 0, color: "blue" },
  { id: 2, type: "국내 주식", broker: "미연결", name: "국내 주식 계좌", amount: 0, returnRate: 0, color: "violet" },
  { id: 3, type: "ISA", broker: "미연결", name: "ISA 계좌", amount: 0, returnRate: 0, color: "mint" },
  { id: 4, type: "IRP", broker: "미연결", name: "IRP 계좌", amount: 0, returnRate: 0, color: "orange" },
  { id: 5, type: "연금저축", broker: "미연결", name: "연금저축 계좌", amount: 0, returnRate: 0, color: "pink" },
  { id: 6, type: "펀드", broker: "미연결", name: "펀드 계좌", amount: 0, returnRate: 0, color: "yellow" },
  { id: 7, type: "코인", broker: "미연결", name: "코인 계좌", amount: 0, returnRate: 0, color: "blue" },
];
const initialPortfolios: Portfolio[] = [
  { id: "kim-soobeom", name: "김수범" },
  { id: "kim-seoha", name: "김서하" },
  { id: "kim-eunho", name: "김은호" },
];
const seohaPensionAccount: Account = { id: 9, type: "연금저축", broker: "대신증권", name: "연금저축 계좌", amount: 429371, returnRate: 7.86, color: "pink", portfolioId: "kim-seoha" };
const seohaPensionHoldings: Holding[] = [
  { symbol: "379780.KS", name: "RISE 미국S&P500", quantity: 16, averagePrice: 21578, fallbackPrice: 23224.125, accountId: 9 },
  { symbol: "CASH-KRW", name: "예수금", quantity: 1, averagePrice: 57785, fallbackPrice: 57785, accountId: 9, unit: "원" },
];
const seohaOverseasAccount: Account = { id: 10, type: "미국 주식", broker: "대신증권", name: "해외 주식 계좌", amount: 52555813, returnRate: 85.34, color: "blue", portfolioId: "kim-seoha" };
// 사용자가 제공한 대신증권 해외주식 잔고의 수량·달러 장부가·평가금액입니다.
const seohaOverseasHoldings: Holding[] = [
  ["EDV", "뱅가드 초장기 채권 ETF", 1, 163.88, 58.93], ["EMLC", "반에크 JP모건 신흥국 현지통화 국채 ETF", 2, 30.985, 51.03],
  ["IAU", "아이셰어즈 금 ETF", 11, 77.2391, 894.78], ["LIT", "글로벌엑스 리튬 배터리 ETF", 72, 43.4389, 5295.18],
  ["LTPZ", "핌코 물가연동채권 ETF", 2, 83.64, 94.67], ["SPHD", "인베스코 고배당 저변동 ETF", 70, 33.04, 3701.33],
  ["SPYG", "SPDR 포트폴리오 S&P500 성장주 ETF", 80, 39.67, 9637.24], ["T", "AT&T", 7, 25.4329, 174.19],
  ["TSLA", "테슬라", 1, 198.09, 333.9], ["VOO", "뱅가드 S&P 500 인덱스 ETF", 9, 262.68, 6321.45],
  ["VT", "뱅가드 글로벌 주식 인덱스 ETF", 5, 80.0329, 797.72], ["XLY", "SPDR 임의 소비재 ETF", 50, 57.4, 5797.85],
].map(([symbol, name, quantity, averagePrice, value]) => ({ symbol: String(symbol), name: String(name), quantity: Number(quantity), averagePrice: Number(averagePrice), fallbackPrice: Number(value) / Number(quantity), accountId: 10 }));
// 장외 미국채: 공개 시세 티커가 없어 스크린샷의 달러 평가금액을 기준값으로 유지합니다.
const seohaUsBondHoldings: Holding[] = [
  { symbol: "US01375-5008", name: "미국 국채 (USD) 01375-5008", quantity: 7500, averagePrice: 3796.05 / 7500, fallbackPrice: 3472.28 / 7500, accountId: 10 },
  { symbol: "US04250-3508", name: "미국 국채 (USD) 04250-3508", quantity: 200, averagePrice: 205.28 / 200, fallbackPrice: 194.42 / 200, accountId: 10 },
];
const eunhoPensionAccount: Account = { id: 11, type: "연금저축", broker: "대신증권", name: "연금저축 계좌", amount: 39470978, returnRate: 31.67, color: "pink", portfolioId: "kim-eunho" };
const eunhoPensionHoldings: Holding[] = [
  ["284430.KS", "KODEX 200미국채혼합50", 1019, 17010, 20751672],
  ["367380.KS", "RISE 미국나스닥100", 378, 13895, 11436462],
  ["379780.KS", "RISE 미국S&P500", 17, 21538, 395234],
  ["411060.KS", "ACE KRX금현물", 237, 28585, 6457335],
].map(([symbol, name, quantity, averagePrice, value]) => ({ symbol: String(symbol), name: String(name), quantity: Number(quantity), averagePrice: Number(averagePrice), fallbackPrice: Number(value) / Number(quantity), accountId: 11 } as Holding)).concat({ symbol: "CASH-KRW", name: "예수금", quantity: 1, averagePrice: 430275, fallbackPrice: 430275, accountId: 11, unit: "원" });
const okxGramAccount: Account = { id: 12, type: "코인", broker: "OKX", name: "OKX GRAM 계좌", amount: 801869, returnRate: 0, color: "blue", portfolioId: "kim-soobeom" };
// 스크린샷에는 매입단가와 손익이 표시되지 않아, 등록 시점 현재가를 기준값으로 기록합니다.
const okxGramHolding: Holding = { symbol: "GRAM", name: "GRAM", quantity: 390, averagePrice: 2056.0756, fallbackPrice: 2056.0756, market: "OKX:GRAM-USDT", accountId: 12, unit: "GRAM" };
// 토스증권은 국내·해외 주식의 통화와 시세 조회 경로가 달라 두 하위 계좌로 보관합니다.
// 두 계좌 모두 김수범 포트폴리오의 토스증권 자산입니다.
const tossDomesticAccount: Account = { id: 13, type: "국내 주식", broker: "토스증권", name: "토스 국내 주식 계좌", amount: 18350, returnRate: (18350 / 10810 - 1) * 100, color: "violet", portfolioId: "kim-soobeom" };
const tossDomesticHoldings: Holding[] = [
  { symbol: "047040.KS", name: "대우건설", quantity: 1, averagePrice: 7190, fallbackPrice: 15610, accountId: 13 },
  { symbol: "009180.KS", name: "한솔로지스틱스", quantity: 1, averagePrice: 3620, fallbackPrice: 2740, accountId: 13 },
];
const tossOverseasAccount: Account = { id: 14, type: "미국 주식", broker: "토스증권", name: "토스 해외 주식 계좌", amount: 163618, returnRate: (163618 / 103839 - 1) * 100, color: "blue", portfolioId: "kim-soobeom" };
const tossOverseasHoldings: Holding[] = [
  { symbol: "BRK-A", name: "버크셔 해서웨이 A", quantity: 0.000153, averagePrice: 99729 / 0.000153 / 1380, fallbackPrice: 157392 / 0.000153 / 1380, accountId: 14 },
  { symbol: "TSLA", name: "테슬라", quantity: 0.012458, averagePrice: 4110 / 0.012458 / 1380, fallbackPrice: 6226 / 0.012458 / 1380, accountId: 14 },
];
// 카카오페이증권 스크린샷의 달러 보유 수량·평단가입니다. 현재가는 미국 시세와 환율로 갱신합니다.
const kakaoPayOverseasAccount: Account = { id: 15, type: "미국 주식", broker: "카카오페이증권", name: "카카오페이 미국 주식 계좌", amount: 149.37 * 1380, returnRate: (149.37 / (0.4061 * 250.47 + 0.023 * 154.2) - 1) * 100, color: "blue", portfolioId: "kim-soobeom" };
const kakaoPayOverseasHoldings: Holding[] = [
  { symbol: "TSLA", name: "테슬라", quantity: 0.4061, averagePrice: 250.47, fallbackPrice: 142.27 / 0.4061, accountId: 15 },
  { symbol: "AAPL", name: "애플", quantity: 0.023, averagePrice: 154.2, fallbackPrice: 7.1 / 0.023, accountId: 15 },
];
// 미래에셋증권 개인투자용국채 화면의 세전 만기금액과 매입금액입니다. 장중 시세가 아닌 만기 상환 예정금액을 평가값으로 유지합니다.
const miraeBondAccount: Account = { id: 16, type: "채권", broker: "미래에셋증권", name: "개인투자용국채 계좌", amount: 283440, returnRate: (283440 / 200000 - 1) * 100, color: "mint", portfolioId: "kim-soobeom" };
const miraeBondHoldings: Holding[] = [
  { symbol: "KTB-03540-3406", name: "개인투자용국채 03540-3406", quantity: 1, averagePrice: 100000, fallbackPrice: 143670, accountId: 16, unit: "건" },
  { symbol: "KTB-03185-3408", name: "개인투자용국채 03185-3408", quantity: 1, averagePrice: 100000, fallbackPrice: 139770, accountId: 16, unit: "건" },
];
const reports = ["주", "월", "분기", "반기", "1년", "최대"] as const;
type ReportPeriod = typeof reports[number];
const snapshotComparisonPeriods = ["일", "주", "월", "분기", "반기", "1년", "최대"] as const;
type SnapshotComparisonPeriod = typeof snapshotComparisonPeriods[number];
const won = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const percent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const signedAmount = (value: number) => `${value >= 0 ? "+" : ""}${won.format(value)}`;
const formatQuoteTimestamp = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)).replace(/\.$/, "");
const formatQuoteDate = (value: string) => value.replaceAll("-", ".");
type PreviousComparison = { rate: number | null; amount: number | null; returnDelta: number | null };
function PriorCloseRate({ rate }: { rate?: number | null }) {
  if (rate === undefined || rate === null) return null;
  return <small className={rate >= 0 ? "valuation-daily-rate positive" : "valuation-daily-rate negative"}>({percent(rate)})</small>;
}
const accountLabel = (name: string) => name.replace(/\s*[·ㆍ]\s*\d[\d-]*$/u, "");
const holdingSnapshotKey = (accountId: number, holding: Holding) => `${accountId}:${holding.symbol}:${holding.name}`;
// 초기 등록 때 사용한 임시 식별자를 한국거래소 종목코드로 승격합니다.
// 기존 Vercel 저장 데이터와 스냅샷도 이 매핑으로 함께 이관합니다.
const canonicalKrwTickers: Record<string, string> = {
  PLUS200: "152100.KS",
  "KODEX-MSCI-KR": "278540.KS",
  "TIGER-MSCI-KR": "310970.KS",
  "RISE-USD-INVERSE": "139660.KS",
  "PLUS-NASDAQ-TECH": "287180.KS",
  "IRP-NASDAQ100": "133690.KS",
  "IRP-NIFTY50": "200250.KS",
  "IRP-TRF3070": "329650.KS",
};
const migrateHoldingTicker = (holding: Holding): Holding => {
  const symbol = canonicalKrwTickers[holding.symbol];
  return symbol ? { ...holding, symbol, previousClose: undefined } : holding;
};
const migrateSnapshotTickerKeys = (record?: Record<string, number>) => {
  if (!record) return record;
  return Object.fromEntries(Object.entries(record).map(([key, value]) => {
    const migratedKey = Object.entries(canonicalKrwTickers).reduce((next, [legacy, symbol]) => next.replace(`:${legacy}:`, `:${symbol}:`), key);
    return [migratedKey, value];
  }));
};
const migrateSnapshotTickers = (snapshot: Snapshot): Snapshot => ({
  ...snapshot,
  holdingAmounts: migrateSnapshotTickerKeys(snapshot.holdingAmounts),
  holdingCosts: migrateSnapshotTickerKeys(snapshot.holdingCosts),
});
const migrateProfitPeakTickers = (peaks: Record<string, ProfitPeak>) => Object.fromEntries(Object.entries(peaks).map(([key, value]) => [canonicalKrwTickers[key] ?? key, { value: typeof value?.value === "number" ? value.value : 0, date: value?.date ?? "" }]));
const assetTypeMeta: Record<AssetType, { color: string }> = {
  "국내 주식": { color: "violet" }, "해외 주식": { color: "blue" }, "채권·현금성": { color: "mint" },
  "대체자산": { color: "orange" }, "펀드": { color: "pink" }, "가상자산": { color: "yellow" },
};
const colorHex: Record<string, string> = { blue: "#5666df", violet: "#8d71e8", mint: "#3fb99e", orange: "#f5a641", pink: "#e878a9", yellow: "#ecc950" };
const assetTypeFor = (accountType: string, holding?: Holding): AssetType => {
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
};
const assetWeightsFor = (accountType: string, holding?: Holding): Array<[AssetType, number]> =>
  holding?.symbol === "284430.KS"
    ? [["국내 주식", 0.5], ["채권·현금성", 0.5]]
    : [[assetTypeFor(accountType, holding), 1]];
const accountProfile: Record<number, Pick<Account, "broker" | "name">> = {
  1: { name: "미국 주식 계좌", broker: "키움증권" },
  2: { name: "국내 주식 계좌", broker: "삼성증권" },
  3: { name: "ISA 중개형 계좌", broker: "한화투자증권" },
  4: { name: "IRP 계좌", broker: "미래에셋증권" },
  5: { name: "연금저축 계좌", broker: "삼성증권" },
  6: { name: "펀드 계좌", broker: "한화자산운용 PINE" },
  8: { name: "국내 주식 계좌 2", broker: "대신증권" },
  12: { name: "OKX GRAM 계좌", broker: "OKX" },
  13: { name: "토스 국내 주식 계좌", broker: "토스증권" },
  14: { name: "토스 해외 주식 계좌", broker: "토스증권" },
  15: { name: "카카오페이 미국 주식 계좌", broker: "카카오페이증권" },
  16: { name: "개인투자용국채 계좌", broker: "미래에셋증권" },
};
const normalizeAccounts = (accounts: Account[]) => accounts.map(account => ({
  ...account,
  ...(accountProfile[account.id] ?? {}),
  portfolioId: account.portfolioId ?? "kim-soobeom",
}));

type TrendSeries = { id: string; name: string; color: string; snapshots: Snapshot[]; currentCost?: number; subtitle?: string; iconLabel?: string };
function TrendLegend({ series, compact = false }: { series: TrendSeries[]; compact?: boolean }) {
  return <div className={`trend-line-legend ${compact ? "compact" : ""}`}>{series.map(item => { const last = item.snapshots.at(-1); const cost = last?.cost ?? item.currentCost ?? 0; const rate = last && cost > 0 ? (last.total / cost - 1) * 100 : null; const profit = last && cost > 0 ? last.total - cost : null; const tone = rate === null ? "" : rate >= 0 ? "positive" : "negative"; return <span key={item.id}><i style={{ background: item.color }} />{item.name}<strong className={tone}>{rate === null || profit === null ? "기준 생성 중" : <>{percent(rate)}<small>{profit >= 0 ? "+" : ""}{won.format(profit)}</small></>}</strong></span>; })}</div>;
}
function TrendChart({ series, stackSeries = series, showLegend = true }: { series: TrendSeries[]; stackSeries?: TrendSeries[]; showLegend?: boolean }) {
  const costOf = (item: TrendSeries, snapshot: Snapshot) => snapshot.cost ?? item.currentCost ?? 0;
  const drawableSeries = series.filter(item => item.snapshots.length > 1 && item.snapshots.every(snapshot => costOf(item, snapshot) > 0)).map(item => ({ ...item, returns: item.snapshots.map(snapshot => (snapshot.total / costOf(item, snapshot) - 1) * 100), profits: item.snapshots.map(snapshot => snapshot.total - costOf(item, snapshot)) }));
  if (!drawableSeries.length) return <div className="chart empty-chart">비교 기준 생성 중입니다. 선택한 항목의 일별 스냅샷이 2개 쌓이면 추이가 표시됩니다.</div>;
  const axisRate = Math.max(...drawableSeries.flatMap(item => item.returns.map(value => Math.abs(value))), 0.1) * 1.15;
  const referenceSnapshots = drawableSeries[0].snapshots;
  const drawableStackSeries = stackSeries.filter(item => item.snapshots.length > 0);
  const valueStacks = referenceSnapshots.map(snapshot => drawableStackSeries.reduce((sum, item) => sum + (item.snapshots.find(candidate => candidate.date === snapshot.date)?.total ?? 0), 0));
  const axisValue = Math.max(...valueStacks, 1) * 1.1;
  const rateLabel = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  const valueLabel = (value: number) => won.format(value);
  const firstDate = drawableSeries[0].snapshots[0].date;
  const lastDate = drawableSeries[0].snapshots.at(-1)!.date;
  const barWidth = Math.min(8, 54 / valueStacks.length);
  return <>{showLegend && <TrendLegend series={series} />}<div className="trend-chart"><div className="trend-axis trend-rate-axis" aria-label="수익률 축"><span>{rateLabel(axisRate)}</span><span>0.00%</span><span>{rateLabel(-axisRate)}</span></div><div className="trend-plot"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="항목별 수익률 선과 항목별 누적 평가금액 스택 막대 추이"><g className="trend-value-bars">{referenceSnapshots.map((snapshot, index) => { const x = referenceSnapshots.length === 1 ? 50 : index / (referenceSnapshots.length - 1) * 100; let cumulative = 0; return drawableStackSeries.map(item => { const value = item.snapshots.find(candidate => candidate.date === snapshot.date)?.total ?? 0; if (!value) return null; const startY = 90 - cumulative / axisValue * 80; cumulative += value; const endY = 90 - cumulative / axisValue * 80; return <rect key={`${item.id}-${snapshot.date}`} x={x - barWidth / 2} y={endY} width={barWidth} height={Math.max(0, startY - endY)} fill={item.color} />; }); })}</g>{drawableSeries.map(item => { const points = item.returns.map((rate, index) => `${item.returns.length === 1 ? 50 : index / (item.returns.length - 1) * 100},${50 - rate / axisRate * 40}`).join(" "); return <polyline key={item.id} points={points} fill="none" stroke={item.color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />; })}</svg></div><div className="trend-axis trend-value-axis" aria-label="평가금액 축"><span>{valueLabel(axisValue)}</span><span>{valueLabel(axisValue / 2)}</span><span>0</span></div><div className="trend-labels"><span>{firstDate.slice(5).replace("-", ".")}</span><span>{lastDate.slice(5).replace("-", ".")}</span></div></div></>;
}

function PerformancePanel({ title, period, onPeriodChange, items, aggregateSeries, selectedItems, onSelectionChange, pickerLabel, pickerColumnLabel = "계좌", valuationDailyRate }: { title: string; period: ReportPeriod; onPeriodChange: (period: ReportPeriod) => void; items: TrendSeries[]; aggregateSeries: TrendSeries; selectedItems: string[]; onSelectionChange: (items: string[]) => void; pickerLabel: string; pickerColumnLabel?: string; valuationDailyRate?: number | null }) {
  const visibleItems = items.filter(item => selectedItems.includes(item.id));
  const aggregateMode = visibleItems.length === 0;
  const chartSeries = aggregateMode ? [aggregateSeries] : visibleItems;
  const itemPerformance = (item: TrendSeries) => { const last = item.snapshots.at(-1); const cost = item.currentCost ?? last?.cost ?? 0; const rate = last && cost > 0 ? (last.total / cost - 1) * 100 : null; const profit = last && cost > 0 ? last.total - cost : null; return { rate, profit }; };
  const headline = aggregateMode ? itemPerformance(aggregateSeries) : null;
  const headlineAmount = aggregateSeries.snapshots.at(-1)?.total ?? 0;
  return <section className="content-grid trend-content-grid"><article className="panel performance-panel"><header className="trend-panel-header"><div className="trend-heading"><div><h2>{title}</h2><p>{aggregateMode ? `전체 ${items.length}개 항목 합산` : `${pickerColumnLabel} ${visibleItems[0]?.name ?? ""} 추이`}</p></div>{headline && <div className="trend-headline-metrics"><div><span>통합 수익률</span><strong className={headline.rate !== null && headline.rate < 0 ? "negative" : "positive"}>{headline.rate === null ? "-" : percent(headline.rate)}</strong></div><div><span>통합 평가금액</span><strong className="valuation-amount">{won.format(headlineAmount)}<PriorCloseRate rate={valuationDailyRate} /></strong></div><div><span>평가손익</span><strong className={headline.profit !== null && headline.profit < 0 ? "negative" : "positive"}>{headline.profit === null ? "-" : <>{headline.profit >= 0 ? "+" : ""}{won.format(headline.profit)}</>}</strong></div></div>}</div></header><div className="trend-panel-body"><div className="trend-workspace without-selection"><div className="trend-chart-column"><div className="trend-series-list"><TrendChart series={chartSeries} stackSeries={aggregateMode ? items : visibleItems} showLegend={false} /></div><div className="trend-controls"><div className="periods" role="tablist">{reports.map(item => <button key={item} role="tab" aria-selected={period === item} className={period === item ? "selected" : ""} onClick={() => onPeriodChange(item)}>{item}</button>)}</div><label className="trend-select"><span>{pickerLabel}</span><select value={selectedItems[0] ?? ""} onChange={event => onSelectionChange(event.target.value ? [event.target.value] : [])}><option value="">전체</option>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div></div></div></div></article></section>;
}
// 사용자가 제공한 미국 주식 잔고 화면의 수량·달러 평단가입니다. 현재가는 조회 시 갱신됩니다.
const importedUsdHoldings: Holding[] = [
  ["AAPL", "애플", 1, 145.9766, 304.56], ["GDX", "금광 반에크 ETF", 5, 30.57, 87.79], ["HLT", "힐튼 월드와이드 홀딩스", 5, 180.5, 320.82],
  ["IAU", "금 아이셰어즈 ETF", 3, 36.89, 81.59], ["JETS", "글로벌 항공주 ETF", 40, 19.2785, 31.86], ["KO", "코카콜라", 10, 49.006, 87.58],
  ["NVDA", "엔비디아", 1, 109.46, 225.02], ["SPYG", "S&P 500 성장주 SPDR ETF", 1, 49.92, 123.4], ["T", "에이티앤티", 100, 16.58, 24.61],
  ["TSLA", "테슬라", 20, 274.6701, 340], ["VT", "글로벌 주식 뱅가드 ETF", 30, 102.53, 162.28],
].map(([symbol, name, quantity, averagePrice, fallbackPrice]) => ({ symbol: String(symbol), name: String(name), quantity: Number(quantity), averagePrice: Number(averagePrice), fallbackPrice: Number(fallbackPrice), accountId: 1 }));
const importedFundHoldings: Holding[] = [{ symbol: "LIFEPLUS-TDF2040-J-PE", name: "한화 LIFEPLUS 적격 TDF2040 연금 J-Pe", quantity: 1, averagePrice: 3010000, fallbackPrice: 4527457, accountId: 6, unit: "건" }];
const importedIrpHoldings: Holding[] = [
  ["TIGER 미국나스닥100", "133690.KS", 452, 30461360, 85235900, "ETF·주식"], ["KIWOOM 인도Nifty50(합성)", "200250.KS", 80, 1477800, 1779600, "ETF·주식"],
  ["TIGER 코리아TOP10", "292150.KS", 732, 9626035, 28203960, "ETF·주식"], ["신한알파리츠", "293940.KS", 1788, 12764590, 9451260, "ETF·주식"],
  ["KODEX TRF3070", "329650.KS", 1068, 12466650, 15197640, "ETF·주식"], ["ACE 미국S&P500", "360200.KS", 189, 2346435, 5235360, "ETF·주식"],
  ["TIGER 차이나전기차SOLACTIVE", "371460.KS", 163, 2773925, 1782405, "ETF·주식"], ["미래에셋증권현금성자산", "IRP-CASH", 1, 1385975, 1385975, "현금성·금융상품"],
  ["애큐온저축은행예금 IRP(개인) 1Y_퇴직", "IRP-ACCION", 1, 394370, 401192, "현금성·금융상품"], ["(통합)(무)흥국생명보험 퇴직연금 이율보증형 3년 (IRP)", "IRP-HEUNGKUK", 1, 433563, 456789, "현금성·금융상품"],
  ["(통합)KB손해보험 원리금보장형 이율보증형 3년 (DC/IRP)", "IRP-KB", 1, 1700932, 1740738, "현금성·금융상품"],
  ["미래에셋증권 디폴트옵션 안정투자형 포트폴리오 1", "IRP-DEFAULT-P1", 1, 16966169, 17893310, "현금성·금융상품"],
].map(([name, symbol, quantity, cost, value, assetClass]) => ({ name: String(name), symbol: String(symbol), quantity: Number(quantity), averagePrice: Number(cost) / Number(quantity), fallbackPrice: Number(value) / Number(quantity), accountId: 4, assetClass: assetClass as Holding["assetClass"] }));

function AccountDetails({ account, positions, updatedAt, exchangeRate, refresh, snapshots, selectedTrendItems, onToggleTrendItem }: { account: Account; positions: Holding[]; updatedAt: string; exchangeRate: number; refresh: () => Promise<void>; snapshots: Snapshot[]; selectedTrendItems: string[]; onToggleTrendItem: (id: string) => void }) {
  const isUsd = account.type === "미국 주식";
  const isCoin = account.type === "코인";
  const isFund = account.type === "펀드";
  const isIrp = account.type === "IRP";
  const isBond = account.type === "채권";
  const isKrwStock = ["국내 주식", "ISA", "연금저축"].includes(account.type);
  const groups = isIrp
    ? ["ETF·주식", "현금성·금융상품"].map(assetClass => ({ assetClass, positions: positions.filter(holding => holding.assetClass === assetClass) })).filter(group => group.positions.length)
    : [{ assetClass: "보유자산", positions }];
  const title = isUsd ? "미국 주식 · 원화 환산 기준" : isCoin ? "코인 · 업비트 현재가 기준" : isBond ? "개인투자용국채 · 세전 만기금액 기준" : isFund ? "펀드 · 등록 평가금액 기준" : account.type === "국내 주식" ? "국내 주식 · 현재가 기준" : account.type === "ISA" ? "ISA · 현재가 기준" : account.type === "연금저축" ? "연금저축 · 현재가 기준" : "IRP · 투자상품 및 현금성 자산";
  const label = isUsd ? "US HOLDINGS · KRW" : isCoin ? "CRYPTO HOLDINGS" : isBond ? "GOVERNMENT BONDS" : isFund ? "FUND HOLDINGS" : account.type === "국내 주식" ? "DOMESTIC HOLDINGS" : account.type === "ISA" ? "ISA HOLDINGS" : account.type === "연금저축" ? "PENSION HOLDINGS" : "IRP HOLDINGS";
  const note = isUsd
    ? `미국 현지 현재가와 USD/KRW 환율(1 USD = ${won.format(exchangeRate)})을 반영해 원화 평가금액·손익을 계산합니다.`
    : isBond ? "세전 만기금액을 평가금액으로 표시합니다. 중도 매도 시 실제 수령액은 달라질 수 있습니다."
    : isFund ? "한화자산운용 PINE에서 확인한 평가금액을 기준으로 표시합니다. 펀드 기준가 연동은 추후 추가할 수 있습니다."
    : isKrwStock ? "등록된 보유 수량과 평단가를 기준으로 현재가 손익과 수익률을 계산합니다."
    : isCoin ? "업비트 KRW 마켓 현재가를 6시간마다 갱신하며, 버튼으로 즉시 다시 조회할 수 있습니다."
    : "상장 ETF·주식은 현재가를 표시하고, 예금·보험·디폴트옵션은 마지막 등록 평가금액을 유지합니다.";
  const quoteBasis = (() => {
    const comparable = positions.filter(holding => holding.previousClose && holding.previousCloseDate && holding.quoteUpdatedAt);
    if (!comparable.length) return null;
    const dates = [...new Set(comparable.map(holding => formatQuoteDate(holding.previousCloseDate!)))];
    const latest = comparable.map(holding => holding.quoteUpdatedAt!).sort().at(-1);
    return `비교 기준 · 이전 거래일 종가 ${dates.join(" · ")} → 현재가 ${latest ? formatQuoteTimestamp(latest) : ""}`;
  })();
  const accountTrendId = `account-total-${account.id}`;
  const holdingTrendItems: TrendSeries[] = [
    { id: accountTrendId, name: "계좌 합산", color: colorHex[account.color] ?? "#5666df", currentCost: account.returnRate > -100 ? account.amount / (1 + account.returnRate / 100) : 0, snapshots: snapshots.flatMap(snapshot => { const amount = snapshot.accountAmounts?.[String(account.id)]; return typeof amount === "number" ? [{ date: snapshot.date, total: amount, cost: snapshot.accountCosts?.[String(account.id)] }] : []; }) },
    ...positions.map((holding, index) => ({ id: `holding-${account.id}-${index}-${holding.symbol}`, name: holding.name, color: ["#5666df", "#f5a641", "#3fb99e", "#e878a9", "#8d71e8", "#ecc950"][index % 6], currentCost: holding.quantity * holding.averagePrice * (isUsd ? exchangeRate : 1), snapshots: snapshots.flatMap(snapshot => { const amount = snapshot.holdingAmounts?.[holdingSnapshotKey(account.id, holding)]; return typeof amount === "number" ? [{ date: snapshot.date, total: amount, cost: snapshot.holdingCosts?.[holdingSnapshotKey(account.id, holding)] }] : []; }) })),
  ];
  const selectedHoldingTrendItems = holdingTrendItems.slice(1).filter(item => selectedTrendItems.includes(item.id));
  const visibleHoldingTrendItems = selectedHoldingTrendItems.length ? selectedHoldingTrendItems : [holdingTrendItems[0]];
  const holdingTrendId = (holding: Holding) => {
    const index = positions.findIndex(item => item === holding);
    return `holding-${account.id}-${index}-${holding.symbol}`;
  };
  // 증권사 위험자산 산정 화면(2026-08-19)과 맞춘 상품별 분류입니다.
  // TRF3070과 차이나전기차 SOLACTIVE는 이 계좌에서 위험자산 투자비율에 포함되지 않습니다.
  const irpExcludedRiskSymbols = new Set(["329650.KS", "371460.KS"]);
  const irpRiskyAmount = isIrp ? positions.filter(holding => holding.assetClass === "ETF·주식" && !irpExcludedRiskSymbols.has(holding.symbol)).reduce((sum, holding) => sum + holding.quantity * holding.fallbackPrice, 0) : 0;
  const irpRiskyRate = account.amount > 0 ? irpRiskyAmount / account.amount * 100 : 0;
  const contributionLimits = account.type === "ISA"
    ? [{ label: "총 납입금액", value: "17,520,578원" }, { label: "추가 납입 가능금액", value: "22,479,422원 / 한도 4,000만원" }, { label: "가입 기간", value: "2025.08.14 ~ 2125.08.14" }]
    : account.type === "연금저축"
      ? [{ label: "올해 연금저축 납입", value: "600만원 / 세액공제 한도 600만원" }, { label: "연금계좌 합산 올해 납입", value: "900만원 / 연 1,800만원" }, { label: "합산 잔여 납입 · 세액공제", value: "900만원 · 0원 / 연 900만원" }]
      : isIrp
        ? [{ label: "올해 IRP 납입", value: "300만원" }, { label: "연금계좌 합산 올해 납입", value: "900만원 / 연 1,800만원" }, { label: "합산 잔여 납입 · 세액공제", value: "900만원 · 0원 / 연 900만원" }]
        : [];

  if (!isUsd && !isCoin && !isFund && !isBond && !isKrwStock && !isIrp) return <div className="account-expanded empty-account-detail">등록된 보유자산이 없습니다.</div>;
  return <div className="account-expanded">
    <div className="detail-head"><div><p className="eyebrow">{label}</p><h3>{title}</h3></div>{!isFund && !isBond && <button className="text-button" onClick={event => { event.stopPropagation(); void refresh(); }}>현재가 새로고침 {updatedAt && `· ${updatedAt}`}</button>}</div>
    <p className="holdings-note">{note}</p>
    {quoteBasis && <p className="quote-basis">{quoteBasis}</p>}
    {(isIrp || contributionLimits.length > 0) && <section className="account-limit-summary"><div className="limit-summary-head"><p className="eyebrow">ACCOUNT LIMITS</p><span>2026년 기준</span></div><div className="limit-summary-grid">{isIrp && <div className="limit-metric"><span>위험자산 비중</span><strong className={irpRiskyRate <= 70 ? "limit-ok" : "limit-alert"}>{irpRiskyRate.toFixed(1)}% <small>/ 70.0%</small></strong><small>ETF·주식 {won.format(irpRiskyAmount)}</small></div>}{contributionLimits.map(item => <div className="limit-metric" key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div><p>{["연금저축", "IRP"].includes(account.type) ? "연금저축 CMA의 올해 납입금액 600만원을 반영했습니다. IRP 납입액을 추가하면 합산 잔여 한도가 자동 갱신됩니다." : "납입 잔여 한도는 납입 내역을 등록하면 계산해 표시합니다."}</p></section>}
    <section className="account-holding-trend"><div className="detail-head"><div><p className="eyebrow">HOLDING PERFORMANCE</p><h4>보유 종목 추이</h4></div></div><p className="holdings-note">아래 보유 종목 행을 클릭하면 그래프에 추가됩니다. 선택하지 않으면 계좌 합산 추이를 표시합니다.</p><div className="trend-series-list"><TrendChart series={visibleHoldingTrendItems} stackSeries={selectedHoldingTrendItems.length ? selectedHoldingTrendItems : holdingTrendItems.slice(1)} showLegend={false} /></div></section>
    {positions.length === 0 ? <div className="empty-holdings">등록된 {isCoin ? "코인 보유자산" : "보유 종목"}이 없습니다.</div> : groups.map(group => <div className="holding-group" key={group.assetClass}>{isIrp && <h4>{group.assetClass}</h4>}<div className="holding-table"><div><span>{isCoin ? "코인" : isIrp ? "상품" : "종목"}</span><span>보유 수량</span><span>매입금액</span><span>평가금액</span><span>평가손익</span><span>수익률</span></div>{group.positions.map(holding => {
      const multiplier = isUsd ? exchangeRate : 1;
      const cost = holding.quantity * holding.averagePrice * multiplier;
      const value = holding.quantity * holding.fallbackPrice * multiplier;
      const profit = value - cost;
      const rate = cost > 0 ? (value / cost - 1) * 100 : 0;
      const dailyRate = holding.previousClose ? (holding.fallbackPrice / holding.previousClose - 1) * 100 : null;
      const trendId = holdingTrendId(holding);
      return <div key={`${holding.symbol}-${holding.name}`} className={selectedTrendItems.includes(trendId) ? "holding-trend-selected" : ""} role="button" tabIndex={0} onClick={event => { event.stopPropagation(); onToggleTrendItem(trendId); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onToggleTrendItem(trendId); } }} aria-pressed={selectedTrendItems.includes(trendId)}><b>{holding.name}<PriorCloseRate rate={dailyRate} /></b><span>{isCoin ? `${holding.quantity.toLocaleString("ko-KR", { maximumFractionDigits: 8 })} ${holding.symbol}` : `${holding.quantity}${holding.unit ?? "주"}`}</span><span>{won.format(cost)}</span><span>{won.format(value)}</span><strong className={profit >= 0 ? "positive" : "negative"}>{profit >= 0 ? "+" : ""}{won.format(profit)}</strong><strong className={rate >= 0 ? "positive" : "negative"}>{percent(rate)}</strong></div>;
    })}</div></div>)}
  </div>;
}

function AccountSnapshotComparison({ accounts, snapshots, period, onPeriodChange }: { accounts: Account[]; snapshots: Snapshot[]; period: SnapshotComparisonPeriod; onPeriodChange: (period: SnapshotComparisonPeriod) => void }) {
  const datedSnapshots = snapshots.filter(snapshot => Object.keys(snapshot.accountAmounts ?? {}).length > 0).sort((left, right) => left.date.localeCompare(right.date));
  const latest = datedSnapshots.at(-1);
  if (!latest) return null;
  const formatDate = (date: string) => date.replaceAll("-", ".");
  const targetDays: Record<Exclude<SnapshotComparisonPeriod, "일" | "최대">, number> = { "주": 7, "월": 31, "분기": 92, "반기": 183, "1년": 365 };
  const latestDate = new Date(`${latest.date}T12:00:00+09:00`);
  const targetDate = new Date(latestDate);
  if (period !== "일" && period !== "최대") targetDate.setDate(targetDate.getDate() - targetDays[period]);
  const previous = period === "일"
    ? datedSnapshots.at(-2)
    : period === "최대"
      ? datedSnapshots[0]
      : datedSnapshots.filter(snapshot => snapshot.date <= new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(targetDate)).at(-1);
  const panelHeader = (description: string) => <div className="panel-head"><div><h2>계좌별 스냅샷 비교</h2><p className="account-hint">{description}</p></div><div className="periods snapshot-comparison-periods" role="tablist">{snapshotComparisonPeriods.map(item => <button key={item} role="tab" aria-selected={period === item} className={period === item ? "selected" : ""} onClick={() => onPeriodChange(item)}>{item}</button>)}</div></div>;
  if (!previous) return <section className="panel snapshot-comparison-panel">{panelHeader(`최신 스냅샷 ${formatDate(latest.date)}이 저장되었습니다. 선택 기간에 해당하는 이전 스냅샷을 기다리고 있습니다.`)}</section>;
  const comparison = (amount: number | undefined, cost: number | undefined, priorAmount: number | undefined, priorCost: number | undefined) => {
    if (typeof amount !== "number" || typeof priorAmount !== "number" || typeof cost !== "number" || typeof priorCost !== "number" || cost <= 0 || priorCost <= 0) return null;
    const profit = amount - cost;
    const priorProfit = priorAmount - priorCost;
    const rate = profit / cost * 100;
    const priorRate = priorProfit / priorCost * 100;
    return { amount, profit, rate, amountChange: amount - priorAmount, amountRate: priorAmount > 0 ? (amount / priorAmount - 1) * 100 : null, profitChange: profit - priorProfit, rateChange: rate - priorRate };
  };
  const rows = accounts.map(account => ({ account, comparison: comparison(latest.accountAmounts?.[String(account.id)], latest.accountCosts?.[String(account.id)], previous.accountAmounts?.[String(account.id)], previous.accountCosts?.[String(account.id)]) })).filter((row): row is { account: Account; comparison: NonNullable<ReturnType<typeof comparison>> } => row.comparison !== null).sort((left, right) => right.comparison.amount - left.comparison.amount);
  const totalComparison = comparison(
    rows.reduce((sum, row) => sum + row.comparison.amount, 0),
    rows.reduce((sum, row) => sum + row.comparison.amount - row.comparison.profit, 0),
    rows.reduce((sum, row) => sum + row.comparison.amount - row.comparison.amountChange, 0),
    rows.reduce((sum, row) => sum + row.comparison.amount - row.comparison.amountChange - (row.comparison.profit - row.comparison.profitChange), 0),
  );
  const metric = (data: NonNullable<ReturnType<typeof comparison>>, kind: "amount" | "rate" | "profit") => kind === "amount"
    ? <strong className="valuation-amount">{won.format(data.amount)} <small className={data.amountChange >= 0 ? "positive" : "negative"}>({signedAmount(data.amountChange)} · {data.amountRate === null ? "-" : percent(data.amountRate)})</small></strong>
    : kind === "rate"
      ? <strong className={data.rate >= 0 ? "positive" : "negative"}>{percent(data.rate)} <small className={data.rateChange >= 0 ? "positive" : "negative"}>({data.rateChange >= 0 ? "+" : ""}{data.rateChange.toFixed(2)}%p)</small></strong>
      : <strong className={data.profit >= 0 ? "positive" : "negative"}>{signedAmount(data.profit)} <small className={data.profitChange >= 0 ? "positive" : "negative"}>({signedAmount(data.profitChange)})</small></strong>;
  return <section className="panel snapshot-comparison-panel">{panelHeader(`${formatDate(previous.date)} → ${formatDate(latest.date)} · 최신 저장값과 선택 기간 전 저장값을 비교합니다.`)}{rows.length && totalComparison ? <div className="snapshot-comparison-table"><div className="snapshot-comparison-heading"><span>계좌</span><span>평가금액</span><span>수익률</span><span>평가손익</span></div><div className="snapshot-comparison-row snapshot-total-row"><span className="snapshot-account-name"><span><b>전체 계좌 합산</b></span></span>{metric(totalComparison, "amount")}{metric(totalComparison, "rate")}{metric(totalComparison, "profit")}</div>{rows.map(({ account, comparison: data }) => <div className="snapshot-comparison-row" key={account.id}><span className="snapshot-account-name"><span><b>{accountLabel(account.name)}</b><small>{account.broker}</small></span></span>{metric(data, "amount")}{metric(data, "rate")}{metric(data, "profit")}</div>)}</div> : <div className="empty-holdings">두 스냅샷 모두에 계좌별 원금 정보가 저장되면 비교가 표시됩니다.</div>}</section>;
}

export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>(() => normalizeAccounts(initialAccounts));
  const [portfolios, setPortfolios] = useState<Portfolio[]>(initialPortfolios);
  const [activePortfolioId, setActivePortfolioId] = useState("kim-soobeom");
  const [period, setPeriod] = useState<ReportPeriod>("주");
  const [snapshotComparisonPeriod, setSnapshotComparisonPeriod] = useState<SnapshotComparisonPeriod>("일");
  const [selectedTrendItems, setSelectedTrendItems] = useState<string[]>([]);
  const [selectedAssetTrendItems, setSelectedAssetTrendItems] = useState<string[]>([]);
  const [selectedHoldingTrendItems, setSelectedHoldingTrendItems] = useState<Record<number, string[]>>({});
  const [notice, setNotice] = useState("");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [usdHoldings, setUsdHoldings] = useState<Holding[]>([]);
  const [fundHoldings, setFundHoldings] = useState<Holding[]>([]);
  const [coinHoldings, setCoinHoldings] = useState<Holding[]>([]);
  const [pensionHoldings, setPensionHoldings] = useState<Holding[]>([]);
  const [isaHoldings, setIsaHoldings] = useState<Holding[]>([]);
  const [irpHoldings, setIrpHoldings] = useState<Holding[]>([]);
  const [quoteUpdatedAt, setQuoteUpdatedAt] = useState("");
  const [usdQuoteUpdatedAt, setUsdQuoteUpdatedAt] = useState("");
  const [usdKrwRate, setUsdKrwRate] = useState(1380);
  const [coinQuoteUpdatedAt, setCoinQuoteUpdatedAt] = useState("");
  const [isaQuoteUpdatedAt, setIsaQuoteUpdatedAt] = useState("");
  const [pensionQuoteUpdatedAt, setPensionQuoteUpdatedAt] = useState("");
  const [irpQuoteUpdatedAt, setIrpQuoteUpdatedAt] = useState("");
  const [expandedAccountId, setExpandedAccountId] = useState<number | null>(null);
  const [expandedTopHoldingId, setExpandedTopHoldingId] = useState<string | null>(null);
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType | null>(null);
  const [imports, setImports] = useState<ScreenshotImport[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [profitPeaks, setProfitPeaks] = useState<Record<string, ProfitPeak>>({});
  const [targetAllocations, setTargetAllocations] = useState<Record<string, Partial<Record<AssetType, number>>>>({});
  const [editingTargetAllocation, setEditingTargetAllocation] = useState(false);
  const [draftTargetAllocation, setDraftTargetAllocation] = useState<Partial<Record<AssetType, number>>>({});
  const [irpResetVersion, setIrpResetVersion] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const syncErrorShown = useRef(false);
  const activePortfolio = portfolios.find(item => item.id === activePortfolioId) ?? portfolios[0];
  const portfolioAccounts = useMemo(() => accounts.filter(account => account.portfolioId === activePortfolio?.id), [accounts, activePortfolio?.id]);
  const total = useMemo(() => portfolioAccounts.reduce((sum, account) => sum + account.amount, 0), [portfolioAccounts]);
  const totalProfit = useMemo(() => portfolioAccounts.reduce((sum, account) => account.returnRate > -100 ? sum + account.amount - account.amount / (1 + account.returnRate / 100) : sum, 0), [portfolioAccounts]);
  const weightedReturn = useMemo(() => {
    const totalCost = total - totalProfit;
    return totalCost > 0 ? totalProfit / totalCost * 100 : 0;
  }, [total, totalProfit]);
  const accountsByValue = useMemo(() => [...portfolioAccounts].sort((a, b) => b.amount - a.amount), [portfolioAccounts]);
  const dailyValuations = useMemo(() => {
    const accountRates = new Map<number, number | null>();
    const accountComparisons = new Map<number, PreviousComparison>();
    const assetRates = new Map<AssetType, number | null>();
    const assetAccountRates = new Map<string, number | null>();
    const holdingRates = new Map<string, number | null>();
    const holdingComparisons = new Map<string, PreviousComparison>();
    const sources: Array<{ positions: Holding[]; exchangeRate: number }> = [
      { positions: holdings, exchangeRate: 1 }, { positions: usdHoldings, exchangeRate: usdKrwRate }, { positions: fundHoldings, exchangeRate: 1 },
      { positions: coinHoldings, exchangeRate: 1 }, { positions: pensionHoldings, exchangeRate: 1 }, { positions: isaHoldings, exchangeRate: 1 }, { positions: irpHoldings, exchangeRate: 1 },
    ];
    const byAccount = new Map<number, Array<{ holding: Holding; current: number; previous: number; hasComparison: boolean }>>();
    sources.forEach(({ positions, exchangeRate }) => positions.forEach(holding => {
      if (!holding.accountId) return;
      const current = holding.quantity * holding.fallbackPrice * exchangeRate;
      const hasComparison = typeof holding.previousClose === "number" && holding.previousClose > 0;
      const previous = holding.quantity * (hasComparison ? holding.previousClose! : holding.fallbackPrice) * exchangeRate;
      const rate = hasComparison && previous > 0 ? (current / previous - 1) * 100 : null;
      const cost = holding.quantity * holding.averagePrice * exchangeRate;
      const previousReturn = rate !== null && cost > 0 ? (previous / cost - 1) * 100 : null;
      holdingRates.set(holdingSnapshotKey(holding.accountId, holding), rate);
      holdingComparisons.set(holdingSnapshotKey(holding.accountId, holding), { rate, amount: rate === null ? null : current - previous, returnDelta: previousReturn === null ? null : (current / cost - 1) * 100 - previousReturn });
      const entries = byAccount.get(holding.accountId) ?? [];
      entries.push({ holding, current, previous, hasComparison });
      byAccount.set(holding.accountId, entries);
    }));
    const assetTotals = new Map<AssetType, { current: number; previous: number; hasComparison: boolean }>();
    let totalPrevious = 0;
    let hasTotalComparison = false;
    portfolioAccounts.forEach(account => {
      const entries = byAccount.get(account.id) ?? [];
      const rawCurrent = entries.reduce((sum, item) => sum + item.current, 0);
      const rawPrevious = entries.reduce((sum, item) => sum + item.previous, 0);
      const hasComparison = entries.some(item => item.hasComparison);
      const scale = rawCurrent > 0 ? account.amount / rawCurrent : 1;
      const previous = rawCurrent > 0 ? rawPrevious * scale : account.amount;
      const rate = hasComparison && previous > 0 ? (account.amount / previous - 1) * 100 : null;
      accountRates.set(account.id, rate);
      const accountCost = account.returnRate > -100 ? account.amount / (1 + account.returnRate / 100) : 0;
      const previousReturn = rate !== null && accountCost > 0 ? (previous / accountCost - 1) * 100 : null;
      accountComparisons.set(account.id, { rate, amount: rate === null ? null : account.amount - previous, returnDelta: previousReturn === null ? null : account.returnRate - previousReturn });
      totalPrevious += previous;
      hasTotalComparison ||= hasComparison;
      if (!entries.length) {
        const type = assetTypeFor(account.type);
        const current = assetTotals.get(type) ?? { current: 0, previous: 0, hasComparison: false };
        current.current += account.amount;
        current.previous += account.amount;
        assetTotals.set(type, current);
      }
      entries.forEach(item => assetWeightsFor(account.type, item.holding).forEach(([type, weight]) => {
        const currentValue = item.current * scale * weight;
        const previousValue = item.previous * scale * weight;
        const current = assetTotals.get(type) ?? { current: 0, previous: 0, hasComparison: false };
        current.current += currentValue;
        current.previous += previousValue;
        current.hasComparison ||= item.hasComparison;
        assetTotals.set(type, current);
      }));
      (Object.keys(assetTypeMeta) as AssetType[]).forEach(type => {
        const entriesForType = entries.flatMap(item => assetWeightsFor(account.type, item.holding).filter(([candidate]) => candidate === type).map(([, weight]) => ({ ...item, weight })));
        if (!entriesForType.length) return;
        const current = entriesForType.reduce((sum, item) => sum + item.current * scale * item.weight, 0);
        const previous = entriesForType.reduce((sum, item) => sum + item.previous * scale * item.weight, 0);
        const known = entriesForType.some(item => item.hasComparison);
        assetAccountRates.set(`${type}:${account.id}`, known && previous > 0 ? (current / previous - 1) * 100 : null);
      });
    });
    assetTotals.forEach((value, type) => assetRates.set(type, value.hasComparison && value.previous > 0 ? (value.current / value.previous - 1) * 100 : null));
    const totalRate = hasTotalComparison && totalPrevious > 0 ? (total / totalPrevious - 1) * 100 : null;
    const totalCost = total - totalProfit;
    const previousReturn = totalRate !== null && totalCost > 0 ? (totalPrevious / totalCost - 1) * 100 : null;
    const totalComparison: PreviousComparison = { rate: totalRate, amount: totalRate === null ? null : total - totalPrevious, returnDelta: previousReturn === null ? null : weightedReturn - previousReturn };
    return { totalRate, totalComparison, accountRates, accountComparisons, assetRates, assetAccountRates, holdingRates, holdingComparisons };
  }, [portfolioAccounts, total, totalProfit, weightedReturn, holdings, usdHoldings, usdKrwRate, fundHoldings, coinHoldings, pensionHoldings, isaHoldings, irpHoldings]);
  const portfolioQuoteBasis = useMemo(() => {
    const accountIds = new Set(portfolioAccounts.map(account => account.id));
    const comparable = [holdings, usdHoldings, coinHoldings, pensionHoldings, isaHoldings, irpHoldings].flat().filter(holding => accountIds.has(holding.accountId ?? -1) && holding.previousClose && holding.previousCloseDate && holding.quoteUpdatedAt);
    if (!comparable.length) return null;
    const dates = [...new Set(comparable.map(holding => formatQuoteDate(holding.previousCloseDate!)))];
    const latest = comparable.map(holding => holding.quoteUpdatedAt!).sort().at(-1);
    return `이전 거래일 종가 ${dates.join(" · ")} → 현재가 ${latest ? formatQuoteTimestamp(latest) : ""}`;
  }, [portfolioAccounts, holdings, usdHoldings, coinHoldings, pensionHoldings, isaHoldings, irpHoldings]);
  const assetAllocationByType = useMemo(() => {
    const sources: Array<{ positions: Holding[]; exchangeRate: number }> = [
      { positions: holdings, exchangeRate: 1 }, { positions: usdHoldings, exchangeRate: usdKrwRate }, { positions: fundHoldings, exchangeRate: 1 },
      { positions: coinHoldings, exchangeRate: 1 }, { positions: pensionHoldings, exchangeRate: 1 }, { positions: isaHoldings, exchangeRate: 1 }, { positions: irpHoldings, exchangeRate: 1 },
    ];
    const positionsByAccount = new Map<number, Array<{ holding: Holding; value: number }>>();
    sources.forEach(({ positions, exchangeRate }) => positions.forEach(holding => {
      const accountId = holding.accountId;
      if (!accountId) return;
      const items = positionsByAccount.get(accountId) ?? [];
      items.push({ holding, value: holding.quantity * holding.fallbackPrice * exchangeRate });
      positionsByAccount.set(accountId, items);
    }));
    const grouped: Record<AssetType, number> = { "국내 주식": 0, "해외 주식": 0, "채권·현금성": 0, "대체자산": 0, "펀드": 0, "가상자산": 0 };
    portfolioAccounts.forEach(account => {
      const positions = positionsByAccount.get(account.id) ?? [];
      const positionsTotal = positions.reduce((sum, item) => sum + item.value, 0);
      if (!positionsTotal) { grouped[assetTypeFor(account.type)] += account.amount; return; }
      positions.forEach(({ holding, value }) => assetWeightsFor(account.type, holding).forEach(([type, weight]) => { grouped[type] += account.amount * value / positionsTotal * weight; }));
    });
    return (Object.entries(grouped) as Array<[AssetType, number]>).filter(([, amount]) => amount > 0).map(([type, amount]) => ({ type, amount, color: assetTypeMeta[type].color })).sort((a, b) => b.amount - a.amount);
  }, [portfolioAccounts, holdings, usdHoldings, usdKrwRate, fundHoldings, coinHoldings, pensionHoldings, isaHoldings, irpHoldings]);
  const assetAllocationGradient = useMemo(() => {
    if (!total || !assetAllocationByType.length) return "#eceef3 0 100%";
    let offset = 0;
    return assetAllocationByType.map(item => {
      const start = offset;
      offset += item.amount / total * 100;
      return `${colorHex[item.color]} ${start}% ${offset}%`;
    }).join(", ");
  }, [assetAllocationByType, total]);
  const analyticsSources = useMemo(() => [
    { holdings: holdings as AnalyticsHolding[], exchangeRate: 1 },
    { holdings: usdHoldings as AnalyticsHolding[], exchangeRate: usdKrwRate },
    { holdings: fundHoldings as AnalyticsHolding[], exchangeRate: 1 },
    { holdings: coinHoldings as AnalyticsHolding[], exchangeRate: 1 },
    { holdings: pensionHoldings as AnalyticsHolding[], exchangeRate: 1 },
    { holdings: isaHoldings as AnalyticsHolding[], exchangeRate: 1 },
    { holdings: irpHoldings as AnalyticsHolding[], exchangeRate: 1 },
  ], [holdings, usdHoldings, usdKrwRate, fundHoldings, coinHoldings, pensionHoldings, isaHoldings, irpHoldings]);
  const analyticsAssetTypeFor = (account: AnalyticsAccount, holding?: AnalyticsHolding) => assetTypeFor(account.type, holding as Holding) as PortfolioAssetType;
  const analyticsAssetWeightsFor = (account: AnalyticsAccount, holding: AnalyticsHolding) => assetWeightsFor(account.type, holding as Holding) as Array<[PortfolioAssetType, number]>;
  const aggregatedHoldings = useMemo(() => aggregateHoldingsByAsset({
    accounts: portfolioAccounts,
    sources: analyticsSources,
    assetTypeFor: analyticsAssetTypeFor,
    assetWeightsFor: analyticsAssetWeightsFor,
  }), [portfolioAccounts, analyticsSources]);
  const concentrationMetrics = useMemo(() => calculateConcentrationMetrics(aggregatedHoldings), [aggregatedHoldings]);
  const concentrationSummary = useMemo(() => portfolioSummary(aggregatedHoldings), [aggregatedHoldings]);
  const latestSnapshotPair = useMemo(() => snapshots
    .filter(snapshot => Object.keys(snapshot.accountAmounts ?? {}).length > 0)
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-2), [snapshots]);
  const dailyContributions = useMemo(() => calculateDailyContributions({
    accounts: portfolioAccounts,
    sources: analyticsSources,
    latest: latestSnapshotPair.at(-1),
    previous: latestSnapshotPair.at(-2),
    assetWeightsFor: analyticsAssetWeightsFor,
  }), [portfolioAccounts, analyticsSources, latestSnapshotPair]);
  const activeTargets = useMemo(() => activePortfolio ? targetAllocations[activePortfolio.id] ?? {} : {}, [activePortfolio?.id, targetAllocations]);
  const targetInput = editingTargetAllocation ? draftTargetAllocation : activeTargets;
  const targetAllocationTotal = PORTFOLIO_ASSET_TYPES.reduce((sum, type) => sum + (targetInput[type] ?? 0), 0);
  const hasTargetAllocation = PORTFOLIO_ASSET_TYPES.some(type => (activeTargets[type] ?? 0) > 0);
  const targetAllocationGaps = useMemo(() => calculateTargetAllocationGap({ items: aggregatedHoldings, targets: activeTargets }), [aggregatedHoldings, activeTargets]);
  const currentAccountCosts = useMemo(() => Object.fromEntries(portfolioAccounts.map(account => [String(account.id), account.returnRate > -100 ? account.amount / (1 + account.returnRate / 100) : 0])), [portfolioAccounts]);
  const currentAssetCosts = useMemo(() => {
    const grouped: Record<AssetType, number> = { "국내 주식": 0, "해외 주식": 0, "채권·현금성": 0, "대체자산": 0, "펀드": 0, "가상자산": 0 };
    const sources: Array<{ positions: Holding[]; exchangeRate: number }> = [
      { positions: holdings, exchangeRate: 1 }, { positions: usdHoldings, exchangeRate: usdKrwRate }, { positions: fundHoldings, exchangeRate: 1 },
      { positions: coinHoldings, exchangeRate: 1 }, { positions: pensionHoldings, exchangeRate: 1 }, { positions: isaHoldings, exchangeRate: 1 }, { positions: irpHoldings, exchangeRate: 1 },
    ];
    const positionsByAccount = new Map<number, Array<{ holding: Holding; value: number; cost: number }>>();
    sources.forEach(({ positions, exchangeRate }) => positions.forEach(holding => {
      if (!holding.accountId) return;
      const positions = positionsByAccount.get(holding.accountId) ?? [];
      positions.push({ holding, value: holding.quantity * holding.fallbackPrice * exchangeRate, cost: holding.quantity * holding.averagePrice * exchangeRate });
      positionsByAccount.set(holding.accountId, positions);
    }));
    portfolioAccounts.forEach(account => {
      const positions = positionsByAccount.get(account.id) ?? [];
      const value = positions.reduce((sum, item) => sum + item.value, 0);
      if (!value) { grouped[assetTypeFor(account.type)] += currentAccountCosts[String(account.id)] ?? 0; return; }
      positions.forEach(item => assetWeightsFor(account.type, item.holding).forEach(([type, weight]) => { grouped[type] += item.cost * account.amount / value * weight; }));
    });
    return grouped;
  }, [portfolioAccounts, coinHoldings, currentAccountCosts, fundHoldings, holdings, irpHoldings, isaHoldings, pensionHoldings, usdHoldings, usdKrwRate]);
  const assetCostsForSnapshot = useMemo(() => {
    const holdingsByKey = new Map<string, Holding>();
    const sources: Array<Holding[]> = [holdings, usdHoldings, fundHoldings, coinHoldings, pensionHoldings, isaHoldings, irpHoldings];
    sources.flat().forEach(holding => { if (holding.accountId) holdingsByKey.set(holdingSnapshotKey(holding.accountId, holding), holding); });
    return (snapshot: Snapshot) => {
      const grouped: Record<AssetType, number> = { "국내 주식": 0, "해외 주식": 0, "채권·현금성": 0, "대체자산": 0, "펀드": 0, "가상자산": 0 };
      portfolioAccounts.forEach(account => {
        const entries = [...holdingsByKey.entries()].filter(([key]) => key.startsWith(`${account.id}:`)).map(([key, holding]) => ({ holding, value: snapshot.holdingAmounts?.[key] ?? 0, cost: snapshot.holdingCosts?.[key] ?? 0 }));
        const holdingValue = entries.reduce((sum, item) => sum + item.value, 0);
        const accountValue = snapshot.accountAmounts?.[String(account.id)] ?? holdingValue;
        if (!holdingValue) { grouped[assetTypeFor(account.type)] += snapshot.accountCosts?.[String(account.id)] ?? 0; return; }
        entries.forEach(item => assetWeightsFor(account.type, item.holding).forEach(([type, weight]) => { grouped[type] += item.cost * accountValue / holdingValue * weight; }));
      });
      return grouped;
    };
  }, [portfolioAccounts, coinHoldings, fundHoldings, holdings, irpHoldings, isaHoldings, pensionHoldings, usdHoldings]);
  const assetDetailsByType = useMemo(() => {
    const details = {} as Record<AssetType, { accounts: Map<number, number>; holdings: Array<{ account: Account; holding: Holding; value: number }> }>;
    (Object.keys(assetTypeMeta) as AssetType[]).forEach(type => { details[type] = { accounts: new Map(), holdings: [] }; });
    const sources: Array<{ positions: Holding[]; exchangeRate: number }> = [
      { positions: holdings, exchangeRate: 1 }, { positions: usdHoldings, exchangeRate: usdKrwRate }, { positions: fundHoldings, exchangeRate: 1 },
      { positions: coinHoldings, exchangeRate: 1 }, { positions: pensionHoldings, exchangeRate: 1 }, { positions: isaHoldings, exchangeRate: 1 }, { positions: irpHoldings, exchangeRate: 1 },
    ];
    const positionsByAccount = new Map<number, Array<{ holding: Holding; value: number }>>();
    sources.forEach(({ positions, exchangeRate }) => positions.forEach(holding => {
      if (!holding.accountId) return;
      const items = positionsByAccount.get(holding.accountId) ?? [];
      items.push({ holding, value: holding.quantity * holding.fallbackPrice * exchangeRate });
      positionsByAccount.set(holding.accountId, items);
    }));
    portfolioAccounts.forEach(account => {
      const positions = positionsByAccount.get(account.id) ?? [];
      const positionsTotal = positions.reduce((sum, item) => sum + item.value, 0);
      if (!positionsTotal) { details[assetTypeFor(account.type)].accounts.set(account.id, account.amount); return; }
      positions.forEach(({ holding, value }) => assetWeightsFor(account.type, holding).forEach(([type, weight]) => {
        const allocatedValue = account.amount * value / positionsTotal * weight;
        const detail = details[type];
        detail.accounts.set(account.id, (detail.accounts.get(account.id) ?? 0) + allocatedValue);
        detail.holdings.push({ account, holding, value: allocatedValue });
      }));
    });
    return details;
  }, [portfolioAccounts, holdings, usdHoldings, usdKrwRate, fundHoldings, coinHoldings, pensionHoldings, isaHoldings, irpHoldings]);
  const selectedAssetDetails = selectedAssetType ? assetDetailsByType[selectedAssetType] : null;
  const periodSnapshots = useMemo(() => {
    if (period === "최대") return snapshots;
    const start = new Date();
    const daysByPeriod: Record<Exclude<ReportPeriod, "최대">, number> = { "주": 7, "월": 31, "분기": 92, "반기": 183, "1년": 365 };
    start.setDate(start.getDate() - daysByPeriod[period]);
    const startDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(start);
    return snapshots.filter(snapshot => snapshot.date >= startDate);
  }, [period, snapshots]);
  const portfolioPeriodSnapshots = useMemo(() => periodSnapshots.map(snapshot => {
    const hasAccountBreakdown = Object.keys(snapshot.accountAmounts ?? {}).length > 0;
    const hasAccountCosts = portfolioAccounts.some(account => typeof snapshot.accountCosts?.[String(account.id)] === "number");
    const amount = hasAccountBreakdown ? portfolioAccounts.reduce((sum, account) => sum + (snapshot.accountAmounts?.[String(account.id)] ?? 0), 0) : snapshot.total;
    const estimatedCost = portfolioAccounts.reduce((sum, account) => {
      const accountAmount = snapshot.accountAmounts?.[String(account.id)] ?? 0;
      return sum + (account.returnRate > -100 ? accountAmount / (1 + account.returnRate / 100) : 0);
    }, 0);
    const cost = hasAccountBreakdown || hasAccountCosts ? portfolioAccounts.reduce((sum, account) => sum + (snapshot.accountCosts?.[String(account.id)] ?? 0), 0) : (snapshot.cost ?? estimatedCost);
    return { ...snapshot, total: amount, cost };
  }), [periodSnapshots, portfolioAccounts]);
  const trendItems = useMemo(() => [
    ...portfolioAccounts.filter(account => account.amount > 0).map(account => ({
      id: `account-${account.id}`,
      name: accountLabel(account.name),
      color: colorHex[account.color] ?? "#5666df",
      subtitle: account.broker,
      iconLabel: account.type.slice(0, 1),
      currentCost: currentAccountCosts[String(account.id)],
      snapshots: portfolioPeriodSnapshots.flatMap(snapshot => {
        const amount = snapshot.accountAmounts?.[String(account.id)];
        return typeof amount === "number" ? [{ date: snapshot.date, total: amount, cost: snapshot.accountCosts?.[String(account.id)] }] : [];
      }),
    })),
  ], [portfolioAccounts, currentAccountCosts, portfolioPeriodSnapshots]);
  const assetTrendItems = useMemo(() => [
    ...assetAllocationByType.map(asset => ({
      id: `asset-${asset.type}`,
      name: asset.type,
      color: colorHex[asset.color],
      currentCost: currentAssetCosts[asset.type],
      snapshots: periodSnapshots.flatMap((snapshot, index) => {
        const amount = snapshot.assetAmounts?.[asset.type];
        const isLatest = index === periodSnapshots.length - 1;
        const historicalCost = assetCostsForSnapshot(snapshot)[asset.type] || snapshot.assetCosts?.[asset.type];
        return typeof amount === "number" ? [{ date: snapshot.date, total: amount, cost: isLatest ? currentAssetCosts[asset.type] : historicalCost }] : [];
      }),
    })),
  ], [assetAllocationByType, assetCostsForSnapshot, currentAssetCosts, periodSnapshots]);
  const aggregateAccountTrend: TrendSeries = { id: "accounts-total", name: "전체 계좌 합산", color: "#5666df", currentCost: total - totalProfit, snapshots: portfolioPeriodSnapshots };
  const aggregateAssetTrend: TrendSeries = { id: "assets-total", name: "전체 자산 합산", color: "#5666df", currentCost: total - totalProfit, snapshots: portfolioPeriodSnapshots };

  const updateStockAccounts = (type: string, next: Holding[], exchangeRate = 1) => setAccounts(current => current.map(account => {
    if (account.type !== type) return account;
    const positions = next.filter(holding => holding.accountId === account.id);
    const value = positions.reduce((sum, holding) => sum + holding.quantity * holding.fallbackPrice * exchangeRate, 0);
    const cost = positions.reduce((sum, holding) => sum + holding.quantity * holding.averagePrice * exchangeRate, 0);
    return positions.length ? { ...account, amount: value, returnRate: cost > 0 ? (value / cost - 1) * 100 : 0 } : account;
  }));
  const refreshKrw = async (items: Holding[], setter: React.Dispatch<React.SetStateAction<Holding[]>>, type: string, setUpdated: React.Dispatch<React.SetStateAction<string>>) => {
    if (!items.length) { setNotice("현재가를 반영할 보유 종목이 없습니다."); return; }
    try {
      const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(items.filter(item => item.symbol.endsWith(".KS")).map(item => item.symbol).join(","))}&fields=previous-close-v1`, { cache: "no-store" });
      const data = await response.json() as { quotes?: Record<string, number>; previousCloses?: Record<string, number>; previousCloseDates?: Record<string, string>; fetchedAt?: string };
      if (!data.quotes) throw new Error("No quotes");
      setter(current => { const next = current.map(holding => ({ ...holding, fallbackPrice: data.quotes?.[holding.symbol] ?? holding.fallbackPrice, previousClose: data.previousCloses?.[holding.symbol] ?? holding.previousClose, previousCloseDate: data.previousCloseDates?.[holding.symbol] ?? holding.previousCloseDate, quoteUpdatedAt: data.fetchedAt ?? holding.quoteUpdatedAt })); updateStockAccounts(type, next); return next; });
      setUpdated(data.fetchedAt ? formatQuoteTimestamp(data.fetchedAt) : new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    } catch { setNotice("현재가를 불러오지 못했습니다. 마지막 확인 가격으로 계산합니다."); }
  };
  const refreshUsdPrices = async () => {
    if (!usdHoldings.length) { setNotice("현재가를 반영할 미국 주식 보유 종목이 없습니다."); return; }
    try {
      const response = await fetch(`/api/quotes?includeExchangeRate=1&symbols=${encodeURIComponent(usdHoldings.map(item => item.symbol).join(","))}&fields=previous-close-v1`, { cache: "no-store" });
      const data = await response.json() as { quotes?: Record<string, number>; previousCloses?: Record<string, number>; previousCloseDates?: Record<string, string>; exchangeRate?: number | null; fetchedAt?: string };
      if (!data.quotes || !data.exchangeRate) throw new Error("No quotes");
      setUsdKrwRate(data.exchangeRate);
      setUsdHoldings(current => { const next = current.map(holding => ({ ...holding, fallbackPrice: data.quotes?.[holding.symbol] ?? holding.fallbackPrice, previousClose: data.previousCloses?.[holding.symbol] ?? holding.previousClose, previousCloseDate: data.previousCloseDates?.[holding.symbol] ?? holding.previousCloseDate, quoteUpdatedAt: data.fetchedAt ?? holding.quoteUpdatedAt })); updateStockAccounts("미국 주식", next, data.exchangeRate!); return next; });
      setUsdQuoteUpdatedAt(data.fetchedAt ? formatQuoteTimestamp(data.fetchedAt) : new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    } catch { setNotice("미국 주식 현재가 또는 환율을 불러오지 못했습니다. 마지막 확인 값으로 계산합니다."); }
  };
  const refreshCoinPrices = async () => {
    if (!coinHoldings.length) { setNotice("현재가를 반영할 코인 보유자산이 없습니다."); return; }
    try {
      const marketFor = (holding: Holding) => holding.market ?? `KRW-${holding.symbol}`;
      const response = await fetch(`/api/crypto-quotes?markets=${encodeURIComponent(coinHoldings.map(marketFor).join(","))}`, { cache: "no-store" });
      const data = await response.json() as { quotes?: Record<string, number>; previousCloses?: Record<string, number>; fetchedAt?: string };
      if (!data.quotes) throw new Error("No quotes");
      setCoinHoldings(current => {
        const next = current.map(holding => ({
          ...holding,
          fallbackPrice: data.quotes?.[marketFor(holding)] ?? holding.fallbackPrice,
          previousClose: data.previousCloses?.[marketFor(holding)] ?? holding.previousClose,
          quoteUpdatedAt: data.fetchedAt ?? holding.quoteUpdatedAt,
        }));
        updateStockAccounts("코인", next);
        return next;
      });
      setCoinQuoteUpdatedAt(data.fetchedAt ? formatQuoteTimestamp(data.fetchedAt) : new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    } catch { setNotice("코인 현재가를 불러오지 못했습니다. 마지막 확인 가격으로 계산합니다."); }
  };
  useEffect(() => {
    if (!fundHoldings.length) return;
    const value = fundHoldings.reduce((sum, holding) => sum + holding.quantity * holding.fallbackPrice, 0);
    const cost = fundHoldings.reduce((sum, holding) => sum + holding.quantity * holding.averagePrice, 0);
    setAccounts(current => current.map(account => account.type === "펀드" ? { ...account, amount: value, returnRate: cost > 0 ? (value / cost - 1) * 100 : 0 } : account));
  }, [fundHoldings.length]);
  const refreshIrpPrices = async () => {
    const symbols = irpHoldings.filter(item => item.assetClass === "ETF·주식" && item.symbol.endsWith(".KS")).map(item => item.symbol);
    if (!symbols.length) { setNotice("현재가를 반영할 IRP ETF가 없습니다."); return; }
    try { const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}&fields=previous-close-v1`, { cache: "no-store" }); const data = await response.json() as { quotes?: Record<string, number>; previousCloses?: Record<string, number>; previousCloseDates?: Record<string, string>; fetchedAt?: string }; if (!data.quotes) throw new Error("No quotes"); setIrpHoldings(current => { const next = current.map(holding => { const price = data.quotes?.[holding.symbol]; return price ? { ...holding, fallbackPrice: price, marketPrice: price, previousClose: data.previousCloses?.[holding.symbol] ?? holding.previousClose, previousCloseDate: data.previousCloseDates?.[holding.symbol] ?? holding.previousCloseDate, quoteUpdatedAt: data.fetchedAt ?? holding.quoteUpdatedAt } : holding; }); updateStockAccounts("IRP", next); return next; }); setIrpQuoteUpdatedAt(data.fetchedAt ? formatQuoteTimestamp(data.fetchedAt) : new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })); } catch { setNotice("IRP ETF 현재가를 불러오지 못했습니다. 마지막 확인 가격을 유지합니다."); }
  };
  useEffect(() => { if (holdings.length) void refreshKrw(holdings, setHoldings, "국내 주식", setQuoteUpdatedAt); }, [holdings.length]);
  useEffect(() => { if (usdHoldings.length) void refreshUsdPrices(); }, [usdHoldings.length]);
  useEffect(() => { if (coinHoldings.length) void refreshCoinPrices(); }, [coinHoldings.length]);
  useEffect(() => { if (isaHoldings.length) void refreshKrw(isaHoldings, setIsaHoldings, "ISA", setIsaQuoteUpdatedAt); }, [isaHoldings.length]);
  useEffect(() => { if (pensionHoldings.length) void refreshKrw(pensionHoldings, setPensionHoldings, "연금저축", setPensionQuoteUpdatedAt); }, [pensionHoldings.length]);
  useEffect(() => { if (irpHoldings.length) void refreshIrpPrices(); }, [irpHoldings.length]);
  useEffect(() => {
    let mounted = true;
    void fetch("/api/portfolio").then(async response => {
      if (!response.ok) throw new Error("저장소 조회 실패");
      return response.json() as Promise<{ hasData?: boolean; state?: { portfolios?: Portfolio[]; accounts?: Account[]; imports?: ScreenshotImport[]; snapshots?: Snapshot[]; profitPeaks?: Record<string, ProfitPeak>; targetAllocations?: Record<string, Partial<Record<AssetType, number>>>; irpResetVersion?: number; holdings?: Holding[]; usdHoldings?: Holding[]; fundHoldings?: Holding[]; coinHoldings?: Holding[]; pensionHoldings?: Holding[]; isaHoldings?: Holding[]; irpHoldings?: Holding[] } }>;
    }).then(data => {
      if (!mounted || !data.hasData || !data.state) return;
      if (Array.isArray(data.state.portfolios) && data.state.portfolios.length) setPortfolios(data.state.portfolios.filter(item => typeof item?.id === "string" && typeof item?.name === "string"));
      if (Array.isArray(data.state.accounts)) setAccounts(normalizeAccounts(data.state.accounts));
      if (Array.isArray(data.state.imports)) setImports(data.state.imports);
      if (Array.isArray(data.state.snapshots)) setSnapshots(data.state.snapshots.filter(snapshot => typeof snapshot.date === "string" && typeof snapshot.total === "number").map(migrateSnapshotTickers));
      if (data.state.profitPeaks && typeof data.state.profitPeaks === "object") setProfitPeaks(migrateProfitPeakTickers(data.state.profitPeaks));
      if (data.state.targetAllocations && typeof data.state.targetAllocations === "object") setTargetAllocations(data.state.targetAllocations);
      if (typeof data.state.irpResetVersion === "number") setIrpResetVersion(data.state.irpResetVersion);
      if (Array.isArray(data.state.holdings)) setHoldings(data.state.holdings.map(item => migrateHoldingTicker({ ...item, accountId: item.accountId ?? 2 })));
      if (Array.isArray(data.state.usdHoldings)) setUsdHoldings(data.state.usdHoldings.map(item => ({ ...item, accountId: item.accountId ?? 1 })));
      else setUsdHoldings(importedUsdHoldings);
      if (Array.isArray(data.state.fundHoldings)) setFundHoldings(data.state.fundHoldings.map(item => ({ ...item, accountId: item.accountId ?? 6 })));
      else setFundHoldings(importedFundHoldings);
      if (Array.isArray(data.state.coinHoldings)) setCoinHoldings(data.state.coinHoldings.map(item => ({ ...item, accountId: item.accountId ?? 7 })));
      if (Array.isArray(data.state.pensionHoldings)) setPensionHoldings(data.state.pensionHoldings.map(item => migrateHoldingTicker({ ...item, accountId: item.accountId ?? 5 })));
      if (Array.isArray(data.state.isaHoldings)) setIsaHoldings(data.state.isaHoldings.map(item => ({ ...item, accountId: item.accountId ?? 3 })));
      if (Array.isArray(data.state.irpHoldings)) setIrpHoldings(data.state.irpHoldings.map(item => migrateHoldingTicker({ ...item, accountId: item.accountId ?? 4 })));
      if (!data.state.accounts?.some(account => account.id === seohaPensionAccount.id)) setAccounts(current => [...current, seohaPensionAccount]);
      if (!data.state.pensionHoldings?.some(holding => holding.accountId === seohaPensionAccount.id)) setPensionHoldings(current => [...current, ...seohaPensionHoldings]);
      else setPensionHoldings(current => current.map(holding => holding.accountId === seohaPensionAccount.id && holding.symbol === "RISE-US-SP500" ? { ...holding, symbol: "379780.KS" } : holding));
      if (!data.state.accounts?.some(account => account.id === seohaOverseasAccount.id)) setAccounts(current => [...current, seohaOverseasAccount]);
      if (!data.state.usdHoldings?.some(holding => holding.accountId === seohaOverseasAccount.id)) setUsdHoldings(current => [...current, ...seohaOverseasHoldings]);
      if (!data.state.usdHoldings?.some(holding => holding.accountId === seohaOverseasAccount.id && holding.symbol === seohaUsBondHoldings[0].symbol)) setUsdHoldings(current => [...current, ...seohaUsBondHoldings]);
      if (!data.state.accounts?.some(account => account.id === eunhoPensionAccount.id)) setAccounts(current => [...current, eunhoPensionAccount]);
      if (!data.state.pensionHoldings?.some(holding => holding.accountId === eunhoPensionAccount.id)) setPensionHoldings(current => [...current, ...eunhoPensionHoldings]);
      if (!data.state.accounts?.some(account => account.id === okxGramAccount.id)) setAccounts(current => [...current, okxGramAccount]);
      if (!data.state.coinHoldings?.some(holding => holding.accountId === okxGramAccount.id && holding.symbol === "GRAM")) setCoinHoldings(current => [...current, okxGramHolding]);
      if (!data.state.accounts?.some(account => account.id === tossDomesticAccount.id)) setAccounts(current => [...current, tossDomesticAccount]);
      if (!data.state.holdings?.some(holding => holding.accountId === tossDomesticAccount.id)) setHoldings(current => [...current, ...tossDomesticHoldings]);
      if (!data.state.accounts?.some(account => account.id === tossOverseasAccount.id)) setAccounts(current => [...current, tossOverseasAccount]);
      if (!data.state.usdHoldings?.some(holding => holding.accountId === tossOverseasAccount.id)) setUsdHoldings(current => [...current, ...tossOverseasHoldings]);
      if (!data.state.accounts?.some(account => account.id === kakaoPayOverseasAccount.id)) setAccounts(current => [...current, kakaoPayOverseasAccount]);
      if (!data.state.usdHoldings?.some(holding => holding.accountId === kakaoPayOverseasAccount.id)) setUsdHoldings(current => [...current, ...kakaoPayOverseasHoldings]);
      if (!data.state.accounts?.some(account => account.id === miraeBondAccount.id)) setAccounts(current => [...current, miraeBondAccount]);
      if (!data.state.fundHoldings?.some(holding => holding.accountId === miraeBondAccount.id)) setFundHoldings(current => [...current, ...miraeBondHoldings]);
    }).catch(() => mounted && setNotice("서버 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.")).finally(() => mounted && setHydrated(true));
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!hydrated || irpResetVersion >= 3) return;
    const value = importedIrpHoldings.reduce((sum, holding) => sum + holding.quantity * holding.fallbackPrice, 0);
    const cost = importedIrpHoldings.reduce((sum, holding) => sum + holding.quantity * holding.averagePrice, 0);
    setIrpHoldings(importedIrpHoldings);
    setAccounts(current => current.map(account => account.id === 4 ? { ...account, amount: value, returnRate: cost > 0 ? (value / cost - 1) * 100 : 0 } : account));
    setIrpResetVersion(3);
  }, [hydrated, irpResetVersion]);
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => { void fetch("/api/portfolio", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portfolios, accounts, imports, snapshots, profitPeaks, targetAllocations, irpResetVersion, holdings, usdHoldings, fundHoldings, coinHoldings, pensionHoldings, isaHoldings, irpHoldings }) }).then(response => { if (!response.ok) throw new Error("저장 실패"); syncErrorShown.current = false; }).catch(() => { if (!syncErrorShown.current) { syncErrorShown.current = true; setNotice("변경 내용을 서버에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."); } }); }, 350);
    return () => window.clearTimeout(timer);
  }, [portfolios, accounts, imports, snapshots, profitPeaks, targetAllocations, irpResetVersion, holdings, usdHoldings, fundHoldings, coinHoldings, pensionHoldings, isaHoldings, irpHoldings, hydrated]);
  const detailsFor = (account: Account) => {
    if (account.type === "미국 주식") return { positions: usdHoldings.filter(item => item.accountId === account.id), updatedAt: usdQuoteUpdatedAt, exchangeRate: usdKrwRate, refresh: refreshUsdPrices };
    if (account.type === "펀드" || account.type === "채권") return { positions: fundHoldings.filter(item => item.accountId === account.id), updatedAt: "", exchangeRate: 1, refresh: async () => undefined };
    if (account.type === "국내 주식") return { positions: holdings.filter(item => item.accountId === account.id), updatedAt: quoteUpdatedAt, exchangeRate: 1, refresh: () => refreshKrw(holdings, setHoldings, "국내 주식", setQuoteUpdatedAt) };
    if (account.type === "코인") return { positions: coinHoldings.filter(item => item.accountId === account.id), updatedAt: coinQuoteUpdatedAt, exchangeRate: 1, refresh: refreshCoinPrices };
    if (account.type === "ISA") return { positions: isaHoldings.filter(item => item.accountId === account.id), updatedAt: isaQuoteUpdatedAt, exchangeRate: 1, refresh: () => refreshKrw(isaHoldings, setIsaHoldings, "ISA", setIsaQuoteUpdatedAt) };
    if (account.type === "연금저축") return { positions: pensionHoldings.filter(item => item.accountId === account.id), updatedAt: pensionQuoteUpdatedAt, exchangeRate: 1, refresh: () => refreshKrw(pensionHoldings, setPensionHoldings, "연금저축", setPensionQuoteUpdatedAt) };
    return { positions: irpHoldings.filter(item => item.accountId === account.id), updatedAt: irpQuoteUpdatedAt, exchangeRate: 1, refresh: refreshIrpPrices };
  };
  const updateTargetAllocation = (assetType: AssetType, value: number) => {
    setDraftTargetAllocation(current => ({ ...current, [assetType]: Math.max(0, Math.min(100, value)) }));
  };
  if (!hydrated) return <main><header className="topbar"><div className="brand"><span className="brand-mark">P</span><span>포트폴리오</span></div></header><section className="dashboard-loading"><strong>데이터 불러오는 중</strong><span>포트폴리오와 시세 정보를 준비하고 있습니다.</span></section></main>;
  return <main>
    <header className="topbar"><div className="brand"><span className="brand-mark">P</span><span>포트폴리오</span></div><div className="topbar-actions"><label className="portfolio-select"><span>포트폴리오</span><select value={activePortfolio?.id ?? ""} onChange={event => { setActivePortfolioId(event.target.value); setExpandedAccountId(null); setSelectedTrendItems([]); setSelectedAssetTrendItems([]); setSelectedAssetType(null); setEditingTargetAllocation(false); }} aria-label="표시할 포트폴리오 선택">{portfolios.map(portfolio => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></label><button className="profile">{activePortfolio?.name.slice(-2) ?? "SB"}</button></div></header>
    <section className="hero"><div><p className="eyebrow">{activePortfolio?.name ?? "포트폴리오"} · KRW</p><h1>{activePortfolio?.name ?? "내"} 자산, 한눈에.</h1><p className="hero-copy">이 포트폴리오에 연결된 계좌와 연금·펀드·코인의 성과를 확인하세요.</p></div></section>
    {notice && <div className="notice">{notice}<button onClick={() => setNotice("")}>닫기</button></div>}
    <section className="metrics"><article className="metric-card main-metric"><p>통합 평가자산</p><strong className="valuation-amount">{won.format(total)}<PriorCloseRate rate={dailyValuations.totalRate} /></strong><span>{portfolioQuoteBasis ?? "현재가 비교 기준 생성 중"}</span></article><article className="metric-card"><p>통합 수익률</p><strong>{total > 0 ? percent(weightedReturn) : "-"}</strong></article><article className="metric-card"><p>운용 계좌</p><strong>{portfolioAccounts.filter(account => account.amount > 0).length}<small>개</small></strong><span>{activePortfolio?.name ?? "선택"} 포트폴리오</span></article><article className="metric-card"><p>수익금</p><strong className={totalProfit >= 0 ? "positive" : "negative"}>{total > 0 ? `${totalProfit >= 0 ? "+" : ""}${won.format(totalProfit)}` : "-"}</strong></article></section>
    <section className="portfolio-summary-panel panel"><p className="portfolio-summary-copy">{concentrationSummary}</p><div className="concentration-grid"><article><span>주식 비중</span><strong>{concentrationMetrics.equityWeight.toFixed(1)}%</strong><small className={`tone-${concentrationTone("equity", concentrationMetrics.equityWeight)}`}>{concentrationTone("equity", concentrationMetrics.equityWeight)}</small></article><article><span>국내 자산 비중</span><strong>{concentrationMetrics.domesticWeight.toFixed(1)}%</strong><small>국내 주식 기준</small></article><article><span>최대 종목</span><strong>{concentrationMetrics.topOneWeight.toFixed(1)}%</strong><small className={`tone-${concentrationTone("single", concentrationMetrics.topOneWeight)}`}>{concentrationMetrics.topOneName} · {concentrationTone("single", concentrationMetrics.topOneWeight)}</small></article><article><span>Top 5 집중도</span><strong>{concentrationMetrics.topFiveWeight.toFixed(1)}%</strong><small className={`tone-${concentrationTone("topFive", concentrationMetrics.topFiveWeight)}`}>{concentrationTone("topFive", concentrationMetrics.topFiveWeight)}</small></article></div></section>
    <section className="panel asset-allocation-panel"><div className="panel-head"><div><p className="eyebrow">ASSET ALLOCATION</p><h2>자산 유형별 비중</h2></div></div><p className="account-hint">계좌가 아닌 보유 종목·상품의 성격을 기준으로 합산합니다. 유형을 클릭하면 계좌와 종목을 볼 수 있습니다.</p><div className="asset-allocation-body"><div className="donut" style={{ background: `conic-gradient(${assetAllocationGradient})` }}><div><strong>{assetAllocationByType.length}</strong><span>자산 유형</span></div></div><div className="legend asset-legend">{assetAllocationByType.map(item => <button key={item.type} className={selectedAssetType === item.type ? "selected" : ""} onClick={() => setSelectedAssetType(current => current === item.type ? null : item.type)} aria-expanded={selectedAssetType === item.type}><i className={item.color}/><span>{item.type}</span><b>{total > 0 ? (item.amount / total * 100).toFixed(1) : "0.0"}%</b><small>›</small></button>)}</div></div>{selectedAssetType && selectedAssetDetails && <div className="asset-detail"><div className="asset-detail-head"><div><p className="eyebrow">{selectedAssetType.toUpperCase()}</p><h3>{selectedAssetType} 상세</h3></div><button onClick={() => setSelectedAssetType(null)}>닫기</button></div><div className="asset-detail-grid"><div><h4>포함 계좌</h4><div className="asset-detail-list asset-metric-list"><div className="asset-metric-heading"><span>계좌</span><span>평가금액</span><span>수익률</span><span>평가손익</span><span>비중</span></div>{[...selectedAssetDetails.accounts.entries()].sort((a, b) => b[1] - a[1]).map(([accountId, amount]) => { const account = accounts.find(item => item.id === accountId); if (!account) return null; const profit = account.returnRate > -100 ? amount - amount / (1 + account.returnRate / 100) : 0; return <div className="asset-metric-row" key={accountId}><span><b>{accountLabel(account.name)}</b><small>{account.broker}</small></span><strong className="valuation-amount">{won.format(amount)}<PriorCloseRate rate={dailyValuations.assetAccountRates.get(`${selectedAssetType}:${accountId}`)} /></strong><strong className={account.returnRate >= 0 ? "positive" : "negative"}>{percent(account.returnRate)}</strong><strong className={profit >= 0 ? "positive" : "negative"}>{profit >= 0 ? "+" : ""}{won.format(profit)}</strong><strong>{total > 0 ? (amount / total * 100).toFixed(1) : "0.0"}%</strong></div>; })}</div></div><div><h4>보유 종목</h4><div className="asset-detail-list asset-metric-list">{selectedAssetDetails.holdings.length ? <><div className="asset-metric-heading"><span>종목</span><span>평가금액</span><span>수익률</span><span>평가손익</span><span>비중</span></div>{[...selectedAssetDetails.holdings].sort((a, b) => b.value - a.value).map(({ account, holding, value }) => { const cost = holding.fallbackPrice > 0 ? value * holding.averagePrice / holding.fallbackPrice : 0; const profit = value - cost; const rate = cost > 0 ? (value / cost - 1) * 100 : 0; return <div className="asset-metric-row" key={`${account.id}-${holding.symbol}-${holding.name}`}><span><b>{holding.name}</b><small>{accountLabel(account.name)} · {holding.symbol}</small><PriorCloseRate rate={dailyValuations.holdingRates.get(holdingSnapshotKey(account.id, holding))} /></span><strong>{won.format(value)}</strong><strong className={rate >= 0 ? "positive" : "negative"}>{percent(rate)}</strong><strong className={profit >= 0 ? "positive" : "negative"}>{profit >= 0 ? "+" : ""}{won.format(profit)}</strong><strong>{total > 0 ? (value / total * 100).toFixed(1) : "0.0"}%</strong></div>; })}</> : <p className="asset-empty">등록된 종목 정보가 없습니다.</p>}</div></div></div></div>}</section>
    <section className="panel holdings-top-panel"><div className="panel-head"><div><h2>전체 보유자산 Top 10</h2><p className="account-hint">동일 종목은 계좌 간 합산</p></div><span className="domestic-total">평가금액 기준</span></div><div className="holdings-top-table"><div className="holdings-top-heading"><span>종목</span><span>유형</span><span>평가금액</span><span>전체 비중</span><span>수익률</span></div>{aggregatedHoldings.slice(0, 10).map((item, index) => <div className="holding-top-item" key={item.id}><button className={`holdings-top-row ${expandedTopHoldingId === item.id ? "expanded" : ""}`} onClick={() => setExpandedTopHoldingId(current => current === item.id ? null : item.id)} aria-expanded={expandedTopHoldingId === item.id} aria-controls={`holding-source-${index}`}><span className="holding-top-name"><i>{index + 1}</i><span><b>{item.name}</b>{item.ticker && <small>{item.ticker}</small>}</span></span><span className={`asset-type-chip ${assetTypeMeta[item.assetType].color}`}>{item.assetType}</span><strong>{won.format(item.evaluationAmount)}</strong><strong>{item.portfolioWeight.toFixed(1)}%</strong><strong className={item.returnRate === null || item.returnRate >= 0 ? "positive" : "negative"}>{item.returnRate === null ? "-" : percent(item.returnRate)}</strong><i className="disclosure-chevron" aria-hidden="true">⌄</i></button>{expandedTopHoldingId === item.id && <div className="holding-source-detail" id={`holding-source-${index}`}><p>보유 계좌 {new Set(item.lots.map(lot => lot.accountId)).size}개 · 총 {item.lots.reduce((sum, lot) => sum + lot.quantity, 0).toLocaleString("ko-KR", { maximumFractionDigits: 6 })}주</p><div className="holding-source-heading"><span>계좌 · 보유 상태</span><span>수량</span><span>평가금액</span><span>종목 내 비중</span></div>{item.lots.sort((left, right) => right.evaluationAmount - left.evaluationAmount).map((lot, lotIndex) => <div className="holding-source-row" key={`${lot.accountId}-${lot.holdingStatus}-${lotIndex}`}><span><b>{accountLabel(lot.accountName)}</b><small>{lot.holdingStatus}</small></span><strong>{lot.quantity > 0 ? lot.quantity.toLocaleString("ko-KR", { maximumFractionDigits: 6 }) : "-"}</strong><strong>{won.format(lot.evaluationAmount)}</strong><strong>{item.evaluationAmount > 0 ? (lot.evaluationAmount / item.evaluationAmount * 100).toFixed(1) : "0.0"}%</strong></div>)}</div>}</div>)}</div></section>
    <section className="daily-contribution-grid">{["상승", "하락"].map(direction => { const entries = dailyContributions?.filter(item => direction === "상승" ? item.amountChange > 0 : item.amountChange < 0).sort((a, b) => direction === "상승" ? b.amountChange - a.amountChange : a.amountChange - b.amountChange).slice(0, 5) ?? []; return <section className="panel contribution-panel" key={direction}><div className="panel-head"><div><h2>오늘 {direction} 기여 Top 5</h2><p className="account-hint">{latestSnapshotPair.length === 2 ? `${latestSnapshotPair[0].date.replaceAll("-", ".")} → ${latestSnapshotPair[1].date.replaceAll("-", ".")} · 전일 평가금액 증감 기준` : "비교할 전일 데이터가 없습니다."}</p></div></div>{entries.length ? <ol>{entries.map(item => <li key={item.id}><span><b>{item.name}</b><small>{item.assetType} · {item.ticker}</small></span><strong className={item.amountChange >= 0 ? "positive" : "negative"}>{signedAmount(item.amountChange)}<small>{item.contributionPct === null ? "" : `${item.contributionPct >= 0 ? "+" : ""}${item.contributionPct.toFixed(2)}%p 기여`}</small></strong></li>)}</ol> : <div className="empty-holdings">비교할 전일 데이터가 없습니다.</div>}</section>; })}</section>
    <section className="panel target-allocation-panel"><div className="panel-head"><div><h2>목표 자산배분</h2><p className="account-hint">현재 비중과 목표 비중의 편차 및 목표 평가금액 기준 차이를 표시합니다.</p></div><button className="target-edit-button" onClick={() => { if (editingTargetAllocation) setEditingTargetAllocation(false); else { setDraftTargetAllocation(activeTargets); setEditingTargetAllocation(true); } }}>{editingTargetAllocation ? "취소" : hasTargetAllocation ? "목표 수정" : "목표 설정"}</button></div>{editingTargetAllocation ? <div className="target-allocation-form">{PORTFOLIO_ASSET_TYPES.map(type => <label key={type}><span>{type}</span><input type="number" min="0" max="100" step="0.1" value={draftTargetAllocation[type] ?? 0} onChange={event => updateTargetAllocation(type, Number(event.target.value))} /><b>%</b></label>)}<div className={`target-total ${Math.abs(targetAllocationTotal - 100) < 0.01 ? "valid" : ""}`}><span>합계</span><strong>{targetAllocationTotal.toFixed(1)}%</strong><button disabled={Math.abs(targetAllocationTotal - 100) >= 0.01} onClick={() => { if (!activePortfolio) return; setTargetAllocations(current => ({ ...current, [activePortfolio.id]: draftTargetAllocation })); setEditingTargetAllocation(false); }}>저장</button></div>{Math.abs(targetAllocationTotal - 100) >= 0.01 && <p>합계가 100%가 되어야 저장할 수 있습니다.</p>}</div> : hasTargetAllocation ? <div className="target-allocation-table"><div><span>자산 유형</span><span>현재</span><span>목표</span><span>편차</span><span>목표 대비</span></div>{targetAllocationGaps.map(item => <div key={item.assetType}><span><i className={assetTypeMeta[item.assetType].color}/>{item.assetType}</span><strong>{item.currentWeight.toFixed(1)}%</strong><strong>{item.targetWeight.toFixed(1)}%</strong><strong className={item.gapPct >= 0 ? "positive" : "negative"}>{item.gapPct >= 0 ? "+" : ""}{item.gapPct.toFixed(1)}%p</strong><strong className={item.adjustmentAmount >= 0 ? "negative" : "positive"}>{item.adjustmentAmount >= 0 ? "+" : ""}{won.format(item.adjustmentAmount)}</strong></div>)}</div> : <div className="target-allocation-empty"><strong>목표 자산배분을 설정해 보세요.</strong><span>자산 유형별 목표 비중을 합계 100%로 저장하면 현재 비중과 편차를 비교할 수 있습니다.</span></div>}</section>
    <section className="accounts-section"><div className="panel-head"><div><p className="eyebrow">ACCOUNTS</p><h2>계좌별 자산</h2></div></div><p className="account-hint">평가금액이 큰 계좌부터 표시됩니다. 계좌를 클릭하면 보유자산 상세와 현재가를 확인할 수 있습니다.</p><div className="account-table"><div className="table-heading"><span>계좌</span><span>평가금액</span><span>수익률</span><span>평가손익</span><span>비중</span></div>{accountsByValue.map(account => { const details = detailsFor(account); const profit = account.returnRate > -100 ? account.amount - account.amount / (1 + account.returnRate / 100) : 0; const comparison = dailyValuations.accountComparisons.get(account.id); const holdingSelection = selectedHoldingTrendItems[account.id] ?? []; const toggleHoldingTrendItem = (id: string) => setSelectedHoldingTrendItems(current => { const selected = current[account.id] ?? []; return { ...current, [account.id]: selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id] }; }); return <div className="account-item" key={account.id}><div className={`account-row ${expandedAccountId === account.id ? "expanded" : ""}`} role="button" tabIndex={0} onClick={() => setExpandedAccountId(current => current === account.id ? null : account.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpandedAccountId(current => current === account.id ? null : account.id); } }}><div><span className={`account-icon ${account.color}`}>{account.type.slice(0, 1)}</span><span><b>{accountLabel(account.name)}</b><small>{account.broker}</small></span></div><strong className="valuation-amount">{won.format(account.amount)}<PriorCloseRate rate={comparison?.rate} /></strong><strong className={account.returnRate >= 0 ? "positive" : "negative"}>{percent(account.returnRate)}</strong><strong className={profit >= 0 ? "positive" : "negative"}>{profit >= 0 ? "+" : ""}{won.format(profit)}</strong><div className="weight"><i><em style={{ width: `${total > 0 ? account.amount / total * 100 : 0}%` }}/></i><span>{total > 0 ? (account.amount / total * 100).toFixed(1) : "0.0"}%</span></div></div>{expandedAccountId === account.id && <AccountDetails account={account} {...details} snapshots={periodSnapshots} selectedTrendItems={holdingSelection} onToggleTrendItem={toggleHoldingTrendItem} />}</div>; })}</div></section>
    <AccountSnapshotComparison accounts={portfolioAccounts} snapshots={snapshots} period={snapshotComparisonPeriod} onPeriodChange={setSnapshotComparisonPeriod} />
    <PerformancePanel title="통합 자산 추이" period={period} onPeriodChange={setPeriod} items={trendItems} aggregateSeries={aggregateAccountTrend} selectedItems={selectedTrendItems} onSelectionChange={setSelectedTrendItems} pickerLabel="계좌 선택" valuationDailyRate={dailyValuations.totalRate} />
    <PerformancePanel title="자산 유형별 추이" period={period} onPeriodChange={setPeriod} items={assetTrendItems} aggregateSeries={aggregateAssetTrend} selectedItems={selectedAssetTrendItems} onSelectionChange={setSelectedAssetTrendItems} pickerLabel="자산 유형 선택" pickerColumnLabel="자산 유형" valuationDailyRate={dailyValuations.totalRate} />
  </main>;
}
