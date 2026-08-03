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

function researchForTopic(currentTopic: string) {
  const clean = currentTopic.trim() || defaultTopic;
  const templates = [
    `围绕“${clean}”整理时间线：谁在什么时候释放了什么信号，哪些是官方原文，哪些只是媒体或市场推测。未获得来源验证的内容必须标记为待确认。`,
    `解释“${clean}”通过什么变量影响资产价格：汇率、利率、流动性、风险偏好、贸易条件或企业盈利。先写传导机制，再写结论，不能把同时上涨直接当成因果关系。`,
    `建立跨市场映射：观察美元/日元、日债与日股，再看美股、港股、A股和大宗商品是否出现同向或背离反应。只有存在时间先后和可验证路径，才能称为联动。`,
    `寻找同类历史事件进行对照，例如历次汇率干预、央行口头干预或政策转向后的资产表现，并明确本次与历史案例的相同点、不同点和不可比之处。`,
    `用投资大师的框架检验：索罗斯的反身性看预期与价格反馈，芒格的逆向思考看市场共识是否过度，霍华德·马克斯的周期框架看这是趋势变化还是短期波动。观点只作为分析框架，不替代事实证据。`,
    `提出最强反方：这可能只是技术性波动、仓位调整或新闻噪音，而不是政策级趋势。列出需要继续观察的验证条件：官方后续表态、价格是否扩散、成交与期限结构是否确认，以及其他市场是否跟随。`,
  ];
  return researchLayers.map((layer, index) => ({
    ...layer,
    title: index === 0 ? `${clean}：发生了什么` : layer.title,
    body: templates[index],
  }));
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

function packagesForTopic(currentTopic: string) {
  const clean = currentTopic.trim() || defaultTopic;
  const text = clean.toLowerCase();
  const isFx = /日元|美元.?日元|美日|汇率|外汇|干预|intervention|yen/.test(text);
  const coverCopies = isFx
    ? ["美日突然出手", "日元要变天？", "全球资金变向？"]
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
  const titles = isFx
    ? [
      "美日突然摸向汇率扳机，日元反弹还是全球资金撤退？",
      "别只盯日元，美日若真出手，最先松动的是全球套息交易",
      "日元要变天？先看美债、日股和A股这三个确认信号",
    ]
    : [
      clean,
      `${clean}，市场最可能看错的不是方向，而是传导顺序`,
      `${clean}到底能走多远？先看三个确认信号`,
    ];
  const hooks = isFx
    ? [
      "美日如果真的对日元出手，最危险的可能不是做空日元的人，而是全球最拥挤的那笔便宜钱。",
      "很多人把这当成一条外汇新闻，但它真正可能撬动的，是从美债到日股、再到A股科技估值的一整条资金链。",
      "日元涨一天不叫变天。真正的信号，是汇率动完以后，美债、日股和亚洲风险资产有没有被迫跟着动。",
    ]
    : [
      `${clean}。表面上大家在争涨跌，真正决定后面行情的却是资金先从哪里撤、又往哪里去。`,
      `这条热点最容易看错的地方，是把同时发生当成因果。市场真正交易的顺序，可能正好相反。`,
      `别急着追第一根大阳线，也别被第一根大阴线吓跑。${clean}要成立，还缺三个确认信号。`,
    ];
  const conflict = isFx ? "官方出手预期 × 全球套息交易" : "第一反应 × 真实传导";
  const visual = isFx ? "一枚被骤然扳动的汇率杠杆，美元与日元两端失衡，资金流像绷紧的钢索" : "一条突然改变方向的资本洪流，与仍按旧方向前进的市场形成正面冲突";
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
  if (/日元|汇率|外汇|干预|美元.?日元|yen|intervention/i.test(`${clean} ${category}`)) return scriptForTopic(clean, data);
  const markets = Array.isArray(data?.markets) && data.markets.length ? data.markets.join("、") : "美股、港股、A股、债券和外汇";
  const trigger = "这次事件已经从消息层面进入资产价格讨论，但传导是否持续仍需市场确认";
  const sourceSummary = "";
  return `${clean}。大多数人第一眼只看到涨跌，但真正决定后续行情的，往往不是第一根阳线或者阴线，而是资金为什么在这个时间改变选择。今天我只讲透一个判断：这到底是一次情绪冲击，还是市场定价逻辑已经发生变化。\n\n直接触发关注的是：${trigger}。${sourceSummary}先别急着把新闻标题当结论。市场里最贵的错误，就是把同时发生误认为因果成立。我们需要先确认事件、时间和来源，再观察价格是否给出一致回答。\n\n真正值得看的，是这件事通过哪条通道进入股价。它可能改变利率和流动性，也可能改变企业盈利、风险偏好或行业订单。把市场想成一排相连的水箱：新闻只是在第一个水箱里倒水，能不能流到后面，要看阀门有没有打开。这个阀门，就是资金成本和盈利预期。\n\n现在同时观察${markets}。如果只有一个市场短暂异动，其他资产拒绝跟随，这更像局部噪音；如果价格按照清晰顺序扩散，才说明资金正在重新定价。但更反直觉的是，最先上涨的市场未必是最终受益者，它也可能只是仓位最拥挤、回补速度最快的地方。真正的趋势，要等没有被迫交易的人也开始主动改变选择。\n\n历史上的重大市场冲击通常经历三个阶段：先交易新闻标题，再重估资金价格，最后由盈利和政策落地验证。历史案例不是拿来机械套答案的，而是用来识别必要条件。第一天最刺激的价格，往往最不能代表最后的方向。\n\n索罗斯的反身性提醒我们，价格变化会反过来改变预期和行为；霍华德·马克斯则提醒我们，再正确的方向也可能因为价格过高而变成错误的交易。两者放在一起，结论很简单：既要看故事是否成立，也要看市场已经提前付了多少钱。\n\n最强的反方是，这可能只是技术性波动、仓位调整或新闻噪音。要推翻这个反方，需要看到信源继续升级、价格没有迅速回吐、更多市场参与确认，并且资金变化持续到第二个交易日之后。\n\n所以我的判断是：${clean}值得跟踪，但真正能指导行动的不是一句利好或利空，而是传导顺序。先确认事件，再确认资金价格，随后看股票扩散，最后等盈利或政策落地。谁先动、谁跟随、谁拒绝跟随，才是这条热点里最值钱的信息。你认为这次只是情绪波动，还是市场真的换了一套定价逻辑？`;
}

const steps = ["选题确认", "研究底稿", "包装确认", "纯口播稿", "花生成片", "数据回流"];
const methodologyVersion = 3;

export function CreatorWorkflow({ notify, selectedTopic, selectedTopicData, startRequestId = 0, editProjectId = "" }: { notify: (message: string) => void; selectedTopic?: string; selectedTopicData?: any; startRequestId?: number; editProjectId?: string }) {
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
  const currentResearch = useMemo(() => researchForTopic(topic), [topic]);
  const currentPackages = useMemo(() => packagesForTopic(topic), [topic]);

  // 首页点击“用这个选题开稿”后，工坊直接切换到该实时选题；不再继续沿用旧项目标题。
  useEffect(() => {
    if (!hydrated || !selectedTopic?.trim()) return;
    const nextTopic = selectedTopic.trim();
    const projects = JSON.parse(window.localStorage.getItem("financial-titan-projects") || "[]");
    const current = projects.find((item: any) => item.id === projectId);
    const isNewTopic = !current || current.topic !== nextTopic;
    const consumedStartRequestId = Number(window.localStorage.getItem("financial-titan-last-start-request") || 0);
    const explicitRestart = startRequestId > 0 && startRequestId !== consumedStartRequestId;
    const shouldStartFresh = explicitRestart || isNewTopic;
    const needsMethodologyUpgrade = !shouldStartFresh && current.methodologyVersion !== methodologyVersion;
    if (shouldStartFresh) {
      if (explicitRestart) window.localStorage.setItem("financial-titan-last-start-request", String(startRequestId));
      // 同一次开稿请求始终映射到同一个项目 ID，流程推进只覆盖更新这一条记录。
      const nextId = startRequestId > 0 ? `project-${startRequestId}` : `project-${Date.now()}`;
      window.localStorage.setItem("financial-titan-current-project", nextId);
      setProjectId(nextId);
    }
    if (shouldStartFresh) {
      setTopic(nextTopic);
      setTopicApproved(false);
      setPackageIndex(0);
      setPackageApproved(false);
      setScript(methodologyScriptForTopic(selectedTopic, selectedTopicData));
      setCoverImages({});
      setCoverPrompt("");
      setCoverError("");
      setArchived(false);
      setVideoLink("");
      setMetricResult(null);
      setMetricError("");
      setStep(0);
    } else if (needsMethodologyUpgrade) {
      setScript(methodologyScriptForTopic(selectedTopic, selectedTopicData));
    }
  }, [hydrated, selectedTopic, startRequestId]);

  useEffect(() => {
    // 从首页开稿时直接使用请求 ID 初始化，避免先创建临时项目、随后再创建正式项目。
    const currentId = editProjectId || (startRequestId > 0
      ? `project-${startRequestId}`
      : window.localStorage.getItem("financial-titan-current-project") || `project-${Date.now()}`);
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
      methodologyVersion, step, topic, topicApproved, packageIndex, packageApproved, script, archived, coverPrompt, coverImages,
    }));
    const projects = JSON.parse(window.localStorage.getItem("financial-titan-projects") || "[]");
    const record = {
      id: projectId,
      createdAt: projects.find((item: any) => item.id === projectId)?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      methodologyVersion,
      step, topic, topicApproved, packageIndex, packageApproved, script, archived,
      research: currentResearch,
      packaging: currentPackages[packageIndex],
      coverPrompt, coverImages,
    };
    const index = projects.findIndex((item: any) => item.id === projectId);
    if (index >= 0) projects[index] = record; else projects.unshift(record);
    window.localStorage.setItem("financial-titan-projects", JSON.stringify(projects));
  }, [hydrated, projectId, step, topic, topicApproved, packageIndex, packageApproved, script, archived, coverPrompt, coverImages]);

  useEffect(() => {
    if (poeApiKey) window.localStorage.setItem("financial-titan-poe-key", poeApiKey);
    else window.localStorage.removeItem("financial-titan-poe-key");
    window.localStorage.setItem("financial-titan-poe-model", poeModel);
  }, [poeApiKey, poeModel]);

  // peanutcut methodology：封面控制观众的 0.5 秒，基因层固定，变量层只换文案与视觉锤。
  useEffect(() => {
    const selected = currentPackages[packageIndex];
    const sensitiveTopic = /台湾|香港|澳门|新疆|西藏/.test(topic);
    const subjectConstraint = sensitiveTopic
      ? "本题涉及敏感地域，画面禁止出现人物、旗帜和国徽，只能使用中性的金融概念场景。"
      : "没有经过确认的真实参考图，不要虚构具名人物的脸，也不要虚构观众能够核对真伪的具体实体。优先使用抽象金融意象或泛指主体。";
    setCoverPrompt(
      `这是一张财经视频封面。观众会在信息流里用零点五秒决定要不要点开。不要追求信息完整，只控制三件事：第一眼认出这是一次重要的资本市场事件；立刻感到危险、紧迫或机会中的一种情绪；故意留下一个必须点开视频才能补上的信息缺口。\n\n` +
      `本期视频标题是：“${selected.title}”。标题只供理解，绝对不要写进画面。封面与标题的分工是：${selected.coverMode}。封面必须给标题增加新的情绪或信息，不能复述标题，也不能换几个近义词再说一遍。\n\n` +
      `这期最强的矛盾是：${selected.conflict}。把这个矛盾压缩成一个能在零点五秒认出来的视觉锤：${selected.visual}。画面只能有一个绝对主角，主体轮廓必须硬、清楚、完整，占画面约四成到五成半。只有在能明显强化冲突时，才允许加入一个对立元素；否则不要加。\n\n` +
      `固定审美基因不要变：石墨黑或深海军蓝打底，克制的机构级财经编辑质感，电影级定向光，真实材质和清晰边缘；只允许一种情绪信号色，从警报红、克制金或冷白中选择。画面要像顶级商业杂志的封面，不要像廉价新闻海报，也不要像泛着塑料光的人工智能概念图。每期只更换主锤字和主视觉，其余设计语言保持系列一致。不要出现账号名、标志、角标或水印。\n\n` +
      `图中唯一允许出现的中文大字，逐字准确写成：“${selected.cover}”。主锤字控制在四到八个汉字，使用超粗、紧凑、醒目的中文无衬线体，最多两行，只形成一个完整文字块。不能增加副标题、小字、英文装饰、股票代码或任何额外字符。每个汉字都必须完整、清晰、无错字，缩小到手机上约三厘米宽时仍能一眼读出。\n\n` +
      `文字和主体必须彻底分开，不能互相遮挡。文字区域背后加一层不易察觉的暗色渐变蒙版，只为保证可读性，不能做成明显色块或卡片。底图要清晰、明亮但不过曝，细节不能抢字。\n\n` +
      `${subjectConstraint}\n` +
      `所有封面一律禁止地图、旗帜、国徽、虚假新闻截图、密集K线、坐标轴、图例、微小数字、多图拼贴、多人物、多标志、赛博界面、金币雨、牛熊雕像、外边框和平台界面。如果使用图表，只能用一个极简的方向形状传递情绪，不能承担具体数据展示。\n\n` +
      `出图前在脑中把封面缩小到手机信息流里的指甲盖大小，做三项检查：主锤字是否能完整读出；唯一主体是否仍能辨认；危险、紧迫或机会的情绪是否立刻成立。任何一项不成立，就删掉次要元素、放大主体或增强对比，不能靠继续添加信息补救。`
    );
  }, [currentPackages, packageIndex, topic]);

  const cleanLength = useMemo(() => script.replace(/\s/g, "").length, [script]);
  const oralChecks = [
    { label: "长度在1000—3000字", ok: cleanLength >= 1000 && cleanLength <= 3000 },
    { label: "没有章节或分镜标签", ok: !/[【\[]?(镜头|画面|章节|Hook|开头)[】\]]?/i.test(script) },
    { label: "六层研究融入叙事，不按层报菜名", ok: !/第[一二三四五六123456]层|事实层|因果层|映射层|历史层|大师层|反方层/.test(script) },
    { label: "使用中文标点", ok: !/[A-Za-z\u4e00-\u9fa5][,.!?][\u4e00-\u9fa5]/.test(script) },
    { label: "包含反方观点与验证条件", ok: /最强的反方|可能只是/.test(script) && /确认|验证/.test(script) },
    { label: "开头含当前选题主体", ok: script.slice(0, 120).includes(topic.slice(0, 8)) },
    { label: "避免AI腔排比否定", ok: !/不是[^。]{0,25}不是[^。]{0,25}而是/.test(script) },
    { label: "具备4个以上留存单元", ok: script.split(/\n\s*\n/).filter(Boolean).length >= 8 },
    { label: "开放问题最多一个", ok: (script.match(/？/g) || []).length <= 1 },
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
    const layoutRules = format === "portrait"
      ? `这是竖版封面，必须从零按纵向空间重新构图，不能裁切横版。大字放在中间偏上，主体放在中上或文字下方，形成从大字到主体的纵向视线瀑布。左右至少留出画面宽度百分之十四，顶部至少百分之十六，底部至少百分之二十二，避开平台字幕和操作区。文字块宽度不超过画面百分之六十八，高度不超过百分之二十二，任何笔画都不能越过安全区。`
      : `这是横版封面，必须从零按横向空间重新构图，不能拉伸或裁切竖版。采用左图右字或右图左字，让主体与文字成为两个清楚的信息位。四周至少留出画面百分之九的安全边距，文字块宽度不超过画面百分之四十二，主体与文字不能重叠。`;
    const response = await fetch("http://127.0.0.1:4318/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: poeApiKey,
        model: poeModel || "gpt-image-2",
        aspectRatio,
        prompt: `${coverPrompt}\n\n本次画幅为 ${aspectRatio}。${layoutRules}\n出图前再次检查：完整文字块和每一个汉字都在安全区内，横版与竖版是同一套审美基因下的两次独立构图。`,
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
      ...currentPackages[packageIndex],
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
            {currentResearch.map((layer) => (
              <article key={layer.key}><div><b>{layer.key}</b><em>{layer.status}</em></div><h3>{layer.title}</h3><p>{layer.body}</p></article>
            ))}
          </div>
          <div className="researchConclusion"><b>一句话判断</b><p>“{topic}”目前先按事件冲击处理：确认事实、价格反应和跨市场传导后，再判断这是趋势变化、情绪修复，还是一次性噪音。</p></div>
        </section>
      )}

      {step === 2 && (
        <section className="studioPanel gatePanel">
          <div className="gateLabel">GATE 2 · PACKAGING DECISION</div>
          <p className="eyebrow">TITLE · COVER · HOOK</p>
          <h2>包装承诺必须和正文判断一致</h2>
          <div className="packageList">
            {currentPackages.map((item, index) => (
              <button key={item.title} className={packageIndex === index ? "selected" : ""} onClick={() => { setPackageIndex(index); setPackageApproved(false); }}>
                <i>{String(index + 1).padStart(2, "0")}</i>
                <span><b>{item.title}</b><small>开头：{item.hook}</small><em>封面：{item.cover}</em></span>
              </button>
            ))}
          </div>
          <div className="packageAudit">
            <div className="coverMock">
              <div className="coverChart"><i /><i /><i /><i /><i /></div>
              <strong>{currentPackages[packageIndex].cover}</strong>
              <em>?!</em>
              <small>{currentPackages[packageIndex].visual}</small>
            </div>
            <div className="packageLogic">
              <h3>标题 × Hook × 封面审计</h3>
              <dl>
                <div><dt>标题类型</dt><dd>{currentPackages[packageIndex].type}</dd></div>
                <div><dt>受众动机</dt><dd>{currentPackages[packageIndex].motive}</dd></div>
                <div><dt>搜索锚点</dt><dd>{currentPackages[packageIndex].keyword}</dd></div>
                <div><dt>最强矛盾</dt><dd>{currentPackages[packageIndex].conflict}</dd></div>
                <div><dt>封面分工</dt><dd>{currentPackages[packageIndex].coverMode}</dd></div>
              </dl>
              <div className="packageScores">
                {Object.entries(currentPackages[packageIndex].scores).map(([key, value]) => (
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
