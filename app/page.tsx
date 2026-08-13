"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import "./holdings.css";
import "./reset.css";

type Account = { id: number; type: string; broker: string; name: string; amount: number; returnRate: number; color: string };
type Holding = { symbol: string; name: string; quantity: number; averagePrice: number; fallbackPrice: number };
const importedDomesticHoldings = [
  { name: "SK하이닉스", quantity: "1주", value: 1605000, profit: 91230, rate: 6.07 },
  { name: "삼성전자", quantity: "10주", value: 2672500, profit: 309372, rate: 13.19 },
  { name: "두산에너빌리티", quantity: "8주", value: 655200, profit: -120903, rate: -15.70 },
];
const initialDomesticHoldings: Holding[] = importedDomesticHoldings.map((holding, index) => ({
  symbol: ["000660.KS", "005930.KS", "034020.KS"][index],
  name: holding.name,
  quantity: Number(holding.quantity.replace("주", "")),
  // Screenshot value - screenshot profit = invested cost. The direct MTS average-price field will replace this when present.
  averagePrice: (holding.value - holding.profit) / Number(holding.quantity.replace("주", "")),
  fallbackPrice: holding.value / Number(holding.quantity.replace("주", "")),
}));
const initialAccounts: Account[] = [
  { id: 1, type: "미국 주식", broker: "미래에셋", name: "해외주식 계좌", amount: 18450000, returnRate: 12.84, color: "blue" },
  { id: 2, type: "국내 주식", broker: "삼성증권", name: "국내주식 계좌", amount: 12680000, returnRate: 4.26, color: "violet" },
  { id: 3, type: "ISA", broker: "한국투자", name: "중개형 ISA", amount: 8900000, returnRate: 6.75, color: "mint" },
  { id: 4, type: "IRP", broker: "KB증권", name: "퇴직연금 IRP", amount: 15240000, returnRate: 8.12, color: "orange" },
  { id: 5, type: "연금저축", broker: "NH투자", name: "연금저축펀드", amount: 9700000, returnRate: 7.08, color: "pink" },
  { id: 6, type: "펀드", broker: "신한투자", name: "펀드 계좌", amount: 5430000, returnRate: 3.64, color: "yellow" },
];
const reports = ["일", "주", "월", "분기", "반기", "1년"];
const reportRates = [0.48, 1.76, 3.42, 6.18, 9.33, 14.67];
const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
const percent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

