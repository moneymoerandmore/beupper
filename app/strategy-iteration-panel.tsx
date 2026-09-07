"use client";

import { useEffect, useState } from "react";
import { apiUrl, readJsonResponse } from "./api-client";

export function StrategyIterationPanel({ notify }: { notify: (message: string) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [processing, setProcessing] = useState("");

  useEffect(() => {
    const load = () => {
      try {
        setItems(JSON.parse(window.localStorage.getItem("financial-titan-strategy-iterations") || "[]"));
        setCandidates(JSON.parse(window.localStorage.getItem("financial-titan-promotion-candidates") || "[]"));
      }
      catch { setItems([]); }
    };
    load();
    window.addEventListener("financial-titan-strategy-updated", load);
    return () => window.removeEventListener("financial-titan-strategy-updated", load);
  }, []);

  function saveCandidates(next: any[]) {
    setCandidates(next);
    window.localStorage.setItem("financial-titan-promotion-candidates", JSON.stringify(next));
  }

  async function approve(candidate: any) {
    if (!window.confirm(`确认把这条规则写入 ${candidate.targetSkill}？\n\n${candidate.rule}\n\n系统会先创建版本备份。`)) return;
    setProcessing(candidate.id);
    try {
      const response = await fetch(apiUrl("/api/strategy-promote"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidate }) });
      const payload = await readJsonResponse(response, "Skill晋升");
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Skill晋升失败");
      saveCandidates(candidates.map((item) => item.id === candidate.id ? { ...item, status: "approved", approvedAt: payload.approvedAt, backup: payload.backup } : item));
      notify("规则已写入稳定 Skill，后续生成立即生效");
    } catch (error) { notify(error instanceof Error ? error.message : "Skill晋升失败"); }
    finally { setProcessing(""); }
  }

  function reject(candidate: any) {
    const reason = window.prompt("拒绝原因（可选，供后续策略复盘参考）：", "证据不足或不适合作为通用规则") ?? "";
    saveCandidates(candidates.map((item) => item.id === candidate.id ? { ...item, status: "rejected", rejectedAt: new Date().toISOString(), rejectionReason: reason } : item));
    notify("已拒绝该晋升候选，动态策略不受影响");
  }

  return <section className="strategyPage">
    <div className="strategyHero">
      <p className="eyebrow">DOUYIN FEEDBACK LOOP</p>
      <h2>策略迭代列表</h2>
      <p>每次抖音创作者数据同步后，DeepSeek 都会用已匹配稿件的真实表现复盘，并把最新版策略注入选题、研究底稿和口播成稿。</p>
    </div>
    <section className="promotionDesk">
      <div><p className="eyebrow">HUMAN APPROVAL</p><h2>待晋升规则</h2><span>只有通过3轮、14天、8篇作品、2类题材、去极值和指标门槛的规则才会进入这里；最终必须由你确认。</span></div>
      {!candidates.filter((item) => item.status === "pending").length && <div className="strategyEmpty"><b>暂无待确认规则</b><span>系统会继续从后续多轮同步中聚类验证，不会用单条爆款改写 Skill。</span></div>}
      <div className="promotionList">{candidates.map((candidate) => <article className={`promotionCandidate ${candidate.status}`} key={candidate.id}>
        <header><div><span>{candidate.targetSkill}</span><h3>{candidate.rule}</h3></div><em>{candidate.status === "approved" ? "已晋升" : candidate.status === "rejected" ? "已拒绝" : "待确认"}</em></header>
        <p>{candidate.rationale}</p>
        <div className="promotionGates"><span>{candidate.evidenceIterationIds?.length || 0}轮</span><span>{candidate.spanDays || 0}天</span><span>{candidate.uniquePostCount || candidate.supportingPostIds?.length || 0}篇</span><span>{candidate.supportingCategories?.length || 0}类题材</span><span>置信度 {candidate.confidence || "—"}</span></div>
        {candidate.metricEvidence?.length > 0 && <div className="promotionEvidence">{candidate.metricEvidence.map((metric: any, i: number) => <span key={i}>{metric.metric}：{metric.baseline} → {metric.test}（{metric.change > 0 ? "+" : ""}{metric.change}）</span>)}</div>}
        <small>去极值复核：{candidate.outlierCheck || "—"}；适用边界：{candidate.risks || "—"}</small>
        {candidate.status === "pending" && <footer><button disabled={processing === candidate.id} onClick={() => reject(candidate)}>拒绝</button><button className="primary" disabled={processing === candidate.id} onClick={() => approve(candidate)}>{processing === candidate.id ? "正在写入…" : "确认晋升到 Skill"}</button></footer>}
        {candidate.status === "approved" && <small>版本备份：{candidate.backup || "已保存"}</small>}
        {candidate.status === "rejected" && <small>拒绝原因：{candidate.rejectionReason || "未填写"}</small>}
      </article>)}</div>
    </section>
    {!items.length && <div className="strategyEmpty"><b>尚无策略迭代</b><span>前往资产库同步抖音创作者数据。存在已匹配项目且已配置 DeepSeek Key 时，会自动生成第一版。</span></div>}
    <div className="strategyList">
      {items.map((item, index) => <article className="strategyEntry" key={item.id || index}>
        <header><div><span>第 {items.length - index} 次迭代</span><h3>{item.summary || "内容策略复盘"}</h3></div><time>{new Date(item.createdAt).toLocaleString("zh-CN")}</time></header>
        <div className="strategyMeta"><span>{item.sampleCount || 0} 个匹配项目</span><span>{item.model || "DeepSeek"}</span><span>{item.receipt ? "API 已回执" : "无回执"}</span></div>
        {item.dataBoundary && <p className="strategyBoundary">数据边界：{item.dataBoundary}</p>}
        <div className="strategyColumns">
          <section><b>选题迭代</b>{(item.topicDirectives || []).map((text: string, i: number) => <p key={i}>{text}</p>)}</section>
          <section><b>底稿迭代</b>{(item.researchDirectives || []).map((text: string, i: number) => <p key={i}>{text}</p>)}</section>
          <section><b>成稿迭代</b>{(item.scriptDirectives || []).map((text: string, i: number) => <p key={i}>{text}</p>)}</section>
        </div>
        {(item.insights || []).length > 0 && <details><summary>查看数据发现与证据</summary>{item.insights.map((insight: any, i: number) => <div className="strategyInsight" key={i}><b>{insight.finding}</b><span>{insight.evidence}</span><em>{insight.confidence || "—"}</em></div>)}</details>}
        {(item.experiments || []).length > 0 && <details><summary>查看下一轮单变量实验</summary>{item.experiments.map((experiment: any, i: number) => <div className="strategyExperiment" key={i}><b>{experiment.name}</b><span>{experiment.change}；成功指标：{experiment.successMetric}；样本：{experiment.sampleSize}</span></div>)}</details>}
      </article>)}
    </div>
  </section>;
}
