export type MarketDomain = {
  key: string;
  label: string;
  terms: string[];
  markets: string[];
  query: string;
  channels: string[];
};

// 影响股票定价的事件地图：先按传导源找事件，再按行业/公司落点找机会。
export const marketDomains: MarketDomain[] = [
  { key: "monetary_policy", label: "货币政策", terms: ["美联储", "联储", "fed", "fomc", "降息", "加息", "央行", "日本央行", "boj", "欧洲央行", "ecb", "存款准备金", "lpr"], markets: ["美股", "A股", "港股", "债券", "外汇"], query: "央行 利率 决议 降息 加息 政策信号 全球股市", channels: ["贴现率", "利率", "估值", "汇率"] },
  { key: "fx_intervention", label: "外汇与汇率", terms: ["汇率", "外汇", "美元兑日元", "美元日元", "日元", " yen", "usd/jpy", "美元指数", "dxy", "汇市干预", "外汇干预", "联合干预", "汇率询价", "财务省", "treasury", "currency intervention"], markets: ["外汇", "美股", "日股", "A股", "港股", "债券"], query: "美元 日元 汇率 外汇干预 美日 财政部 央行 最新", channels: ["汇率", "利差", "出口", "全球流动性"] },
  { key: "fiscal_economic", label: "财政与经济政策", terms: ["财政", "预算", "赤字", "刺激", "基建", "经济数据", "gdp", "cpi", "ppi", "就业", "非农", "失业率", "通胀", "通缩", "关税", "贸易政策"], markets: ["美股", "A股", "港股", "大宗商品", "债券"], query: "最新 财政政策 经济数据 通胀 就业 关税 股市影响", channels: ["盈利", "利率", "风险溢价", "商品"] },
  { key: "liquidity", label: "资金面与市场结构", terms: ["流动性", "资金面", "逆回购", "mlf", "降准", "回购", "北向", "南向", "融资", "量化", "基金赎回", "信用利差", "国债收益率", "债券收益率"], markets: ["A股", "港股", "美股", "债券"], query: "资金面 流动性 国债收益率 回购 南向 北向 股市", channels: ["风险偏好", "杠杆", "估值", "成交"] },
  { key: "rates_bonds", label: "利率与债券", terms: ["国债", "收益率", "yield", "债市", "曲线", "期限利差", "信用债", "主权债", "债券抛售", "债券暴跌"], markets: ["债券", "美股", "A股", "港股", "外汇"], query: "美债 国债收益率 债券市场 股市传导 最新", channels: ["无风险利率", "融资成本", "美元", "银行"] },
  { key: "commodities", label: "商品与资源", terms: ["原油", "黄金", "铜", "天然气", "铁矿", "铝", "商品", "油价", "金价"], markets: ["大宗商品", "美股", "A股", "港股", "外汇"], query: "原油 黄金 铜 商品价格 异动 股市影响 最新", channels: ["通胀", "成本", "资源股", "风险偏好"] },
  { key: "geopolitics_trade", label: "地缘与贸易", terms: ["战争", "制裁", "停火", "地缘", "关税", "贸易战", "出口管制", "芯片禁令", "军费", "谈判"], markets: ["美股", "A股", "港股", "商品", "外汇"], query: "地缘政治 关税 制裁 出口管制 全球市场 最新", channels: ["风险溢价", "供应链", "商品", "军工"] },
  { key: "regulation", label: "监管与制度", terms: ["监管", "证监会", "交易所", "反垄断", "审查", "法案", "批准", "禁令", "政策落地", "上市规则"], markets: ["A股", "港股", "美股"], query: "金融监管 交易所 证监会 反垄断 法案 股市影响", channels: ["估值", "行业准入", "资本开支", "公司治理"] },
  { key: "corporate_earnings", label: "公司与财报", terms: ["财报", "业绩", "盈利", "指引", "回购", "分红", "并购", "收购", "破产", "订单", "资本开支", "earnings", "guidance"], markets: ["美股", "A股", "港股"], query: "全球公司 财报 业绩 指引 回购 并购 股价异动", channels: ["盈利预期", "估值", "现金流", "行业竞争"] },
  { key: "technology_sector", label: "科技与产业", terms: ["半导体", "芯片", "人工智能", "ai", "大模型", "算力", "光模块", "软件", "机器人", "新能源", "电动车"], markets: ["美股", "A股", "港股"], query: "全球科技 半导体 AI 产业链 股市热点 最新", channels: ["订单", "资本开支", "产业趋势", "估值"] },
  { key: "consumption_dividend", label: "消费与红利", terms: ["消费", "白酒", "零售", "汽车", "家电", "红利", "高股息", "银行", "煤炭", "电力", "运营商"], markets: ["A股", "港股"], query: "A股 消费 红利 高股息 银行 政策 资金 最新", channels: ["内需", "分红", "利率", "盈利"] },
];

export function classifyDomains(text: string) {
  const lower = text.toLowerCase();
  return marketDomains.filter((domain) => domain.terms.some((term) => lower.includes(term.toLowerCase())));
}

export function discoveryQueries() {
  return [
    "过去48小时 全球金融市场 最大热点 股市 汇率 利率 债券 商品 政策",
    ...marketDomains.map((domain) => domain.query),
    "weekend global markets biggest financial event stocks forex rates policy",
    "中国 美国 日本 社交网络 热议 汇率 股市 央行 财报 最新",
  ];
}
