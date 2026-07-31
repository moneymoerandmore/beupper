"use client";

import { useEffect, useMemo, useState } from "react";
import { topicEngineRules } from "./topic-engine";
import { CreatorWorkflow } from "./creator-workflow";

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
  freshness: string;
  trigger: string;
};

const topics: Topic[] = [
  {
    id: 1,
    title: "昨夜美股AI链暴力反弹，今天A股科技跟涨：反转来了，还是又一次诱多？",
    thesis: "微软单日大涨15.5%、泛林集团涨18%，纳指反弹2.8%；A股白天接力，真正要判断的是“业绩验证”还是“超跌回补”。",
    markets: ["美股", "港股", "A股"],
    heat: 99,
    fit: 99,
    depth: 94,
    score: 98,
    status: "立即做",
    accent: "violet",
    freshness: "11 小时内",
    trigger: "美股收盘 → A股盘中验证",
  },
  {
    id: 2,
    title: "微软证明AI能赚钱，Meta却因加码投入承压：市场到底在奖励什么？",
    thesis: "同样是AI资本开支，一家公司创近18年最佳单日，另一家却被市场惩罚；分水岭是回报兑现速度。",
    markets: ["美股", "港股"],
    heat: 93,
    fit: 90,
    depth: 88,
    score: 91,
    status: "备选",
    accent: "blue",
    freshness: "昨夜财报",
    trigger: "微软 / Meta 财报分化",
  },
  {
    id: 3,
    title: "半导体一个月暴跌后突然反包：为什么“涨得最猛”不等于“风险解除”？",
    thesis: "费城半导体此前从高位深度回撤，昨夜反弹更像财报催化下的空头回补；要看成交、扩散与后续财报确认。",
    markets: ["美股", "A股"],
    heat: 91,
    fit: 95,
    depth: 96,
    score: 94,
    status: "观察",
    accent: "amber",
    freshness: "24 小时内",
    trigger: "超跌反弹 / 趋势反转之争",
  },
];

const pipeline = [
  { label: "热点采集", count: 24, done: true },
  { label: "候选评分", count: 8, done: true },
  { label: "选题确认", count: 1, done: true },
  { label: "深度研究", count: 3, done: true },
  { label: "包装确认", count: 1, done: false },
  { label: "口播成稿", count: 1, done: false },
  { label: "花生成片", count: 0, done: false },
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

        {tab === "稿件工坊" && <CreatorWorkflow notify={notify} />}
        <div style={{display: tab === "稿件工坊" ? "none" : "block"}}>
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

        <section className="engineCard">
          <div className="sectionTitle">
            <div><p className="eyebrow">TOPIC ENGINE V2</p><h2>先过硬门槛，再按事件强度排序</h2></div>
            <span className="engineVersion">滚动窗口：每 30 分钟</span>
          </div>
          <div className="engineFlow">
            <span><b>01</b>采集事件<small>行情·公告·新闻·社媒</small></span>
            <i>→</i><span><b>02</b>事件聚类<small>同一事件合并去重</small></span>
            <i>→</i><span><b>03</b>硬门筛除<small>时间·信源·异动·联动</small></span>
            <i>→</i><span><b>04</b>动态评分<small>热度增速而非绝对热度</small></span>
            <i>→</i><span><b>05</b>编辑判断<small>形成可证伪命题</small></span>
          </div>
          <div className="ruleGrid">
            {topicEngineRules.map((item) => (
              <div key={item.name}><strong>{item.name}</strong><p>{item.rule}</p><em>{item.weight}</em></div>
            ))}
          </div>
          <div className="engineFoot">
            <span><b>主推</b> ≥ 85分且全部过门</span>
            <span><b>备选</b> 75—84分</span>
            <span><b>观察</b> 未完成跨市场验证</span>
            <span><b>自动淘汰</b> 超48小时无新增催化</span>
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
                    <div className="marketTags"><span className="fresh">● {topic.freshness}</span>{topic.markets.map((m) => <span key={m}>{m}</span>)}<span>{topic.trigger}</span></div>
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
              <li><b>刚刚发生</b><span>昨夜美股收盘确认，今天A股盘中完成第二市场验证</span></li>
              <li><b>因果链清楚</b><span>微软AI回报兑现 → 美股AI链反包 → A股科技情绪修复</span></li>
              <li><b>核心分歧够大</b><span>业绩驱动的趋势反转，还是深跌后的空头回补？</span></li>
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
        <section className="fusionCard">
          <div><p className="eyebrow">PEANUTCUT FUSION</p><h2>新增闭环能力</h2></div>
          <div className="fusionGrid">
            <span><b>实时失败保护</b><small>核心数据源过期或抓取失败时停止主推，不用缓存伪装实时。</small><em>已完成</em></span>
            <span><b>内容资产库</b><small>稿件自动存档、历史检索、系列管理、发布指标回填。</small><em>已完成</em></span>
            <span><b>两个人工闸门</b><small>选题确认后才研究；标题、封面、Hook确认后才成稿。</small><em>已完成</em></span>
            <span><b>花生纯口播</b><small>研究标注与分镜不混入口播，中文标点和数字读法单独校验。</small><em className="building">下一步</em></span>
          </div>
        </section>
        </div>
      </section>
      {toast && <div className="toast">✓　{toast}</div>}
    </main>
  );
}
