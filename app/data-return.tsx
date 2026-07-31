"use client";

import { useEffect, useMemo, useState } from "react";

type Asset = { id: string; topic?: string; title?: string; createdAt?: string };
type Snapshot = {
  platform: string;
  title: string;
  url: string;
  metrics: Record<string, number | null>;
  collectedAt: string;
  note: string;
};
type PublicationLink = {
  id: string;
  contentId: string;
  inputUrl: string;
  snapshot?: Snapshot;
  history: Snapshot[];
  status: "pending" | "collecting" | "collected" | "error";
  error?: string;
};

export function DataReturn({ notify }: { notify: (message: string) => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [contentId, setContentId] = useState("");
  const [newLink, setNewLink] = useState("");
  const [links, setLinks] = useState<PublicationLink[]>([]);

  useEffect(() => {
    const savedAssets = JSON.parse(window.localStorage.getItem("financial-titan-content-assets") || "[]");
    const savedLinks = JSON.parse(window.localStorage.getItem("financial-titan-publication-links") || "[]");
    setAssets(savedAssets);
    setContentId(savedAssets[0]?.id || "");
    setLinks(savedLinks);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("financial-titan-publication-links", JSON.stringify(links));
  }, [links]);

  const activeAsset = assets.find((asset) => asset.id === contentId);
  const activeLinks = useMemo(() => links.filter((link) => link.contentId === contentId), [links, contentId]);

  async function collect(link: PublicationLink) {
    setLinks((current) => current.map((item) => item.id === link.id ? { ...item, status: "collecting", error: "" } : item));
    try {
      const response = await fetch("/api/platform-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link.inputUrl }),
      });
      const snapshot = await response.json();
      if (!response.ok) throw new Error(snapshot.error || "页面读取失败");
      setLinks((current) => current.map((item) => item.id === link.id ? {
        ...item,
        status: "collected",
        snapshot,
        history: [...(item.history || []), snapshot],
      } : item));
      notify(`${snapshot.platform} 数据已更新`);
    } catch (error) {
      setLinks((current) => current.map((item) => item.id === link.id ? {
        ...item, status: "error", error: error instanceof Error ? error.message : "页面读取失败",
      } : item));
    }
  }

  function addLink() {
    if (!contentId || !newLink.trim()) return;
    const item: PublicationLink = {
      id: `publication-${Date.now()}`,
      contentId,
      inputUrl: newLink.trim(),
      history: [],
      status: "pending",
    };
    setLinks((current) => [...current, item]);
    setNewLink("");
    void collect(item);
  }

  return (
    <div className="returnDesk">
      <section className="studioPanel">
        <p className="eyebrow">MULTI-PLATFORM TRACKING</p>
        <h2>发布追踪台</h2>
        <p className="returnIntro">每条内容可以陆续追加任意数量的平台链接。先发的平台先采集，后发的平台以后再补；每个链接保留独立的历史快照。</p>
        {assets.length ? (
          <>
            <label className="assetSelector">选择内容
              <select value={contentId} onChange={(event) => setContentId(event.target.value)}>
                {assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.title || asset.topic || asset.id}</option>)}
              </select>
            </label>
            <div className="selectedAsset"><b>{activeAsset?.title || activeAsset?.topic}</b><span>{activeLinks.length} 个平台链接</span></div>
            <div className="linkCollector">
              <label>追加平台视频链接<input value={newLink} onChange={(event) => setNewLink(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addLink(); }} placeholder="每次粘贴一个链接，之后可继续追加" /></label>
              <button className="primary" disabled={!newLink.trim()} onClick={addLink}>添加并采集</button>
            </div>
          </>
        ) : (
          <div className="emptyReturn"><b>还没有已归档内容</b><span>先在稿件工坊完成一次“成片完成并存档”，再回来关联多平台链接。</span></div>
        )}
      </section>

      {activeLinks.map((link) => {
        const snapshot = link.snapshot;
        return (
          <section className="publicationCard" key={link.id}>
            <div className="publicationHead">
              <div><b>{snapshot?.platform || "等待识别平台"}</b><a href={link.inputUrl} target="_blank" rel="noreferrer">{link.inputUrl}</a></div>
              <button className="ghost" disabled={link.status === "collecting"} onClick={() => collect(link)}>{link.status === "collecting" ? "读取中…" : "刷新数据"}</button>
            </div>
            {link.error && <p className="coverError">{link.error}</p>}
            {snapshot ? (
              <>
                <div className="metricCards">
                  {[["播放", "views"], ["点赞", "likes"], ["评论", "comments"], ["转发", "shares"], ["收藏", "favorites"]].map(([label, key]) => {
                    const value = snapshot.metrics[key];
                    return <span key={key}><small>{label}</small><b>{value === null ? "不可见" : Number(value).toLocaleString("zh-CN")}</b></span>;
                  })}
                </div>
                <div className="snapshotFoot"><span>最近采集：{new Date(snapshot.collectedAt).toLocaleString("zh-CN")}</span><span>历史快照：{link.history.length} 次</span></div>
              </>
            ) : <div className="pendingCollect">链接已保存，等待首次页面数据。</div>}
          </section>
        );
      })}
    </div>
  );
}
