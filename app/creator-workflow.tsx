"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCover, localizeCoverUrl } from "./image-download";
import { apiUrl, readJsonResponse } from "./api-client";

const defaultTopic = "当前选题尚未锁定";

function communityInsightScore(item: any) {
  const text = `${item?.title || ""} ${item?.snippet || ""}`.replace(/\s+/g, " ");
  let score = 0;
  if (/我认为|我觉得|我更|在我看来|我们认为|因为|原因|逻辑|解释|预期|担心|质疑|分歧|争论|风险|估值|定价|资本开支|需求|供给|周期|反映|意味着|看多|看空|bullish|bearish|because|expect|concern|thesis|valuation|priced.?in/i.test(text)) score += 2;
  if (/但是|不过|反而|未必|除非|如果|可能|或许|为什么|关键在于|真正影响|不认同|低估|高估/i.test(text)) score += 1;
  if (/(^|[\s，。！？])我([们的在]|觉得|认为|担心|倾向)|@\w+.{0,80}(think|believe|expect)/i.test(text)) score += 1;
  if (/盘前早报|盘后速递|快讯|行情播报|收盘播报|涨幅|跌幅|创.{0,8}新高|报\d|收于|截至.{0,12}(上涨|下跌)/i.test(text) && score < 2) score -= 2;
  return score;
}

async function normalizeCoverReference(source: Blob) {
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = document.createElement("canvas");
    let normalized: Blob | null = null;
    const byteBudget = 420_000;
    const attempts = [
      { maxEdge: 1024, quality: 0.78 },
      { maxEdge: 896, quality: 0.68 },
      { maxEdge: 768, quality: 0.58 },
    ];
    for (const attempt of attempts) {
      const scale = Math.min(1, attempt.maxEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法处理封面参考图。");
      context.fillStyle = "#10141c";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      normalized = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("参考图标准化失败。")),
        "image/jpeg",
        attempt.quality,
      ));
      if (normalized.size <= byteBudget) break;
    }
    if (!normalized) throw new Error("参考图标准化失败。");
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("参考图读取失败。"));
      reader.readAsDataURL(normalized);
    });
  } finally {
    bitmap.close();
  }
}

