"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./holdings.css";
import "./reset.css";
import "./empty.css";
import "./account-manager.css";
import "./accounts.css";
import "./trend.css";

type Account = { id: number; type: string; broker: string; name: string; amount: number; returnRate: number; color: string };
type Holding = { symbol: string; name: string; quantity: number; averagePrice: number; fallbackPrice: number; accountId?: number; unit?: string; assetClass?: "ETF·주식" | "현금성·금융상품"; marketPrice?: number };
type ScreenshotImport = { id: number; accountId: number; fileName: string; createdAt: string; status: "추출 대기" | "검토 필요"; summary?: string };
type Snapshot = { date: string; total: number };
type ProfitPeak = { profit: number; date: string };
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
const reports = ["주", "월", "분기", "반기", "1년", "최대"] as const;
type ReportPeriod = typeof reports[number];
const reportLabels: Record<ReportPeriod, string> = {
  "주": "최근 1주",
  "월": "최근 1개월",
  "분기": "최근 3개월",
  "반기": "최근 6개월",
  "1년": "최근 1년",
  "최대": "전체 기간",
};
const won = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const percent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const accountLabel = (name: string) => name.replace(/\s*[·ㆍ]\s*\d[\d-]*$/u, "");
const assetTypeMeta: Record<AssetType, { color: string }> = {
  "국내 주식": { color: "violet" }, "해외 주식": { color: "blue" }, "채권·현금성": { color: "mint" },
  "대체자산": { color: "orange" }, "펀드": { color: "pink" }, "가상자산": { color: "yellow" },
};
const colorHex: Record<string, string> = { blue: "#5666df", violet: "#8d71e8", mint: "#3fb99e", orange: "#f5a641", pink: "#e878a9", yellow: "#ecc950" };
const assetTypeFor = (accountType: string, holding?: Holding): AssetType => {
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
const accountProfile: Record<number, Pick<Account, "broker" | "name">> = {
  1: { name: "미국 주식 계좌", broker: "키움증권" },
  2: { name: "국내 주식 계좌", broker: "삼성증권" },
  3: { name: "ISA 중개형 계좌", broker: "한화투자증권" },
  4: { name: "IRP 계좌", broker: "미래에셋증권" },
  5: { name: "연금저축 계좌", broker: "삼성증권" },
  6: { name: "펀드 계좌", broker: "한화자산운용 PINE" },
  8: { name: "국내 주식 계좌 2", broker: "대신증권" },
};
const normalizeAccounts = (accounts: Account[]) => accounts.map(account => accountProfile[account.id] ? { ...account, ...accountProfile[account.id] } : account);
const todayKst = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());

function TrendChart({ snapshots }: { snapshots: Snapshot[] }) {
  if (snapshots.length < 2) return <div className="chart empty-chart">오늘 평가금액을 기준선으로 저장했습니다. 내일부터 일별 자산 추이가 표시됩니다.</div>;
  const values = snapshots.map(snapshot => snapshot.total);
  const min = Math.min(...values); const max = Math.max(...values); const range = max - min || 1;
  const points = values.map((value, index) => `${index / (values.length - 1) * 100},${88 - (value - min) / range * 72}`).join(" ");
  return <div className="trend-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="통합 자산 추이"><polyline points={points} fill="none" stroke="#5666df" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /><polyline points={`0,100 ${points} 100,100`} fill="#5666df12" stroke="none" /></svg><div className="trend-labels"><span>{snapshots[0].date.slice(5).replace("-", ".")}</span><span>{snapshots.at(-1)?.date.slice(5).replace("-", ".")}</span></div></div>;
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
  ["TIGER 미국나스닥100", "IRP-NASDAQ100", 452, 30461360, 85235900, "ETF·주식"], ["KIWOOM 인도Nifty50(합성)", "IRP-NIFTY50", 80, 1477800, 1779600, "ETF·주식"],
  ["TIGER 코리아TOP10", "292150.KS", 732, 9626035, 28203960, "ETF·주식"], ["신한알파리츠", "293940.KS", 1788, 12764590, 9451260, "ETF·주식"],
  ["KODEX TRF3070", "IRP-TRF3070", 1068, 12466650, 15197640, "ETF·주식"], ["ACE 미국S&P500", "360200.KS", 189, 2346435, 5235360, "ETF·주식"],
  ["TIGER 차이나전기차SOLACTIVE", "371460.KS", 163, 2773925, 1782405, "ETF·주식"], ["미래에셋증권현금성자산", "IRP-CASH", 1, 1385975, 1385975, "현금성·금융상품"],
  ["애큐온저축은행예금 IRP(개인) 1Y_퇴직", "IRP-ACCION", 1, 394370, 401192, "현금성·금융상품"], ["(통합)(무)흥국생명보험 퇴직연금 이율보증형 3년 (IRP)", "IRP-HEUNGKUK", 1, 433563, 456789, "현금성·금융상품"],
  ["(통합)KB손해보험 원리금보장형 이율보증형 3년 (DC/IRP)", "IRP-KB", 1, 1700932, 1740738, "현금성·금융상품"],
  ["미래에셋증권 디폴트옵션 안정투자형 포트폴리오 1", "IRP-DEFAULT-P1", 1, 16966169, 17893310, "현금성·금융상품"],
].map(([name, symbol, quantity, cost, value, assetClass]) => ({ name: String(name), symbol: String(symbol), quantity: Number(quantity), averagePrice: Number(cost) / Number(quantity), fallbackPrice: Number(value) / Number(quantity), accountId: 4, assetClass: assetClass as Holding["assetClass"] }));

