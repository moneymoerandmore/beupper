export type TopicSignal = {
  occurredAt: string;
  authoritativeSources: number;
  priceMovePercentile: number;
  chinaSocialPercentile: number;
  overseasSocialPercentile: number;
  marketCount: number;
  transmissionConfirmed: boolean;
  accountFit: number;
  thesisTension: number;
  evidenceQuality: number;
  similarityToRecent: number;
};

export type TopicScore = {
  eligible: boolean;
  score: number;
  ageHours: number;
  reasons: string[];
  breakdown: {
    freshness: number;
    abnormality: number;
    socialHeat: number;
    transmission: number;
    fitAndDepth: number;
    duplicatePenalty: number;
  };
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));

export function rankTopic(signal: TopicSignal, now = new Date()): TopicScore {
  const ageHours = Math.max(
    0,
    (now.getTime() - new Date(signal.occurredAt).getTime()) / 3_600_000,
  );
  const reasons: string[] = [];

  // 24小时内保持高权重，24—48小时快速衰减，72小时后不再进入“今日主推”。
  const freshness = ageHours <= 6
    ? 100
    : ageHours <= 24
      ? 100 - (ageHours - 6) * 1.4
      : ageHours <= 48
        ? 75 - (ageHours - 24) * 2.2
        : clamp(22 - (ageHours - 48) * 1.8);

  const abnormality = clamp(signal.priceMovePercentile);
  const socialHeat = clamp(
    signal.chinaSocialPercentile * 0.48 +
    signal.overseasSocialPercentile * 0.52,
  );
  const transmission = clamp(
    (signal.marketCount >= 3 ? 100 : signal.marketCount === 2 ? 78 : 35) +
    (signal.transmissionConfirmed ? 8 : -12),
  );
  const fitAndDepth = clamp(
    signal.accountFit * 0.35 +
    signal.thesisTension * 0.35 +
    signal.evidenceQuality * 0.3,
  );
  const duplicatePenalty = clamp(signal.similarityToRecent) * 0.16;

  const score = Math.round(clamp(
    freshness * 0.25 +
    abnormality * 0.2 +
    socialHeat * 0.18 +
    transmission * 0.17 +
    fitAndDepth * 0.2 -
    duplicatePenalty,
  ));

  // 硬门槛比总分更重要，防止“长期热门但今天没发生事”的题目混入。
  if (ageHours > 48) reasons.push("核心事件已超过48小时");
  if (signal.authoritativeSources < 2) reasons.push("不足两个独立权威信源");
  if (signal.priceMovePercentile < 70 && socialHeat < 80) reasons.push("价格与讨论度均未达到异常阈值");
  if (signal.marketCount < 2) reasons.push("不具备跨市场映射");
  if (signal.evidenceQuality < 65) reasons.push("证据链质量不足");

  return {
    eligible: reasons.length === 0,
    score,
    ageHours: Math.round(ageHours * 10) / 10,
    reasons,
    breakdown: { freshness, abnormality, socialHeat, transmission, fitAndDepth, duplicatePenalty },
  };
}

export const topicEngineRules = [
  { name: "时效门", rule: "核心事件 ≤ 48h；主推优先 ≤ 24h", weight: "25%" },
  { name: "异动门", rule: "价格异动或讨论增速至少一项进入前20%", weight: "20%" },
  { name: "信源门", rule: "≥ 2个独立权威信源，可追溯到原始信息", weight: "硬门槛" },
  { name: "联动门", rule: "至少映射2个市场，并写明先后与传导路径", weight: "17%" },
  { name: "传播门", rule: "中美社媒分别计算讨论增速，不看绝对热词", weight: "18%" },
  { name: "观点门", rule: "必须形成可证伪、可争论的一句话判断", weight: "20%" },
  { name: "去重门", rule: "与近14日内容相似度越高，扣分越多", weight: "最高-16" },
];
