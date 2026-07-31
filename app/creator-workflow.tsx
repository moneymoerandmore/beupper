"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCover } from "./image-download";

const defaultTopic = "昨夜美股AI链暴力反弹，今天A股科技跟涨：反转来了，还是又一次诱多？";

const researchLayers = [
  { key: "事实", title: "发生了什么", body: "微软财报后单日上涨15.5%，创近18年最佳单日表现；半导体设备公司泛林集团上涨18%，纳指上涨2.8%。随后A股科技方向在白天交易时段出现情绪修复。", status: "双源确认" },
  { key: "因果", title: "市场为什么这样交易", body: "市场并非重新奖励所有AI投入，而是在奖励“资本开支已经转化为收入和利润”的公司。财报兑现、超跌仓位与空头回补共同放大了反弹。", status: "待持续验证" },
  { key: "映射", title: "跨市场如何传导", body: "微软云业务和AI回报先修复美股风险偏好，设备股验证上游需求，再由A股半导体、光模块和算力链交易海外映射与高弹性。", status: "A股已验证" },
  { key: "历史", title: "历史案例", body: "2022年末至2023年初的科技反弹说明：估值修复可以先于盈利见底，但只有订单、资本开支和盈利预测连续上修，反弹才能演化为趋势。", status: "可类比" },
  { key: "大师", title: "大师观点", body: "霍华德·马克斯强调价格与价值的关系会被市场情绪暂时扭曲；索罗斯的反身性则解释了价格上涨如何改善融资、预期和风险偏好，进一步强化行情。", status: "观点支撑" },
  { key: "反方", title: "最强反方观点", body: "半导体此前跌幅较深，一天的大涨可能只是拥挤空头回补。若后续公司指引没有继续上修、上涨扩散失败，所谓反转很可能重新退化为震荡。", status: "必须保留" },
];

const packages = [
  {
    title: "美股一夜暴涨，A股科技跟涨：反转来了，还是又一次诱多？",
    hook: "昨晚，微软一天涨了15.5%。但如果你以为这是华尔街重新无脑相信AI，那可能正好理解反了。",
    cover: "反转，还是诱多？",
    type: "好问题", motive: "焦虑 + 好奇", keyword: "美股 / A股科技",
    conflict: "暴力反弹 × 趋势未确认", coverMode: "标题抛问题，封面压缩矛盾",
    visual: "紫红反包K线 + 冷黑背景", scores: { ctr: 94, search: 92, promise: 96, oral: 91 },
  },
  {
    title: "微软暴涨15.5%背后：市场终于看懂了AI投资的分水岭",
    hook: "同样是砸钱搞AI，为什么微软被资金疯抢，有些公司却越投越跌？市场真正奖励的只有四个字。",
    cover: "AI开始算利润账",
    type: "清晰结论", motive: "希望 + 好奇", keyword: "微软 / AI投资",
    conflict: "巨额投入 × 开始盈利", coverMode: "标题给分水岭，封面给结论",
    visual: "微软标识轮廓 + 发光利润曲线", scores: { ctr: 89, search: 96, promise: 92, oral: 94 },
  },
  {
    title: "A股科技反弹能走多远？先看懂昨夜美股的三个信号",
    hook: "今天A股科技股的反弹，起点其实不在A股，而在昨晚美国两份完全不同的成绩单。",
    cover: "科技反弹看三点",
    type: "好问题", motive: "实用 + 风险规避", keyword: "A股科技 / 美股",
    conflict: "A股上涨 × 起点在海外", coverMode: "标题给方法，封面给进度锚点",
    visual: "中美市场箭头 + 三个信号灯", scores: { ctr: 86, search: 95, promise: 94, oral: 96 },
  },
];

