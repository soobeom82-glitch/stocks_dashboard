"use client";

import { useState } from "react";

type ImportState = { accounts: unknown[]; holdings: unknown[]; imports: unknown[] };

function validImport(value: unknown): value is ImportState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return Array.isArray(state.accounts) && Array.isArray(state.holdings) && Array.isArray(state.imports);
}

export default function MigrationPage() {
  const [state, setState] = useState<ImportState | null>(null);
  const [fileName, setFileName] = useState("");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const selectFile = async (file: File | undefined) => {
    if (!file) return;
    setMessage("");
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!validImport(parsed)) throw new Error("invalid export");
      setState(parsed); setFileName(file.name);
      setMessage(`가져올 준비가 되었습니다. 계좌 ${parsed.accounts.length}개, 국내 보유종목 ${parsed.holdings.length}개를 확인했습니다.`);
    } catch { setState(null); setFileName(""); setMessage("이 파일은 대시보드 내보내기 JSON 형식이 아닙니다."); }
  };

  const importState = async () => {
    if (!state || !secret) return;
    setIsSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/import-portfolio", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` }, body: JSON.stringify(state) });
      if (!response.ok) throw new Error("save failed");
      setMessage("가져오기가 완료되었습니다. 잠시 후 대시보드로 이동합니다.");
      window.setTimeout(() => window.location.assign("/"), 900);
    } catch { setMessage("가져오지 못했습니다. 일회성 비밀키와 데이터베이스 설정을 확인해 주세요."); }
    finally { setIsSaving(false); }
  };

  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f8f9fc", color: "#202638" }}><section style={{ width: "min(100%, 600px)", padding: 40, border: "1px solid #e4e7ef", borderRadius: 20, background: "white", boxShadow: "0 12px 34px #2026380b" }}>
    <p style={{ margin: 0, color: "#7180a5", fontSize: 12, fontWeight: 800, letterSpacing: ".14em" }}>ONE-TIME MIGRATION</p><h1 style={{ margin: "10px 0 12px", fontSize: 28 }}>대시보드 데이터 가져오기</h1>
    <p style={{ margin: "0 0 26px", color: "#738098", lineHeight: 1.7 }}>내보낸 JSON을 한 번만 업로드합니다. 파일은 브라우저에서 Vercel 데이터베이스로 전송되며 Git에 포함되지 않습니다.</p>
    <label style={{ display: "block", border: "2px dashed #cfd6e7", borderRadius: 14, padding: 26, textAlign: "center", cursor: "pointer", color: "#596987" }}><input type="file" accept="application/json,.json" onChange={event => void selectFile(event.target.files?.[0])} style={{ display: "none" }} /><strong>{fileName || "내보내기 JSON 파일 선택"}</strong><small style={{ display: "block", marginTop: 8, color: "#98a3b8" }}>파일은 이 페이지에서만 사용됩니다.</small></label>
    <label style={{ display: "block", marginTop: 16, color: "#596987", fontWeight: 700 }}>일회성 비밀키<input type="password" value={secret} onChange={event => setSecret(event.target.value)} placeholder="Vercel의 MIGRATION_SECRET 값" style={{ boxSizing: "border-box", width: "100%", marginTop: 8, padding: 12, border: "1px solid #dce1ec", borderRadius: 10, fontSize: 15 }} /></label>
    {message && <p aria-live="polite" style={{ margin: "18px 0 0", color: state ? "#277a60" : "#bd4d5e", lineHeight: 1.6 }}>{message}</p>}
    <button type="button" disabled={!state || !secret || isSaving} onClick={() => void importState()} style={{ width: "100%", marginTop: 24, padding: "14px 18px", border: 0, borderRadius: 10, background: state && secret && !isSaving ? "#5666df" : "#d9deec", color: "white", fontSize: 15, fontWeight: 700, cursor: state && secret && !isSaving ? "pointer" : "not-allowed" }}>{isSaving ? "가져오는 중…" : "데이터 가져오기"}</button>
  </section></main>;
}
