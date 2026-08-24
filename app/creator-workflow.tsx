"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCover, localizeCoverUrl } from "./image-download";
import { apiUrl, readJsonResponse } from "./api-client";

const defaultTopic = "昨夜美股AI链暴力反弹，今天A股科技跟涨：反转来了，还是又一次诱多？";

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
    `单元一｜用“${trigger}”里的最强事实打开，不交代完整背景；收尾把问题转向“市场到底在重新定价什么”。`,
    `单元二｜拆掉观众最容易相信的表面解释，讲透唯一概念“${coreConcept}”；只保留一条主因果链。`,
    `单元三｜沿${markets.join(" → ")}寻找真实先后顺序；有价格或时间证据才写联动，没有就写成待验证。`,
    `单元四｜给一个“原来如此”的转折：最先上涨或下跌的资产未必是最终受益者，它也可能只是仓位最拥挤。`,
    `单元五｜摆出最强反方和两三个可观察条件，给出当前判断；结尾让观众带走一套观察方法，而不是一句涨跌预测。`,
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
      key: "市场分歧", title: "先看投资者在争论什么，再决定哪里值得深挖", status: "讨论证据层",
      body: `本次通过百度 WebSearch 捕获${socialEvidence.length}条被公开索引的雪球、X/Twitter等社区讨论、讨论页或媒体引用；这不是平台原生完整信息流，也不能代表全体用户。主要讨论线索：${socialDebate || "当前尚未捕获有效社区讨论，不能凭空编造市场情绪"}。写作时不要只报讨论数量，要从可见样本中提炼四项社区性内容：普通投资者最直接的困惑、当前最常见的解释、最有价值的反方质疑、财报或价格变化前后的情绪转折。把这些内容自然写成“雪球上现在争得最凶的是……”“X上的讨论更在意……”或“从目前能检索到的公开讨论看……”，用来提出观众真正关心的问题、承接反证或制造认知转折。必须保留样本边界，不能写成“全网都认为”“市场一致认为”，不能虚构原帖、用户名、点赞数、持仓和原话。社交内容只用于识别关注度、分歧、叙事和预期拥挤度；财报数字、公司动作和实时价格仍须回到公告、交易所、行情或高可信媒体核验，个别帖子的预测不能写成事实或市场共识。`,
    },
    {
      key: "情绪弧线", title: "信息要推动观众的感受变化", status: "可调整草图",
      body: `开头让观众因“${clean.slice(0, 34)}”产生紧迫和困惑；中段在“${coreConcept}”处给出原来如此的认知转折；结尾从追涨杀跌的焦虑，转成知道下一步该观察什么的掌控感。情绪服务于事实，不能靠夸张词硬煽动。`,
    },
    {
      key: "叙述关系", title: "先和观众站在同一边，再承担判断", status: "人设与距离",
      body: `默认主播不是站在讲台上教育股民，而是和普通投资者一起面对同一条新闻、同一段波动和同一种信息不对称。正文用“我”承担观点与判断，例如“我更在意的是”“我的判断是”；在共同利益、共同困惑和一起拆解问题时，自然使用“咱们”或“我们”，让观众感到主播也是市场参与者，而不是冷冰冰的新闻播报员。“咱们”优先用于普通股民能共感的处境，“我们”优先用于一起推演和观察。账号名“金融巨子”只在确有记忆点或人设承接价值时偶尔自称，不能每段报号、不能像广告口播。亲近感不能靠虚构持仓、交易、亏损、收益或亲历；没有证据只能表达观察和判断。全文要有同类感，但不能把所有观众武断地说成散户，也不要机械地在每段塞入人称。`,
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
      body: `逐段追问：90%的目标观众是否已经知道？如果知道，就增加一种真正有用的东西——有来源的数字和可感知对比、反直觉推论、或再往后一步的市场后果。不能用“大家都知道”的背景消耗时长，也不能把来源数量写进口播冒充信息增量。`,
    },
    {
      key: "表达手艺", title: "给观众留下一个能成像的记忆锚点", status: "可选弹药",
      body: `可尝试意象：${imageAnchor}。它只有比专业概念更好懂、且符合中国观众日常经验时才保留。博主要用“我”的判断说话，但真实事件与演绎必须分开；没有来源的具体细节宁可删掉，不要编造。`,
    },
    {
      key: "终审护栏", title: "成稿前换一双眼睛", status: "不过即打回",
      body: `逐项检查：第一句含可搜索主体；关键数据有明确主体和时间；观点后有证据；因果没有跳步；每个设问都有回答且开放问题最多一个；无结构标注和废话过场；标题承诺得到明确回答；结尾给出可核验的观察指标。涉政策与敏感议题按官方口径表达。涉及具体证券时，再检查标题、开头、指标解释与结尾是否暗含买卖、持仓、仓位、点位或收益承诺；免责声明不能抵消正文中的交易指令。`,
    },
  ];
}

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

