"use client";

import { useEffect, useState } from "react";
import { downloadCover } from "./image-download";

const stepNames = ["选题确认", "研究底稿", "包装确认", "口播成稿", "花生成片", "数据回流"];

export function ProjectLibrary({ notify }: { notify: (message: string) => void }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [links, setLinks] = useState<any[]>([]);
  const [newLink, setNewLink] = useState("");

  useEffect(() => {
    const saved = JSON.parse(window.localStorage.getItem("financial-titan-projects") || "[]");
    setProjects(saved.sort((a: any, b: any) => String(b.updatedAt).localeCompare(String(a.updatedAt))));
    setSelectedId(saved[0]?.id || "");
    setLinks(JSON.parse(window.localStorage.getItem("financial-titan-publication-links") || "[]"));
  }, []);

  const selected = projects.find((item) => item.id === selectedId);
  const selectedLinks = links.filter((item) => item.contentId === selectedId);

  function saveLinks(next: any[]) {
    setLinks(next);
    window.localStorage.setItem("financial-titan-publication-links", JSON.stringify(next));
    window.dispatchEvent(new Event("financial-titan-publications-updated"));
  }

  async function collectPublication(link: any) {
    const stored = JSON.parse(window.localStorage.getItem("financial-titan-publication-links") || "[]");
    saveLinks(stored.map((item: any) => item.id === link.id ? { ...item, status: "collecting", error: "" } : item));
    try {
      const response = await fetch("/api/platform-metrics", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: link.inputUrl }),
      });
      const snapshot = await response.json();
      if (!response.ok) throw new Error(snapshot.error || "页面读取失败");
      const current = JSON.parse(window.localStorage.getItem("financial-titan-publication-links") || "[]");
      const next = current.map((item: any) => item.id === link.id ? { ...item, status: "collected", snapshot, history: [...(item.history || []), snapshot] } : item);
      saveLinks(next);
      notify(`${snapshot.platform} 数据已更新`);
    } catch (error) {
      const current = JSON.parse(window.localStorage.getItem("financial-titan-publication-links") || "[]");
      saveLinks(current.map((item: any) => item.id === link.id ? { ...item, status: "error", error: error instanceof Error ? error.message : "页面读取失败" } : item));
    }
  }

  function addPublication() {
    if (!selected || !newLink.trim()) return;
    const publication = { id: `publication-${Date.now()}`, contentId: selected.id, inputUrl: newLink.trim(), history: [], status: "pending" };
    saveLinks([...links, publication]);
    setNewLink("");
    void collectPublication(publication);
  }

  function continueProject() {
    if (!selected) return;
    window.localStorage.setItem("financial-titan-current-project", selected.id);
    window.localStorage.setItem("financial-titan-open-tab", "稿件工坊");
    window.location.reload();
  }

  async function copyScript() {
    if (!selected?.script) return;
    await navigator.clipboard.writeText(selected.script);
    notify("口播稿已复制");
  }

  function exportProject() {
    if (!selected) return;
    const blob = new Blob([JSON.stringify(selected, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `金融巨子-${selected.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="libraryLayout">
      <aside className="projectList">
        <div><p className="eyebrow">PROJECT ARCHIVE</p><h2>内容资产库</h2><span>{projects.length} 个项目</span></div>
        {projects.length ? projects.map((project) => (
          <button className={selectedId === project.id ? "selected" : ""} key={project.id} onClick={() => setSelectedId(project.id)}>
            <b>{project.packaging?.title || project.topic || "未命名项目"}</b>
            <span>{stepNames[project.step] || "进行中"} · {new Date(project.updatedAt).toLocaleString("zh-CN")}</span>
          </button>
        )) : <div className="emptyReturn"><b>暂无项目</b><span>进入稿件工坊后，系统会从第一步开始自动保存。</span></div>}
      </aside>
      {selected && (
        <section className="projectDetail">
          <div className="projectDetailHead"><div><p className="eyebrow">AUTO-SAVED OUTPUT</p><h2>{selected.packaging?.title || selected.topic}</h2></div><div><button className="ghost" onClick={exportProject}>导出 JSON</button><button className="primary" onClick={continueProject}>继续编辑</button></div></div>
          <div className="projectMeta"><span>当前阶段<b>{stepNames[selected.step]}</b></span><span>创建时间<b>{new Date(selected.createdAt).toLocaleString("zh-CN")}</b></span><span>最近保存<b>{new Date(selected.updatedAt).toLocaleString("zh-CN")}</b></span></div>
          <article className="outputBlock"><h3>选题</h3><p>{selected.topic}</p></article>
          <article className="outputBlock"><h3>研究底稿</h3><div className="savedResearch">{(selected.research || []).map((item: any) => <span key={item.key}><b>{item.key} · {item.title}</b><small>{item.body}</small></span>)}</div></article>
          <article className="outputBlock"><h3>标题、Hook 与封面方案</h3><dl className="savedPackage"><div><dt>标题</dt><dd>{selected.packaging?.title}</dd></div><div><dt>Hook</dt><dd>{selected.packaging?.hook}</dd></div><div><dt>封面主锤字</dt><dd>{selected.packaging?.cover}</dd></div><div><dt>视觉方向</dt><dd>{selected.packaging?.visual}</dd></div></dl></article>
          {(selected.coverImages?.landscape || selected.coverImages?.portrait) && <article className="outputBlock"><h3>生成封面</h3><div className="savedCovers">{selected.coverImages.landscape && <figure><img src={selected.coverImages.landscape} alt="已保存横版封面" /><figcaption><button onClick={() => downloadCover(selected.coverImages.landscape, "png", "金融巨子-横版封面")}>下载 PNG</button><button onClick={() => downloadCover(selected.coverImages.landscape, "jpg", "金融巨子-横版封面")}>下载 JPG</button></figcaption></figure>}{selected.coverImages.portrait && <figure><img src={selected.coverImages.portrait} alt="已保存竖版封面" /><figcaption><button onClick={() => downloadCover(selected.coverImages.portrait, "png", "金融巨子-竖版封面")}>下载 PNG</button><button onClick={() => downloadCover(selected.coverImages.portrait, "jpg", "金融巨子-竖版封面")}>下载 JPG</button></figcaption></figure>}</div></article>}
          <article className="outputBlock publicationAssets">
            <div className="blockHead"><h3>投稿链接与平台数据</h3><span>{selectedLinks.length} 个平台</span></div>
            <div className="linkCollector"><label>追加平台视频链接<input value={newLink} onChange={(event) => setNewLink(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addPublication(); }} placeholder="粘贴抖音、Bilibili、YouTube 或 TikTok 链接" /></label><button className="primary" disabled={!newLink.trim()} onClick={addPublication}>添加并采集</button></div>
            {selectedLinks.map((link) => <div className="assetPublication" key={link.id}>
              <div><b>{link.snapshot?.platform || "等待识别"}</b><a href={link.inputUrl} target="_blank" rel="noreferrer">{link.inputUrl}</a></div>
              <div className="assetMetrics">{[["播放","views"],["点赞","likes"],["评论","comments"],["转发","shares"],["收藏","favorites"]].map(([label,key]) => { const value = link.snapshot?.metrics?.[key]; return <span key={key}><small>{label}</small><b>{value == null ? "—" : Number(value).toLocaleString("zh-CN")}</b></span>; })}</div>
              <div className="publicationActions"><span>{link.snapshot ? `最近采集 ${new Date(link.snapshot.collectedAt).toLocaleString("zh-CN")} · ${link.history?.length || 0} 次快照` : link.error || "等待首次采集"}</span><button className="ghost" disabled={link.status === "collecting"} onClick={() => collectPublication(link)}>{link.status === "collecting" ? "读取中…" : "刷新数据"}</button></div>
            </div>)}
            {!selectedLinks.length && <div className="pendingCollect">尚未绑定投稿链接，可以在任何时间陆续补充多个平台。</div>}
          </article>
          <article className="outputBlock"><div className="blockHead"><h3>口播稿</h3><button className="ghost" onClick={copyScript}>复制全文</button></div><pre>{selected.script}</pre></article>
        </section>
      )}
    </div>
  );
}
