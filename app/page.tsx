"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./holdings.css";
import "./reset.css";
import "./empty.css";
import "./account-manager.css";

type Account = { id: number; type: string; broker: string; name: string; amount: number; returnRate: number; color: string };
type Holding = { symbol: string; name: string; quantity: number; averagePrice: number; fallbackPrice: number };
type CoinHolding = Holding;
type ScreenshotImport = { id: number; accountId: number; fileName: string; createdAt: string; status: "추출 대기" | "검토 필요"; summary?: string };
const STORAGE_KEY = "portfolio-dashboard-state-v1";
const initialAccounts: Account[] = [
  { id: 1, type: "미국 주식", broker: "미연결", name: "미국 주식 계좌", amount: 0, returnRate: 0, color: "blue" },
  { id: 2, type: "국내 주식", broker: "미연결", name: "국내 주식 계좌", amount: 0, returnRate: 0, color: "violet" },
  { id: 3, type: "ISA", broker: "미연결", name: "ISA 계좌", amount: 0, returnRate: 0, color: "mint" },
  { id: 4, type: "IRP", broker: "미연결", name: "IRP 계좌", amount: 0, returnRate: 0, color: "orange" },
  { id: 5, type: "연금저축", broker: "미연결", name: "연금저축 계좌", amount: 0, returnRate: 0, color: "pink" },
  { id: 6, type: "펀드", broker: "미연결", name: "펀드 계좌", amount: 0, returnRate: 0, color: "yellow" },
  { id: 7, type: "코인", broker: "미연결", name: "코인 계좌", amount: 0, returnRate: 0, color: "blue" },
];
const reports = ["일", "주", "월", "분기", "반기", "1년"];
const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
const percent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