function researchForTopic(currentTopic: string, context: any = {}) {
  const clean = currentTopic.trim() || defaultTopic;
  const text = clean.toLowerCase();
  const markets = Array.isArray(context?.markets) && context.markets.length ? context.markets : ["相关市场"];
  const evidence = Array.isArray(context?.evidence) ? context.evidence : [];
  const evidenceNames = evidence.slice(0, 5).map((item: any) => `${item.site || "来源待识别"}《${item.title || "标题缺失"}》`).join("；");
  const socialEvidence = evidence.filter((item: any) => item.social || /雪球|xueqiu|twitter|x\.com|reddit|微博|weibo/i.test(`${item.site || ""} ${item.url || ""}`));
  const socialDebate = socialEvidence.slice(0, 4).map((item: any) => `${item.site || "社交平台"}：${item.title || item.snippet || "讨论标题缺失"}`).join("；");
  const thesis = context?.thesis || `表面新闻已经出现，但真正值得讲的是它改变了哪条定价逻辑，以及这种改变能否继续传导。`;
  const trigger = context?.trigger || "事件触发点仍需从原始信源中确认";
  const isRmb = /人民币|离岸人民币|在岸人民币|美元.?人民币|usd.?cny|usd.?cnh|中间价/.test(text);
  const isYen = /日元|美元.?日元|美日|usd.?jpy|yen/.test(text);
  const isFx = isRmb || isYen || /汇率|外汇|干预|美元指数|欧元|英镑|韩元/.test(text);
  const isTech = /半导体|芯片|科技|人工智能|\bai\b/.test(text);
  const isPolicy = /央行|利率|降息|加息|政策|关税|监管/.test(text);
  const coreConcept = isRmb
    ? "人民币变化如何同时影响跨境资金、进口成本、出口利润和A股估值"
    : isYen
      ? "日元变化如何穿透套息仓位并改变全球资金成本"
      : isFx
        ? "汇率变化通过资金成本与企业盈利进入股票定价的条件"
        : isTech ? "这轮上涨究竟是盈利兑现、估值修复，还是仓位回补" : isPolicy ? "政策变化通过哪一个价格变量进入股市，而不是政策口号本身" : "第一反应和真实传导之间的落差";
  const imageAnchor = isRmb
    ? "一架两端受力的天平：一边是外资与进口成本，另一边是出口收入，人民币变化让两边同时重新定价"
    : isYen
      ? "一部突然倒转的扶梯：借低息日元买高收益资产的人开始逆向回撤"
      : isFx
        ? "一组相连的齿轮：汇率先动，资金成本和企业利润随后以不同速度转动"
        : isTech ? "一张开始结账的餐桌：市场不再为菜单买单，只为已经端上来的利润买单" : "一排相连的水箱：新闻只倒进第一个水箱，资金成本决定水能不能流到后面";
  const retentionUnits = [
    `单元一｜用“${trigger}”里的最强异常打开，并在10—20秒内先交付一句核心判断方向；不一次剧透全部证据。`,
    `单元二｜先讲对核心判断解释力最大的因素，通常是盈利质量、估值锚或资金约束；讲清唯一概念“${coreConcept}”。`,
    `单元三｜再放行业消息、供应链、汇率或跨市场证据，作用是补强、限定或反驳主因；沿${markets.join(" → ")}确认真实先后顺序。`,
    `单元四｜段首提出一个由真实证据产生的矛盾，并在本段兑现：看似利好的信息为什么可能带来相反后果，或主因为什么仍解释不了某个价格反应。`,
    `单元五｜摆出最强反方和可观察条件，给出当前判断；结尾明确总结，把案例压缩成可复用的分析顺序，再用一个真实分歧引导评论、直接引导点赞关注，并用泛化表达承接持续更新，不预告具体题目。`,
  ];
  return [
    {
      key: "事实底座", title: "先确认能说出口的事实", status: "必用 · 硬门",
      body: `事件：${clean}。触发点：${trigger}。当前摘要：${thesis}。扫描记录为${context?.sourceCount ?? 0}个独立来源、${context?.authorityCount ?? 0}个高可信来源、${context?.socialCount ?? 0}个社交信号。可追溯证据：${evidenceNames || "历史项目未保存原始证据，生成前必须补证"}。数字、人名、时间和政策动作只能从这些原始证据确认，评分不能当作口播事实。`,
    },
    {
      key: "核心概念", title: "一条视频只讲透这一件事", status: "只选一个",
      body: `建议聚焦：${coreConcept}。与这个概念功能重叠的解释删掉；历史案例、大师观点和行业背景只有在能让这条因果更清楚时才使用，不能为了“显得深”强行凑齐。`,
    },
    {
      key: "平台适配", title: "长稿不是把所有材料平均铺开", status: "写前决策",
      body: `本项目交付1000—3000字中视频口播。完整稿只围绕一个判断展开；后续拆短版时，从长稿中单独抽出最反常识、最有冲突的一个单元讲透，禁止把整篇平均压缩成五个浅观点。`,
    },
    {
      key: "传播通道", title: "先分清搜索需求和推荐需求", status: "后台实证",
      body: `先判断本题属于搜索型、推荐型还是双引擎。搜索型必须准确兑现用户会输入的主体、最新动作、冲击数字和时间；推荐型必须让没有主动搜索的人也能立刻理解谁获益、谁承担成本、价格为什么反常；双引擎两者都要做到。传播通道决定开头优先兑现什么，但不能替代下面单独设计的前60秒结构。`,
    },
    {
      key: "前60秒", title: "开头必须完成一次完整交付", status: "四段时间验收",
      body: `① 2秒出现异常：用“${trigger}”中最反常、最具体且可核验的结果起手，不用背景铺垫。\n② 5秒说清事件：明确说出本次主体及其最新动作或价格反应，不能只说“出大事了”。\n③ 15秒说明与股民关系：回答它会改变哪类股票、估值、盈利预期或资金选择，让普通股民知道为什么值得继续听。\n④ 60秒完成第一轮因果闭环：在约前300字内说清“发生了什么—最主要原因是什么—为什么进入股价”，即使观众只听一分钟，也应得到一个完整判断。历史29条抖音作品显示平均观看时长比封面点击率更能解释播放差异，因此这四项是独立创作单元；成稿会逐窗验收，失败则自动触发前60秒专项重写。`,
    },
    {
      key: "市场分歧", title: "先看投资者在争论什么，再决定哪里值得深挖", status: "讨论证据层",
      body: `研究阶段已冻结${socialEvidence.length}条具有观点增量的雪球、X/Twitter社区证据；盘前早报、价格涨跌、创新高/新低、公告转述等纯客观事实，即使来自社交平台也已降级，不得为了提到“X”而写入口播。保留的价值必须来自人的思考：对原因的解释、预期差、估值或产业逻辑、担忧与质疑、最强反方、情绪拥挤或什么条件会推翻判断。具体以每条证据的平台、作者、摘要和链接为准。这不是平台完整信息流，也不能代表全体用户。主要讨论线索：${socialDebate || "当前尚未捕获有观点增量的社区讨论，不能凭空编造市场情绪"}。正文引用时先说清“这个人/这类投资者在怎么解释、为什么这样判断”，再说明我是否认同以及它缺哪条验证；不能把“X上的盘前早报说某板块下跌、金价创新高”当成社区洞察。必须保留样本边界，不能写成“全网都认为”“市场一致认为”，不能虚构原帖、用户名、点赞数、持仓和原话。财报数字、公司动作与实时价格仍须回到公告、交易所、行情或高可信媒体核验。`,
    },
    {
      key: "情绪弧线", title: "信息要推动观众的感受变化", status: "可调整草图",
      body: `开头先用“${clean.slice(0, 34)}”的异常制造困惑，并迅速给出一句核心判断方向；中段按解释力从主因到次因展开，在“${coreConcept}”处形成由证据推动的认知转折；结尾明确总结判断，再交付一套类似事件可复用的观察顺序，让观众获得掌控感。分析完成后再自然承接互动与下一篇，不让内容戛然而止。情绪服务于事实，不能靠夸张词硬煽动。`,
    },
    {
      key: "收尾互动", title: "让结论落地，并给观众一个继续留下来的理由", status: "每篇必用",
      body: `先完整总结“${clean.slice(0, 42)}”的核心判断和失效条件，再从本期真实分歧中提出一个观众能回答的问题；问题只能讨论原因、证据或验证顺序，不能询问持仓、成本或买卖计划。随后必须直接说出“点赞”和“关注”：请认可本期分析的观众点赞，并说明关注“金融巨子”后能持续获得基于最新热点的深度市场分析。最后只用“下期咱们继续拆最新市场变化”这类泛化表达承接持续更新，不得预告下一篇的具体公司、事件、数据、市场、观点或题目，也不写“明天必发”等排期承诺。互动、点赞、关注和承接合计一至三句，不强制要求转发。`,
    },
    {
      key: "叙述关系", title: "先和观众站在同一边，再承担判断", status: "人设与距离",
      body: `默认主播不是站在讲台上教育股民，而是和普通投资者一起面对同一条新闻、同一段波动和同一种信息不对称。这不是可选语气：开头前五分之一必须至少一次用“咱们”或“我们”建立共同处境；核心推演的不同位置至少两次用“我”承担真实判断、取舍或不确定性；后文再带观众共同验证。海外公司或非A股主题也要从中国股民熟悉的矛盾进入，例如利好落地却下跌、现金回报与增长预期冲突，不能因为观众未必持有相关证券就退回新闻播报。“咱们”用于普通股民能共感的处境，“我们”用于一起推演和观察。账号名“金融巨子”只在确有记忆点或人设承接价值时偶尔自称，通常零至一次；不能每段报号。亲近感不能靠虚构持仓、交易、亏损、收益或亲历；不能只重复“你”，也不能把代词集中塞在一段应付检查。`,
    },
    {
      key: "个股表达", title: "给出深度判断，但不把分析写成交易指令", status: "具体证券护栏",
      body: `如果主题涉及单一上市公司或具体证券，核心问题必须是“哪条盈利或定价假设发生了变化”，而不是替观众决定买、卖、持有或仓位。所谓“关键信号”只能是可由财报、公告、经营数据和市场价格继续验证的证据变量，不能被写成入场、离场、加减仓或目标价触发器。每个信号都要讲清当前证据、影响盈利或估值的机制、偏强与偏弱两种解释、下一份可核验数据以及什么事实会推翻当前判断。可以明确说“按目前证据，我更倾向于哪种解释”，不能说“满足这个条件就可以上车”“持有的拿稳”“跌到某价就买”，也不能用抄底、最后机会、主升浪等暗语绕开。结尾必须给观察顺序和判断边界，不以“仅供参考、不构成投资建议”替代正文约束。`,
    },
    {
      key: "留存单元", title: "五个能单独成立、又彼此咬合的单元", status: "动态4—6个",
      body: retentionUnits.join("\n"),
    },
    {
      key: "信息增量", title: "每一段都要比新闻标题深一层", status: "逐段淘汰",
      body: `逐段追问：90%的目标观众是否已经知道？如果知道，就增加一种真正有用的东西——有来源的数字和可感知对比、反直觉推论、或再往后一步的市场后果。材料按对核心判断的解释力排序：估值、盈利质量或资金约束等主因先讲，行业消息、供应链、汇率等次因随后补强或限定。每段开头只设置一个能在本段回答的真实矛盾，禁止用连续设问冒充留存。`,
    },
    {
      key: "表达手艺", title: "给观众留下一个能成像的记忆锚点", status: "可选弹药",
      body: `可尝试意象：${imageAnchor}。它只有比专业概念更好懂、且符合中国观众日常经验时才保留。博主要用“我”的判断说话，但真实事件与演绎必须分开；没有来源的具体细节宁可删掉，不要编造。`,
    },
    {
      key: "终审护栏", title: "成稿前换一双眼睛", status: "黄色提醒 · 不阻止使用",
      body: `逐项检查：第一句含可搜索主体；关键数据有明确主体和时间；观点后有证据；因果没有跳步；正文设问都有回答；无结构标注和废话过场；标题承诺得到明确回答；结尾给出可核验的观察指标，并在分析收口后包含自然的互动问题，直接说出“点赞”和“关注”，给出具体关注理由和泛化的下期承接，不预告具体题目。涉政策与敏感议题按官方口径表达。涉及具体证券时，再检查标题、开头、指标解释与结尾是否暗含买卖、持仓、仓位、点位或收益承诺；互动不得询问观众持仓、成本或操作计划，免责声明不能抵消正文中的交易指令。`,
    },
  ];
}


const steps = ["选题确认", "研究底稿", "包装确认", "纯口播稿", "花生成片", "数据回流"];
const methodologyVersion = 8;

function coverDirectionForPackage(selected: any) {
  const questionLed = selected.type === "好问题" || /\?|？/.test(selected.cover || "");
  const riskLed = /恐惧|风险|警告|暴跌|跳水|出逃|冲击|禁令|制裁/.test(`${selected.motive || ""} ${selected.conflict || ""} ${selected.cover || ""}`);
  const opportunityLed = /希望|机会|反弹|暴涨|抢筹|新高|修复/.test(`${selected.motive || ""} ${selected.conflict || ""} ${selected.cover || ""}`);
  return {
    archetype: questionLed ? "氛围纪录型、主体主导" : "财经周刊型、大字主导",
    visualHierarchy: questionLed
      ? "主视觉是唯一第一落点，主锤字是紧随其后的第二落点；二者不能同样大。"
      : "主锤字本身就是唯一第一落点，主视觉退为一个清晰但次一级的证据符号。",
    emotion: riskLed ? "危险正在逼近的压迫感" : opportunityLed ? "资金突然转向带来的兴奋与不安并存" : "旧共识被打破的紧迫和疑问",
    signalColor: riskLed ? "警报红" : opportunityLed ? "克制金" : "冷白",
  };
}