function packagesForTopic(currentTopic: string, context: any = {}) {
  const clean = currentTopic.trim() || defaultTopic;
  const text = clean.toLowerCase();
  const isRmb = /人民币|离岸人民币|在岸人民币|美元.?人民币|usd.?cny|usd.?cnh|中间价/.test(text);
  const isYen = /日元|美元.?日元|美日|usd.?jpy|yen/.test(text);
  const isFx = /日元|美元.?日元|美日|汇率|外汇|干预|intervention|yen/.test(text);
  const isCurrency = isFx || isRmb || /人民币|美元指数|欧元|英镑|韩元|汇率|外汇/.test(text);
  const coverCopies = isRmb
    ? ["人民币突然走强", "外资要回流？", "A股谁先重估？"]
    : isYen
      ? ["日元突然走强", "套息交易松动？", "全球资金变向？"]
      : isCurrency
        ? ["汇率突然变盘", "资金要转向？", "谁会先重估？"]
    : /降息|加息|央行|美联储|利率|货币政策/.test(text)
      ? ["央行突然变脸", "降息交易反转？", "全球资产变盘"]
      : /半导体|芯片|科技|人工智能|\bai\b/.test(text)
        ? ["科技股杀回来了", "反弹还是陷阱？", "资金突然抢筹"]
        : /暴跌|大跌|跳水|崩|抛售/.test(text)
          ? ["市场突然跳水", "谁在疯狂出逃？", "风暴才刚开始？"]
          : /暴涨|大涨|反弹|新高|拉升/.test(text)
            ? ["资金突然疯抢", "这次真反转？", "行情要变天？"]
            : /关税|制裁|贸易|出口管制/.test(text)
              ? ["政策突然开火", "全球市场遭殃？", "谁会最先倒下？"]
              : /黄金|原油|铜|商品/.test(text)
                ? ["商品突然异动", "通胀要失控？", "资金正在避险"]
                : ["大资金突然转向", "市场严重误判？", "真正冲击来了"];
  const titles = isRmb
    ? [clean, "人民币升值背后，A股真正交易的是资金回流还是盈利重估？", "人民币这轮升值能走多远？盯住美元、外资和出口链三个确认"]
    : isYen
      ? [clean, "日元走强背后，全球市场真正担心的是汇率还是套息仓位？", "日元这轮异动能走多远？盯住美债、日股和风险资产三个确认"]
      : isCurrency
        ? [clean, `${clean}，股票市场真正交易的是哪条资金与盈利链？`, `${clean}能走多远？先看三个跨市场确认信号`]
    : [
      clean,
      `${clean}，市场最可能看错的不是方向，而是传导顺序`,
      `${clean}到底能走多远？先看三个确认信号`,
    ];
  const hooks = isRmb
    ? [
      "人民币突然走强，最先被重估的可能不是汇率本身，而是外资成本、进口利润和出口公司的业绩预期。",
      "同样是人民币升值，对航空、造纸和出口链的影响可能完全相反，A股不会只给出一个统一答案。",
      "人民币涨一天不等于趋势反转。真正的确认，要看美元、跨境资金和出口链盈利预期能不能同时接上。",
    ]
    : isYen
      ? [
        "日元突然走强，市场真正需要重算的不是一个汇率点位，而是借低息日元建立的全球仓位。",
        "一条日元行情为什么会传到美债、日股和高估值资产？关键在资金成本，而不是新闻标题。",
        "日元涨一天不叫变天，真正的确认是债券、日股和全球风险资产有没有按顺序跟随。",
      ]
      : isCurrency
        ? [
          `${clean}。汇率只是第一块屏幕，股票最终交易的是资金成本、企业盈利和风险偏好的变化。`,
          "汇率和股市同时变化不等于因果成立，先要找出谁先动、通过什么变量传导。",
          "一天异动不叫趋势，真正的确认要来自美元、债券、跨境资金和相关股票的连续反应。",
        ]
    : [
      `${clean}。表面上大家在争涨跌，真正决定后面行情的却是资金先从哪里撤、又往哪里去。`,
      `这条热点最容易看错的地方，是把同时发生当成因果。市场真正交易的顺序，可能正好相反。`,
      `别急着追第一根大阳线，也别被第一根大阴线吓跑。${clean}要成立，还缺三个确认信号。`,
    ];
  const conflict = isRmb ? "人民币升值 × A股行业分化" : isYen ? "日元走强 × 全球套息仓位" : isCurrency ? "汇率异动 × 资金与盈利重估" : "第一反应 × 真实传导";
  const visual = isRmb
    ? "一枚人民币汇率刻度向上抬升，外资流向与出口利润在两侧形成方向相反的拉力"
    : isYen
      ? "一枚日元汇率杠杆突然反向，低息资金链像绷紧的钢索开始回收"
      : isCurrency
        ? "一个汇率刻度突然改变方向，资金流与企业利润在两侧重新寻找平衡"
        : "一条突然改变方向的资本洪流，与仍按旧方向前进的市场形成正面冲突";
  return packages.map((item, index) => ({
    ...item,
    title: titles[index],
    hook: hooks[index],
    cover: coverCopies[index % coverCopies.length],
    keyword: `${clean.slice(0, 28)} / 跨市场分析`,
    conflict,
    visual,
    type: index === 1 ? "清晰结论" : "好问题",
    motive: index === 0 ? "恐惧 + 好奇" : index === 1 ? "恐惧 + 信息增量" : "希望 + 风险规避",
  }));
}

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