export default function Home() {
  const [accounts, setAccounts] = useState(initialAccounts); const [period, setPeriod] = useState(5); const [notice, setNotice] = useState(""); const [holdings, setHoldings] = useState<Holding[]>([]); const [coinHoldings, setCoinHoldings] = useState<CoinHolding[]>([]); const [quoteUpdatedAt, setQuoteUpdatedAt] = useState(""); const [coinQuoteUpdatedAt, setCoinQuoteUpdatedAt] = useState(""); const [manageOpen, setManageOpen] = useState(false); const [newType, setNewType] = useState("국내 주식"); const [newName, setNewName] = useState(""); const [newBroker, setNewBroker] = useState(""); const [imports, setImports] = useState<ScreenshotImport[]>([]); const [hydrated, setHydrated] = useState(false); const syncErrorShown = useRef(false);
  const total = useMemo(() => accounts.reduce((sum, account) => sum + account.amount, 0), [accounts]);
  const weightedReturn = useMemo(() => total > 0 ? accounts.reduce((sum, account) => sum + account.amount * account.returnRate, 0) / total : 0, [accounts, total]);
  const domesticValue = useMemo(() => holdings.reduce((sum, holding) => sum + holding.quantity * holding.fallbackPrice, 0), [holdings]);
  const domesticProfit = useMemo(() => holdings.reduce((sum, holding) => sum + holding.quantity * (holding.fallbackPrice - holding.averagePrice), 0), [holdings]);
  const refreshPrices = async () => {
    if (holdings.length === 0) { setNotice("현재가를 반영할 보유 종목이 없습니다."); return; }
    try {
      const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(holdings.map(holding => holding.symbol).join(","))}`);
      const data = await response.json() as { quotes?: Record<string, number> };
      if (!data.quotes) throw new Error("No quotes");
      setHoldings(current => {
        const next = current.map(holding => ({ ...holding, fallbackPrice: data.quotes?.[holding.symbol] ?? holding.fallbackPrice }));
        const value = next.reduce((sum, holding) => sum + holding.quantity * holding.fallbackPrice, 0);
        const cost = next.reduce((sum, holding) => sum + holding.quantity * holding.averagePrice, 0);
        setAccounts(accountState => accountState.map(account => account.type === "국내 주식" ? { ...account, amount: value, returnRate: cost > 0 ? (value / cost - 1) * 100 : 0 } : account));
        return next;
      });
      setQuoteUpdatedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    } catch { setNotice("현재가를 불러오지 못했습니다. 마지막 확인 가격으로 계산합니다."); }
  };
  const refreshCoinPrices = async () => {
    if (coinHoldings.length === 0) { setNotice("현재가를 반영할 코인 보유자산이 없습니다."); return; }
    try {
      const markets = coinHoldings.map(holding => `KRW-${holding.symbol}`).join(",");
      const response = await fetch(`/api/crypto-quotes?markets=${encodeURIComponent(markets)}`);
      const data = await response.json() as { quotes?: Record<string, number> };
      if (!data.quotes) throw new Error("No quotes");
      setCoinHoldings(current => {
        const next = current.map(holding => ({ ...holding, fallbackPrice: data.quotes?.[`KRW-${holding.symbol}`] ?? holding.fallbackPrice }));
        const value = next.reduce((sum, holding) => sum + holding.quantity * holding.fallbackPrice, 0);
        const cost = next.reduce((sum, holding) => sum + holding.quantity * holding.averagePrice, 0);
        setAccounts(accountState => accountState.map(account => account.type === "코인" ? { ...account, amount: value, returnRate: cost > 0 ? (value / cost - 1) * 100 : 0 } : account));
        return next;
      });
      setCoinQuoteUpdatedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    } catch { setNotice("코인 현재가를 불러오지 못했습니다. 마지막 확인 가격으로 계산합니다."); }
  };
  useEffect(() => { if (holdings.length > 0) void refreshPrices(); }, [holdings.length]);
  useEffect(() => { if (coinHoldings.length > 0) void refreshCoinPrices(); }, [coinHoldings.length]);
  useEffect(() => {
    let mounted = true;
    const loadPortfolio = async () => {
      try {
        const response = await fetch("/api/portfolio");
        const data = await response.json() as { hasData?: boolean; state?: { accounts?: Account[]; imports?: ScreenshotImport[]; holdings?: Holding[]; coinHoldings?: CoinHolding[] } };
        if (!response.ok) throw new Error("저장소 조회 실패");
        if (data.hasData && data.state) {
          if (Array.isArray(data.state.accounts)) setAccounts(data.state.accounts);
          if (Array.isArray(data.state.imports)) setImports(data.state.imports);
          if (Array.isArray(data.state.holdings)) setHoldings(data.state.holdings);
          if (Array.isArray(data.state.coinHoldings)) setCoinHoldings(data.state.coinHoldings);
        } else {
          // 기존 브라우저 데이터는 최초 한 번만 DB로 옮겨, 이전 입력을 잃지 않게 합니다.
          const legacy = localStorage.getItem(STORAGE_KEY);
          if (legacy) {
            const parsed = JSON.parse(legacy) as { accounts?: Account[]; imports?: ScreenshotImport[]; holdings?: Holding[] };
            if (Array.isArray(parsed.accounts)) setAccounts(parsed.accounts);
            if (Array.isArray(parsed.imports)) setImports(parsed.imports);
            if (Array.isArray(parsed.holdings)) setHoldings(parsed.holdings);
          }
        }
      } catch {
        if (mounted) setNotice("서버 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (mounted) setHydrated(true);
      }
    };
    void loadPortfolio();
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/portfolio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts, imports, holdings, coinHoldings }),
      }).then(response => {
        if (!response.ok) throw new Error("저장 실패");
        localStorage.removeItem(STORAGE_KEY);
        syncErrorShown.current = false;
      }).catch(() => {
        if (!syncErrorShown.current) {
          syncErrorShown.current = true;
          setNotice("변경 내용을 서버에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [accounts, imports, holdings, coinHoldings, hydrated]);
  const resetAccount = (account: Account) => {
    if (!window.confirm(`“${account.name}”의 가져온 자산 데이터를 초기화할까요? 계좌 유형은 유지됩니다.`)) return;
    setAccounts(current => current.map(item => item.id === account.id ? { ...item, name: `${item.type} 계좌`, broker: "미연결", amount: 0, returnRate: 0 } : item));
    if (account.id === 2) setHoldings([]); if (account.type === "코인") setCoinHoldings([]); setImports(current => current.filter(item => item.accountId !== account.id));
    setNotice(`${account.type} 계좌 데이터를 초기화했습니다.`);
  };
  const addAccount = () => {
    const type = newType.trim() || "기타";
    const colors = ["blue", "violet", "mint", "orange", "pink", "yellow"];
    const account: Account = { id: Date.now(), type, name: newName.trim() || `${type} 계좌`, broker: newBroker.trim() || "미연결", amount: 0, returnRate: 0, color: colors[accounts.length % colors.length] };
    setAccounts(current => [...current, account]); setNewName(""); setNewBroker(""); setNotice(`${account.name}을(를) 추가했습니다.`);
  };
  const deleteAccount = (account: Account) => {
    if (!window.confirm(`“${account.name}” 계좌를 삭제할까요? 가져온 데이터도 함께 삭제됩니다.`)) return;
    setAccounts(current => current.filter(item => item.id !== account.id)); setImports(current => current.filter(item => item.accountId !== account.id));
    if (account.type === "국내 주식") setHoldings([]); if (account.type === "코인") setCoinHoldings([]);
    setNotice(`${account.name} 계좌를 삭제했습니다.`);
  };
  return <main>
    <header className="topbar"><div className="brand"><span className="brand-mark">P</span><span>포트폴리오</span></div><div className="topbar-actions"><span className="sync-dot" /> 아직 동기화된 계좌 없음 <button className="profile">SB</button></div></header>
    <section className="hero"><div><p className="eyebrow">ALL ACCOUNTS · KRW</p><h1>내 자산, 한눈에.</h1><p className="hero-copy">증권사별 계좌와 연금·펀드·코인을 한곳에 모아 성과를 확인하세요.</p></div></section>
    {notice && <div className="notice">{notice}<button onClick={() => setNotice("")}>닫기</button></div>}
    <section className="metrics"><article className="metric-card main-metric"><p>통합 평가자산</p><strong>{won.format(total)}</strong><span>등록된 보유 종목 기준</span></article><article className="metric-card"><p>통합 수익률</p><strong>{total > 0 ? percent(weightedReturn) : "-"}</strong><span>매입금액 대비</span></article><article className="metric-card"><p>운용 계좌</p><strong>{accounts.filter(account => account.amount > 0).length}<small>개</small></strong><span>등록 가능한 7개 자산 유형</span></article><article className="metric-card"><p>이번 달 수익</p><strong>{total > 0 ? won.format(0) : "-"}</strong><span>거래 내역 등록 후 제공</span></article></section>
    <section className="content-grid"><article className="panel performance-panel"><div className="panel-head"><div><p className="eyebrow">PERFORMANCE</p><h2>통합 수익 리포트</h2></div><button className="text-button">리포트 상세 보기 →</button></div><div className="periods" role="tablist">{reports.map((item, index) => <button key={item} role="tab" aria-selected={period === index} className={period === index ? "selected" : ""} onClick={() => setPeriod(index)}>{item}</button>)}</div><div className="report-value"><div><span>{reports[period]}간 수익률</span><strong>{total > 0 ? "계산 준비 중" : "데이터 없음"}</strong></div><span className="report-description">거래·평가 이력이 쌓이면 산출됩니다</span></div><div className="chart empty-chart">자산 이력이 쌓이면 기간별 추이가 표시됩니다.</div></article>
    <article className="panel allocation"><div className="panel-head"><div><p className="eyebrow">ALLOCATION</p><h2>계좌별 비중</h2></div><button className="dots">•••</button></div><div className="donut"><div><strong>{accounts.filter(account => account.amount > 0).length}</strong><span>연결 계좌</span></div></div><div className="legend">{accounts.map(account => <div key={account.id}><i className={account.color}/><span>{account.type}</span><b>{total > 0 ? Math.round(account.amount / total * 100) : 0}%</b></div>)}</div></article></section>
    <section className="accounts-section"><div className="panel-head"><div><p className="eyebrow">ACCOUNTS</p><h2>계좌별 자산</h2></div><button className="text-button" onClick={() => setManageOpen(true)}>계좌 관리 →</button></div><div className="account-table"><div className="table-heading"><span>계좌</span><span>자산 유형</span><span>평가금액</span><span>수익률</span><span>비중</span><span/></div>{accounts.map(account => <div className="account-row" key={account.id}><div><span className={`account-icon ${account.color}`}>{account.type.slice(0, 1)}</span><span><b>{account.name}</b><small>{account.broker}</small></span></div><span className="type-chip">{account.type}</span><strong>{won.format(account.amount)}</strong><strong className={account.returnRate >= 0 ? "positive" : "negative"}>{percent(account.returnRate)}</strong><div className="weight"><i><em style={{ width: `${total > 0 ? account.amount / total * 100 : 0}%` }}/></i><span>{total > 0 ? (account.amount / total * 100).toFixed(1) : "0.0"}%</span></div><span className="row-actions"><button className="reset-button" onClick={() => resetAccount(account)}>초기화</button><button className="delete-button" onClick={() => deleteAccount(account)}>삭제</button></span></div>)}</div><button className="add-account-inline" onClick={() => setManageOpen(true)}>＋ 계좌 추가</button></section>
    <section className="holdings-section"><div className="panel-head"><div><p className="eyebrow">DOMESTIC HOLDINGS</p><h2>국내 주식 · 현재가 기준</h2></div><button className="text-button" onClick={() => void refreshPrices()}>현재가 새로고침 {quoteUpdatedAt && `· ${quoteUpdatedAt}`}</button></div><p className="holdings-note">등록된 보유 수량과 평단가를 기준으로 현재가 손익과 수익률을 계산합니다.</p>{holdings.length === 0 ? <div className="empty-holdings">등록된 보유 종목이 없습니다.</div> : <div className="holding-table"><div><span>종목</span><span>보유 수량</span><span>평단가</span><span>현재가</span><span>평가손익</span><span>수익률</span></div>{holdings.map(holding => { const profit = holding.quantity * (holding.fallbackPrice - holding.averagePrice); const rate = (holding.fallbackPrice / holding.averagePrice - 1) * 100; return <div key={holding.symbol}><b>{holding.name}<small>{holding.symbol.replace(".KS", "")}</small></b><span>{holding.quantity}주</span><span>{won.format(holding.averagePrice)}</span><span>{won.format(holding.fallbackPrice)}</span><strong className={profit >= 0 ? "positive" : "negative"}>{profit >= 0 ? "+" : ""}{won.format(profit)}</strong><strong className={rate >= 0 ? "positive" : "negative"}>{percent(rate)}</strong></div>; })}</div>}</section>
    <section className="holdings-section"><div className="panel-head"><div><p className="eyebrow">CRYPTO HOLDINGS</p><h2>코인 · 업비트 현재가 기준</h2></div><button className="text-button" onClick={() => void refreshCoinPrices()}>현재가 새로고침 {coinQuoteUpdatedAt && `· ${coinQuoteUpdatedAt}`}</button></div><p className="holdings-note">업비트 KRW 마켓 현재가를 6시간마다 갱신하며, 버튼으로 즉시 다시 조회할 수 있습니다.</p>{coinHoldings.length === 0 ? <div className="empty-holdings">등록된 코인 보유자산이 없습니다.</div> : <div className="holding-table"><div><span>코인</span><span>보유 수량</span><span>평단가</span><span>현재가</span><span>평가손익</span><span>수익률</span></div>{coinHoldings.map(holding => { const profit = holding.quantity * (holding.fallbackPrice - holding.averagePrice); const rate = (holding.fallbackPrice / holding.averagePrice - 1) * 100; return <div key={holding.symbol}><b>{holding.name}<small>{holding.symbol}</small></b><span>{holding.quantity.toLocaleString("ko-KR", { maximumFractionDigits: 8 })} {holding.symbol}</span><span>{won.format(holding.averagePrice)}</span><span>{won.format(holding.fallbackPrice)}</span><strong className={profit >= 0 ? "positive" : "negative"}>{profit >= 0 ? "+" : ""}{won.format(profit)}</strong><strong className={rate >= 0 ? "positive" : "negative"}>{percent(rate)}</strong></div>; })}</div>}</section>
    {manageOpen && <div className="modal-backdrop"><section className="manage-modal" role="dialog" aria-modal="true" aria-label="계좌 관리"><button className="modal-close" onClick={() => setManageOpen(false)}>×</button><p className="eyebrow">ACCOUNT MANAGER</p><h2>계좌 관리</h2><p className="helper">필요한 계좌만 남기고 새 계좌를 추가하세요.</p><div className="manage-list">{accounts.map(account => <div key={account.id}><span className={`account-icon ${account.color}`}>{account.type.slice(0, 1)}</span><span><b>{account.name}</b><small>{account.type} · {account.broker}</small></span><button className="delete-button" onClick={() => deleteAccount(account)}>삭제</button></div>)}</div><div className="add-form"><h3>새 계좌 추가</h3><label>자산 유형<select value={newType} onChange={event => setNewType(event.target.value)}>{["미국 주식", "국내 주식", "ISA", "IRP", "연금저축", "펀드", "코인", "기타"].map(type => <option key={type}>{type}</option>)}</select></label><label>계좌 이름<input value={newName} onChange={event => setNewName(event.target.value)} placeholder="예: 미래에셋 해외주식" /></label><label>증권사 / 거래소<input value={newBroker} onChange={event => setNewBroker(event.target.value)} placeholder="예: 미래에셋증권 또는 업비트" /></label><button className="confirm add-confirm" onClick={addAccount}>계좌 추가</button></div></section></div>}
  </main>;
}
