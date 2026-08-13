"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import "./holdings.css";
import "./reset.css";
import "./empty.css";
import "./account-manager.css";

type Account = { id: number; type: string; broker: string; name: string; amount: number; returnRate: number; color: string };
type Holding = { symbol: string; name: string; quantity: number; averagePrice: number; fallbackPrice: number };
const initialAccounts: Account[] = [
  { id: 1, type: "미국 주식", broker: "미연결", name: "미국 주식 계좌", amount: 0, returnRate: 0, color: "blue" },
  { id: 2, type: "국내 주식", broker: "미연결", name: "국내 주식 계좌", amount: 0, returnRate: 0, color: "violet" },
  { id: 3, type: "ISA", broker: "미연결", name: "ISA 계좌", amount: 0, returnRate: 0, color: "mint" },
  { id: 4, type: "IRP", broker: "미연결", name: "IRP 계좌", amount: 0, returnRate: 0, color: "orange" },
  { id: 5, type: "연금저축", broker: "미연결", name: "연금저축 계좌", amount: 0, returnRate: 0, color: "pink" },
  { id: 6, type: "펀드", broker: "미연결", name: "펀드 계좌", amount: 0, returnRate: 0, color: "yellow" },
];
const reports = ["일", "주", "월", "분기", "반기", "1년"];
const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
const percent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