function scriptForTopic(currentTopic: string, data?: any) {
  const clean = currentTopic.trim() || defaultTopic;
  const markets = Array.isArray(data?.markets) && data.markets.length ? data.markets.join("、") : "外汇、债券、美股、日股、港股和A股";
  const category = data?.category || "全球资本市场事件";
  // 搜索标题、抓取数量和评分诊断只供后台使用，绝不能进入对外口播稿。
  const trigger = "美日两方围绕日元汇率释放了政策级信号，市场开始重新评估干预概率";
  const thesis = "";
  const sourceSummary = "";
  const isFx = /日元|汇率|外汇|干预|美元.?日元|yen|intervention/i.test(`${clean} ${category}`);
  const history = isFx
    ? "历史上真正有效的汇率干预，通常不只靠一句表态。二〇一一年日本在地震后参与协调干预，二〇二二年日本又在日元快速贬值时直接入市。共同点是：政策意图、真实资金行动和市场仓位同时发生变化；不同点则在于，当时的利差环境、通胀约束和全球风险偏好都不一样。"
    : "历史上的重大政策冲击通常分成三个阶段：先交易新闻标题，再重估资金价格，最后由盈利和经济数据验证。第一天涨跌最剧烈，却往往最不能代表最终方向。";
  return `${clean}，很多人以为这只是一条外汇或者政策新闻。但我更担心的，是它可能踢倒全球资金链上的第一块骨牌。真正的问题不是日元会涨多少，而是过去几年靠低成本日元撑起来的那批交易，会不会突然发现，脚下的地板正在动。\n\n先说现在能够确认的。直接触发市场关注的是：${trigger}。${sourceSummary}${thesis}。但这里有一个特别容易被标题带偏的地方：官员讨论过干预、媒体报道可能干预、政府真的把钱打进市场，这是三件完全不同的事。前两种能制造剧烈波动，第三种才可能改变仓位。如果连动作级别都没分清，后面所有看多看空都只是猜。\n\n可市场真正紧张的，还不是这句话是真是假，而是它碰到了一笔极其拥挤的交易。你可以把套息交易想成一群人坐同一部向上的扶梯：大家借便宜的日元，去买收益更高的美元资产、债券和股票。扶梯一直向上时，每个人都觉得自己很聪明；一旦日元突然升值，扶梯不是停下来，而是开始倒转。为了还日元债务，资金可能被迫卖出原本最赚钱、流动性最好的资产。于是，一条发生在外汇市场的消息，可能先打到美债，再传到日股和美股，最后才被港股和A股感受到。\n\n这也是为什么只看日元涨跌远远不够。现在真正需要盯住的是${markets}。如果汇率只跳一下，债券收益率、股指和高估值板块都没有持续跟随，那更像一次仓位惊吓；如果汇率先动，债券随后确认，股票里的金融、出口和科技板块再出现有顺序的分化，事情就变了。那说明市场不是在转发新闻，而是在重新计算资金成本。对A股来说，最危险的误判，就是看到海外资产一起动，便默认所有科技股都该同涨同跌。真正要核对的是人民币、外资风险偏好、出口竞争力和估值折现率，到底哪一条传导真的落了地。\n\n但故事到这里还有一次转弯。${history}历史真正告诉我们的，不是干预一定成功或者一定失败，而是口头信号只能改变速度，持续的政策行动和利差变化才可能改变方向。第一天最刺激的价格，往往只是最拥挤仓位的应激反应；真正的趋势，要等那些没有被迫交易的人也开始主动改变选择。\n\n索罗斯讲反身性，放在这里特别好理解。价格越快偏离政策容忍区间，政府行动压力越大；政府越可能行动，投机仓位撤得越快；仓位撤得越快，价格又越强化政策有效的印象。这是一个会自己加速的循环。但霍华德·马克斯会追问另一件事：市场到底已经提前交易了多少？当所有人都押同一个方向时，即便判断最终正确，价格也可能先狠狠反着走。两套框架放在一起，得到的不是一句看多或者看空，而是一个更实用的判断：方向重要，仓位和价格更重要。\n\n现在把最强的反方也摆上桌。这可能只是口头干预、周末流动性偏低，或者短线资金借题发挥。即便官方真的行动，只要利差和资金环境没有改变，效果也可能很快被市场吃掉。接下来不要被每一根分时线牵着走，只看四个确认：官方措辞有没有升级，汇率变化有没有迅速回吐，债券和股票是否跟随，以及资金调整能不能持续到第二个交易日之后。\n\n所以我的判断很明确：${clean}不是一条可以忽略的小新闻，但现在也远没到凭一个标题就宣布全球资金转向的时候。它更像有人突然碰了一下多米诺骨牌。第一块已经晃了，后面的牌会不会倒，要看政策动作、利率、仓位和股票价格能不能按顺序接上。对投资者最有用的，不是抢着猜最后一块牌倒向哪边，而是盯住谁先动、谁跟随，以及谁始终不肯动。你觉得这次是一次短暂警告，还是全球套息交易真正开始松动？`;
}