function AccountDetails({ account, positions, updatedAt, exchangeRate, refresh }: { account: Account; positions: Holding[]; updatedAt: string; exchangeRate: number; refresh: () => Promise<void> }) {
  const isUsd = account.type === "미국 주식";
  const isCoin = account.type === "코인";
  const isFund = account.type === "펀드";
  const isIrp = account.type === "IRP";
  const isKrwStock = ["국내 주식", "ISA", "연금저축"].includes(account.type);
  const groups = isIrp
    ? ["ETF·주식", "현금성·금융상품"].map(assetClass => ({ assetClass, positions: positions.filter(holding => holding.assetClass === assetClass) })).filter(group => group.positions.length)
    : [{ assetClass: "보유자산", positions }];
  const title = isUsd ? "미국 주식 · 원화 환산 기준" : isCoin ? "코인 · 업비트 현재가 기준" : isFund ? "펀드 · 등록 평가금액 기준" : account.type === "국내 주식" ? "국내 주식 · 현재가 기준" : account.type === "ISA" ? "ISA · 현재가 기준" : account.type === "연금저축" ? "연금저축 · 현재가 기준" : "IRP · 투자상품 및 현금성 자산";
  const label = isUsd ? "US HOLDINGS · KRW" : isCoin ? "CRYPTO HOLDINGS" : isFund ? "FUND HOLDINGS" : account.type === "국내 주식" ? "DOMESTIC HOLDINGS" : account.type === "ISA" ? "ISA HOLDINGS" : account.type === "연금저축" ? "PENSION HOLDINGS" : "IRP HOLDINGS";
  const note = isUsd
    ? `미국 현지 현재가와 USD/KRW 환율(1 USD = ${won.format(exchangeRate)})을 반영해 원화 평가금액·손익을 계산합니다.`
    : isFund ? "한화자산운용 PINE에서 확인한 평가금액을 기준으로 표시합니다. 펀드 기준가 연동은 추후 추가할 수 있습니다."
    : isKrwStock ? "등록된 보유 수량과 평단가를 기준으로 현재가 손익과 수익률을 계산합니다."
    : isCoin ? "업비트 KRW 마켓 현재가를 6시간마다 갱신하며, 버튼으로 즉시 다시 조회할 수 있습니다."
    : "상장 ETF·주식은 현재가를 표시하고, 예금·보험·디폴트옵션은 마지막 등록 평가금액을 유지합니다.";

  if (!isUsd && !isCoin && !isFund && !isKrwStock && !isIrp) return <div className="account-expanded empty-account-detail">등록된 보유자산이 없습니다.</div>;
  return <div className="account-expanded">
    <div className="detail-head"><div><p className="eyebrow">{label}</p><h3>{title}</h3></div>{!isFund && <button className="text-button" onClick={event => { event.stopPropagation(); void refresh(); }}>현재가 새로고침 {updatedAt && `· ${updatedAt}`}</button>}</div>
    <p className="holdings-note">{note}</p>
    {positions.length === 0 ? <div className="empty-holdings">등록된 {isCoin ? "코인 보유자산" : "보유 종목"}이 없습니다.</div> : groups.map(group => <div className="holding-group" key={group.assetClass}>{isIrp && <h4>{group.assetClass}</h4>}<div className="holding-table"><div><span>{isCoin ? "코인" : isIrp ? "상품" : "종목"}</span><span>보유 수량</span><span>매입금액</span><span>평가금액</span><span>평가손익</span><span>수익률</span></div>{group.positions.map(holding => {
      const multiplier = isUsd ? exchangeRate : 1;
      const cost = holding.quantity * holding.averagePrice * multiplier;
      const value = holding.quantity * holding.fallbackPrice * multiplier;
      const profit = value - cost;
      const rate = cost > 0 ? (value / cost - 1) * 100 : 0;
      return <div key={`${holding.symbol}-${holding.name}`}><b>{holding.name}<small>{isKrwStock ? holding.symbol.replace(".KS", "") : holding.symbol}{isUsd ? ` · $${holding.fallbackPrice.toFixed(2)}` : ""}{isIrp && holding.marketPrice ? ` · 현재가 ${won.format(holding.marketPrice)}` : ""}</small></b><span>{isCoin ? `${holding.quantity.toLocaleString("ko-KR", { maximumFractionDigits: 8 })} ${holding.symbol}` : `${holding.quantity}${holding.unit ?? "주"}`}</span><span>{won.format(cost)}</span><span>{won.format(value)}</span><strong className={profit >= 0 ? "positive" : "negative"}>{profit >= 0 ? "+" : ""}{won.format(profit)}</strong><strong className={rate >= 0 ? "positive" : "negative"}>{percent(rate)}</strong></div>;
    })}</div></div>)}
  </div>;
}

