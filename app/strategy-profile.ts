type StrategyProfile = Record<string, any>;

const DIRECTIVE_KEYS = ["topicDirectives", "researchDirectives", "scriptDirectives", "avoid"] as const;

function abstractDirective(value: unknown) {
  let text = String(value || "").trim();
  if (!text) return "";
  // Directives are decisions, not their historical proof. Evidence stays in
  // insights/sampleDigest and must never become current-topic research copy.
  text = text.split(/[；;]/, 1)[0];
  text = text.split(/(?:例如|比如|譬如|举例|证据(?:显示|是|为)?)[：:，,]/, 1)[0];
  text = text.replace(/[（(](?:如|例如|比如)[^）)]*[）)]/g, "");
  text = text.replace(/[\u4e00-\u9fffA-Za-z·]{2,20}(?=(?:高|低)留存样本)/g, "");
  return text.replace(/[，,。；;：:\s]+$/g, "").trim();
}

export function abstractStrategyProfile(profile: StrategyProfile = {}) {
  const clean: StrategyProfile = {
    id: profile.id,
    createdAt: profile.createdAt,
    sampleCount: profile.sampleCount,
    dataBoundary: profile.dataBoundary,
  };
  for (const key of DIRECTIVE_KEYS) {
    clean[key] = [...new Set((Array.isArray(profile[key]) ? profile[key] : []).map(abstractDirective).filter(Boolean))].slice(0, 6);
  }
  return clean;
}

export function researchStrategySummary(profile: StrategyProfile = {}) {
  const rules = abstractStrategyProfile(profile).researchDirectives || [];
  return rules.length
    ? `历史投稿只沉淀为以下通用研究约束：${rules.join("；")}。历史作品、公司、标题和单次表现仅作为复盘证据，不属于本题事实。`
    : "历史反馈尚未形成可用于本题的通用研究约束；不得把历史稿件案例带入当前底稿。";
}