const initialScript = `昨晚，微软一天涨了百分之十五点五。

但如果你以为，这是华尔街重新开始无脑相信人工智能，那可能正好理解反了。

因为这一夜，市场奖励的不是“谁在人工智能上花钱最多”，而是“谁已经证明这些钱能变成收入和利润”。这两个逻辑看起来很像，结果却完全不同。

先看最直观的数字。微软公布业绩之后，股价创下接近十八年来最强的单日表现。纳斯达克指数上涨百分之二点八。半导体设备公司泛林集团上涨百分之十八。此前被连续抛售的芯片和人工智能产业链，出现了一次非常猛烈的修复。

到了今天白天，A股科技股也开始反弹。于是很多人马上得出结论：海外科技重新起飞，A股科技新一轮行情来了。

但问题没有这么简单。

这次上涨最重要的信号，不是涨幅，而是市场的奖励机制变了。

过去两年，只要一家公司宣布增加人工智能资本开支，市场通常会先兴奋。因为大家相信，算力投入越多，未来增长空间越大。但现在，投资者开始追问三个更现实的问题：这些服务器带来了多少新增收入？云业务的利润率有没有改善？投入一块钱，到底多久能够收回来？

微软之所以被资金追捧，是因为它给出了相对清晰的答案。人工智能需求不再只是发布会里的宏大故事，而是开始进入云业务收入、订单和利润。也就是说，市场看到的不是一个新的梦想，而是一张逐渐能够对账的利润表。

这对A股科技股有什么影响？

第一，海外龙头的资本开支如果继续保持强度，算力硬件、光模块、服务器、液冷和半导体设备，就仍然有真实需求支撑。这是产业层面的映射。

第二，美股科技股大涨会修复全球风险偏好。此前跌幅较大的A股科技公司弹性通常更高，所以资金会先交易情绪修复。这是估值和仓位层面的映射。

第三，也是最容易被忽略的一点，美股上涨并不意味着A股所有科技公司都应该一起涨。微软能够证明人工智能投入产生回报，不代表每一家算力公司、每一家芯片公司都能拿到同样的订单和利润。真正有持续性的公司，必须沿着客户、订单、收入和利润这条链逐级验证。

所以，这次到底是反转，还是诱多？

我的判断是：现在可以确认的是超跌修复，但还不能仅凭一个交易日确认趋势反转。

为什么？

因为真正的趋势反转，至少还需要三个条件。

第一个条件，是上涨必须从少数财报超预期的龙头，扩散到更广泛的半导体公司。如果只有微软和少数设备股上涨，那更像个股财报行情；如果存储、设备、设计、制造和软件连续获得盈利上修，才说明产业预期整体改变。

第二个条件，是接下来的公司指引不能掉链子。股价可以靠空头回补涨一天，但盈利预测要靠订单和收入才能连续上调。如果后续财报只讲资本开支、不讲回报，市场很可能重新担心投入过度。

第三个条件，是A股科技反弹之后要出现成交和基本面的双重确认。仅仅因为美股昨晚大涨，A股早盘高开，这叫情绪映射；高开之后还能放量、分化后龙头仍然稳住，并且公司订单得到验证，才叫趋势形成。

这其实很像霍华德·马克斯经常强调的一个问题：好资产和好投资不是一回事，关键还要看你支付了什么价格。人工智能当然可能是未来十年最重要的产业趋势，但如果市场提前把十年的增长全部算进今天的价格，再优秀的公司也会产生巨大波动。

索罗斯的反身性也能解释眼前的行情。股价上涨会改善市场情绪，降低融资成本，吸引更多资金，再进一步推高股价。这个过程可以自我强化。但反身性不是永动机，一旦盈利无法兑现，正反馈也会迅速倒转。

回到今天的交易。

如果你只看见“半导体暴涨”，很容易追在情绪最热的时候。如果你看见的是“市场开始区分能够兑现回报的人工智能投入，和仍然停留在故事里的投入”，你关注的就不再是整个板块，而是产业链中最先出现订单和利润验证的环节。

所以接下来，不要只盯着指数红不红。重点观察三件事：海外科技公司的盈利预测是否继续上修，人工智能资本开支是否带来可量化回报，以及A股科技龙头能否用订单和业绩接住海外映射。

昨夜的暴涨说明，资金并没有彻底放弃人工智能。但今天的反弹，还没有证明风险已经全部解除。

市场真正进入的新阶段，不是重新相信所有人工智能故事，而是开始给每一个故事算账。

而当市场开始算账，最大的机会和最大的陷阱，往往会同时出现。`;