export default function Home() {
  const [accounts, setAccounts] = useState(initialAccounts); const [period, setPeriod] = useState(5); const [fileName, setFileName] = useState(""); const [importOpen, setImportOpen] = useState(false); const [notice, setNotice] = useState(""); const [holdings, setHoldings] = useState<Holding[]>([]); const [quoteUpdatedAt, setQuoteUpdatedAt] = useState(""); const [manageOpen, setManageOpen] = useState(false); const [newType, setNewType] = useState("국내 주식"); const [newName, setNewName] = useState(""); const [newBroker, setNewBroker] = useState("");
  const total = useMemo(() => accounts.reduce((sum, account) => sum + account.amount, 0), [accounts]);
  const weightedReturn = useMemo(() => total > 0 ? accounts.reduce((sum, account) => sum + account.amount * account.returnRate, 0) / total : 0, [accounts, total]);
  const domesticValue = useMemo(() => holdings.reduce((sum, holding) => sum + holding.quantity * holding.fallbackPrice, 0), [holdings]);
  const domesticProfit = useMemo(() => holdings.reduce((sum, holding) => sum + holding.quantity * (holding.fallbackPrice - holding.averagePrice), 0), [holdings]);
  const refreshPrices = async () => {
    if (holdings.length === 0) { setNotice("현재가를 반영할 보유 종목이 없습니다. MTS 스크린샷을 먼저 가져와 주세요."); return; }
    try {
      const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(holdings.map(holding => holding.symbol).join(","))}`);
      const data = await response.json() as { quotes?: Record<string, number> };
      if (!data.quotes) throw new Error("No quotes");
      setHoldings(current => current.map(holding => ({ ...holding, fallbackPrice: data.quotes?.[holding.symbol] ?? holding.fallbackPrice })));
      setQuoteUpdatedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    } catch { setNotice("현재가를 불러오지 못했습니다. 마지막 확인 가격으로 계산합니다."); }
  };
  useEffect(() => { if (holdings.length > 0) void refreshPrices(); }, [holdings.length]);
  const chooseScreenshot = (event: ChangeEvent<HTMLInputElement>) => { const picked = event.target.files?.[0]; if (!picked) return; setFileName(picked.name); setImportOpen(true); setNotice("스크린샷을 불러왔습니다. 추출 결과를 확인한 뒤 반영해 주세요."); };
  const importExample = () => { setImportOpen(false); setNotice("스크린샷을 등록했습니다. 실제 인식 결과를 확인한 뒤 계좌에 반영할 수 있도록 준비 중입니다."); };
  const resetAccount = (account: Account) => {
    if (!window.confirm(`“${account.name}”의 가져온 자산 데이터를 초기화할까요? 계좌 유형은 유지됩니다.`)) return;
    setAccounts(current => current.map(item => item.id === account.id ? { ...item, name: `${item.type} 계좌`, broker: "미연결", amount: 0, returnRate: 0 } : item));
    if (account.id === 2) setHoldings([]);
    setNotice(`${account.type} 계좌 데이터를 초기화했습니다. 새 MTS 스크린샷으로 다시 가져올 수 있습니다.`);
  };
  const addAccount = () => {
    const type = newType.trim() || "기타";
    const colors = ["blue", "violet", "mint", "orange", "pink", "yellow"];
    const account: Account = { id: Date.now(), type, name: newName.trim() || `${type} 계좌`, broker: newBroker.trim() || "미연결", amount: 0, returnRate: 0, color: colors[accounts.length % colors.length] };
    setAccounts(current => [...current, account]); setNewName(""); setNewBroker(""); setNotice(`${account.name}을(를) 추가했습니다.`);
  };
  const deleteAccount = (account: Account) => {
    if (!window.confirm(`“${account.name}” 계좌를 삭제할까요? 가져온 데이터도 함께 삭제됩니다.`)) return;
    setAccounts(current => current.filter(item => item.id !== account.id));
    if (account.type === "국내 주식") setHoldings([]);
    setNotice(`${account.name} 계좌를 삭제했습니다.`);
  };
  return <main>
    <header className="topbar"><div className="brand"><span className="brand-mark">P</span><span>포트폴리오</span></div><div className="topbar-actions"><span className="sync-dot" /> 아직 동기화된 계좌 없음 <button className="profile">SB</button></div></header>
    <section className="hero"><div><p className="eyebrow">ALL ACCOUNTS · KRW</p><h1>내 자산, 한눈에.</h1><p className="hero-copy">증권사별 계좌와 연금·펀드를 한곳에 모아 성과를 확인하세요.</p></div><label className="upload-button"><input aria-label="MTS 스크린샷 업로드" type="file" accept="image/*" onChange={chooseScreenshot}/><span>＋</span> MTS 스크린샷 가져오기</label></section>
    {notice && <div className="notice">{notice}<button onClick={() => setNotice("")}>닫기</button></div>}
    <section className="metrics"><article className="metric-card main-metric"><p>통합 평가자산</p><strong>{won.format(total)}</strong><span>스크린샷을 가져오면 계산됩니다</span></article><article className="metric-card"><p>통합 수익률</p><strong>{total > 0 ? percent(weightedReturn) : "-"}</strong><span>매입금액 대비</span></article><article className="metric-card"><p>운용 계좌</p><strong>{accounts.filter(account => account.amount > 0).length}<small>개</small></strong><span>등록 가능한 6개 자산 유형</span></article><article className="metric-card"><p>이번 달 수익</p><strong>{total > 0 ? won.format(0) : "-"}</strong><span>거래 내역 등록 후 제공</span></article></section>
    <section className="content-grid"><article className="panel performance-panel"><div className="panel-head"><div><p className="eyebrow">PERFORMANCE</p><h2>통합 수익 리포트</h2></div><button className="text-button">리포트 상세 보기 →</button></div><div className="periods" role="tablist">{reports.map((item, index) => <button key={item} role="tab" aria-selected={period === index} className={period === index ? "selected" : ""} onClick={() => setPeriod(index)}>{item}</button>)}</div><div className="report-value"><div><span>{reports[period]}간 수익률</span><strong>{total > 0 ? "계산 준비 중" : "데이터 없음"}</strong></div><span className="report-description">거래·평가 이력이 쌓이면 산출됩니다</span></div><div className="chart empty-chart">스크린샷을 반영한 뒤 기간별 자산 추이가 표시됩니다.</div></article>
    <article className="panel allocation"><div className="panel-head"><div><p className="eyebrow">ALLOCATION</p><h2>계좌별 비중</h2></div><button className="dots">•••</button></div><div className="donut"><div><strong>{accounts.filter(account => account.amount > 0).length}</strong><span>연결 계좌</span></div></div><div className="legend">{accounts.map(account => <div key={account.id}><i className={account.color}/><span>{account.type}</span><b>{total > 0 ? Math.round(account.amount / total * 100) : 0}%</b></div>)}</div></article></section>
    <section className="accounts-section"><div className="panel-head"><div><p className="eyebrow">ACCOUNTS</p><h2>계좌별 자산</h2></div><button className="text-button" onClick={() => setManageOpen(true)}>계좌 관리 →</button></div><div className="account-table"><div className="table-heading"><span>계좌</span><span>자산 유형</span><span>평가금액</span><span>수익률</span><span>비중</span><span/></div>{accounts.map(account => <div className="account-row" key={account.id}><div><span className={`account-icon ${account.color}`}>{account.type.slice(0, 1)}</span><span><b>{account.name}</b><small>{account.broker}</small></span></div><span className="type-chip">{account.type}</span><strong>{won.format(account.amount)}</strong><strong className={account.returnRate >= 0 ? "positive" : "negative"}>{percent(account.returnRate)}</strong><div className="weight"><i><em style={{ width: `${total > 0 ? account.amount / total * 100 : 0}%` }}/></i><span>{total > 0 ? (account.amount / total * 100).toFixed(1) : "0.0"}%</span></div><span className="row-actions"><button className="reset-button" onClick={() => resetAccount(account)}>초기화</button><button className="delete-button" onClick={() => deleteAccount(account)}>삭제</button></span></div>)}</div><button className="add-account-inline" onClick={() => setManageOpen(true)}>＋ 계좌 추가</button></section>
    <section className="holdings-section"><div className="panel-head"><div><p className="eyebrow">DOMESTIC HOLDINGS</p><h2>국내 주식 · 현재가 기준</h2></div><button className="text-button" onClick={() => void refreshPrices()}>현재가 새로고침 {quoteUpdatedAt && `· ${quoteUpdatedAt}`}</button></div><p className="holdings-note">평단가와 보유 수량은 MTS 화면에서 가져오고, 현재가 조회 후 손익과 수익률을 계산합니다.</p>{holdings.length === 0 ? <div className="empty-holdings">보유 종목이 없습니다. 국내 주식 MTS 스크린샷을 가져와 주세요.</div> : <div className="holding-table"><div><span>종목</span><span>보유 수량</span><span>평단가</span><span>현재가</span><span>평가손익</span><span>수익률</span></div>{holdings.map(holding => { const profit = holding.quantity * (holding.fallbackPrice - holding.averagePrice); const rate = (holding.fallbackPrice / holding.averagePrice - 1) * 100; return <div key={holding.symbol}><b>{holding.name}<small>{holding.symbol.replace(".KS", "")}</small></b><span>{holding.quantity}주</span><span>{won.format(holding.averagePrice)}</span><span>{won.format(holding.fallbackPrice)}</span><strong className={profit >= 0 ? "positive" : "negative"}>{profit >= 0 ? "+" : ""}{won.format(profit)}</strong><strong className={rate >= 0 ? "positive" : "negative"}>{percent(rate)}</strong></div>; })}</div>}</section>
    <section className="import-guide"><div className="guide-icon">▣</div><div><p className="eyebrow">SMART IMPORT</p><h2>수기 입력 대신, 화면을 가져오세요.</h2><p>MTS 보유종목·잔고 화면을 올리면 계좌명, 종목, 수량, 평가금액을 읽어 초안을 만듭니다. 반영 전에는 언제나 직접 확인할 수 있습니다.</p></div><label className="outline-upload"><input aria-label="MTS 스크린샷 업로드" type="file" accept="image/*" onChange={chooseScreenshot}/>스크린샷 선택</label></section>
    {importOpen && <div className="modal-backdrop"><section className="import-modal" role="dialog" aria-modal="true" aria-label="스크린샷 데이터 검토"><button className="modal-close" onClick={() => setImportOpen(false)}>×</button><p className="eyebrow">SCREENSHOT IMPORT</p><h2>스크린샷을 등록했습니다</h2><p className="file-name">{fileName}</p><div className="review-box"><div><span>인식 상태</span><b>추출 규칙 연결 대기</b></div><div><span>반영 기준</span><b>보유 수량 · 평단가</b></div></div><p className="helper">예시 종목이나 금액은 자동으로 넣지 않습니다. 실제 MTS 화면 형식을 연결한 뒤 추출 결과를 검토하고 반영할 수 있습니다.</p><div className="modal-actions"><button className="cancel" onClick={() => setImportOpen(false)}>닫기</button><button className="confirm" onClick={importExample}>확인</button></div></section></div>}
    {manageOpen && <div className="modal-backdrop"><section className="manage-modal" role="dialog" aria-modal="true" aria-label="계좌 관리"><button className="modal-close" onClick={() => setManageOpen(false)}>×</button><p className="eyebrow">ACCOUNT MANAGER</p><h2>계좌 관리</h2><p className="helper">필요한 계좌만 남기고 새 계좌를 추가하세요.</p><div className="manage-list">{accounts.map(account => <div key={account.id}><span className={`account-icon ${account.color}`}>{account.type.slice(0, 1)}</span><span><b>{account.name}</b><small>{account.type} · {account.broker}</small></span><button className="delete-button" onClick={() => deleteAccount(account)}>삭제</button></div>)}</div><div className="add-form"><h3>새 계좌 추가</h3><label>자산 유형<select value={newType} onChange={event => setNewType(event.target.value)}>{["미국 주식", "국내 주식", "ISA", "IRP", "연금저축", "펀드", "기타"].map(type => <option key={type}>{type}</option>)}</select></label><label>계좌 이름<input value={newName} onChange={event => setNewName(event.target.value)} placeholder="예: 미래에셋 해외주식" /></label><label>증권사 / 운용사<input value={newBroker} onChange={event => setNewBroker(event.target.value)} placeholder="예: 미래에셋증권" /></label><button className="confirm add-confirm" onClick={addAccount}>계좌 추가</button></div></section></div>}
  </main>;
}
