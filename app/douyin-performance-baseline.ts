export type DouyinPerformanceRecord = {
  id: string;
  title: string;
  publishedAt: string;
  durationSeconds: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  followers: number;
  coverCtr: number;
  averagePlayRatio: number;
  averageWatchSeconds: number;
  completionRate?: number;
  twoSecondBounceRate?: number;
  fiveSecondCompletionRate?: number;
  trafficSources?: Record<string, number>;
  collectedAt: string;
  source: "douyin_creator_center";
};

const collectedAt = "2026-09-02T15:10:00+08:00";

function row(id: string, title: string, publishedAt: string, duration: string, views: number, likes: number, comments: number, shares: number, favorites: number, followers: number, coverCtr: number, averagePlayRatio: number, detail: Partial<DouyinPerformanceRecord> = {}): DouyinPerformanceRecord {
  const [minutes, seconds] = duration.split(":").map(Number);
  const durationSeconds = minutes * 60 + seconds;
  return {
    id, title, publishedAt, durationSeconds, views, likes, comments, shares, favorites, followers,
    coverCtr, averagePlayRatio,
    averageWatchSeconds: Number((durationSeconds * averagePlayRatio / 100).toFixed(2)),
    collectedAt, source: "douyin_creator_center", ...detail,
  };
}

