export type DouyinFocusRow = {
  id: string;
  title: string;
  publishedAt: string;
  views: number;
  previousViews: number | null;
  viewDelta: number | null;
  ageHours: number | null;
  detailCollected: boolean;
  platformStatus: "abnormal" | "no_explicit_restriction";
  reason: string;
};

const identity = (item: any) => String(item.platformId || item.id || `${item.title}|${item.publishedAt}`);
const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function buildDouyinSyncFocus(previous: any[], current: any[], now = Date.now()): DouyinFocusRow[] {
  const before = new Map(previous.map((item) => [identity(item), item]));
  const recent = [...current]
    .filter((item) => Number.isFinite(Date.parse(item.publishedAt || "")))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const selected: DouyinFocusRow[] = [];
  for (const [index, item] of recent.entries()) {
    const prior = before.get(identity(item));
    const views = numeric(item.views);
    const previousViews = prior ? numeric(prior.views) : null;
    const viewDelta = previousViews == null ? null : views - previousViews;
    const ageHours = Math.max(0, (now - Date.parse(item.publishedAt)) / 3_600_000);
    const abnormal = Boolean(item.inReviewing || item.isProhibited || item.isPrivate || item.isDeleted || item.selfSee || item.restrictionReason);
    const newPost = !prior;
    const detailsArrived = Boolean(item.detailCollected && !prior?.detailCollected);
    const materialChange = prior && (Math.abs(viewDelta || 0) >= Math.max(50, numeric(prior.views) * 0.25)
      || Math.abs(numeric(item.averageWatchSeconds) - numeric(prior.averageWatchSeconds)) >= 5
      || abnormal !== Boolean(prior.inReviewing || prior.isProhibited || prior.isPrivate || prior.isDeleted || prior.selfSee || prior.restrictionReason));
    if (index > 0 && !newPost && !detailsArrived && !materialChange) continue;
    if (ageHours > 168 && !abnormal) continue;
    let reason = newPost ? "新增投稿" : detailsArrived ? "逐稿明细刚返回" : materialChange ? "本轮指标显著变化" : "最新投稿持续跟踪";
    if (abnormal) reason += "；后台状态异常";
    else if (!item.detailCollected) reason += "；逐稿留存尚未返回，不作限流归因";
    selected.push({
      id: identity(item), title: String(item.title || ""), publishedAt: item.publishedAt,
      views, previousViews, viewDelta, ageHours: Number(ageHours.toFixed(1)),
      detailCollected: Boolean(item.detailCollected),
      platformStatus: abnormal ? "abnormal" : "no_explicit_restriction", reason,
    });
    if (selected.length >= 5) break;
  }
  return selected;
}

export function compactDouyinSyncSnapshot(records: any[]) {
  return records.map((item) => ({
    id: item.id, platformId: item.platformId, title: item.title, publishedAt: item.publishedAt,
    views: item.views, averageWatchSeconds: item.averageWatchSeconds, detailCollected: item.detailCollected,
    inReviewing: item.inReviewing, isProhibited: item.isProhibited, isPrivate: item.isPrivate,
    isDeleted: item.isDeleted, selfSee: item.selfSee, restrictionReason: item.restrictionReason,
  }));
}