const steps = ["选题确认", "研究底稿", "包装确认", "纯口播稿", "花生成片", "数据回流"];

export function CreatorWorkflow({ notify }: { notify: (message: string) => void }) {
  const [projectId, setProjectId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState(defaultTopic);
  const [topicApproved, setTopicApproved] = useState(false);
  const [packageIndex, setPackageIndex] = useState(0);
  const [packageApproved, setPackageApproved] = useState(false);
  const [script, setScript] = useState(initialScript);
  const [archived, setArchived] = useState(false);
  const [poeApiKey, setPoeApiKey] = useState("");
  const [poeModel, setPoeModel] = useState("gpt-image-2");
  const [coverPrompt, setCoverPrompt] = useState("");
  const [coverImages, setCoverImages] = useState<{ landscape?: string; portrait?: string }>({});
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [coverError, setCoverError] = useState("");
  const [videoLink, setVideoLink] = useState("");
  const [metricResult, setMetricResult] = useState<any>(null);
  const [metricLoading, setMetricLoading] = useState(false);
  const [metricError, setMetricError] = useState("");

  useEffect(() => {
    const currentId = window.localStorage.getItem("financial-titan-current-project") || `project-${Date.now()}`;
    setProjectId(currentId);
    window.localStorage.setItem("financial-titan-current-project", currentId);
    const projects = JSON.parse(window.localStorage.getItem("financial-titan-projects") || "[]");
    const project = projects.find((item: any) => item.id === currentId);
    const raw = project ? JSON.stringify(project) : window.localStorage.getItem("financial-titan-workflow");
    if (!raw) { setHydrated(true); return; }
    try {
      const saved = JSON.parse(raw);
      setStep(saved.step ?? 0);
      setTopic(saved.topic ?? defaultTopic);
      setTopicApproved(Boolean(saved.topicApproved));
      setPackageIndex(saved.packageIndex ?? 0);
      setPackageApproved(Boolean(saved.packageApproved));
      setScript(saved.script ?? initialScript);
      setArchived(Boolean(saved.archived));
      setCoverPrompt(saved.coverPrompt || "");
      setCoverImages(saved.coverImages || {});
      setPoeApiKey(window.localStorage.getItem("financial-titan-poe-key") || "");
      const savedModel = window.localStorage.getItem("financial-titan-poe-model");
      setPoeModel(!savedModel || ["image2", "nano-banana-2", "gpt-image-2"].includes(savedModel.toLowerCase()) ? "gpt-image-2" : savedModel);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !projectId) return;
    window.localStorage.setItem("financial-titan-workflow", JSON.stringify({
      step, topic, topicApproved, packageIndex, packageApproved, script, archived, coverPrompt, coverImages,
    }));
    const projects = JSON.parse(window.localStorage.getItem("financial-titan-projects") || "[]");
    const record = {
      id: projectId,
      createdAt: projects.find((item: any) => item.id === projectId)?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      step, topic, topicApproved, packageIndex, packageApproved, script, archived,
      research: researchLayers,
      packaging: packages[packageIndex],
      coverPrompt, coverImages,
    };
    const index = projects.findIndex((item: any) => item.id === projectId);
    if (index >= 0) projects[index] = record; else projects.unshift(record);
    window.localStorage.setItem("financial-titan-projects", JSON.stringify(projects));
  }, [hydrated, projectId, step, topic, topicApproved, packageIndex, packageApproved, script, archived, coverPrompt, coverImages]);

  function createProject() {
    const id = `project-${Date.now()}`;
    window.localStorage.setItem("financial-titan-current-project", id);
    setProjectId(id);
    setStep(0); setTopic(defaultTopic); setTopicApproved(false); setPackageIndex(0);
    setPackageApproved(false); setScript(initialScript); setArchived(false); setCoverImages({});
    notify("已创建新项目，后续产出将自动保存");
  }

  useEffect(() => {
    if (poeApiKey) window.localStorage.setItem("financial-titan-poe-key", poeApiKey);
    else window.localStorage.removeItem("financial-titan-poe-key");
    window.localStorage.setItem("financial-titan-poe-model", poeModel);
  }, [poeApiKey, poeModel]);

  useEffect(() => {
    const selected = packages[packageIndex];
    setCoverPrompt(
      `为财经自媒体“金融巨子”设计高点击率视频封面。主题：${topic}。封面主锤字：“${selected.cover}”。` +
      `视觉方向：${selected.visual}。核心冲突：${selected.conflict}。风格：高级金融媒体、黑紫科技底色、强烈明暗对比、` +
      `单一视觉焦点、移动端缩略图清晰。必须准确呈现中文主锤字，避免小字、数据幻觉、股票代码、平台水印和复杂图表。`
    );
  }, [packageIndex, topic]);

  const cleanLength = useMemo(() => script.replace(/\s/g, "").length, [script]);
  const oralChecks = [
    { label: "长度在1000—3000字", ok: cleanLength >= 1000 && cleanLength <= 3000 },
    { label: "没有章节或分镜标签", ok: !/[【\[]?(镜头|画面|章节|Hook|开头)[】\]]?/i.test(script) },
    { label: "使用中文标点", ok: !/[A-Za-z\u4e00-\u9fa5][,.!?][\u4e00-\u9fa5]/.test(script) },
    { label: "包含反方观点与验证条件", ok: script.includes("还不能") && script.includes("条件") },
    { label: "第一句含可搜索主体", ok: script.trim().slice(0, 45).includes("微软") },
    { label: "避免AI腔排比否定", ok: !/不是[^。]{0,25}不是[^。]{0,25}而是/.test(script) },
    { label: "具备4个以上留存单元", ok: script.split(/\n\s*\n/).filter(Boolean).length >= 8 },
  ];
  const scriptReady = oralChecks.every((item) => item.ok);

  function approveTopic() {
    setTopicApproved(true);
    setStep(1);
    notify("选题已通过 Gate 1，研究底稿可以继续");
  }

  function approvePackage() {
    setPackageApproved(true);
    setStep(3);
    notify("标题、封面与 Hook 已通过 Gate 2");
  }

  async function copyScript() {
    await navigator.clipboard.writeText(script);
    notify("纯口播稿已复制，可直接粘贴到花生AI");
  }

  async function generateCover(format: "landscape" | "portrait") {
    if (!poeApiKey.trim()) throw new Error("请先填写 Poe API Key。");
    const isGptImage2 = poeModel.trim().toLowerCase() === "gpt-image-2";
    const aspectRatio = format === "landscape" ? (isGptImage2 ? "3:2" : "16:9") : (isGptImage2 ? "2:3" : "9:16");
    const response = await fetch("http://127.0.0.1:4318/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: poeApiKey,
        model: poeModel || "gpt-image-2",
        aspectRatio,
        prompt: `${coverPrompt}\n当前输出画幅：${aspectRatio}。请针对该画幅重新构图，不要从其他画幅裁切。`,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "封面生成失败");
    setCoverImages((current) => ({ ...current, [format]: payload.imageUrl }));
  }

  async function generateBothCovers() {
    setCoverGenerating(true);
    setCoverError("");
    try {
      await generateCover("landscape");
      await generateCover("portrait");
      notify("GPT-Image-2 已生成横版与竖版封面");
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : "封面生成失败");
    } finally {
      setCoverGenerating(false);
    }
  }

  async function collectPlatformMetrics() {
    if (!videoLink.trim()) return;
    setMetricLoading(true);
    setMetricError("");
    try {
      const response = await fetch("/api/platform-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: videoLink.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "页面读取失败");
      setMetricResult(payload);
      const existing = JSON.parse(window.localStorage.getItem("financial-titan-publication-links") || "[]");
      const currentUrl = videoLink.trim();
      const index = existing.findIndex((item: any) => item.contentId === projectId && item.inputUrl === currentUrl);
      const previous = index >= 0 ? existing[index] : null;
      const publication = {
        id: previous?.id || `publication-${Date.now()}`,
        contentId: projectId,
        inputUrl: currentUrl,
        snapshot: payload,
        history: [...(previous?.history || []), payload],
        status: "collected",
      };
      if (index >= 0) existing[index] = publication; else existing.push(publication);
      window.localStorage.setItem("financial-titan-publication-links", JSON.stringify(existing));
      notify(`${payload.platform} 页面数据已采集并保存`);
    } catch (error) {
      setMetricError(error instanceof Error ? error.message : "页面读取失败");
    } finally {
      setMetricLoading(false);
    }
  }

  function archive() {
    const existing = JSON.parse(window.localStorage.getItem("financial-titan-content-assets") || "[]");
    const asset = {
      id: projectId,
      createdAt: existing.find((item: any) => item.id === projectId)?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      topic,
      ...packages[packageIndex],
      script,
      research: researchLayers,
      coverPrompt,
      coverImages,
      status: "pending-production",
      metrics: {},
    };
    const index = existing.findIndex((item: any) => item.id === projectId);
    if (index >= 0) existing[index] = asset; else existing.unshift(asset);
    window.localStorage.setItem("financial-titan-content-assets", JSON.stringify(existing));
    setArchived(true);
    notify("已存入本地内容资产库");
  }

  return (
    <div className="studio">
      <div className="projectBar"><span><b>自动保存项目</b><small>{projectId || "正在初始化…"}</small></span><button className="ghost" onClick={createProject}>＋ 新建项目</button></div>
      <section className="studioStepper">
        {steps.map((label, index) => (
          <button key={label} className={`${index === step ? "current" : ""} ${index < step ? "passed" : ""}`} onClick={() => setStep(index)}>
            <i>{index < step ? "✓" : index + 1}</i><span>{label}</span>
          </button>
        ))}
      </section>

      {step === 0 && (
        <section className="studioPanel gatePanel">
          <div className="gateLabel">GATE 1 · EDITOR DECISION</div>
          <p className="eyebrow">SELECTED TOPIC</p>
          <h2>确认今天真正值得做的判断</h2>
          <textarea value={topic} onChange={(event) => setTopic(event.target.value)} aria-label="选题" />
          <div className="gateReasons">
            <span><b>时效</b>昨夜美股收盘，今日A股验证</span>
            <span><b>异动</b>纳指与AI链显著反弹</span>
            <span><b>联动</b>美股 → A股科技</span>
            <span><b>分歧</b>趋势反转 vs 超跌回补</span>
          </div>
          <div className="studioActions"><button className="primary" onClick={approveTopic}>{topicApproved ? "已确认，进入研究 →" : "确认选题并锁定 →"}</button></div>
        </section>
      )}

      {step === 1 && (
        <section className="studioPanel">
          <div className="studioTitle"><div><p className="eyebrow">RESEARCH BRIEF</p><h2>六层证据链</h2></div><button className="primary" onClick={() => setStep(2)}>研究完成，进入包装 →</button></div>
          <div className="researchGrid">
            {researchLayers.map((layer) => (
              <article key={layer.key}><div><b>{layer.key}</b><em>{layer.status}</em></div><h3>{layer.title}</h3><p>{layer.body}</p></article>
            ))}
          </div>
          <div className="researchConclusion"><b>一句话判断</b><p>这轮上涨确认了AI投资正在从“讲资本开支”进入“算投资回报”的阶段，但当前只能确认超跌修复；能否反转，要看盈利预测扩散、后续公司指引和A股订单验证。</p></div>
        </section>
      )}

      {step === 2 && (
        <section className="studioPanel gatePanel">
          <div className="gateLabel">GATE 2 · PACKAGING DECISION</div>
          <p className="eyebrow">TITLE · COVER · HOOK</p>
          <h2>包装承诺必须和正文判断一致</h2>
          <div className="packageList">
            {packages.map((item, index) => (
              <button key={item.title} className={packageIndex === index ? "selected" : ""} onClick={() => { setPackageIndex(index); setPackageApproved(false); }}>
                <i>{String(index + 1).padStart(2, "0")}</i>
                <span><b>{item.title}</b><small>开头：{item.hook}</small><em>封面：{item.cover}</em></span>
              </button>
            ))}
          </div>
          <div className="packageAudit">
            <div className="coverMock">
              <div className="coverChart"><i /><i /><i /><i /><i /></div>
              <span>金融巨子 · 跨市场</span>
              <strong>{packages[packageIndex].cover}</strong>
              <em>?!</em>
              <small>{packages[packageIndex].visual}</small>
            </div>
            <div className="packageLogic">
              <h3>标题 × Hook × 封面审计</h3>
              <dl>
                <div><dt>标题类型</dt><dd>{packages[packageIndex].type}</dd></div>
                <div><dt>受众动机</dt><dd>{packages[packageIndex].motive}</dd></div>
                <div><dt>搜索锚点</dt><dd>{packages[packageIndex].keyword}</dd></div>
                <div><dt>最强矛盾</dt><dd>{packages[packageIndex].conflict}</dd></div>
                <div><dt>封面分工</dt><dd>{packages[packageIndex].coverMode}</dd></div>
              </dl>
              <div className="packageScores">
                {Object.entries(packages[packageIndex].scores).map(([key, value]) => (
                  <span key={key}>
                    <small>{({ctr:"点击",search:"搜索",promise:"兑现",oral:"口语"} as Record<string, string>)[key]}</small>
                    <b>{value}</b><i><em style={{width:`${value}%`}} /></i>
                  </span>
                ))}
              </div>
              <p>缩略图检查：主锤字4—8字、唯一视觉焦点、黑紫科技底色。标题负责完整问题，封面不复读标题。</p>
            </div>
          </div>
          <div className="aiCoverStudio">
            <div className="aiCoverHeader">
              <div><p className="eyebrow">POE · GPT-IMAGE-2</p><h3>AI 双画幅封面</h3></div>
              <button className="primary" disabled={coverGenerating} onClick={generateBothCovers}>
                {coverGenerating ? "正在生成两个画幅…" : "生成横版 + 竖版"}
              </button>
            </div>
            <div className="poeConfig">
              <label>Poe API Key<input type="password" value={poeApiKey} onChange={(event) => setPoeApiKey(event.target.value)} placeholder="仅保存在当前浏览器" autoComplete="off" /></label>
              <label>模型<select value={poeModel} onChange={(event) => setPoeModel(event.target.value)}><option value="gpt-image-2">GPT-Image-2</option><option value="Nano-Banana-2">Nano-Banana-2（备用）</option></select></label>
            </div>
            <label className="coverPromptField">封面提示词<textarea value={coverPrompt} onChange={(event) => setCoverPrompt(event.target.value)} /></label>
            {coverError && <p className="coverError">{coverError}</p>}
            <div className="generatedCovers">
              <figure className="landscapeCover">
                {coverImages.landscape ? <img src={coverImages.landscape} alt="GPT-Image-2 生成的横版封面" /> : <div><b>横版</b><span>适配 YouTube、Bilibili</span></div>}
                <figcaption><span>横版封面</span>{coverImages.landscape && <span className="coverDownloads"><button onClick={() => downloadCover(coverImages.landscape!, "png", "金融巨子-横版封面")}>PNG</button><button onClick={() => downloadCover(coverImages.landscape!, "jpg", "金融巨子-横版封面")}>JPG</button></span>}</figcaption>
              </figure>
              <figure className="portraitCover">
                {coverImages.portrait ? <img src={coverImages.portrait} alt="GPT-Image-2 生成的竖版封面" /> : <div><b>竖版</b><span>适配抖音、TikTok、Shorts</span></div>}
                <figcaption><span>竖版封面</span>{coverImages.portrait && <span className="coverDownloads"><button onClick={() => downloadCover(coverImages.portrait!, "png", "金融巨子-竖版封面")}>PNG</button><button onClick={() => downloadCover(coverImages.portrait!, "jpg", "金融巨子-竖版封面")}>JPG</button></span>}</figcaption>
              </figure>
            </div>
            <p className="keyNotice">API Key 只保存在这台设备的浏览器中；点击生成时发送给本地接口，再由本地接口调用 Poe。</p>
          </div>
          <div className="studioActions"><button className="primary" onClick={approvePackage}>{packageApproved ? "已确认，进入成稿 →" : "确认这套包装 →"}</button></div>
        </section>
      )}

      {step === 3 && (
        <section className="studioPanel scriptPanel">
          <div className="studioTitle"><div><p className="eyebrow">PEANUT-READY SCRIPT</p><h2>纯口播编辑器</h2></div><div className="wordCount"><b>{cleanLength}</b> 字</div></div>
          <div className="scriptLayout">
            <textarea value={script} onChange={(event) => setScript(event.target.value)} aria-label="纯口播稿" />
            <aside>
              <h3>花生AI交付检查</h3>
              {oralChecks.map((item) => <span className={item.ok ? "ok" : "bad"} key={item.label}><i>{item.ok ? "✓" : "!"}</i>{item.label}</span>)}
              <p>这里只保留会被念出来的话。研究来源、章节名、镜头和素材说明不进入口播区。</p>
              <div className="retentionUnits">
                <b>留存单元</b>
                <span>1. 暴涨事实 → 奖励机制变了</span>
                <span>2. AI投入 → 开始算回报</span>
                <span>3. 美股信号 → A股映射</span>
                <span>4. 反转条件 → 三项验证</span>
                <span>5. 大师框架 → 新阶段判断</span>
              </div>
              <button className="ghost wide" onClick={copyScript}>复制纯口播稿</button>
              <button className="primary wide" disabled={!scriptReady} onClick={() => setStep(4)}>通过校验，交接花生 →</button>
            </aside>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="studioPanel productionPanel">
          <div className="productionHero"><div className="peanutLarge">花生 <b>AI</b></div><h2>文稿已准备，可以成片</h2><p>先复制纯口播稿，再打开花生AI粘贴。生成9:16与16:9两套母版，成片后回到这里登记。</p></div>
          <div className="productionChecklist">
            <span>① 复制口播稿</span><span>② 打开花生AI</span><span>③ 生成双画幅</span><span>④ 人工检查数字与素材</span>
          </div>
          <div className="studioActions center">
            <button className="ghost" onClick={copyScript}>复制口播稿</button>
            <button className="primary" onClick={() => window.open("https://www.huasheng.cn/", "_blank", "noopener,noreferrer")}>打开花生AI →</button>
            <button className="ghost" onClick={() => { archive(); setStep(5); }}>成片完成并存档</button>
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="studioPanel metricsPanel">
          <p className="eyebrow">PUBLISH & LEARN</p><h2>发布后数据回流</h2>
          <div className="archiveSuccess"><i>✓</i><div><b>{archived ? "内容已进入资产库" : "等待内容存档"}</b><span>粘贴公开视频链接，系统从页面读取可见指标并记录采集时间；无需手填数字。</span></div></div>
          <div className="linkCollector">
            <label>平台视频链接<input value={videoLink} onChange={(event) => setVideoLink(event.target.value)} placeholder="粘贴抖音、Bilibili、YouTube 或 TikTok 视频链接" /></label>
            <button className="primary" disabled={metricLoading || !videoLink.trim()} onClick={collectPlatformMetrics}>{metricLoading ? "正在读取页面…" : "读取并保存数据"}</button>
          </div>
          {metricError && <p className="coverError">{metricError}</p>}
          {metricResult && (
            <div className="metricResult">
              <div><b>{metricResult.platform}</b><span>{metricResult.title || "已识别视频页面"}</span><em>{new Date(metricResult.collectedAt).toLocaleString("zh-CN")}</em></div>
              <div className="metricCards">
                {[
                  ["播放", metricResult.metrics.views], ["点赞", metricResult.metrics.likes],
                  ["评论", metricResult.metrics.comments], ["转发", metricResult.metrics.shares],
                  ["收藏", metricResult.metrics.favorites],
                ].map(([label, value]) => <span key={String(label)}><small>{label}</small><b>{value === null ? "页面不可见" : Number(value).toLocaleString("zh-CN")}</b></span>)}
              </div>
              <p>{metricResult.note}</p>
            </div>
          )}
          <div className="unavailableMetrics"><b>公开视频页无法读取</b><span>3秒留存 · 完播率 · 观众画像 · 涨粉归因</span><small>这些指标只存在于创作者后台，系统不会猜测或伪造。</small></div>
          <div className="studioActions"><button className="ghost" onClick={() => setStep(0)}>开始下一条内容</button></div>
        </section>
      )}
    </div>
  );
}