// 2026-09-02 使用已登录的抖音创作者中心逐条读取。详情页指标仅在平台实际展示时写入，绝不估算。
export const douyinPerformanceBaseline: DouyinPerformanceRecord[] = [
  row("dy-20260902-gilt", "30年期英债破5.9%，全球长期资金为何集体重新定价？", "2026-09-02T14:37:00+08:00", "09:33", 23, 0, 0, 0, 0, 0, 0, 1.31),
  row("dy-20260902-nio", "蔚来二季报：刚盈利就被成本追着跑，18.4%毛利率敢信吗", "2026-09-02T13:59:00+08:00", "07:56", 290, 3, 0, 0, 0, 0, 100, 4.19),
  row("dy-20260901-shein", "希音破发首日：1000亿估值砍七成，到底谁在接盘？", "2026-09-01T15:52:00+08:00", "08:48", 28000, 107, 35, 60, 22, 19, 12.62, 8.4, { averageWatchSeconds: 44.33, completionRate: 2.48, twoSecondBounceRate: 28.1, fiveSecondCompletionRate: 54.08, trafficSources: { 搜索: 78.1, 推荐页: 21.1, 其他: 0.5, 消息页: 0.2, 个人主页: 0.1 } }),
  row("dy-20260831-bonds", "美债回购救不了长端？亚洲股市下跌的真相", "2026-08-31T18:14:00+08:00", "06:23", 1250, 7, 2, 0, 4, 3, 55, 6.47),
  row("dy-20260827-nvda", "英伟达财报先跌后涨，市场在意的是下一年", "2026-08-27T16:22:00+08:00", "07:45", 1017, 6, 0, 4, 2, 3, 47.37, 5.43),
  row("dy-20260826-nvda", "英伟达财报前那根阳线，是抄底还是抢跑？", "2026-08-26T14:52:00+08:00", "06:51", 1667, 24, 0, 2, 1, 3, 38.89, 8.11),
  row("dy-20260824-alibaba", "阿里巴巴配售800亿：8%低开，是黄金坑还是豪赌？", "2026-08-24T13:54:00+08:00", "06:54", 9783, 80, 16, 11, 30, 17, 5.75, 14.19, { averageWatchSeconds: 58.76, completionRate: 7.4, twoSecondBounceRate: 27.46, fiveSecondCompletionRate: 51.41, trafficSources: { 推荐页: 58.3, 搜索: 35.5, 其他: 3.6, 精选App: 1.6, 个人主页: 0.6, 消息页: 0.2 } }),
  row("dy-20260821-popmart", "泡泡玛特单日暴跌8%，是黄金坑还是估值松动？", "2026-08-21T13:56:00+08:00", "06:45", 337, 4, 0, 0, 0, 1, 26.67, 5.6),
  row("dy-20260820-alibaba", "阿里估值锚从电商切到AI，下季度必须盯住这三个数字", "2026-08-20T21:52:00+08:00", "06:54", 1520, 21, 5, 1, 2, 2, 4.12, 9.41),
  row("dy-20260817-gold", "金价冲上4400，老铺黄金却罕见大促", "2026-08-17T14:29:00+08:00", "08:26", 1049, 9, 1, 1, 2, 2, 20, 4.68),
  row("dy-20260816-gold", "金价冲上4400又回落，接下来黄金ETF和美元指数怎么走？", "2026-08-16T11:49:00+08:00", "06:06", 86, 5, 1, 0, 1, 1, 10.53, 4.3),
  row("dy-20260815-storage", "闪迪周涨35%，存储芯片这轮是AI真需求还是抢跑？", "2026-08-15T13:45:00+08:00", "05:38", 80, 7, 1, 0, 0, 1, 31.82, 4.83),
  row("dy-20260814-deepseek", "DeepSeek Harness要来了，WorkBuddy真会凉吗？", "2026-08-14T11:23:00+08:00", "07:00", 43, 6, 0, 0, 0, 0, 0, 4.77),
  row("dy-20260806-gold", "黄金一夜暴涨188美元，但真相藏在那个两天空档里", "2026-08-06T14:12:00+08:00", "06:21", 712, 15, 2, 1, 3, 3, 35.71, 9.37),
  row("dy-20260805-optical", "光通信暴跌15%，资金换桌你读懂了吗？", "2026-08-05T13:34:00+08:00", "05:22", 826, 6, 0, 3, 1, 0, 57.14, 9.83),
  row("dy-20260803-yen", "美日突然摸向汇率扳机，日元反弹还是全球资金撤退？", "2026-08-03T18:02:00+08:00", "05:49", 640, 9, 1, 0, 2, 1, 15.38, 7.45),
  row("dy-20260731-tech", "美股一夜暴涨，A股科技跟涨：反转来了，还是又一次诱多？", "2026-07-31T18:12:00+08:00", "05:45", 1590, 19, 0, 2, 4, 4, 41.67, 7.41),
  row("dy-20260724-google", "谷歌财报大跌背后：AI资本开支的囚徒困境", "2026-07-24T16:35:00+08:00", "10:29", 910, 10, 0, 0, 1, 3, 42.86, 4.67),
  row("dy-20260714-fed", "AI凶猛：美联储点名，通胀反弹，加息风暴要来了？", "2026-07-14T17:46:00+08:00", "05:16", 816, 11, 1, 0, 3, 4, 78.57, 21.26),
  row("dy-20260709-hk", "央行重磅新政！港股的估值修复逻辑终于来了", "2026-07-09T21:39:00+08:00", "08:54", 1008, 17, 1, 0, 2, 2, 31.25, 10.27),
  row("dy-20260708-semiconductor", "半导体硬件行情见顶了吗？周期股的致命陷阱", "2026-07-08T13:37:00+08:00", "11:55", 958, 11, 1, 2, 1, 3, 21.05, 7.16),
  row("dy-20260706-robot", "人形机器人不能像人了？对行业投资价值影响几何", "2026-07-06T17:12:00+08:00", "08:35", 2432, 22, 4, 4, 6, 3, 6.32, 8.62),
  row("dy-20260625-ai", "AI硬件行情：这次不一样？2000年互联网泡沫的警示", "2026-06-25T11:10:00+08:00", "14:38", 1171, 14, 0, 0, 1, 2, 26.67, 5.21),
  row("dy-20260624-goodhart", "为什么所有投资指标都会失效？古德哈特定律的残酷真相", "2026-06-24T11:34:00+08:00", "16:03", 1071, 25, 0, 3, 10, 2, 9.76, 2.74),
  row("dy-20260622-buffett", "巴菲特警告：美股正在变成赌场", "2026-06-22T11:06:00+08:00", "17:07", 1726, 15, 3, 6, 4, 1, 11.11, 3.28),
  row("dy-20260618-newton", "牛顿炒股血亏后沉迷神学？天才的理性边界", "2026-06-18T14:02:00+08:00", "23:47", 878, 11, 1, 4, 2, 1, 8.06, 2.59),
  row("dy-20260617-exuberance", "《非理性繁荣》：当所有人相信同一个故事时，危险就开始了", "2026-06-17T19:42:00+08:00", "18:03", 1014, 10, 0, 1, 5, 3, 31.03, 3.19),
  row("dy-20260616-crowd", "《群体的疯狂》：A股极致抱团真相", "2026-06-16T21:46:00+08:00", "16:53", 15000, 162, 26, 25, 78, 45, 24.49, 6.47),
  row("dy-20260116-sober", "清醒为何成原罪？狂欢时代的清醒者困境", "2026-01-16T16:18:00+08:00", "04:47", 776, 10, 0, 1, 0, 0, 100, 3.22),
];

export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function diagnoseDouyinPerformance(item: DouyinPerformanceRecord, medianViews = 1008, medianWatchSeconds = 33.3) {
  const searchShare = item.trafficSources?.搜索 || 0;
  const recommendationShare = item.trafficSources?.推荐页 || 0;
  if (searchShare >= 60 && item.views >= medianViews * 3) return "搜索需求命中";
  if (searchShare >= 25 && recommendationShare >= 40 && item.averageWatchSeconds >= 45) return "搜索推荐双引擎";
  if (item.twoSecondBounceRate != null && item.twoSecondBounceRate >= 35) return "开头2秒流失";
  if (item.fiveSecondCompletionRate != null && item.fiveSecondCompletionRate < 45) return "前5秒承诺不足";
  if (item.averageWatchSeconds < medianWatchSeconds) return "内容留存不足";
  if (item.averageWatchSeconds >= 45 && item.views < medianViews) return "内容强但需求不足";
  if (item.views < medianViews) return "推荐测试未放大";
  return "表现高于基线";
}
