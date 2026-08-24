export type CoverageCell = {
  key: string;
  label: string;
  queries: string[];
};

// 通用财经事件覆盖矩阵。这里只定义稳定的信息入口，不包含任何单一新闻、公司或用户曾强调的事件。
export const coverageMatrix: CoverageCell[] = [
  {
    key: "market_state",
    label: "全球股票市场行情",
    queries: [
      "A股 今日 收盘 指数 成交额 涨跌家数 领涨领跌 板块轮动 资金流向",
      "港股 今日 收盘 恒生指数 恒生科技 南向资金 领涨领跌 板块轮动",
      "美股 最新收盘 标普500 纳斯达克 道琼斯 行业涨跌 个股异动 原因",
      "global stocks market close sector movers unusual volume latest",
    ],
  },
  {
    key: "policy_regulation",
    label: "政策监管与贸易措施",
    queries: [
      "全球 最新 政府 监管 提案 草案 调查 审批 禁令 制裁 关税 进出口限制 市场影响",
      "latest government regulator proposal draft investigation approval ban sanction tariff trade restriction markets",
    ],
  },
  {
    key: "macro_liquidity",
    label: "宏观、央行与资金价格",
    queries: [
      "全球 最新 央行 利率 流动性 通胀 就业 财政 经济数据 市场反应",
      "latest central bank rates inflation jobs liquidity fiscal data bond currency market reaction",
    ],
  },
  {
    key: "corporate",
    label: "公司与信用事件",
    queries: [
      "今日 财报日历 业绩发布时间 公司名单 A股 港股 美股 中概股",
      "今日 中概股 财报日历 盘前发布 业绩 电话会 NASDAQ NYSE",
      "today earnings calendar companies reporting before open after close China ADR Hong Kong",
      "A股 今日最新 上市公司公告 财报 业绩预告 经营指引 重大合同 回购 分红 股价反应",
      "港股 今日最新 业绩公告 盈利预警 经营数据 指引 回购 分红 港交所披露 股价反应",
      "美股 最新盘前盘后 earnings results guidance conference call SEC filing stock reaction",
      "全球上市公司 今日最新 财报 指引 资本开支 并购 违约 破产 股价异动",
    ],
  },
  {
    key: "industry_supply",
    label: "产业供需与供应链",
    queries: [
      "全球产业链 最新 价格 库存 产能 短缺 技术迭代 供应中断 行业异动",
      "latest industry supply chain price inventory capacity shortage technology disruption market impact",
    ],
  },
  {
    key: "cross_asset",
    label: "跨资产价格信号",
    queries: [
      "最新 美债 国债收益率 美元 汇率 黄金 原油 铜 信用利差 异动 股市传导",
      "latest bonds yields dollar currencies gold oil copper credit spread cross asset move",
    ],
  },
  {
    key: "geopolitical_risk",
    label: "地缘与突发风险",
    queries: [
      "全球 最新 地缘冲突 战争 停火 制裁 航运 能源 供应链 突发事件 市场影响",
      "latest geopolitical conflict ceasefire sanctions shipping energy disruption market impact",
    ],
  },
  {
    key: "emerging_attention",
    label: "新兴讨论与异常关注",
    queries: [
      "今日 财经 热议 突发 异常上涨 异常下跌 新公司 新政策 雪球 微博",
      "今日 热门股票 财报 雪球 X Twitter 投资者 热议 分歧 预期",
      "today earnings stocks premarket after hours X Twitter investor discussion sentiment",
      "today finance breaking unusual move emerging company policy reddit youtube tiktok markets",
    ],
  },
];

export function discoveryQueries() {
  return coverageMatrix.flatMap((cell) => cell.queries);
}
