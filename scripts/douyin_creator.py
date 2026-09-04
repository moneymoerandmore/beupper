import json
import os
import re
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PROFILE_DIR = PROJECT_ROOT / "data" / "douyin-browser"
DEBUG_PORT = 9333
CREATOR_URL = "https://creator.douyin.com/creator-micro/content/manage"
DATA_CENTER_URL = "https://creator.douyin.com/creator-micro/data-center/content"


def _browser_executable():
    candidates = [
        Path(os.environ.get("PROGRAMFILES", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
    ]
    return next((item for item in candidates if item.is_file()), None)


def open_login():
    browser = _browser_executable()
    if not browser:
        return {"ok": False, "status": 500, "error": "没有找到 Chrome 或 Edge"}
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    subprocess.Popen([
        str(browser), f"--user-data-dir={PROFILE_DIR}", f"--remote-debugging-port={DEBUG_PORT}",
        "--remote-debugging-address=127.0.0.1", "--no-first-run", "--no-default-browser-check", CREATOR_URL,
    ], cwd=str(PROJECT_ROOT), creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
    return {"ok": True, "message": "抖音创作者中心登录窗口已打开。完成登录后回到资产库，再点一次同步按钮。"}


def _with_context(callback):
    from playwright.sync_api import sync_playwright
    executable = _browser_executable()
    if not executable:
        raise RuntimeError("没有找到 Chrome 或 Edge")
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        try:
            browser = playwright.chromium.connect_over_cdp(f"http://127.0.0.1:{DEBUG_PORT}", timeout=3000)
            if browser.contexts:
                return callback(browser.contexts[0])
        except Exception:
            pass
        context = playwright.chromium.launch_persistent_context(
            str(PROFILE_DIR), executable_path=str(executable), headless=True,
            args=["--disable-gpu", "--no-first-run"], viewport={"width": 1440, "height": 1000},
        )
        try:
            return callback(context)
        finally:
            context.close()


def _logged_in(context):
    names = {item.get("name", "") for item in context.cookies()}
    return bool(names.intersection({"sessionid", "sessionid_ss", "passport_csrf_token", "sid_guard"}))


def login_status():
    try:
        def probe(context):
            page = context.pages[0] if context.pages else context.new_page()
            page.goto(CREATOR_URL, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(2500)
            body_text = page.locator("body").inner_text()
            login_ui = ("扫码登录" in body_text and ("验证码登录" in body_text or "密码登录" in body_text))
            signed_in = _logged_in(context) and "login" not in page.url.lower() and not login_ui
            return {"ok": True, "loggedIn": signed_in, "url": page.url,
                    "message": "已检测到抖音创作者登录态" if signed_in else "尚未检测到有效登录态"}
        return _with_context(probe)
    except Exception as error:
        return {"ok": True, "loggedIn": False, "message": str(error)[:240]}


def _number(value):
    if value is None: return None
    if isinstance(value, (int, float)): return value
    text = str(value).replace(",", "").strip()
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    return float(match.group()) if match else None


def _rate(value):
    number = _number(value)
    if number is None: return None
    return number * 100 if -1 <= number <= 1 else number


def _first(item, *keys):
    for key in keys:
        value = item.get(key)
        if value not in (None, "", []): return value
    return None


def _walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values(): yield from _walk(child)
    elif isinstance(value, list):
        for child in value: yield from _walk(child)


def _normalize_record(item):
    title = _first(item, "title", "video_title", "item_title", "desc", "name")
    if not isinstance(title, str) or len(title.strip()) < 4: return None
    stats = _first(item, "statistics", "stats", "data_info", "metric") or {}
    if not isinstance(stats, dict): stats = {}
    merged = {**item, **stats}
    views = _number(_first(merged, "play_count", "playCount", "view_count", "viewCount", "vv", "views"))
    if views is None: return None
    create_time = _first(merged, "create_time", "createTime", "publish_time", "publishTime", "published_at")
    if isinstance(create_time, (int, float)):
        if create_time > 10_000_000_000: create_time /= 1000
        published_at = datetime.fromtimestamp(create_time, timezone.utc).isoformat()
    else:
        published_at = str(create_time or "")
    item_id = str(_first(merged, "aweme_id", "item_id", "itemId", "video_id", "videoId", "id") or "")
    duration = _number(_first(merged, "duration", "duration_seconds", "durationSeconds"))
    if duration and duration > 10000: duration /= 1000
    ratio = _rate(_first(merged, "average_play_ratio", "avg_play_ratio", "averagePlayRatio"))
    watch = _number(_first(merged, "average_watch_seconds", "avg_play_duration", "averagePlayDuration"))
    return {
        "id": f"dy-live-{item_id or abs(hash((title, published_at)))}", "platformId": item_id,
        "title": re.sub(r"\s+", " ", title).strip(), "publishedAt": published_at,
        "durationSeconds": duration or 0, "views": views or 0,
        "likes": _number(_first(merged, "digg_count", "like_count", "likes")) or 0,
        "comments": _number(_first(merged, "comment_count", "comments")) or 0,
        "shares": _number(_first(merged, "share_count", "shares")) or 0,
        "favorites": _number(_first(merged, "collect_count", "favorite_count", "favorites")) or 0,
        "followers": _number(_first(merged, "follow_count", "fans_count", "followers")) or 0,
        "coverCtr": _rate(_first(merged, "cover_ctr", "coverCtr")) or 0,
        "averagePlayRatio": ratio or 0, "averageWatchSeconds": watch or 0,
        "completionRate": _rate(_first(merged, "finish_rate", "completion_rate", "completionRate")),
        "twoSecondBounceRate": _rate(_first(merged, "two_second_bounce_rate", "twoSecondBounceRate")),
        "fiveSecondCompletionRate": _rate(_first(merged, "five_second_finish_rate", "fiveSecondCompletionRate")),
        "url": _first(merged, "share_url", "video_url", "url") or "",
        "collectedAt": datetime.now(timezone.utc).isoformat(), "source": "douyin_creator_center",
        "detailCollected": False,
    }


def _detail_values(item):
    """Extract per-item analytics even when a response does not repeat play_count."""
    if not isinstance(item, dict): return None
    item_id = str(_first(item, "aweme_id", "item_id", "itemId", "video_id", "videoId", "id") or "")
    title = _first(item, "title", "video_title", "item_title", "desc", "name")
    if not item_id and not isinstance(title, str): return None
    aliases = {
        "views": ("play_count", "view_count", "vv"),
        "averageWatchSeconds": ("average_play_duration", "avg_play_duration", "average_watch_seconds"),
        "averagePlayRatio": ("average_play_ratio", "avg_play_ratio"),
        "completionRate": ("finish_rate", "completion_rate", "video_finish_rate"),
        "twoSecondBounceRate": ("bounce_rate_2s", "two_second_bounce_rate", "2s_bounce_rate"),
        "fiveSecondCompletionRate": ("completion_rate_5s", "five_second_finish_rate", "5s_finish_rate"),
        "coverCtr": ("cover_ctr", "cover_click_rate"),
        "followers": ("net_follow_fans", "follow_count", "fans_count"),
    }
    values = {"platformId": item_id, "title": title.strip() if isinstance(title, str) else ""}
    found = False
    analytics_found = False
    for target, keys in aliases.items():
        value = (_rate(_first(item, *keys)) if target in {"averagePlayRatio", "completionRate",
                 "twoSecondBounceRate", "fiveSecondCompletionRate", "coverCtr"}
                 else _number(_first(item, *keys)))
        if value is not None:
            values[target] = value
            found = True
            if target in {"averageWatchSeconds", "averagePlayRatio", "completionRate",
                          "twoSecondBounceRate", "fiveSecondCompletionRate", "coverCtr"}:
                analytics_found = True
    if found:
        values["detailCollected"] = analytics_found
        return values
    return None


def _merge_details(records, details):
    by_id = {row.get("platformId"): row for row in records if row.get("platformId")}
    by_title = {re.sub(r"\W+", "", row.get("title", "")): row for row in records if row.get("title")}
    for detail in details:
        target = by_id.get(detail.get("platformId"))
        if not target and detail.get("title"):
            target = by_title.get(re.sub(r"\W+", "", detail["title"]))
        if not target: continue
        for key, value in detail.items():
            if key == "detailCollected" and not value:
                continue
            if key == "views" and target.get("views") is not None:
                continue
            if key not in {"platformId", "title"} and value is not None:
                target[key] = value


def _find_work_page(payload):
    for item in _walk(payload):
        if not isinstance(item, dict): continue
        works = _first(item, "aweme_list", "item_list", "work_list", "items")
        if isinstance(works, list) and any(isinstance(row, dict) and _first(row, "aweme_id", "item_id") for row in works):
            return works, _first(item, "max_cursor", "cursor", "next_cursor"), bool(_first(item, "has_more", "hasMore"))
    return None


def sync_creator_data():
    def collect(context):
        page = context.pages[0] if context.pages else context.new_page()
        payloads = []
        response_urls = []
        def capture(response):
            if not re.search(r"aweme|item|video|content|manage|work|data", response.url, re.I): return
            response_urls.append(response.url)
            try:
                content_type = response.headers.get("content-type", "")
                if "json" in content_type: payloads.append(response.json())
            except Exception: pass
        page.on("response", capture)
        page.goto(CREATOR_URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(3500)
        body_text = page.locator("body").inner_text()
        login_ui = ("扫码登录" in body_text and ("验证码登录" in body_text or "密码登录" in body_text))
        if not _logged_in(context) or login_ui:
            return {"ok": False, "status": 401, "loginRequired": True, "error": "未检测到抖音创作者中心登录态"}
        # Pull every work page sequentially. Douyin currently defaults to 12 items per page.
        first_page = next((_find_work_page(payload) for payload in payloads if _find_work_page(payload)), None)
        if not first_page:
            for attempt in range(3):
                try:
                    page_payload = page.evaluate("""async () => {
                      const u = '/janus/douyin/creator/pc/work_list?status=0&count=50&max_cursor=0&scene=star_atlas&device_platform=android&aid=1128';
                      const r = await fetch(u, {credentials:'include'}); if (!r.ok) throw new Error(`work_list ${r.status}`); return await r.json();
                    }""")
                    payloads.append(page_payload)
                    first_page = _find_work_page(page_payload)
                    if first_page: break
                except Exception:
                    if attempt < 2: page.wait_for_timeout(1500)
        cursor = first_page[1] if first_page else 0
        has_more = first_page[2] if first_page else False
        seen_cursors = {str(cursor)}
        for _ in range(60):
            if not has_more or cursor in (None, ""): break
            page_payload = page.evaluate("""async (cursor) => {
              const u = `/janus/douyin/creator/pc/work_list?status=0&count=50&max_cursor=${encodeURIComponent(cursor)}&scene=star_atlas&device_platform=android&aid=1128`;
              const r = await fetch(u, {credentials:'include'}); if (!r.ok) throw new Error(`work_list ${r.status}`); return await r.json();
            }""", cursor)
            payloads.append(page_payload)
            page_info = _find_work_page(page_payload)
            if not page_info: break
            cursor, has_more = page_info[1], page_info[2]
            if str(cursor) in seen_cursors: break
            seen_cursors.add(str(cursor))
        for _ in range(12):
            page.mouse.wheel(0, 1800)
            page.wait_for_timeout(300)
        records = {}
        for payload in payloads:
            for item in _walk(payload):
                record = _normalize_record(item)
                if record: records[record["id"]] = record
        if not records:
            # DOM fallback preserves at least title/list metrics when API response shapes change.
            cards = page.locator("[class*='content-item'], [class*='video-item'], [class*='work-item'], tr")
            for index in range(min(cards.count(), 300)):
                text = re.sub(r"\s+", " ", cards.nth(index).inner_text()).strip()
                title_match = re.search(r"^(.{4,100}?)(?:\s+\d|\s+播放|$)", text)
                view_match = re.search(r"(?:播放|观看)\s*([\d,.万]+)", text)
                if not title_match or not view_match: continue
                view_text = view_match.group(1)
                multiplier = 10000 if "万" in view_text else 1
                views = (_number(view_text) or 0) * multiplier
                record = {"id": f"dy-dom-{index}-{abs(hash(title_match.group(1)))}", "title": title_match.group(1),
                          "publishedAt": "", "durationSeconds": 0, "views": views, "likes": 0, "comments": 0,
                          "shares": 0, "favorites": 0, "followers": 0, "coverCtr": 0, "averagePlayRatio": 0,
                          "averageWatchSeconds": 0, "collectedAt": datetime.now(timezone.utc).isoformat(),
                          "source": "douyin_creator_center"}
                records[record["id"]] = record
        result = sorted(records.values(), key=lambda row: row.get("publishedAt") or "", reverse=True)
        if not result:
            return {"ok": False, "status": 502, "error": "抖音登录态有效，但作品列表本次没有返回数据；请稍后重试同步"}
        detail_probe = {}
        detail_error = None
        if result:
            try:
                response_urls.clear()
                payloads.clear()
                page.goto(DATA_CENTER_URL, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(8000)
                item_list_tab = page.get_by_text("投稿列表", exact=True)
                if item_list_tab.count():
                    item_list_tab.first.click(timeout=5000)
                    page.wait_for_timeout(8000)
                end_date = datetime.now().strftime("%Y%m%d")
                start_date = (datetime.now() - timedelta(days=90)).strftime("%Y%m%d")
                direct_payloads = page.evaluate("""async ({startDate,endDate}) => {
                  const metrics = [1,10,11,14];
                  const results = [];
                  for (const metric of metrics) {
                    const q = new URLSearchParams({
                      genres: JSON.stringify([1,2,3,4,5,8]), start_date:startDate,
                      end_date:endDate, primary_verticals:JSON.stringify([]), metric_type:String(metric)
                    });
                    try {
                      const r = await fetch(`/janus/douyin/creator/data/item_analysis/item_performance?${q}`, {credentials:'include'});
                      if (r.ok) results.push(await r.json());
                    } catch (_) {}
                  }
                  return results;
                }""", {"startDate": start_date, "endDate": end_date})
                payloads.extend(direct_payloads or [])
                for label in ("内容数据", "内容分析", "作品数据", "作品分析"):
                    control = page.get_by_text(label, exact=True)
                    if control.count():
                        control.first.click(timeout=5000); page.wait_for_timeout(2500); break
                metric_clicks = []
                for label in ("播放量", "平均播放时长", "2秒跳出率", "5秒完播率"):
                    try:
                        control = page.get_by_text(label, exact=True)
                        if control.count() and control.first.is_visible():
                            control.first.click(timeout=2500); page.wait_for_timeout(1200); metric_clicks.append(label)
                    except Exception:
                        pass
                details = []
                for payload in payloads:
                    for item in _walk(payload):
                        detail = _detail_values(item)
                        if detail: details.append(detail)
                _merge_details(result, details)
                detail_probe = {"page": "data-center", "metricsRequested": metric_clicks,
                                "detailRows": len(details),
                                "url": page.url,
                                "visibleText": (re.sub(r"\s+", " ", page.locator("body").inner_text())[:1200]
                                                if not details else ""),
                                "responsePaths": list(dict.fromkeys(item.split("?", 1)[0] for item in response_urls[-80:]))}
            except Exception as error:
                detail_error = str(error)[:240]
                detail_probe = {"page": "data-center", "error": detail_error}
        return {"ok": True, "loggedIn": True, "records": result, "count": len(result),
                "collectedAt": datetime.now(timezone.utc).isoformat(),
                "detailComplete": bool(result) and any(row.get("detailCollected") for row in result),
                "message": (f"已读取 {len(result)} 条作品，并合并逐稿内容分析" if any(row.get("detailCollected") for row in result)
                            else f"已读取 {len(result)} 条作品；逐稿内容分析本次未完成"),
                "detailProbe": detail_probe,
                "diagnostic": None if result else {"pageUrl": page.url, "pageTitle": page.title(),
                    "responsePaths": [item.split("?", 1)[0] for item in response_urls[-30:]],
                    "visibleText": re.sub(r"\s+", " ", page.locator("body").inner_text())[:600]}}
    try:
        return _with_context(collect)
    except Exception as error:
        return {"ok": False, "status": 502, "error": f"抖音创作者中心读取失败：{error}"}