function methodologyScriptForTopic(currentTopic: string, data?: any) {
  const clean = currentTopic.trim() || defaultTopic;
  const category = data?.category || "全球资本市场事件";
  const markets = Array.isArray(data?.markets) && data.markets.length ? data.markets.join("、") : "美股、港股、A股、债券和外汇";
  const trigger = "这次事件已经从消息层面进入资产价格讨论，但传导是否持续仍需市场确认";
  const sourceSummary = "";
  return `${clean}。大多数人第一眼只看到涨跌，但真正决定后续行情的，往往不是第一根阳线或者阴线，而是资金为什么在这个时间改变选择。今天我只讲透一个判断：这到底是一次情绪冲击，还是市场定价逻辑已经发生变化。\n\n直接触发关注的是：${trigger}。${sourceSummary}先别急着把新闻标题当结论。市场里最贵的错误，就是把同时发生误认为因果成立。我们需要先确认事件、时间和来源，再观察价格是否给出一致回答。\n\n真正值得看的，是这件事通过哪条通道进入股价。它可能改变利率和流动性，也可能改变企业盈利、风险偏好或行业订单。把市场想成一排相连的水箱：新闻只是在第一个水箱里倒水，能不能流到后面，要看阀门有没有打开。这个阀门，就是资金成本和盈利预期。\n\n现在同时观察${markets}。如果只有一个市场短暂异动，其他资产拒绝跟随，这更像局部噪音；如果价格按照清晰顺序扩散，才说明资金正在重新定价。但更反直觉的是，最先上涨的市场未必是最终受益者，它也可能只是仓位最拥挤、回补速度最快的地方。真正的趋势，要等没有被迫交易的人也开始主动改变选择。\n\n历史上的重大市场冲击通常经历三个阶段：先交易新闻标题，再重估资金价格，最后由盈利和政策落地验证。历史案例不是拿来机械套答案的，而是用来识别必要条件。第一天最刺激的价格，往往最不能代表最后的方向。\n\n索罗斯的反身性提醒我们，价格变化会反过来改变预期和行为；霍华德·马克斯则提醒我们，再正确的方向也可能因为价格过高而变成错误的交易。两者放在一起，结论很简单：既要看故事是否成立，也要看市场已经提前付了多少钱。\n\n最强的反方是，这可能只是技术性波动、仓位调整或新闻噪音。要推翻这个反方，需要看到信源继续升级、价格没有迅速回吐、更多市场参与确认，并且资金变化持续到第二个交易日之后。\n\n所以我的判断是：${clean}值得跟踪，但真正能指导行动的不是一句利好或利空，而是传导顺序。先确认事件，再确认资金价格，随后看股票扩散，最后等盈利或政策落地。谁先动、谁跟随、谁拒绝跟随，才是这条热点里最值钱的信息。你认为这次只是情绪波动，还是市场真的换了一套定价逻辑？`;
}

