"use client";

import { useEffect, useMemo, useState } from "react";

type Topic = {
  id: number;
  title: string;
  thesis: string;
  markets: string[];
  heat: number;
  fit: number;
  depth: number;
  score: number;
  status: string;
  accent: string;
};

const topics: Topic[] = [
  {
    id: 1,
    title: "AI算力链重新定价：美股卖铲人，为什么带动A股液冷与港股云厂商？",
    thesis: "从资本开支到订单兑现，三地市场正在交易同一件事的不同阶段。",
    markets: ["美股", "港股", "A股"],
    heat: 94,
    fit: 97,
    depth: 91,
    score: 95,
    status: "主推",
    accent: "violet",
  },
  {
    id: 2,
    title: "降息预期又反转：科技股、黄金和人民币资产谁更敏感？",
    thesis: "利率不是单一变量，真正决定走势的是增长预期与风险偏好的组合。",
    markets: ["美股", "A股", "大宗"],
    heat: 89,
    fit: 92,
    depth: 88,
    score: 90,
    status: "备选",
    accent: "blue",
  },
  {
    id: 3,
    title: "消费复苏的错觉：白酒、潮玩与本地生活正在走三条不同的路",
    thesis: "总量叙事失效后，消费板块要看人群、场景和渠道的结构变化。",
    markets: ["A股", "港股"],
    heat: 83,
    fit: 78,
    depth: 86,
    score: 82,
    status: "观察",
    accent: "amber",
  },
];

const pipeline = [
  { label: "热点采集", count: 24, done: true },
  { label: "候选评分", count: 8, done: true },
  { label: "深度研究", count: 3, done: true },
  { label: "口播成稿", count: 1, done: false },
  { label: "花生成片", count: 0, done: false },
  { label: "多端发布", count: 0, done: false },
];

const platformRows = [
  { name: "抖音", color: "#19c6a4", views: "48.2万", completion: "38.6%", follows: "+2,184", index: 86 },
  { name: "Bilibili", color: "#4aa8ff", views: "16.8万", completion: "51.2%", follows: "+1,032", index: 92 },
  { name: "YouTube", color: "#ff5353", views: "7.4万", completion: "44.7%", follows: "+486", index: 78 },
  { name: "TikTok", color: "#c783ff", views: "12.1万", completion: "32.9%", follows: "+713", index: 74 },
];

