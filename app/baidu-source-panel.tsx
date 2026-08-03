"use client";

import { useEffect, useState } from "react";

export function BaiduSourcePanel({ notify, onValidated, onScan }: { notify: (message: string) => void; onValidated: (value: boolean) => void; onScan: (scan: any) => void }) {
  const [apiKey, setApiKey] = useState("");
  const [validated, setValidated] = useState(false);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [scan, setScan] = useState<any>(null);

  useEffect(() => {
    setApiKey(window.localStorage.getItem("financial-titan-baidu-key") || "");
    const ok = window.localStorage.getItem("financial-titan-baidu-validated") === "true";
    setValidated(ok);
    onValidated(ok);
    const saved = window.localStorage.getItem("financial-titan-baidu-last-scan");
    if (saved) try { const parsed = JSON.parse(saved); setScan(parsed); onScan(parsed); } catch {}
  }, [onValidated, onScan]);

  useEffect(() => {
    if (apiKey) window.localStorage.setItem("financial-titan-baidu-key", apiKey);
  }, [apiKey]);

  async function call(action: "test" | "scan") {
    setLoading(action);
    setError("");
    try {
      const response = await fetch("/api/baidu-websearch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, action }),
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
        <button className="ghost" disabled={!apiKey || Boolean(loading)} onClick={() => call("test")}>{loading === "test" ? "验证中…" : "验证连接"}</button>
        <button className="primary" disabled={!validated || Boolean(loading)} onClick={() => call("scan")}>{loading === "scan" ? "正在扫描全市场事件地图…" : "扫描今日热点"}</button>
      </div>
      <p className="credentialHint">百度千帆 V2 Key 应为完整的 <code>bce-v3/...</code>；AppBuilder Key 会自动尝试对应鉴权头。<code>BSK...</code> 通常是 Brave Search Key，不能用于百度接口。Access Key / Secret Key 也不能填在这里。</p>
      {error && <p className="coverError">{error}</p>}
      <div className="sourceMethod"><span>① 中文财经与市场异动</span><span>② 美股科技与财报</span><span>③ 中文社交讨论</span><span>④ 海外英文与社交信号</span></div>
      {scan && (
        <div className="liveEvidence">
          <div><b>最近扫描：{new Date(scan.scannedAt).toLocaleString("zh-CN")}</b><span>{scan.queryCount} 组查询 · 原始 {scan.rawReferenceCount ?? scan.references.length} 条 → 内容去重 {scan.contentDedupCount ?? scan.references.length} 条 · {scan.events?.length ?? scan.discoveredEventCount ?? "—"} 个独立事件 · {scan.topics.length} 个头部候选</span></div>
          {scan.categoryCoverage?.length > 0 && <div className="coverageTags">覆盖：{scan.categoryCoverage.map((item: string) => <span key={item}>{item}</span>)}</div>}
          {scan.events?.length > 0 && <div className="rejectionDesk">
            <div className="rejectionHead"><b>今日扫描事件全集</b><span>每一行是一个去重后的事件；高潜选题是其中的头部子集</span></div>
            <div className="rejectionTable"><div className="rejectionRow rejectionHeader"><span># / 事件</span><span>类别</span><span>来源/权威/市场</span><span>分数</span><span>状态与原因</span></div>
              {scan.events.map((item: any) => <div className="rejectionRow" key={item.eventKey || item.id}>
                <span title={item.trigger}><b>{item.rank}. </b>{item.title}</span><span>{item.category || "市场事件"}</span><span>{item.sourceCount}/{item.authorityCount}/{item.markets?.length || 0}</span><span>{Math.round(item.score)}</span><span className={item.eligible ? "eventEligible" : "rejectionReason"}><b>{item.status}</b>{!item.eligible && ` · ${item.rejectionReasons?.join("；") || "未过门槛"}`}</span>
              </div>)}
            </div>
          </div>}
        </div>
      )}
      <p className="keyNotice">扫描结果会按事件合并去重；只有双来源、权威信源、近期催化和明确异动全部通过，才可能进入主推。</p>
    </section>
  );
}
