"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "./api-client";

function sourceUrlFor(item: any) {
  const candidate = item?.evidence?.find((entry: any) => entry?.url)?.url;
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function BaiduSourcePanel({ notify, onValidated, onScan }: { notify: (message: string) => void; onValidated: (value: boolean) => void; onScan: (scan: any) => void }) {
  const [apiKey, setApiKey] = useState("");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [validated, setValidated] = useState(false);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [scan, setScan] = useState<any>(null);
  const [scanStale, setScanStale] = useState(false);

  useEffect(() => {
    setApiKey(window.localStorage.getItem("financial-titan-baidu-key") || "");
    setDeepseekApiKey(window.localStorage.getItem("financial-titan-deepseek-key") || "");
    const ok = window.localStorage.getItem("financial-titan-baidu-validated") === "true";
    setValidated(ok);
    onValidated(ok);
    const saved = window.localStorage.getItem("financial-titan-baidu-last-scan");
    if (saved) try {
      const parsed = JSON.parse(saved);
      const ageMs = Date.now() - new Date(parsed.scannedAt || 0).getTime();
      const stale = !parsed.scannedAt || ageMs > 90 * 60 * 1000;
      setScan(parsed);
      setScanStale(stale);
      if (!stale) onScan(parsed);
    } catch {}
  }, [onValidated, onScan]);

  useEffect(() => {
    if (apiKey) window.localStorage.setItem("financial-titan-baidu-key", apiKey);
  }, [apiKey]);

  useEffect(() => {
    if (deepseekApiKey) window.localStorage.setItem("financial-titan-deepseek-key", deepseekApiKey);
  }, [deepseekApiKey]);

  async function call(action: "test" | "scan") {
    setLoading(action);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/baidu-websearch"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, deepseekApiKey, action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "百度搜索请求失败");
      if (action === "test") {
        setValidated(true);
        onValidated(true);
        window.localStorage.setItem("financial-titan-baidu-validated", "true");
        notify(`百度 WebSearch 验证成功，返回 ${payload.resultCount} 条结果`);
      } else {
        setScan(payload);
        setScanStale(false);
        onScan(payload);
        window.localStorage.setItem("financial-titan-baidu-last-scan", JSON.stringify(payload));
        notify(`今日扫描完成，形成 ${payload.topics.length} 个有效候选，其中 ${payload.mainTopicCount} 个达到主推门槛`);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "连接失败");
      if (action === "test") {
        setValidated(false);
        onValidated(false);
        window.localStorage.removeItem("financial-titan-baidu-validated");
      }
    } finally {
      setLoading("");
    }
  }

  return (
    <section className="card baiduSource">
      <div className="baiduHead">
        <div><p className="eyebrow">LIVE DATA SOURCE</p><h2>百度 WebSearch 数据接入</h2></div>
        <span className={validated ? "sourceOk" : "sourcePending"}>{validated ? "已验证" : "待验证"}</span>
      </div>
      <div className="sourceConfig">
        <label>API Key<input type="password" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setValidated(false); onValidated(false); }} placeholder="仅保存在当前浏览器" autoComplete="off" /></label>
        <label>DeepSeek Key<input type="password" value={deepseekApiKey} onChange={(event) => setDeepseekApiKey(event.target.value)} placeholder="动态事件理解" autoComplete="off" /></label>
        <button className="ghost" disabled={!apiKey || Boolean(loading)} onClick={() => call("test")}>{loading === "test" ? "验证中…" : "验证连接"}</button>
        <button className="primary" disabled={!validated || !deepseekApiKey || Boolean(loading)} onClick={() => call("scan")}>{loading === "scan" ? "正在召回并标准化全球事件…" : "扫描今日热点"}</button>
      </div>
      <p className="credentialHint">百度千帆 V2 Key 应为完整的 <code>bce-v3/...</code>；AppBuilder Key 会自动尝试对应鉴权头。<code>BSK...</code> 通常是 Brave Search Key，不能用于百度接口。Access Key / Secret Key 也不能填在这里。</p>
      {error && <p className="coverError">{error}</p>}
      <div className="sourceMethod"><span>① 通用财经覆盖矩阵</span><span>② 动态实体与动作提取</span><span>③ 事件级语义标准化</span><span>④ 全链路诊断与纯排序</span></div>
      {scan && (
        <div className="liveEvidence">
          <div><b>{scanStale ? "历史扫描（已过期）" : "最近扫描"}：{new Date(scan.scannedAt).toLocaleString("zh-CN")}</b><span>{scan.queryCount} 组查询{scan.followUpQueryCount ? `（含 ${scan.followUpQueryCount} 组行情追因/公告追踪）` : ""} · 搜索返回 {scan.collectedReferenceCount ?? scan.rawReferenceCount ?? scan.references.length} 条 → 48小时有效 {scan.rawReferenceCount ?? scan.references.length} 条 → 内容去重 {scan.contentDedupCount ?? scan.references.length} 条 · {scan.events?.length ?? scan.discoveredEventCount ?? "—"} 个独立事件 · {scan.topics.length} 个头部候选</span></div>
          {scanStale && <p className="coverError">这份结果已超过90分钟，只用于历史查看，不再作为首页“今日热点”。请重新扫描以获取最新交易时段信息。</p>}
          {scan.categoryCoverage?.length > 0 && <div className="coverageTags">覆盖：{scan.categoryCoverage.map((item: string) => <span key={item}>{item}</span>)}</div>}
          {scan.diagnostics?.freshnessBuckets && <div className="coverageTags">时效：<span>2小时突发 {scan.diagnostics.freshnessBuckets.breaking_2h || 0}</span><span>8小时交易时段 {scan.diagnostics.freshnessBuckets.current_session_8h || 0}</span><span>24小时今日 {scan.diagnostics.freshnessBuckets.today_24h || 0}</span><span>48小时背景 {scan.diagnostics.freshnessBuckets.background_48h || 0}</span></div>}
          {scan.events?.length > 0 && <div className="rejectionDesk">
            <div className="rejectionHead"><b>今日扫描事件全集</b><span>每一行是一个去重后的事件；高潜选题是其中的头部子集</span></div>
            <div className="rejectionTable"><div className="rejectionRow rejectionHeader"><span># / 事件</span><span>类别</span><span>来源/权威/市场</span><span>分数</span><span>排序状态与诊断</span></div>
              {scan.events.map((item: any) => {
                const sourceUrl = sourceUrlFor(item);
                return <div className="rejectionRow" key={item.eventKey || item.id}>
                  <span className="eventTitle" title={item.trigger}>{sourceUrl ? <a className="eventSourceLink" href={sourceUrl} target="_blank" rel="noopener noreferrer"><b className="eventRank">{item.rank}. </b>{item.title}<i>↗</i></a> : <><b className="eventRank">{item.rank}. </b>{item.title}</>}</span>
                  <span className="eventCategory">{item.eventRole || "事件"} · {item.category || "市场事件"} · {item.freshness}</span>
                  <span className="eventSources" aria-label="来源、权威来源、涉及市场数量"><i>来源</i>{item.sourceCount}<i>权威</i>{item.authorityCount}<i>市场</i>{item.markets?.length || 0}</span>
                  <span className="eventScore"><i>综合分</i><b>{Math.round(item.score)}</b></span>
                  <span className={`eventStatus ${item.rejectionReasons?.length ? "rejectionReason" : "eventEligible"}`}><b>{item.status}</b>{item.topicCount ? ` · 对应 ${item.topicCount} 个高潜题` : item.rejectionReasons?.length ? ` · ${item.rejectionReasons.join("；")}` : " · 仅保留在事件全集"}</span>
                </div>;
              })}
            </div>
          </div>}
          {scan.diagnostics && <details className="recallAudit">
            <summary>查看召回全过程诊断</summary>
            <div className="auditCounts">{Object.entries(scan.diagnostics.counts || {}).map(([key, value]) => <span key={key}><b>{String(value)}</b>{key}</span>)}</div>
            <div className="auditTrace"><div className="auditTraceRow auditTraceHead"><span>原始结果</span><span>发布时间</span><span>处理状态</span><span>归属事件</span></div>
              {(scan.diagnostics.traces || []).map((trace: any) => <div className="auditTraceRow" key={trace.traceId}><span>{trace.url ? <a href={trace.url} target="_blank" rel="noopener noreferrer">{trace.title || trace.url}</a> : trace.title}</span><span>{trace.publishedAt || "无时间"}</span><span>{trace.status}</span><span>{trace.eventId || "—"}</span></div>)}
            </div>
          </details>}
        </div>
      )}
      <p className="keyNotice">事件全集不再经过评分淘汰：时间过滤与内容去重后，每条证据必须被动态分配到具体事件或进入“未分类”诊断；评分只决定事件排名和前六个高潜子集。</p>
    </section>
  );
}