export default function Home() {
  const [accounts, setAccounts] = useState(initialAccounts); const [period, setPeriod] = useState(5); const [fileName, setFileName] = useState(""); const [importOpen, setImportOpen] = useState(false); const [notice, setNotice] = useState(""); const [holdings, setHoldings] = useState(initialDomesticHoldings); const [quoteUpdatedAt, setQuoteUpdatedAt] = useState("");
  const total = useMemo(() => accounts.reduce((sum, account) => sum + account.amount, 0), [accounts]);
  const weightedReturn = useMemo(() => accounts.reduce((sum, account) => sum + account.amount * account.returnRate, 0) / total, [accounts, total]);
  const domesticValue = useMemo(() => holdings.reduce((sum, holding) => sum + holding.quantity * holding.fallbackPrice, 0), [holdings]);
  const domesticProfit = useMemo(() => holdings.reduce((sum, holding) => sum + holding.quantity * (holding.fallbackPrice - holding.averagePrice), 0), [holdings]);
  const refreshPrices = async () => {
    try {
      const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(holdings.map(holding => holding.symbol).join(","))}`);
      const data = await response.json() as { quotes?: Record<string, number> };
      if (!data.quotes) throw new Error("No quotes");
      setHoldings(current => current.map(holding => ({ ...holding, fallbackPrice: data.quotes?.[holding.symbol] ?? holding.fallbackPrice })));
      setQuoteUpdatedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    } catch { setNotice("현재가를 불러오지 못했습니다. 마지막 확인 가격으로 계산합니다."); }
  };
  useEffect(() => { void refreshPrices(); }, []);
  const chooseScreenshot = (event: ChangeEvent<HTMLInputElement>) => { const picked = event.target.files?.[0]; if (!picked) return; setFileName(picked.name); setImportOpen(true); setNotice("스크린샷을 불러왔습니다. 추출 결과를 확인한 뒤 반영해 주세요."); };
  const importExample = () => { setAccounts(current => current.map(account => account.id === 2 ? { ...account, broker: "삼성증권", name: "국내주식 계좌 · 7074****69-01", amount: domesticValue, returnRate: domesticProfit / (domesticValue - domesticProfit) * 100 } : account)); setImportOpen(false); setNotice("국내 주식 계좌의 보유 수량과 평단가를 반영했습니다. 현재가는 대시보드에서 갱신됩니다."); };
  const resetAccount = (account: Account) => {
    if (!window.confirm(`“${account.name}”의 가져온 자산 데이터를 초기화할까요? 계좌 유형은 유지됩니다.`)) return;
    setAccounts(current => current.map(item => item.id === account.id ? { ...item, name: `${item.type} 계좌`, broker: "미연결", amount: 0, returnRate: 0 } : item));
    if (account.id === 2) setHoldings([]);
    setNotice(`${account.type} 계좌 데이터를 초기화했습니다. 새 MTS 스크린샷으로 다시 가져올 수 있습니다.`);
  };
  return <main>
    <header className="topbar"><div className="brand"><span className="brand-mark">P</span><span>포트폴리오</span></div><div className="topbar-actions"><span className="sync-dot" /> 마지막 동기화 오늘 09:42 <button className="profile">SB</button></div></header>
    <section className="hero"><div><p className="eyebrow">ALL ACCOUNTS · KRW</p><h1>내 자산, 한눈에.</h1><p className="hero-copy">증권사별 계좌와 연금·펀드를 한곳에 모아 성과를 확인하세요.</p></div><label className="upload-button"><input aria-label="MTS 스크린샷 업로드" type="file" accept="image/*" onChange={chooseScreenshot}/><span>＋</span> MTS 스크린샷 가져오기</label></section>
    {notice && <div className="notice">{notice}<button onClick={() => setNotice("")}>닫기</button></div>}
    <section className="metrics"><article className="metric-card main-metric"><p>통합 평가자산</p><strong>{won.format(total)}</strong><span className="positive">오늘 {percent(reportRates[0])} · +{won.format(total * reportRates[0] / 100).replace("₩", "")}</span></article><article className="metric-card"><p>통합 수익률</p><strong className="positive">{percent(weightedReturn)}</strong><span>매입금액 대비</span></article><article className="metric-card"><p>운용 계좌</p><strong>{accounts.length}<small>개</small></strong><span>6개 자산 유형</span></article><article className="metric-card"><p>이번 달 수익</p><strong>{won.format(total * reportRates[2] / 100)}</strong><span className="positive">{percent(reportRates[2])}</span></article></section>
    <section className="content-grid"><article className="panel performance-panel"><div className="panel-head"><div><p className="eyebrow">PERFORMANCE</p><h2>통합 수익 리포트</h2></div><button className="text-button">리포트 상세 보기 →</button></div><div className="periods" role="tablist">{reports.map((item, index) => <button key={item} role="tab" aria-selected={period === index} className={period === index ? "selected" : ""} onClick={() => setPeriod(index)}>{item}</button>)}</div><div className="report-value"><div><span>{reports[period]}간 수익률</span><strong className="positive">{percent(reportRates[period])}</strong></div><span className="report-description">전 계좌의 평가금액 비중으로 산출</span></div><div className="chart"><div className="chart-labels"><span>+15%</span><span>+10%</span><span>+5%</span><span>0%</span></div><svg viewBox="0 0 680 210" role="img" aria-label="우상향 자산 추이"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6171e8" stopOpacity=".24"/><stop offset="100%" stopColor="#6171e8" stopOpacity="0"/></linearGradient></defs><path d="M0 176 C50 168 65 173 110 154 S170 161 215 128 S285 139 335 112 S412 122 458 80 S520 93 562 59 S630 70 680 25 L680 210 L0 210Z" fill="url(#fill)"/><path d="M0 176 C50 168 65 173 110 154 S170 161 215 128 S285 139 335 112 S412 122 458 80 S520 93 562 59 S630 70 680 25" fill="none" stroke="#5365dc" strokeWidth="4" strokeLinecap="round"/></svg></div></article>
    <article className="panel allocation"><div className="panel-head"><div><p className="eyebrow">ALLOCATION</p><h2>계좌별 비중</h2></div><button className="dots">•••</button></div><div className="donut"><div><strong>{accounts.length}</strong><span>계좌</span></div></div><div className="legend">{accounts.map(account => <div key={account.id}><i className={account.color}/><span>{account.type}</span><b>{Math.round(account.amount / total * 100)}%</b></div>)}</div></article></section>
    <section className="accounts-section"><div className="panel-head"><div><p className="eyebrow">ACCOUNTS</p><h2>계좌별 자산</h2></div><button className="text-button">계좌 관리 →</button></div><div className="account-table"><div className="table-heading"><span>계좌</span><span>자산 유형</span><span>평가금액</span><span>수익률</span><span>비중</span><span/></div>{accounts.map(account => <div className="account-row" key={account.id}><div><span className={`account-icon ${account.color}`}>{account.type.slice(0, 1)}</span><span><b>{account.name}</b><small>{account.broker}</small></span></div><span className="type-chip">{account.type}</span><strong>{won.format(account.amount)}</strong><strong className={account.returnRate >= 0 ? "positive" : "negative"}>{percent(account.returnRate)}</strong><div className="weight"><i><em style={{ width: `${total > 0 ? account.amount / total * 100 : 0}%` }}/></i><span>{total > 0 ? (account.amount / total * 100).toFixed(1) : "0.0"}%</span></div><button className="reset-button" onClick={() => resetAccount(account)}>초기화</button></div>)}</div></section>
    <section className="holdings-section"><div className="panel-head"><div><p className="eyebrow">DOMESTIC HOLDINGS</p><h2>국내 주식 · 현재가 기준</h2></div><button className="text-button" onClick={() => void refreshPrices()}>현재가 새로고침 {quoteUpdatedAt && `· ${quoteUpdatedAt}`}</button></div><p className="holdings-note">평단가와 보유 수량은 MTS 화면에서 가져오고, 현재가 조회 후 손익과 수익률을 계산합니다.</p><div className="holding-table"><div><span>종목</span><span>보유 수량</span><span>평단가</span><span>현재가</span><span>평가손익</span><span>수익률</span></div>{holdings.map(holding => { const profit = holding.quantity * (holding.fallbackPrice - holding.averagePrice); const rate = (holding.fallbackPrice / holding.averagePrice - 1) * 100; return <div key={holding.symbol}><b>{holding.name}<small>{holding.symbol.replace(".KS", "")}</small></b><span>{holding.quantity}주</span><span>{won.format(holding.averagePrice)}</span><span>{won.format(holding.fallbackPrice)}</span><strong className={profit >= 0 ? "positive" : "negative"}>{profit >= 0 ? "+" : ""}{won.format(profit)}</strong><strong className={rate >= 0 ? "positive" : "negative"}>{percent(rate)}</strong></div>; })}</div></section>
    <section className="import-guide"><div className="guide-icon">▣</div><div><p className="eyebrow">SMART IMPORT</p><h2>수기 입력 대신, 화면을 가져오세요.</h2><p>MTS 보유종목·잔고 화면을 올리면 계좌명, 종목, 수량, 평가금액을 읽어 초안을 만듭니다. 반영 전에는 언제나 직접 확인할 수 있습니다.</p></div><label className="outline-upload"><input aria-label="MTS 스크린샷 업로드" type="file" accept="image/*" onChange={chooseScreenshot}/>스크린샷 선택</label></section>
    {importOpen && <div className="modal-backdrop"><section className="import-modal" role="dialog" aria-modal="true" aria-label="스크린샷 데이터 검토"><button className="modal-close" onClick={() => setImportOpen(false)}>×</button><p className="eyebrow">SCREENSHOT IMPORT</p><h2>추출 결과를 확인하세요</h2><p className="file-name">{fileName}</p><div className="review-box"><div><span>인식한 계좌</span><b>삼성증권 · 국내주식 · 7074****69-01</b></div><div><span>평가손익 / 수익률</span><b className="positive">+279,699원 · +6.06%</b></div><div><span>평가금액</span><b>{won.format(4932700)}</b></div></div><div className="holding-review"><p>인식한 보유 종목 <span>3개</span></p>{importedDomesticHoldings.map(holding => <div key={holding.name}><span><b>{holding.name}</b><small>{holding.quantity}</small></span><span><b>{won.format(holding.value)}</b><small className={holding.rate >= 0 ? "positive" : "negative"}>{percent(holding.rate)} · {holding.profit >= 0 ? "+" : ""}{won.format(holding.profit)}</small></span></div>)}</div><p className="helper">계좌번호와 성명은 대시보드에 저장하지 않고 마스킹합니다. 이미지 인식 결과는 반영 전 확인할 수 있습니다.</p><div className="modal-actions"><button className="cancel" onClick={() => setImportOpen(false)}>취소</button><button className="confirm" onClick={importExample}>검토 후 반영</button></div></section></div>}
  </main>;
}