export function CreatorWorkflow({ notify, selectedTopic, selectedTopicData, startRequestId = 0, editProjectId = "" }: { notify: (message: string) => void; selectedTopic?: string; selectedTopicData?: any; startRequestId?: number; editProjectId?: string }) {
  const [projectId, setProjectId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState(defaultTopic);
  const [topicContext, setTopicContext] = useState<any>({});
  const [topicApproved, setTopicApproved] = useState(false);
  const [packageIndex, setPackageIndex] = useState(0);
  const [packageApproved, setPackageApproved] = useState(false);
  const [script, setScript] = useState("");
  const [archived, setArchived] = useState(false);
  const [poeApiKey, setPoeApiKey] = useState("");
  const [poeModel, setPoeModel] = useState("gpt-image-2");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [scriptModel, setScriptModel] = useState("deepseek-v4-pro");
  const [scriptGenerating, setScriptGenerating] = useState(false);
  const [scriptWaitSeconds, setScriptWaitSeconds] = useState(0);
  const [scriptError, setScriptError] = useState("");
  const [scriptWarning, setScriptWarning] = useState("");
  const [scriptProvenance, setScriptProvenance] = useState<any>(null);
  const [socialRefreshing, setSocialRefreshing] = useState(false);
  const [socialRefreshError, setSocialRefreshError] = useState("");
  const [packagingOptions, setPackagingOptions] = useState<any[]>([]);
  const [packagingGenerating, setPackagingGenerating] = useState(false);
  const [packagingError, setPackagingError] = useState("");
  const [packagingProvenance, setPackagingProvenance] = useState<any>(null);
  const [coverPrompt, setCoverPrompt] = useState("");
  const [coverImages, setCoverImages] = useState<{ landscape?: string; portrait?: string }>({});
  const [coverMaterial, setCoverMaterial] = useState<any>(null);
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [coverError, setCoverError] = useState("");
  const [huashengStatus, setHuashengStatus] = useState<any>(null);
  const [huashengTask, setHuashengTask] = useState<any>(null);
  const [huashengMode, setHuashengMode] = useState("auto");
  const [huashengAspect, setHuashengAspect] = useState("9:16");
  const [huashengLoading, setHuashengLoading] = useState(false);
  const [huashengError, setHuashengError] = useState("");
  const [videoLink, setVideoLink] = useState("");
  const [metricResult, setMetricResult] = useState<any>(null);
  const [metricLoading, setMetricLoading] = useState(false);
  const [metricError, setMetricError] = useState("");
  const currentResearch = useMemo(() => researchForTopic(topic, topicContext), [topic, topicContext]);
  const currentPackages = packagingOptions;
  const selectedPackage = currentPackages[packageIndex] || {
    title: topic, hook: "", cover: "", type: "", motive: "", keyword: topic.slice(0, 28),
    conflict: "", coverMode: "", visual: "", visualSubjectType: "non_human", namedPerson: "", scores: { ctr: 0, search: 0, promise: 0, oral: 0 },
  };
  const contextEvidenceCount = Array.isArray(topicContext?.evidence) ? topicContext.evidence.length : 0;
  const frozenSocialEvidence = Array.isArray(topicContext?.evidence)
    ? topicContext.evidence.filter((item: any) => item?.social)
    : [];

  useEffect(() => {
    if (!scriptGenerating) { setScriptWaitSeconds(0); return; }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setScriptWaitSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [scriptGenerating]);

  // 首页点击“用这个选题开稿”后，工坊直接切换到该实时选题；不再继续沿用旧项目标题。
  useEffect(() => {
    // Opening the workshop is read-only. Only an explicit start request may create an asset.
    if (!hydrated || startRequestId <= 0 || !selectedTopic?.trim()) return;
    const nextTopic = selectedTopic.trim();
    const projects = JSON.parse(window.localStorage.getItem("financial-titan-projects") || "[]");
    const consumedStartRequestId = Number(window.localStorage.getItem("financial-titan-last-start-request") || 0);
    const explicitRestart = startRequestId > 0 && startRequestId !== consumedStartRequestId;
    const shouldStartFresh = explicitRestart;
    if (shouldStartFresh) {
      if (explicitRestart) window.localStorage.setItem("financial-titan-last-start-request", String(startRequestId));
      // 同一次开稿请求始终映射到同一个项目 ID，流程推进只覆盖更新这一条记录。
      const nextId = `project-${startRequestId}`;
      window.localStorage.setItem("financial-titan-current-project", nextId);
      setProjectId(nextId);
    }
    if (shouldStartFresh) {
      setTopic(nextTopic);
      setTopicContext(selectedTopicData ? JSON.parse(JSON.stringify(selectedTopicData)) : { title: nextTopic });
      setTopicApproved(false);
      setPackageIndex(0);
      setPackagingOptions([]);
      setPackagingError("");
      setPackagingProvenance(null);
      setPackageApproved(false);
      setScript("");
      setScriptProvenance(null);
      setCoverImages({});
      setCoverMaterial(null);
      setCoverPrompt("");
      setCoverError("");
      setHuashengTask(null);
      setHuashengError("");
      setArchived(false);
      setVideoLink("");
      setMetricResult(null);
      setMetricError("");
      setStep(0);
    }
  }, [hydrated, selectedTopic, startRequestId]);

  useEffect(() => {
    // 从首页开稿时直接使用请求 ID 初始化，避免先创建临时项目、随后再创建正式项目。
    const currentId = editProjectId || (startRequestId > 0 ? `project-${startRequestId}` : "");
    setProjectId(currentId);
    if (currentId) window.localStorage.setItem("financial-titan-current-project", currentId);
    const projects = JSON.parse(window.localStorage.getItem("financial-titan-projects") || "[]");
    const project = projects.find((item: any) => item.id === currentId);
    const raw = project ? JSON.stringify(project) : null;
    setPoeApiKey(window.localStorage.getItem("financial-titan-poe-key") || "");
    setDeepseekApiKey(window.localStorage.getItem("financial-titan-deepseek-key") || "");
    if (!raw) { setHydrated(true); return; }
    try {
      const saved = JSON.parse(raw);
      setStep(saved.step ?? 0);
      setTopic(saved.topic ?? defaultTopic);
      setTopicContext(saved.topicContext || { title: saved.topic ?? defaultTopic, note: "历史项目未保存原始扫描上下文" });
      setTopicApproved(Boolean(saved.topicApproved));
      setPackageIndex(saved.packageIndex ?? 0);
      setPackagingOptions(Array.isArray(saved.packagingOptions) ? saved.packagingOptions : (saved.packaging ? [saved.packaging] : []));
      setPackagingProvenance(saved.packagingProvenance || null);
      setPackageApproved(Boolean(saved.packageApproved));
      setScript(saved.script ?? "");
      setArchived(Boolean(saved.archived));
      setCoverPrompt(saved.coverPrompt || "");
      setCoverImages(saved.coverImages || {});
      setCoverMaterial(saved.coverMaterial || null);
      setHuashengTask(saved.huashengTask || null);
      setHuashengMode(saved.huashengMode || "auto");
      setHuashengAspect(saved.huashengAspect || "9:16");
      const savedModel = window.localStorage.getItem("financial-titan-poe-model");
      setPoeModel(!savedModel || ["image2", "nano-banana-2", "gpt-image-2"].includes(savedModel.toLowerCase()) ? "gpt-image-2" : savedModel);
      const savedScriptModel = window.localStorage.getItem("financial-titan-script-model") || "";
      const normalizedScriptModel = savedScriptModel.trim().toLowerCase();
      setScriptModel(["deepseek-v4-pro", "deepseek-v4-flash"].includes(normalizedScriptModel) ? normalizedScriptModel : "deepseek-v4-pro");
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !projectId) return;
    window.localStorage.setItem("financial-titan-workflow", JSON.stringify({
      methodologyVersion, step, topic, topicContext, topicApproved, packageIndex, packageApproved, packagingOptions, packagingProvenance, script, archived, coverPrompt, coverImages, coverMaterial, huashengTask, huashengMode, huashengAspect,
    }));
    const projects = JSON.parse(window.localStorage.getItem("financial-titan-projects") || "[]");
    const record = {
      id: projectId,
      createdAt: projects.find((item: any) => item.id === projectId)?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      methodologyVersion,
      step, topic, topicContext, topicApproved, packageIndex, packageApproved, packagingOptions, packagingProvenance, script, archived,
      research: currentResearch,
      packaging: currentPackages[packageIndex],
      coverPrompt, coverImages, coverMaterial, huashengTask, huashengMode, huashengAspect,
    };
    const index = projects.findIndex((item: any) => item.id === projectId);
    if (index >= 0) projects[index] = record; else projects.unshift(record);
    window.localStorage.setItem("financial-titan-projects", JSON.stringify(projects));
  }, [hydrated, projectId, step, topic, topicContext, topicApproved, packageIndex, packageApproved, packagingOptions, packagingProvenance, script, archived, coverPrompt, coverImages, coverMaterial, huashengTask, huashengMode, huashengAspect]);

  useEffect(() => {
    if (poeApiKey) window.localStorage.setItem("financial-titan-poe-key", poeApiKey);
    else window.localStorage.removeItem("financial-titan-poe-key");
    if (deepseekApiKey) window.localStorage.setItem("financial-titan-deepseek-key", deepseekApiKey);
    else window.localStorage.removeItem("financial-titan-deepseek-key");
    window.localStorage.setItem("financial-titan-poe-model", poeModel);
    window.localStorage.setItem("financial-titan-script-model", scriptModel);
  }, [poeApiKey, deepseekApiKey, poeModel, scriptModel]);

  // peanutcut methodology：封面控制观众的 0.5 秒，基因层固定，变量层只换文案与视觉锤。
  useEffect(() => {
    const selected = currentPackages[packageIndex];
    if (!selected) { setCoverPrompt(""); return; }
    const direction = coverDirectionForPackage(selected);
    const allowNamedPerson = selected.visualSubjectType === "named_real_person" && Boolean(selected.namedPerson?.trim());
    const sensitiveTopic = /台湾|香港|澳门|新疆|西藏/.test(topic);
    const subjectConstraint = sensitiveTopic
      ? "本题涉及敏感地域，画面禁止出现人物、旗帜和国徽，只能使用中性的金融概念场景。"
      : allowNamedPerson
        ? `本题核心事实明确指向具名真实人物“${selected.namedPerson}”。只允许出现这一位人物，并且必须以经过验证的真实参考图为身份依据；保留可识别面部特征，禁止虚构另一张脸、替身、随从、群众或第二个人。`
        : "本题不是人物主题。画面绝对禁止出现任何人类、脸、五官、头部、身体、手、人物剪影、背影、群众、人偶、雕塑人像、微缩小人、假人模特和任何类人轮廓。即使参考素材里带有人物，也必须完全删除人物，只保留与事件相关的非人物实体、环境、材质或价格张力。不得用一个没有身份的AI假人充当财经主题。";
    setCoverPrompt(
      `为一条面向中文投资者的财经视频设计高点击封面。观众在信息流里只有零点五秒：先认出话题对象，再感到“${direction.emotion}”，最后被一个没有在标题里说完的信息缺口拉住。封面不是新闻摘要，也不是把所有市场元素摆上桌。\n\n` +
      `本期标题是：“${selected.title}”。它只供你理解内容，绝对不能原样出现在画面。标题和封面是两块广告位，本期分工是“${selected.coverMode}”：标题负责交代问题和搜索对象，封面负责给出更锋利的情绪或判断。两者合起来必须比单看标题多一层信息，不能近义改写。\n\n` +
      `先认领这张图的物种：${direction.archetype}。${direction.visualHierarchy}本期最强矛盾是“${selected.conflict}”，把它压成一个一眼能认出的视觉锤：“${selected.visual}”。主体轮廓要完整、硬朗、有真实材质，不能溶进背景。除非第二元素能直接构成矛盾，否则只保留一个主体。\n\n` +
      `系列审美基因固定为“高压财经调查纪录片 × 国际商业周刊封面”：石墨黑到深海军蓝的低饱和底色，硬切的电影级定向光，真实纸张或金属的细微颗粒，锐利边缘，高明暗反差，紧凑的编辑排版。只使用一种信号色——${direction.signalColor}——并把它集中在视觉锤或关键文字上，不能全屏染色。质感必须权威但不冷淡，紧张但不廉价；避免塑料高光、泛滥霓虹、通用AI科技蓝和模板化新闻海报。每期只换主视觉与主锤字，构图逻辑、材质、字体气质和色彩纪律保持系列一致。不要出现账号名、Logo、角标或水印。\n\n` +
      `画面只允许出现一个中文文字块，逐字写成：“${selected.cover}”。这是承诺，不是说明文字；使用超粗、紧凑、有压迫感的中文黑体，四到八个汉字优先，最多两行。不得自行增加副标题、英文、股票代码、数字标签或标点装饰。逐字正确、笔画完整，缩成手机信息流里的指甲盖大小仍能瞬间读出。文字和主体之间必须有明确负空间，不能覆盖面部、物件关键轮廓或高亮区域。\n\n` +
      `情绪必须先由主视觉、光影和信号色成立，不能只靠读字。不要用“震惊脸”、廉价爆炸、金币雨或夸张符号替代真实冲突。底图只负责建立环境和纵深，细节一律退后；如果缩小后出现两个视觉中心，删除较弱的那个。\n\n` +
      `${subjectConstraint}\n` +
      `所有封面一律禁止地图、旗帜、国徽、虚假新闻截图、密集K线、坐标轴、图例、微小数字、多图拼贴、多标志、赛博界面、金币雨、牛熊雕像、外边框和平台界面。除非上文明确批准唯一具名真实人物，否则同时禁止任何人形元素。如果使用图表，只能用一个极简的方向形状传递情绪，不能承担具体数据展示。\n\n` +
      `出图前把封面缩小到手机信息流里的指甲盖大小检查：话题能否认出，第一落点是否唯一，主锤字是否逐字完整，情绪是否在读字之前成立，标题与封面是否互补。任何一项不成立，只能删元素、放大第一落点、扩大负空间或增强局部对比，不能继续堆信息。`
    );
  }, [currentPackages, packageIndex, topic]);

  const cleanLength = useMemo(() => script.replace(/\s/g, "").length, [script]);
  const oralChecks = [
    { label: "长度在1000—3000字", ok: cleanLength >= 1000 && cleanLength <= 3000 },
    { label: "没有章节或分镜标签", ok: !/[【\[]?(镜头|画面|章节|Hook|开头)[】\]]?/i.test(script) },
    { label: "创作底稿只在幕后，不按卡片报菜名", ok: !/事实底座|核心概念层|情绪弧线|留存单元|信息增量层|终审护栏/.test(script) },
    { label: "使用中文标点", ok: !/[A-Za-z\u4e00-\u9fa5][,.!?][\u4e00-\u9fa5]/.test(script) },
    { label: "给出边界或验证条件", ok: /如果|除非|一旦|验证|确认|观察/.test(script) },
    { label: "开头含可搜索主体", ok: script.slice(0, 160).includes(selectedPackage.keyword) || script.slice(0, 160).includes(topic.slice(0, 6)) },
    { label: "开头10—20秒交付核心判断方向", ok: /我的判断|我更倾向|我认为|核心原因|核心判断|核心矛盾|关键在于|关键是|主因|本质|说明|意味着|反映|定价|估值|资金|盈利|风格切换/.test(script.replace(/\s/g, "").slice(0, 220)) },
    { label: "避免AI腔排比否定", ok: !/不是[^。]{0,25}不是[^。]{0,25}而是/.test(script) },
    { label: "段落形成自然留存节奏", ok: script.split(/\n\s*\n/).filter(Boolean).length >= 6 },
    { label: "避免连续套路式设问", ok: (script.match(/？/g) || []).length <= 3 },
    { label: "结尾有自然互动问题", ok: /你(?:更|会|怎么看|认为|在意)|你们(?:更|怎么看|认为)|评论区|留言/.test(script.replace(/\s/g, "").slice(-420)) },
    { label: "结尾直接引导点赞和关注", ok: /点赞/.test(script.replace(/\s/g, "").slice(-420)) && /(?:关注.{0,10}(?:金融巨子|账号|我)|(?:金融巨子|这个账号).{0,8}关注|点个关注|记得关注)/.test(script.replace(/\s/g, "").slice(-420)) },
    { label: "结尾说明关注价值并自然承接下期", ok: /关注/.test(script.replace(/\s/g, "").slice(-420)) && /下一篇|下一期|下期|下回|继续(?:聊|拆|跟踪|看)/.test(script.replace(/\s/g, "").slice(-420)) },
  ];
  const oralWarningCount = oralChecks.filter((item) => !item.ok).length;

  async function refreshSocialEvidence(topicValue = topic, contextValue = topicContext) {
    const cleanTopic = topicValue.trim();
    if (!cleanTopic || socialRefreshing) return contextValue;
    setSocialRefreshing(true);
    setSocialRefreshError("");
    try {
      const response = await fetch(apiUrl("/api/social-search"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries: [`${cleanTopic} 投资者讨论 分歧`] }),
        signal: AbortSignal.timeout(120_000),
      });
      const payload = await readJsonResponse(response, "社区证据采集");
      if (!response.ok || !payload.ok) throw new Error(payload.error || "雪球与X社区证据采集失败");
      const regularEvidence = (Array.isArray(contextValue?.evidence) ? contextValue.evidence : [])
        .filter((item: any) => !item?.social);
      const rawSocialEvidence = (Array.isArray(payload.references) ? payload.references : []).map((item: any) => ({
        title: item.title || "",
        snippet: item.snippet || "",
        url: item.url || "",
        site: item.website || (item.platform === "xueqiu" ? "雪球" : "X/Twitter"),
        publishedAt: item.published_time || "",
        social: true,
        platform: item.platform || "",
        author: item.author || "",
        engagement: item.engagement || {},
        query: item.query || cleanTopic,
      }));
      const socialEvidence = rawSocialEvidence.filter((item: any) => communityInsightScore(item) >= 2);
      const nextContext = {
        ...contextValue,
        evidence: [...regularEvidence, ...socialEvidence],
        socialCount: socialEvidence.length,
        socialEvidence: {
          refreshedAt: new Date().toISOString(),
          query: cleanTopic,
          count: socialEvidence.length,
          rawCount: rawSocialEvidence.length,
          discardedObjectiveCount: rawSocialEvidence.length - socialEvidence.length,
          channels: payload.channels || {},
        },
      };
      setTopicContext(nextContext);
      notify(`研究底稿已冻结 ${socialEvidence.length} 条有观点增量的社区证据；过滤 ${rawSocialEvidence.length - socialEvidence.length} 条纯事实播报`);
      return nextContext;
    } catch (error) {
      const message = error instanceof Error ? error.message : "社区证据采集失败";
      setSocialRefreshError(message);
      notify(`社区证据未能补齐：${message}`);
      return contextValue;
    } finally {
      setSocialRefreshing(false);
    }
  }

  async function approveTopic() {
    setTopicApproved(true);
    await refreshSocialEvidence(topic, topicContext);
    setStep(1);
    notify("选题已通过 Gate 1，研究底稿可以继续");
  }

  async function generatePackaging() {
    if (!deepseekApiKey.trim()) {
      setPackagingError("请先填写页面绑定的 DeepSeek API Key，再生成标题、Hook 和封面包装。");
      return;
    }
    setPackagingGenerating(true);
    setPackagingError("");
    setPackagingProvenance(null);
    try {
      const response = await fetch(apiUrl("/api/generate-packaging"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: deepseekApiKey,
          model: scriptModel || "deepseek-v4-pro",
          topic,
          topicContext,
          research: currentResearch,
        }),
        signal: AbortSignal.timeout(600_000),
      });
      const payload = await readJsonResponse(response, "动态包装");
      if (!response.ok) throw new Error(payload.error || "DeepSeek 包装生成失败");
      const receipts = payload?.provenance?.receipts;
      if (!Array.isArray(receipts) || !receipts.length || !receipts.every((item: any) => item?.responseId)) {
        throw new Error("DeepSeek 未返回可核验的模型回执，本次包装结果已拒绝写入。");
      }
      if (!Array.isArray(payload.packages) || payload.packages.length !== 3) {
        throw new Error("DeepSeek 没有返回完整的三套包装方案，请重新生成。");
      }
      setPackagingOptions(payload.packages);
      setPackagingProvenance(payload.provenance);
      setPackageIndex(0);
      setPackageApproved(false);
      setCoverImages({});
      setCoverMaterial(null);
      setCoverError("");
      setStep(2);
      notify("DeepSeek 已基于当前选题与研究底稿生成三套包装方案");
    } catch (error: any) {
      setPackagingError(error?.message || "DeepSeek 包装生成失败");
    } finally {
      setPackagingGenerating(false);
    }
  }

  async function approvePackage() {
    setPackageApproved(true);
    setStep(3);
    if (deepseekApiKey.trim()) await generateScript();
    else notify("包装已确认；填写 DeepSeek API Key 后即可生成口播稿");
  }

  async function generateScript() {
    if (!deepseekApiKey.trim()) {
      setScriptError("请先填写 DeepSeek API Key。");
      return;
    }
    setScriptGenerating(true);
    setScriptError("");
    setScriptWarning("");
    setScriptProvenance(null);
    try {
      const response = await fetch(apiUrl("/api/generate-script"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: deepseekApiKey,
          model: scriptModel || "deepseek-v4-pro",
          topic,
          topicContext,
          research: currentResearch,
          packaging: selectedPackage,
          packagingOptions: currentPackages,
          workflowContext: {
            topicApproved,
            packageApproved,
            editorialJudgment: `围绕“${topic}”区分已确认事实、市场推断和待验证条件；重点解释跨市场传导，而不是复述新闻。`,
            targetLength: "1000—3000个汉字",
            outputForm: "可直接交给花生AI的纯口播正文",
          },
        }),
        signal: AbortSignal.timeout(600_000),
      });
      const payload = await readJsonResponse(response, "动态创作底稿");
      if (!response.ok) throw new Error(payload.error || "大模型写稿失败");
      const receipts = payload?.provenance?.receipts;
      if (!Array.isArray(receipts) || receipts.length === 0 || !receipts.every((item: any) => item?.responseId)) {
        throw new Error("DeepSeek 未返回可核验的生成回执，本次结果已拒绝写入。旧稿未更新。");
      }
      setScript(payload.script);
      setScriptProvenance(payload.provenance);
      if (payload.warning) setScriptWarning(payload.warning);
      notify(`${payload.model} 已完成主笔创作和独立终审`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "大模型写稿失败";
      setScriptError(/timeout|aborted/i.test(message) ? "写稿与自动成稿修复总等待超过10分钟，已停止等待。请稍后重试。" : message);
    } finally {
      setScriptGenerating(false);
    }
  }

  async function selectCoverMaterial() {
    const baiduApiKey = window.localStorage.getItem("financial-titan-baidu-key") || "";
    if (!baiduApiKey.trim()) throw new Error("请先在首页配置百度 WebSearch API Key，封面需要先搜索主题素材再做图生图。");
    const selected = currentPackages[packageIndex];
    const response = await fetch(apiUrl("/api/cover-material"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: baiduApiKey, topic, title: selected.title, visual: selected.visual, allowPerson: selected.visualSubjectType === "named_real_person" && Boolean(selected.namedPerson?.trim()), namedPerson: selected.namedPerson || "" }),
    });
    const payload = await readJsonResponse(response, "封面素材搜索");
    if (!response.ok) throw new Error(payload.error || "主题素材搜索失败");
    const imageResponse = await fetch(apiUrl(`/api/image-source?url=${encodeURIComponent(payload.selected.imageUrl)}&pageUrl=${encodeURIComponent(payload.selected.pageUrl || "")}`));
    if (!imageResponse.ok) throw new Error("已选主题素材无法下载，未继续生成封面。");
    const blob = await imageResponse.blob();
    const referenceImage = await normalizeCoverReference(blob);
    const material = { ...payload.selected, query: payload.query, requestId: payload.requestId, selectedAt: new Date().toISOString() };
    setCoverMaterial(material);
    return { material, referenceImage };
  }

  async function generateCover(format: "landscape" | "portrait", referenceImage: string) {
    if (!poeApiKey.trim()) throw new Error("请先填写 Poe API Key。");
    const aspectRatio = format === "landscape" ? "4:3" : "3:4";
    const layoutRules = format === "portrait"
      ? `这是3:4竖版信息流封面，必须从零按纵向空间重新设计，绝不能把横版裁成竖版。纵向视线顺序为“安全区内的主锤字—中部唯一主视觉—底部纯背景缓冲区”。主锤字禁止放在画面顶端：文字框上沿必须从画布高度22%以下开始，文字框整体只能位于高度22%至44%的带状区域；画布顶部0%至20%必须保持为没有文字、数字、标点和主体关键轮廓的纯背景缓冲带。主体位于中部并保持完整轮廓。文字最多两行，每行在水平和垂直方向都完整居中；短句优先一行，放不下时均衡拆成两行并主动缩小字号，绝不允许任何一个汉字贴边或被裁。不要把横版的左右分栏硬挤成上下两块。`
      : `这是横版中视频封面，必须从零按横向空间重新设计，绝不能拉伸或裁切竖版。采用不对称的三七构图：视觉锤占约六成，干净文字负空间占约四成；根据主体朝向选择左图右字或右图左字，让视线从主体自然落到主锤字。四周留至少百分之九安全边距，文字块宽度不超过百分之四十二，主体关键轮廓不能被边缘截断。不要居中对称摆放，也不要把主体和文字压成两个同等重量的方块。`;
    const safeAreaRules = format === "portrait"
      ? `3:4竖版建立两层不可越过的安全框。全局主体安全框：左边界16%，右边界78%，顶部16%，底部74%。更严格的文字安全框：左边界18%，右边界76%，顶部22%，底部44%。主锤字的字框、阴影、描边、辉光以及每一个笔画都必须完整落在文字安全框内，文字上方至少保留相当于一个汉字高度的空白。右侧22%、顶部20%和底部26%只能放可裁切的无关背景。文字块宽度不超过画面58%、高度不超过18%；如果字号与安全框冲突，必须缩小字号和行距，不得移动文字框越界。`
      : `4:3横版建立不可越过的中央安全框：左右、顶部和底部各留画布12%，全部文字、主体完整轮廓、脸部或核心识别特征必须位于中央76%宽、76%高的安全框内。安全框之外只能延展可裁切的无关背景、光影和纹理。文字块宽度不超过画面38%。`;
    const response = await fetch(apiUrl("/api/generate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: poeApiKey,
        model: poeModel || "gpt-image-2",
        projectId,
        format,
        aspectRatio,
        referenceImage,
        allowPerson: selectedPackage.visualSubjectType === "named_real_person" && Boolean(selectedPackage.namedPerson?.trim()),
        namedPerson: selectedPackage.namedPerson || "",
        prompt: `${coverPrompt}\n\n本次只生成${format === "portrait" ? "竖版" : "横版"}，目标画幅为 ${aspectRatio}。${layoutRules}\n${safeAreaRules}\n背景必须做满整个画布，但所有有意义的信息都必须收进安全框。禁止文字、头部、手部、产品边缘或主体关键部件贴边、出血、越界或被截断。即使平台从四边轻微裁切，主视觉和主锤字仍必须完整。${format === "portrait" ? "最终出图前必须做文字边界复核：从画布顶部向下20%的区域内不得出现任何文字像素；若主锤字、描边或阴影触碰该区域，重新排版并缩小字号，不能输出越界版本。此条优先级高于前文任何关于文字位置的描述。" : ""}`,
      }),
    });
    const payload = await readJsonResponse(response, "封面生成");
    if (!response.ok) throw new Error(payload.error || "封面生成失败");
    setCoverImages((current) => ({ ...current, [format]: localizeCoverUrl(payload.imageUrl) }));
  }

  async function generateBothCovers() {
    setCoverGenerating(true);
    setCoverError("");
    try {
      const { material, referenceImage } = await selectCoverMaterial();
      await generateCover("landscape", referenceImage);
      await generateCover("portrait", referenceImage);
      notify(`已自动选用“${material.title}”作为主题素材，并生成双画幅封面`);
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
      const response = await fetch(apiUrl("/api/platform-metrics"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: videoLink.trim() }),
      });
      const payload = await readJsonResponse(response, "投稿数据读取");
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
      window.dispatchEvent(new Event("financial-titan-publications-updated"));
      notify(`${payload.platform} 页面数据已采集并保存`);
    } catch (error) {
      setMetricError(error instanceof Error ? error.message : "页面读取失败");
    } finally {
      setMetricLoading(false);
    }
  }

  async function refreshHuashengStatus(silent = false) {
    if (!silent) {
      setHuashengLoading(true);
      setHuashengError("");
    }
    try {
      const response = await fetch(apiUrl("/api/huasheng/status"));
      const payload = await readJsonResponse(response, "花生登录检测");
      if (!response.ok || !payload.ok) throw new Error(payload.error || "花生状态检测失败");
      setHuashengStatus(payload);
    } catch (error) {
      if (!silent) setHuashengError(error instanceof Error ? error.message : "花生状态检测失败");
    } finally {
      if (!silent) setHuashengLoading(false);
    }
  }

  async function loginHuasheng() {
    setHuashengLoading(true);
    setHuashengError("");
    try {
      const response = await fetch(apiUrl("/api/huasheng/login"), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const payload = await readJsonResponse(response, "花生登录");
      if (!response.ok || !payload.ok) throw new Error(typeof payload.error === "string" ? payload.error : JSON.stringify(payload.error));
      if (!payload.authUrl) throw new Error("花生 CLI 没有返回授权地址，请重新点击登录。");
      notify(payload.message || "已打开花生授权页");
      window.setTimeout(() => void refreshHuashengStatus(), 4000);
    } catch (error) {
      setHuashengError(error instanceof Error ? error.message : "无法打开花生登录");
    } finally {
      setHuashengLoading(false);
    }
  }

  async function makeHuashengVideo() {
    if (!script.trim()) { setHuashengError("当前项目还没有可用口播稿。"); return; }
    const confirmed = window.confirm("花生确认分镜后会真实扣除积分，并把当前口播稿上传到花生用于成片。确认现在开始吗？");
    if (!confirmed) return;
    setHuashengLoading(true);
    setHuashengError("");
    try {
      const response = await fetch(apiUrl("/api/huasheng/make"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, script, mode: huashengMode, aspect: huashengAspect, confirmedCharge: true }),
      });
      const payload = await readJsonResponse(response, "花生成片");
      if (!response.ok || !payload.ok) throw new Error(typeof payload.error === "string" ? payload.error : JSON.stringify(payload.error));
      setHuashengTask(payload.task);
      notify("花生成片任务已提交，页面会自动跟踪进度");
    } catch (error) {
      setHuashengError(error instanceof Error ? error.message : "花生成片提交失败");
    } finally {
      setHuashengLoading(false);
    }
  }

  useEffect(() => {
    if (step !== 4) return;
    void refreshHuashengStatus();
  }, [step]);

  useEffect(() => {
    if (step !== 4 || !huashengStatus?.installed || huashengStatus?.authenticated) return;
    const timer = window.setInterval(() => void refreshHuashengStatus(true), 4000);
    return () => window.clearInterval(timer);
  }, [step, huashengStatus?.installed, huashengStatus?.authenticated]);

  useEffect(() => {
    const taskId = huashengTask?.taskId;
    if (!taskId || !["queued", "running"].includes(huashengTask.status)) return;
    const poll = async () => {
      try {
        const response = await fetch(apiUrl(`/api/huasheng/task?id=${encodeURIComponent(taskId)}`));
        const payload = await readJsonResponse(response, "花生任务状态");
        if (response.ok && payload.ok) setHuashengTask(payload.task);
        else setHuashengError(payload.error || "花生任务状态读取失败");
      } catch (error) {
        setHuashengError(error instanceof Error ? error.message : "花生任务状态读取失败");
      }
    };
    const timer = window.setInterval(() => void poll(), 5000);
    void poll();
    return () => window.clearInterval(timer);
  }, [huashengTask?.taskId, huashengTask?.status]);

  function archive() {
    const existing = JSON.parse(window.localStorage.getItem("financial-titan-content-assets") || "[]");
    const asset = {
      id: projectId,
      createdAt: existing.find((item: any) => item.id === projectId)?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      topic,
      ...selectedPackage,
      script,
      research: currentResearch,
      coverPrompt,
      coverImages,
      huashengTask,
      videoFile: huashengTask?.status === "ready" ? huashengTask.downloadUrl : "",
      status: huashengTask?.status === "ready" ? "produced" : "pending-production",
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
      <section className="studioStepper">
        {steps.map((label, index) => (
          <button key={label} className={`${index === step ? "current" : ""} ${index < step ? "passed" : ""}`} onClick={() => { if (index === 2 && !currentPackages.length) { void generatePackaging(); return; } setStep(index); }}>
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
          <div className="studioActions"><button className="primary" disabled={socialRefreshing} onClick={approveTopic}>{socialRefreshing ? "正在采集雪球与X证据…" : topicApproved ? "已确认，进入研究 →" : "确认选题并锁定 →"}</button></div>
        </section>
      )}

      {step === 1 && (
        <section className="studioPanel">
          <div className="studioTitle"><div><p className="eyebrow">PEANUTCUT CREATIVE BRIEF</p><h2>动态创作底稿</h2></div><button className="primary" disabled={packagingGenerating || socialRefreshing || !deepseekApiKey.trim()} onClick={generatePackaging}>{packagingGenerating ? "DeepSeek 正在生成包装…" : "底稿确认，用大模型生成包装 →"}</button></div>
          <div className="poeConfig"><label>DeepSeek API Key<input type="password" value={deepseekApiKey} onChange={(event) => setDeepseekApiKey(event.target.value)} placeholder="仅保存在当前浏览器" autoComplete="off" /></label><label>包装模型<select value={scriptModel} onChange={(event) => setScriptModel(event.target.value)}><option value="deepseek-v4-pro">DeepSeek V4 Pro</option><option value="deepseek-v4-flash">DeepSeek V4 Flash</option></select></label></div>
          {packagingError && <p className="coverError">{packagingError}</p>}
          <div className="socialEvidencePanel">
            <div><b>社区争议证据</b><span>{topicContext?.socialEvidence?.refreshedAt ? `冻结于 ${new Date(topicContext.socialEvidence.refreshedAt).toLocaleString("zh-CN")}` : "尚未采集"}</span><button className="ghost" disabled={socialRefreshing} onClick={() => void refreshSocialEvidence()}>{socialRefreshing ? "正在刷新…" : "刷新社区证据"}</button></div>
            {socialRefreshError && <p className="coverError">{socialRefreshError}</p>}
            {frozenSocialEvidence.length ? <div className="socialEvidenceList">{frozenSocialEvidence.slice(0, 12).map((item: any, index: number) => <a href={item.url} target="_blank" rel="noopener noreferrer" key={item.url || `${item.title}-${index}`}><i>{item.site || "社区"}</i><span><b>{item.author || "公开用户"}</b><small>{item.snippet || item.title}</small></span><em>↗</em></a>)}</div> : <p>当前项目还没有可用的雪球/X帖子。点击刷新后，采集结果和渠道诊断会保存进本项目；没有证据时，后续模型不得虚构社区观点。</p>}
            {topicContext?.socialEvidence?.channels && <small className="socialEvidenceDiagnostic">原始召回 {topicContext.socialEvidence.rawCount ?? frozenSocialEvidence.length} 条 · 观点证据 {frozenSocialEvidence.length} 条 · 过滤纯事实播报 {topicContext.socialEvidence.discardedObjectiveCount || 0} 条　雪球：{topicContext.socialEvidence.channels.xueqiu?.count || 0} 条{topicContext.socialEvidence.channels.xueqiu?.error ? ` · ${topicContext.socialEvidence.channels.xueqiu.error}` : ""}　X：{topicContext.socialEvidence.channels.twitter?.count || 0} 条{topicContext.socialEvidence.channels.twitter?.error ? ` · ${topicContext.socialEvidence.channels.twitter.error}` : ""}</small>}
          </div>
          <div className="researchGrid">
            {currentResearch.map((layer) => (
              <article key={layer.key}><div><b>{layer.key}</b><em>{layer.status}</em></div><h3>{layer.title}</h3><p>{layer.body}</p></article>
            ))}
          </div>
          <div className="researchConclusion"><b>使用原则</b><p>底稿不是正文目录，也不是八项必答题。可核验事实与安全边界是硬门；表达、节奏和交付检查只做黄色提醒，不阻止继续使用。核心概念只选一个；历史案例、大师观点和意象没有增量就直接舍弃。</p></div>
        </section>
      )}

      {step === 2 && (
        <section className="studioPanel gatePanel">
          <div className="gateLabel">GATE 2 · PACKAGING DECISION</div>
          <p className="eyebrow">TITLE · COVER · HOOK</p>
          <h2>包装承诺必须和正文判断一致</h2>
          {!currentPackages.length && <div className="researchConclusion"><b>尚未生成包装</b><p>包装不再使用本地规则或历史模板。请返回研究底稿，使用 DeepSeek 基于本次选题、事件证据和底稿重新生成。</p><button className="primary" disabled={packagingGenerating || !deepseekApiKey.trim()} onClick={generatePackaging}>{packagingGenerating ? "DeepSeek 正在生成包装…" : "用 DeepSeek 生成三套包装"}</button></div>}
          <div className="packageList">
            {currentPackages.map((item, index) => (
              <button key={item.title} className={packageIndex === index ? "selected" : ""} onClick={() => { setPackageIndex(index); setPackageApproved(false); setCoverImages({}); setCoverMaterial(null); setCoverError(""); }}>
                <i>{String(index + 1).padStart(2, "0")}</i>
                <span><b>{item.title}</b><small>开头：{item.hook}</small><em>封面：{item.cover}</em></span>
              </button>
            ))}
          </div>
          <div className="packageAudit">
            <div className="coverMock">
              <div className="coverChart"><i /><i /><i /><i /><i /></div>
              <strong>{selectedPackage.cover}</strong>
              <small>{selectedPackage.visual}</small>
            </div>
            <div className="packageLogic">
              <h3>标题 × Hook × 封面审计</h3>
              <dl>
                <div><dt>标题类型</dt><dd>{selectedPackage.type}</dd></div>
                <div><dt>受众动机</dt><dd>{selectedPackage.motive}</dd></div>
                <div><dt>搜索锚点</dt><dd>{selectedPackage.keyword}</dd></div>
                <div><dt>最强矛盾</dt><dd>{selectedPackage.conflict}</dd></div>
                <div><dt>封面分工</dt><dd>{selectedPackage.coverMode}</dd></div>
                <div><dt>封面类型</dt><dd>{coverDirectionForPackage(selectedPackage).archetype}</dd></div>
                <div><dt>情绪信号</dt><dd>{coverDirectionForPackage(selectedPackage).emotion} · {coverDirectionForPackage(selectedPackage).signalColor}</dd></div>
              </dl>
              <div className="packageScores">
                {Object.entries(selectedPackage.scores as Record<string, number>).map(([key, value]) => (
                  <span key={key}>
                    <small>{({ctr:"点击",search:"搜索",promise:"兑现",oral:"口语"} as Record<string, string>)[key]}</small>
                    <b>{value}</b><i><em style={{width:`${value}%`}} /></i>
                  </span>
                ))}
              </div>
              <p>缩略图检查：话题、情绪和主锤字在0.5秒内成立；第一落点唯一；标题与封面互补。横竖版共享审美基因，但分别重新构图。</p>
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
                {coverImages.landscape ? <img src={localizeCoverUrl(coverImages.landscape)} alt="GPT-Image-2 生成的4:3横版封面" /> : <div><b>横版 4:3</b><span>适配 Bilibili 等横版封面</span></div>}
                <figcaption><span>横版封面 · 4:3</span>{coverImages.landscape && <span className="coverDownloads"><button onClick={() => downloadCover(coverImages.landscape!, "png", "金融巨子-横版封面")}>PNG</button><button onClick={() => downloadCover(coverImages.landscape!, "jpg", "金融巨子-横版封面")}>JPG</button></span>}</figcaption>
              </figure>
              <figure className="portraitCover">
                {coverImages.portrait ? <img src={localizeCoverUrl(coverImages.portrait)} alt="GPT-Image-2 生成的3:4竖版封面" /> : <div><b>竖版 3:4</b><span>适配抖音、小红书等竖版封面</span></div>}
                <figcaption><span>竖版封面 · 3:4</span>{coverImages.portrait && <span className="coverDownloads"><button onClick={() => downloadCover(coverImages.portrait!, "png", "金融巨子-竖版封面")}>PNG</button><button onClick={() => downloadCover(coverImages.portrait!, "jpg", "金融巨子-竖版封面")}>JPG</button></span>}</figcaption>
              </figure>
            </div>
            {(coverImages.landscape || coverImages.portrait) && <p className="coverQaNotice">出图复核：主视觉完整轮廓与全部文字必须在中央安全框内。4:3 四边各留至少12%；3:4 顶部20%禁止出现文字，主锤字必须完整位于画面高度22%—44%，右侧22%和底部26%只放可裁背景。任何主体或文字贴边、越界、截断，都单独重新生成该画幅。</p>}
            <p className="keyNotice">API Key 只保存在这台设备的浏览器中；点击生成时发送给本地接口，再由本地接口调用 Poe。</p>
          </div>
          <div className="studioActions"><button className="primary" disabled={!currentPackages.length} onClick={approvePackage}>{packageApproved ? "已确认，进入成稿 →" : "确认这套包装 →"}</button></div>
        </section>
      )}

      {step === 3 && (
        <section className="studioPanel scriptPanel">
          <div className="studioTitle"><div><p className="eyebrow">DEEPSEEK · PEANUTCUT METHOD</p><h2>大模型纯口播创作</h2></div><div className="wordCount"><b>{cleanLength}</b> 字</div></div>
          <div className="poeConfig">
            <label>DeepSeek API Key<input type="password" value={deepseekApiKey} onChange={(event) => setDeepseekApiKey(event.target.value)} placeholder="仅保存在当前浏览器" autoComplete="off" /></label>
            <label>写稿模型<select value={scriptModel} onChange={(event) => setScriptModel(event.target.value)}><option value="deepseek-v4-pro">DeepSeek V4 Pro（推荐）</option><option value="deepseek-v4-flash">DeepSeek V4 Flash（更快）</option></select></label>
            <button className="primary" disabled={scriptGenerating || !deepseekApiKey.trim()} onClick={generateScript}>{scriptGenerating ? `模型处理中 · ${scriptWaitSeconds}秒` : script ? "用大模型重新创作" : "用大模型生成口播稿"}</button>
          </div>
          {scriptError && <p className="coverError">{scriptError}</p>}
          {scriptWarning && <p className="keyNotice">⚠ {scriptWarning}</p>}
          {scriptProvenance ? (
            <p className="keyNotice">已核验 DeepSeek API 调用：{scriptProvenance.callCount} 次 · 实际模型 {scriptProvenance.receipts?.[0]?.actualModel || scriptModel} · 回执 {scriptProvenance.receipts?.map((item: any) => item.responseId).join("、")}</p>
          ) : script ? (
            <p className="coverError">当前文本是此前保留的旧稿，不代表本次 DeepSeek 调用成功；只有出现 DeepSeek 回执后才是新生成稿。</p>
          ) : null}
          <div className="researchConclusion"><b>本次发送给模型的完整上下文</b><p>原始热点事件、事件摘要、触发时间与新鲜度、{topicContext?.markets?.length || 0} 个涉及市场、来源与社交统计、{contextEvidenceCount} 条原始证据、硬门和评分依据、动态创作底稿、已选标题、Hook、核心矛盾、搜索锚点及交付要求。历史项目若当时未保存原始扫描数据，会明确标记而不会伪造补齐。</p></div>
          <p className="keyNotice">动态创作底稿是写前决策与可选弹药，不是正文结构。系统围绕一个核心概念创作，再由独立总编终审；不会逐卡片扩写。</p>
          <div className="scriptLayout">
            <textarea value={script} onChange={(event) => setScript(event.target.value)} aria-label="纯口播稿" placeholder={scriptGenerating ? "DeepSeek 正在完成主笔创作和独立终审，请稍候……" : "填写 DeepSeek API Key，然后点击“用大模型生成口播稿”。"} />
            <aside>
              <h3>花生AI交付检查</h3>
              {oralChecks.map((item) => <span className={item.ok ? "ok" : "bad"} key={item.label}><i>{item.ok ? "✓" : "!"}</i>{item.label}</span>)}
              <p>{oralWarningCount ? `当前有 ${oralWarningCount} 项编辑提醒，仅供你判断，不阻止继续。` : "当前没有发现明显的口播交付问题。"} 最终是否采纳由你决定。</p>
              <button className="primary wide" disabled={!script.trim() || scriptGenerating} onClick={() => setStep(4)}>{oralWarningCount ? "保留提醒，继续交接花生 →" : "交接花生 →"}</button>
            </aside>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="studioPanel productionPanel">
          <div className="productionHero"><div className="peanutLarge">花生 <b>CLI</b></div><h2>文稿已准备，直接成片</h2><p>当前口播稿会由本地 huasheng-cli 直接提交、等待渲染并下载成片，不再复制文案或跳转花生网页。只有首次登录需要打开官方授权页。</p></div>
          <div className="productionChecklist">
            <span>① 检测本机登录</span><span>② 选择成片模式</span><span>③ 明确确认积分</span><span>④ 自动下载成片</span>
          </div>
          <div className="huashengCliCard">
            <div className="huashengCliStatus">
              <i className={huashengStatus?.authenticated ? "ready" : "pending"}>{huashengStatus?.authenticated ? "✓" : "!"}</i>
              <div><b>{huashengStatus?.authenticated ? "花生账号已连接" : huashengStatus?.installed === false ? "尚未安装 huasheng-cli" : "等待花生登录"}</b><span>{huashengStatus?.authenticated ? "本机凭据有效，可以直接提交成片。" : "登录发生在花生官方授权页，账号密码不会进入本项目。"}</span></div>
              <button className="ghost" disabled={huashengLoading} onClick={huashengStatus?.authenticated ? () => void refreshHuashengStatus() : loginHuasheng}>{huashengStatus?.authenticated ? "重新检测" : "用 Chrome 授权"}</button>
            </div>
            <div className="huashengCliControls">
              <label>成片方式<select value={huashengMode} onChange={(event) => setHuashengMode(event.target.value)}><option value="auto">智能选择（推荐）</option><option value="clip">实拍素材剪辑</option><option value="mg">MG 动效</option></select></label>
              <label>视频画幅<select value={huashengAspect} onChange={(event) => setHuashengAspect(event.target.value)}><option value="9:16">9:16 竖版</option><option value="16:9">16:9 横版</option></select></label>
              <button className="primary" disabled={huashengLoading || !huashengStatus?.authenticated || ["queued", "running"].includes(huashengTask?.status)} onClick={makeHuashengVideo}>{["queued", "running"].includes(huashengTask?.status) ? "花生正在成片…" : "确认积分并开始成片"}</button>
            </div>
            {huashengTask && <div className={`huashengTask ${huashengTask.status}`}><b>{huashengTask.status === "ready" ? "成片已完成" : huashengTask.status === "failed" ? "成片失败" : "任务处理中"}</b><span>{huashengTask.status === "ready" ? "视频已经下载到本地资产目录。" : huashengTask.status === "failed" ? String(huashengTask.error || "花生未返回具体原因") : "页面每5秒读取一次任务状态，可以停留在本页等待。"}</span>{huashengTask.downloadUrl && <a href={huashengTask.downloadUrl} download>下载 MP4</a>}</div>}
            {huashengError && <p className="coverError">{huashengError}</p>}
            <p className="coverQaNotice">确认分镜会真实扣除花生积分且不可撤销；系统只在你点击确认后传入 <b>--yes</b>。本功能只生成并下载文件，不会自动公开发布到任何平台。</p>
          </div>
          <div className="studioActions center">
            <button className="ghost" disabled={huashengTask?.status !== "ready"} onClick={() => { archive(); setStep(5); }}>成片完成并存档</button>
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="studioPanel metricsPanel">
          <p className="eyebrow">PUBLISH & LEARN</p><h2>发布后数据回流</h2>
          <div className="archiveSuccess"><i>✓</i><div><b>{archived ? "内容已进入资产库" : "等待内容存档"}</b><span>粘贴公开视频链接，系统从页面读取可见指标并记录采集时间；无需手填数字。</span></div></div>
          <div className="linkCollector">
            <label>平台视频链接<input value={videoLink} onChange={(event) => setVideoLink(event.target.value)} placeholder="粘贴抖音、小红书、Bilibili、YouTube 或 TikTok 视频链接" /></label>
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