export default function Home() {
  const [selected, setSelected] = useState(1);
  const [tab, setTab] = useState("总览");
  const [toast, setToast] = useState("");
  const [ready, setReady] = useState(false);
  const active = useMemo(() => topics.find((t) => t.id === selected) ?? topics[0], [selected]);

  useEffect(() => {
    const stored = window.localStorage.getItem("fin-titan-selected");
    if (stored) setSelected(Number(stored));
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem("fin-titan-selected", String(selected));
  }, [selected, ready]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  function openHuasheng() {
    window.open("https://www.huasheng.cn/", "_blank", "noopener,noreferrer");
    notify("已打开花生AI，稿件交接清单已准备");
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">金</div>
          <div><b>金融巨子</b><span>CONTENT OS</span></div>
        </div>
        <nav>
          {["总览", "热点雷达", "选题库", "稿件工坊", "发布日历", "数据复盘"].map((item, i) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
              <span className="navIcon">{["◫", "⌁", "◇", "✎", "▦", "↗"][i]}</span>{item}
              {item === "热点雷达" && <em>24</em>}
            </button>
          ))}
        </nav>
        <div className="sidebarBottom">
          <div className="autoStatus"><i /><span><b>工作流运行中</b><small>下次扫描 18:00</small></span></div>
          <button className="settings">⚙　工作流设置</button>
        </div>
      </aside>

      <section className="content">
        <header>
          <div>
            <p className="eyebrow">FRIDAY · 2026.07.31</p>
            <h1>{tab === "总览" ? "今日编辑台" : tab}</h1>
            <p className="subtitle">从全球市场噪音里，找到今天最值得讲的一个判断。</p>
          </div>
          <div className="headerActions">
            <button className="ghost" onClick={() => notify("已开始扫描中美社交网络与市场数据")}>↻　刷新热点</button>
            <button className="primary" onClick={() => notify("已创建空白选题卡")}>＋ 新建选题</button>
            <div className="avatar">巨</div>
          </div>
        </header>

        <div className="stats">
          <div><span>今日候选</span><strong>24</strong><small className="up">↑ 8 个高潜</small></div>
          <div><span>待审稿件</span><strong>3</strong><small>1 篇今日发布</small></div>
          <div><span>近 7 日播放</span><strong>84.5万</strong><small className="up">↑ 18.4%</small></div>
          <div><span>内容健康度</span><strong>88</strong><small className="up">优秀</small></div>
        </div>

        <section className="workflowCard">
          <div className="sectionTitle">
            <div><p className="eyebrow">DAILY ENGINE</p><h2>今日生产流水线</h2></div>
            <span className="live"><i /> 自动同步中</span>
          </div>
          <div className="pipeline">
            {pipeline.map((step, i) => (
              <div className="pipe" key={step.label}>
                <div className={step.done ? "pipeCircle done" : "pipeCircle"}>{step.done ? "✓" : i + 1}</div>
                <b>{step.label}</b><span>{step.count} 项</span>
                {i < pipeline.length - 1 && <div className={step.done ? "line done" : "line"} />}
              </div>
            ))}
          </div>
        </section>

        <div className="grid">
          <section className="topicPanel">
            <div className="sectionTitle compact">
              <div><p className="eyebrow">TOPIC RADAR</p><h2>今日高潜选题</h2></div>
              <button className="textBtn" onClick={() => setTab("热点雷达")}>查看全部 →</button>
            </div>
            <div className="topicList">
              {topics.map((topic, i) => (
                <button className={`topic ${selected === topic.id ? "selected" : ""}`} key={topic.id} onClick={() => setSelected(topic.id)}>
                  <div className={`rank ${topic.accent}`}>0{i + 1}</div>
                  <div className="topicBody">
                    <div className="topicTop"><span className={`badge ${topic.status}`}>{topic.status}</span><span className="score">综合 {topic.score}</span></div>
                    <h3>{topic.title}</h3>
                    <p>{topic.thesis}</p>
                    <div className="marketTags">{topic.markets.map((m) => <span key={m}>{m}</span>)}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <aside className="decisionPanel">
            <p className="eyebrow">EDITOR&apos;S PICK</p>
            <div className="scoreRing"><strong>{active.score}</strong><span>推荐指数</span></div>
            <h2>为什么今天讲这个？</h2>
            <ul>
              <li><b>热度有共振</b><span>中美讨论同时升温，且不是单一消息刺激</span></li>
              <li><b>跨市场有落差</b><span>美股定价业绩，A股交易弹性，港股押注重估</span></li>
              <li><b>观点可证伪</b><span>用资本开支、订单和估值三组数据建立证据链</span></li>
            </ul>
            <div className="miniScores">
              <div><span>传播热度</span><b>{active.heat}</b><i style={{width: `${active.heat}%`}} /></div>
              <div><span>账号匹配</span><b>{active.fit}</b><i style={{width: `${active.fit}%`}} /></div>
              <div><span>分析纵深</span><b>{active.depth}</b><i style={{width: `${active.depth}%`}} /></div>
            </div>
            <button className="primary wide" onClick={() => notify("选题已进入深度研究，正在生成证据链")}>用这个选题开稿　→</button>
          </aside>
        </div>

        <div className="bottomGrid">
          <section className="performance">
            <div className="sectionTitle compact">
              <div><p className="eyebrow">PERFORMANCE</p><h2>近 7 日平台表现</h2></div>
              <select aria-label="统计周期"><option>近 7 天</option><option>近 30 天</option></select>
            </div>
            <div className="tableHead"><span>平台</span><span>播放</span><span>完播率</span><span>涨粉</span><span>内容指数</span></div>
            {platformRows.map((row) => (
              <div className="tableRow" key={row.name}>
                <span className="platform"><i style={{background: row.color}} />{row.name}</span>
                <b>{row.views}</b><span>{row.completion}</span><span className="up">{row.follows}</span>
                <span className="index"><i><em style={{width: `${row.index}%`}} /></i><b>{row.index}</b></span>
              </div>
            ))}
          </section>

          <section className="nextAction">
            <p className="eyebrow">NEXT ACTION</p>
            <div className="peanut">花生<span>AI</span></div>
            <h2>稿件成片交接</h2>
            <p>将定稿文案带入花生AI，生成 9:16 与 16:9 两个母版，再按平台调整标题、字幕密度和前 3 秒画面。</p>
            <div className="checklist"><span>✓ 口播稿</span><span>✓ 素材提示</span><span>✓ 分镜节奏</span><span>✓ 平台标题</span></div>
            <button className="peanutBtn" onClick={openHuasheng}>打开花生AI制作 →</button>
          </section>
        </div>

        <section className="method">
          <div><p className="eyebrow">THE PLAYBOOK</p><h2>金融巨子 · 内容判断框架</h2></div>
          <div className="methodSteps">
            <span><b>01</b><em>热点真伪</em><small>讨论增速 × 权威信源</small></span>
            <span><b>02</b><em>市场映射</em><small>美股 → 港股 → A股</small></span>
            <span><b>03</b><em>历史校验</em><small>周期案例 × 大师观点</small></span>
            <span><b>04</b><em>表达重构</em><small>反常识 Hook × 口语叙事</small></span>
            <span><b>05</b><em>数据回流</em><small>完播 × 互动 × 转粉</small></span>
          </div>
        </section>
      </section>
      {toast && <div className="toast">✓　{toast}</div>}
    </main>
  );
}