const steps = ["选题确认", "研究底稿", "包装确认", "纯口播稿", "花生成片", "数据回流"];
const methodologyVersion = 7;

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
  const [scriptProvenance, setScriptProvenance] = useState<any>(null);
  const [packagingOptions, setPackagingOptions] = useState<any[]>([]);
  const [packagingGenerating, setPackagingGenerating] = useState(false);
  const [packagingError, setPackagingError] = useState("");
  const [packagingProvenance, setPackagingProvenance] = useState<any>(null);
  const [coverPrompt, setCoverPrompt] = useState("");
  const [coverImages, setCoverImages] = useState<{ landscape?: string; portrait?: string }>({});
  const [coverMaterial, setCoverMaterial] = useState<any>(null);
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [coverError, setCoverError] = useState("");
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
      methodologyVersion, step, topic, topicContext, topicApproved, packageIndex, packageApproved, packagingOptions, packagingProvenance, script, archived, coverPrompt, coverImages, coverMaterial,
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
      coverPrompt, coverImages, coverMaterial,
    };
    const index = projects.findIndex((item: any) => item.id === projectId);
    if (index >= 0) projects[index] = record; else projects.unshift(record);
    window.localStorage.setItem("financial-titan-projects", JSON.stringify(projects));
  }, [hydrated, projectId, step, topic, topicContext, topicApproved, packageIndex, packageApproved, packagingOptions, packagingProvenance, script, archived, coverPrompt, coverImages, coverMaterial]);

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
    { label: "避免AI腔排比否定", ok: !/不是[^。]{0,25}不是[^。]{0,25}而是/.test(script) },
    { label: "段落形成自然留存节奏", ok: script.split(/\n\s*\n/).filter(Boolean).length >= 6 },
    { label: "避免连续套路式设问", ok: (script.match(/？/g) || []).length <= 3 },
  ];
  const oralWarningCount = oralChecks.filter((item) => !item.ok).length;

  function approveTopic() {
    setTopicApproved(true);
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
      if (payload.warning) setScriptError(payload.warning);
      notify(`${payload.model} 已完成主笔创作和独立终审`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "大模型写稿失败";
      setScriptError(/timeout|aborted/i.test(message) ? "写稿与自动成稿修复总等待超过10分钟，已停止等待。请稍后重试。" : message);
    } finally {
      setScriptGenerating(false);
    }
  }

  async function copyScript() {
    await navigator.clipboard.writeText(script);
    notify("纯口播稿已复制，可直接粘贴到花生AI");
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
    const imageResponse = await fetch(apiUrl(`/api/image-source?url=${encodeURIComponent(payload.selected.imageUrl)}`));
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
          <div className="studioActions"><button className="primary" onClick={approveTopic}>{topicApproved ? "已确认，进入研究 →" : "确认选题并锁定 →"}</button></div>
        </section>
      )}

      {step === 1 && (
        <section className="studioPanel">
          <div className="studioTitle"><div><p className="eyebrow">PEANUTCUT CREATIVE BRIEF</p><h2>动态创作底稿</h2></div><button className="primary" disabled={packagingGenerating || !deepseekApiKey.trim()} onClick={generatePackaging}>{packagingGenerating ? "DeepSeek 正在生成包装…" : "底稿确认，用大模型生成包装 →"}</button></div>
          <div className="poeConfig"><label>DeepSeek API Key<input type="password" value={deepseekApiKey} onChange={(event) => setDeepseekApiKey(event.target.value)} placeholder="仅保存在当前浏览器" autoComplete="off" /></label><label>包装模型<select value={scriptModel} onChange={(event) => setScriptModel(event.target.value)}><option value="deepseek-v4-pro">DeepSeek V4 Pro</option><option value="deepseek-v4-flash">DeepSeek V4 Flash</option></select></label></div>
          {packagingError && <p className="coverError">{packagingError}</p>}
          <div className="researchGrid">
            {currentResearch.map((layer) => (
              <article key={layer.key}><div><b>{layer.key}</b><em>{layer.status}</em></div><h3>{layer.title}</h3><p>{layer.body}</p></article>
            ))}
          </div>
          <div className="researchConclusion"><b>使用原则</b><p>底稿不是正文目录，也不是八项必答题。事实底座和终审护栏是硬门；核心概念只选一个；情绪弧线与留存单元可以根据证据调整；历史案例、大师观点和意象没有增量就直接舍弃。</p></div>
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
                {Object.entries(selectedPackage.scores).map(([key, value]) => (
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