export default function Home() {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [period, setPeriod] = useState<ReportPeriod>("최대");
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
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType | null>(null);
  const [imports, setImports] = useState<ScreenshotImport[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [profitPeaks, setProfitPeaks] = useState<Record<string, ProfitPeak>>({});
  const [irpResetVersion, setIrpResetVersion] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const syncErrorShown = useRef(false);
  const total = useMemo(() => accounts.reduce((sum, account) => sum + account.amount, 0), [accounts]);
  const weightedReturn = useMemo(() => total > 0 ? accounts.reduce((sum, account) => sum + account.amount * account.returnRate, 0) / total : 0, [accounts, total]);
  const totalProfit = useMemo(() => accounts.reduce((sum, account) => account.returnRate > -100 ? sum + account.amount - account.amount / (1 + account.returnRate / 100) : sum, 0), [accounts]);
  const accountsByValue = useMemo(() => [...accounts].sort((a, b) => b.amount - a.amount), [accounts]);
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
    accounts.forEach(account => {
      const positions = positionsByAccount.get(account.id) ?? [];
      const positionsTotal = positions.reduce((sum, item) => sum + item.value, 0);
      if (!positionsTotal) { grouped[assetTypeFor(account.type)] += account.amount; return; }
      positions.forEach(({ holding, value }) => { grouped[assetTypeFor(account.type, holding)] += account.amount * value / positionsTotal; });
    });
    return (Object.entries(grouped) as Array<[AssetType, number]>).filter(([, amount]) => amount > 0).map(([type, amount]) => ({ type, amount, color: assetTypeMeta[type].color })).sort((a, b) => b.amount - a.amount);
  }, [accounts, holdings, usdHoldings, usdKrwRate, fundHoldings, coinHoldings, pensionHoldings, isaHoldings, irpHoldings]);
  const assetAllocationGradient = useMemo(() => {
    if (!total || !assetAllocationByType.length) return "#eceef3 0 100%";
    let offset = 0;
    return assetAllocationByType.map(item => {
      const start = offset;
      offset += item.amount / total * 100;
      return `${colorHex[item.color]} ${start}% ${offset}%`;
    }).join(", ");
  }, [assetAllocationByType, total]);
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
    accounts.forEach(account => {
      const positions = positionsByAccount.get(account.id) ?? [];
      const positionsTotal = positions.reduce((sum, item) => sum + item.value, 0);
      if (!positionsTotal) { details[assetTypeFor(account.type)].accounts.set(account.id, account.amount); return; }
      positions.forEach(({ holding, value }) => {
        const allocatedValue = account.amount * value / positionsTotal;
        const type = assetTypeFor(account.type, holding);
        const detail = details[type];
        detail.accounts.set(account.id, (detail.accounts.get(account.id) ?? 0) + allocatedValue);
        detail.holdings.push({ account, holding, value: allocatedValue });
      });
    });
    return details;
  }, [accounts, holdings, usdHoldings, usdKrwRate, fundHoldings, coinHoldings, pensionHoldings, isaHoldings, irpHoldings]);
  const selectedAssetDetails = selectedAssetType ? assetDetailsByType[selectedAssetType] : null;
  const domesticTopThree = useMemo(() => {
    const grouped = new Map<string, { name: string; symbol: string; value: number; cost: number; quantity: number; accountNames: Set<string> }>();
    assetDetailsByType["국내 주식"].holdings.forEach(({ account, holding, value }) => {
      const key = holding.symbol || holding.name;
      const current = grouped.get(key) ?? { name: holding.name, symbol: holding.symbol, value: 0, cost: 0, quantity: 0, accountNames: new Set<string>() };
      current.value += value;
      current.cost += holding.fallbackPrice > 0 ? value * holding.averagePrice / holding.fallbackPrice : 0;
      current.quantity += holding.quantity;
      current.accountNames.add(accountLabel(account.name));
      grouped.set(key, current);
    });
    const domesticTotal = [...grouped.values()].reduce((sum, item) => sum + item.value, 0);
    return { total: domesticTotal, items: [...grouped.values()].sort((a, b) => b.value - a.value).slice(0, 3) };
  }, [assetDetailsByType]);
  const periodSnapshots = useMemo(() => {
    if (period === "최대") return snapshots;
    const start = new Date();
    const daysByPeriod: Record<Exclude<ReportPeriod, "최대">, number> = { "주": 7, "월": 31, "분기": 92, "반기": 183, "1년": 365 };
    start.setDate(start.getDate() - daysByPeriod[period]);
    const startDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(start);
    return snapshots.filter(snapshot => snapshot.date >= startDate);
  }, [period, snapshots]);
  const periodChange = useMemo(() => periodSnapshots.length > 1 ? (periodSnapshots.at(-1)!.total / periodSnapshots[0].total - 1) * 100 : null, [periodSnapshots]);

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
      const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(items.filter(item => item.symbol.endsWith(".KS")).map(item => item.symbol).join(","))}`);
      const data = await response.json() as { quotes?: Record<string, number> };
      if (!data.quotes) throw new Error("No quotes");
      setter(current => { const next = current.map(holding => ({ ...holding, fallbackPrice: data.quotes?.[holding.symbol] ?? holding.fallbackPrice })); updateStockAccounts(type, next); return next; });
      setUpdated(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    } catch { setNotice("현재가를 불러오지 못했습니다. 마지막 확인 가격으로 계산합니다."); }
  };
  const refreshUsdPrices = async () => {
    if (!usdHoldings.length) { setNotice("현재가를 반영할 미국 주식 보유 종목이 없습니다."); return; }
    try {
      const response = await fetch(`/api/quotes?includeExchangeRate=1&symbols=${encodeURIComponent(usdHoldings.map(item => item.symbol).join(","))}`);
      const data = await response.json() as { quotes?: Record<string, number>; exchangeRate?: number | null };
      if (!data.quotes || !data.exchangeRate) throw new Error("No quotes");
      setUsdKrwRate(data.exchangeRate);
      setUsdHoldings(current => { const next = current.map(holding => ({ ...holding, fallbackPrice: data.quotes?.[holding.symbol] ?? holding.fallbackPrice })); updateStockAccounts("미국 주식", next, data.exchangeRate!); return next; });
      setUsdQuoteUpdatedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    } catch { setNotice("미국 주식 현재가 또는 환율을 불러오지 못했습니다. 마지막 확인 값으로 계산합니다."); }
  };
  const refreshCoinPrices = async () => {
    if (!coinHoldings.length) { setNotice("현재가를 반영할 코인 보유자산이 없습니다."); return; }
    try {
      const response = await fetch(`/api/crypto-quotes?markets=${encodeURIComponent(coinHoldings.map(item => `KRW-${item.symbol}`).join(","))}`);
      const data = await response.json() as { quotes?: Record<string, number> };
      if (!data.quotes) throw new Error("No quotes");
      setCoinHoldings(current => { const next = current.map(holding => ({ ...holding, fallbackPrice: data.quotes?.[`KRW-${holding.symbol}`] ?? holding.fallbackPrice })); updateStockAccounts("코인", next); return next; });
      setCoinQuoteUpdatedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
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
    try { const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`); const data = await response.json() as { quotes?: Record<string, number> }; if (!data.quotes) throw new Error("No quotes"); setIrpHoldings(current => current.map(holding => ({ ...holding, marketPrice: data.quotes?.[holding.symbol] ?? holding.marketPrice }))); setIrpQuoteUpdatedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })); } catch { setNotice("IRP ETF 현재가를 불러오지 못했습니다. 마지막 확인 가격을 유지합니다."); }
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
      return response.json() as Promise<{ hasData?: boolean; state?: { accounts?: Account[]; imports?: ScreenshotImport[]; snapshots?: Snapshot[]; profitPeaks?: Record<string, ProfitPeak>; irpResetVersion?: number; holdings?: Holding[]; usdHoldings?: Holding[]; fundHoldings?: Holding[]; coinHoldings?: Holding[]; pensionHoldings?: Holding[]; isaHoldings?: Holding[]; irpHoldings?: Holding[] } }>;
    }).then(data => {
      if (!mounted || !data.hasData || !data.state) return;
          if (Array.isArray(data.state.accounts)) setAccounts(normalizeAccounts(data.state.accounts));
      if (Array.isArray(data.state.imports)) setImports(data.state.imports);
      if (Array.isArray(data.state.snapshots)) setSnapshots(data.state.snapshots.filter(snapshot => typeof snapshot.date === "string" && typeof snapshot.total === "number").slice(-366));
      if (data.state.profitPeaks && typeof data.state.profitPeaks === "object") setProfitPeaks(data.state.profitPeaks);
      if (typeof data.state.irpResetVersion === "number") setIrpResetVersion(data.state.irpResetVersion);
      if (Array.isArray(data.state.holdings)) setHoldings(data.state.holdings.map(item => ({ ...item, accountId: item.accountId ?? 2 })));
      if (Array.isArray(data.state.usdHoldings)) setUsdHoldings(data.state.usdHoldings.map(item => ({ ...item, accountId: item.accountId ?? 1 })));
      else setUsdHoldings(importedUsdHoldings);
      if (Array.isArray(data.state.fundHoldings)) setFundHoldings(data.state.fundHoldings.map(item => ({ ...item, accountId: item.accountId ?? 6 })));
      else setFundHoldings(importedFundHoldings);
      if (Array.isArray(data.state.coinHoldings)) setCoinHoldings(data.state.coinHoldings.map(item => ({ ...item, accountId: item.accountId ?? 7 })));
      if (Array.isArray(data.state.pensionHoldings)) setPensionHoldings(data.state.pensionHoldings.map(item => ({ ...item, accountId: item.accountId ?? 5 })));
      if (Array.isArray(data.state.isaHoldings)) setIsaHoldings(data.state.isaHoldings.map(item => ({ ...item, accountId: item.accountId ?? 3 })));
      if (Array.isArray(data.state.irpHoldings)) setIrpHoldings(data.state.irpHoldings.map(item => ({ ...item, accountId: item.accountId ?? 4 })));
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
    if (!hydrated || total <= 0) return;
    const date = todayKst();
    setSnapshots(current => {
      if (current.some(snapshot => snapshot.date === date)) return current;
      return [...current, { date, total }].sort((a, b) => a.date.localeCompare(b.date)).slice(-366);
    });
  }, [hydrated, total]);
  useEffect(() => {
    if (!hydrated) return;
    const date = todayKst();
    setProfitPeaks(current => {
      const next = { ...current };
      domesticTopThree.items.forEach(item => {
        const key = item.symbol || item.name;
        const profit = item.value - item.cost;
        if (!next[key] || profit > next[key].profit) next[key] = { profit, date };
      });
      return next;
    });
  }, [hydrated, domesticTopThree]);
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => { void fetch("/api/portfolio", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accounts, imports, snapshots, profitPeaks, irpResetVersion, holdings, usdHoldings, fundHoldings, coinHoldings, pensionHoldings, isaHoldings, irpHoldings }) }).then(response => { if (!response.ok) throw new Error("저장 실패"); syncErrorShown.current = false; }).catch(() => { if (!syncErrorShown.current) { syncErrorShown.current = true; setNotice("변경 내용을 서버에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."); } }); }, 350);
    return () => window.clearTimeout(timer);
  }, [accounts, imports, snapshots, profitPeaks, irpResetVersion, holdings, usdHoldings, fundHoldings, coinHoldings, pensionHoldings, isaHoldings, irpHoldings, hydrated]);
  const detailsFor = (account: Account) => {
    if (account.type === "미국 주식") return { positions: usdHoldings.filter(item => item.accountId === account.id), updatedAt: usdQuoteUpdatedAt, exchangeRate: usdKrwRate, refresh: refreshUsdPrices };
    if (account.type === "펀드") return { positions: fundHoldings.filter(item => item.accountId === account.id), updatedAt: "", exchangeRate: 1, refresh: async () => undefined };
    if (account.type === "국내 주식") return { positions: holdings.filter(item => item.accountId === account.id), updatedAt: quoteUpdatedAt, exchangeRate: 1, refresh: () => refreshKrw(holdings, setHoldings, "국내 주식", setQuoteUpdatedAt) };
    if (account.type === "코인") return { positions: coinHoldings.filter(item => item.accountId === account.id), updatedAt: coinQuoteUpdatedAt, exchangeRate: 1, refresh: refreshCoinPrices };
    if (account.type === "ISA") return { positions: isaHoldings.filter(item => item.accountId === account.id), updatedAt: isaQuoteUpdatedAt, exchangeRate: 1, refresh: () => refreshKrw(isaHoldings, setIsaHoldings, "ISA", setIsaQuoteUpdatedAt) };
    if (account.type === "연금저축") return { positions: pensionHoldings.filter(item => item.accountId === account.id), updatedAt: pensionQuoteUpdatedAt, exchangeRate: 1, refresh: () => refreshKrw(pensionHoldings, setPensionHoldings, "연금저축", setPensionQuoteUpdatedAt) };
    return { positions: irpHoldings.filter(item => item.accountId === account.id), updatedAt: irpQuoteUpdatedAt, exchangeRate: 1, refresh: refreshIrpPrices };
  };
  return <main>
    <header className="topbar"><div className="brand"><span className="brand-mark">P</span><span>포트폴리오</span></div><div className="topbar-actions"><span className="sync-dot" /> 아직 동기화된 계좌 없음 <button className="profile">SB</button></div></header>
    <section className="hero"><div><p className="eyebrow">ALL ACCOUNTS · KRW</p><h1>내 자산, 한눈에.</h1><p className="hero-copy">증권사별 계좌와 연금·펀드·코인을 한곳에 모아 성과를 확인하세요.</p></div></section>
    {notice && <div className="notice">{notice}<button onClick={() => setNotice("")}>닫기</button></div>}
    <section className="metrics"><article className="metric-card main-metric"><p>통합 평가자산</p><strong>{won.format(total)}</strong><span>등록된 보유 종목 기준</span></article><article className="metric-card"><p>통합 수익률</p><strong>{total > 0 ? percent(weightedReturn) : "-"}</strong><span>매입금액 대비</span></article><article className="metric-card"><p>운용 계좌</p><strong>{accounts.filter(account => account.amount > 0).length}<small>개</small></strong><span>등록 가능한 7개 자산 유형</span></article><article className="metric-card"><p>수익금</p><strong className={totalProfit >= 0 ? "positive" : "negative"}>{total > 0 ? `${totalProfit >= 0 ? "+" : ""}${won.format(totalProfit)}` : "-"}</strong><span>매입금액 대비 평가손익</span></article></section>
    <section className="content-grid"><article className="panel performance-panel"><div className="panel-head"><div><p className="eyebrow">PERFORMANCE</p><h2>통합 자산 추이</h2></div></div><div className="periods" role="tablist">{reports.map(item => <button key={item} role="tab" aria-selected={period === item} className={period === item ? "selected" : ""} onClick={() => setPeriod(item)}>{item}</button>)}</div><div className="report-value"><div><span>{reportLabels[period]} 수익률</span><strong>{periodChange === null ? "비교 기준 생성 중" : percent(periodChange)}</strong></div><span className="report-description">선택 기간의 일별 통합 평가자산을 표시합니다</span></div><TrendChart snapshots={periodSnapshots} /></article></section>
    <section className="panel asset-allocation-panel"><div className="panel-head"><div><p className="eyebrow">ASSET ALLOCATION</p><h2>자산 유형별 비중</h2></div></div><p className="account-hint">계좌가 아닌 보유 종목·상품의 성격을 기준으로 합산합니다. 유형을 클릭하면 계좌와 종목을 볼 수 있습니다.</p><div className="asset-allocation-body"><div className="donut" style={{ background: `conic-gradient(${assetAllocationGradient})` }}><div><strong>{assetAllocationByType.length}</strong><span>자산 유형</span></div></div><div className="legend asset-legend">{assetAllocationByType.map(item => <button key={item.type} className={selectedAssetType === item.type ? "selected" : ""} onClick={() => setSelectedAssetType(current => current === item.type ? null : item.type)} aria-expanded={selectedAssetType === item.type}><i className={item.color}/><span>{item.type}</span><b>{total > 0 ? (item.amount / total * 100).toFixed(1) : "0.0"}%</b><small>›</small></button>)}</div></div>{selectedAssetType && selectedAssetDetails && <div className="asset-detail"><div className="asset-detail-head"><div><p className="eyebrow">{selectedAssetType.toUpperCase()}</p><h3>{selectedAssetType} 상세</h3></div><button onClick={() => setSelectedAssetType(null)}>닫기</button></div><div className="asset-detail-grid"><div><h4>포함 계좌</h4><div className="asset-detail-list asset-metric-list"><div className="asset-metric-heading"><span>계좌</span><span>평가금액</span><span>수익률</span><span>평가손익</span><span>비중</span></div>{[...selectedAssetDetails.accounts.entries()].sort((a, b) => b[1] - a[1]).map(([accountId, amount]) => { const account = accounts.find(item => item.id === accountId); if (!account) return null; const profit = account.returnRate > -100 ? amount - amount / (1 + account.returnRate / 100) : 0; return <div className="asset-metric-row" key={accountId}><span><b>{accountLabel(account.name)}</b><small>{account.broker}</small></span><strong>{won.format(amount)}</strong><strong className={account.returnRate >= 0 ? "positive" : "negative"}>{percent(account.returnRate)}</strong><strong className={profit >= 0 ? "positive" : "negative"}>{profit >= 0 ? "+" : ""}{won.format(profit)}</strong><strong>{total > 0 ? (amount / total * 100).toFixed(1) : "0.0"}%</strong></div>; })}</div></div><div><h4>보유 종목</h4><div className="asset-detail-list asset-metric-list">{selectedAssetDetails.holdings.length ? <><div className="asset-metric-heading"><span>종목</span><span>평가금액</span><span>수익률</span><span>평가손익</span><span>비중</span></div>{[...selectedAssetDetails.holdings].sort((a, b) => b.value - a.value).map(({ account, holding, value }) => { const cost = holding.fallbackPrice > 0 ? value * holding.averagePrice / holding.fallbackPrice : 0; const profit = value - cost; const rate = cost > 0 ? (value / cost - 1) * 100 : 0; return <div className="asset-metric-row" key={`${account.id}-${holding.symbol}-${holding.name}`}><span><b>{holding.name}</b><small>{accountLabel(account.name)} · {holding.symbol}</small></span><strong>{won.format(value)}</strong><strong className={rate >= 0 ? "positive" : "negative"}>{percent(rate)}</strong><strong className={profit >= 0 ? "positive" : "negative"}>{profit >= 0 ? "+" : ""}{won.format(profit)}</strong><strong>{total > 0 ? (value / total * 100).toFixed(1) : "0.0"}%</strong></div>; })}</> : <p className="asset-empty">등록된 종목 정보가 없습니다.</p>}</div></div></div></div>}</section>
    <section className="panel domestic-top-panel"><div className="panel-head"><div><p className="eyebrow">DOMESTIC EQUITY TOP 3</p><h2>국내 주식 보유금액 Top 3</h2></div><span className="domestic-total">평가금액 기준</span></div><p className="account-hint">여러 계좌에 겹쳐 보유한 동일 종목은 합산합니다. 최고 수익금은 매일 기록합니다.</p>{domesticTopThree.items.length ? <div className="domestic-top-chart"><div className="domestic-top-heading"><span>종목</span><span>평가금액</span><span>수익률</span><span>평가손익</span><span>고점 대비</span></div>{domesticTopThree.items.map((item, index) => { const profit = item.value - item.cost; const rate = item.cost > 0 ? (item.value / item.cost - 1) * 100 : 0; const peak = profitPeaks[item.symbol || item.name]; const drawdown = peak && peak.profit > 0 ? (profit / peak.profit - 1) * 100 : null; return <div className="domestic-top-row" key={item.symbol || item.name}><span className="domestic-rank">{index + 1}</span><div className="domestic-name"><b>{item.name}</b><small>{item.symbol} · {item.quantity.toLocaleString("ko-KR")}주 · {[...item.accountNames].join(", ")}</small></div><div className="domestic-value"><strong>{won.format(item.value)}</strong></div><div className={`domestic-rate ${rate >= 0 ? "positive" : "negative"}`}>{percent(rate)}</div><div className={`domestic-profit ${profit >= 0 ? "positive" : "negative"}`}>{profit >= 0 ? "+" : ""}{won.format(profit)}</div><div className={`domestic-peak ${drawdown !== null && drawdown < 0 ? "drawdown" : "at-peak"}`}>{drawdown === null ? "기록 대기" : drawdown < 0 ? `${drawdown.toFixed(1)}%` : "최고"}</div></div>; })}</div> : <div className="empty-holdings">국내 주식 보유 종목을 등록하면 상위 3개가 표시됩니다.</div>}</section>
    <section className="accounts-section"><div className="panel-head"><div><p className="eyebrow">ACCOUNTS</p><h2>계좌별 자산</h2></div></div><p className="account-hint">평가금액이 큰 계좌부터 표시됩니다. 계좌를 클릭하면 보유자산 상세와 현재가를 확인할 수 있습니다.</p><div className="account-table"><div className="table-heading"><span>계좌</span><span>평가금액</span><span>수익률</span><span>평가손익</span><span>비중</span></div>{accountsByValue.map(account => { const details = detailsFor(account); const profit = account.returnRate > -100 ? account.amount - account.amount / (1 + account.returnRate / 100) : 0; return <div className="account-item" key={account.id}><div className={`account-row ${expandedAccountId === account.id ? "expanded" : ""}`} role="button" tabIndex={0} onClick={() => setExpandedAccountId(current => current === account.id ? null : account.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpandedAccountId(current => current === account.id ? null : account.id); } }}><div><span className={`account-icon ${account.color}`}>{account.type.slice(0, 1)}</span><span><b>{accountLabel(account.name)}</b><small>{account.broker}</small></span></div><strong>{won.format(account.amount)}</strong><strong className={account.returnRate >= 0 ? "positive" : "negative"}>{percent(account.returnRate)}</strong><strong className={profit >= 0 ? "positive" : "negative"}>{profit >= 0 ? "+" : ""}{won.format(profit)}</strong><div className="weight"><i><em style={{ width: `${total > 0 ? account.amount / total * 100 : 0}%` }}/></i><span>{total > 0 ? (account.amount / total * 100).toFixed(1) : "0.0"}%</span></div></div>{expandedAccountId === account.id && <AccountDetails account={account} {...details} />}</div>; })}</div></section>
  </main>;
}
