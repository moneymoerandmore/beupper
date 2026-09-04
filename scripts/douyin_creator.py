import json
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PROFILE_DIR = PROJECT_ROOT / "data" / "douyin-browser"
DEBUG_PORT = 9333
CREATOR_URL = "https://creator.douyin.com/creator-micro/content/manage"


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
            login_ui = (("扫码登录" in body_text and ("验证码登录" in body_text or "密码登录" in body_text))
                        or ("创作者登录" in body_text and "作品管理" not in body_text))
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
    ratio = _number(_first(merged, "average_play_ratio", "avg_play_ratio", "averagePlayRatio"))
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
        "coverCtr": _number(_first(merged, "cover_ctr", "coverCtr")) or 0,
        "averagePlayRatio": ratio or 0, "averageWatchSeconds": watch or 0,
        "completionRate": _number(_first(merged, "finish_rate", "completion_rate", "completionRate")),
        "twoSecondBounceRate": _number(_first(merged, "two_second_bounce_rate", "twoSecondBounceRate")),
        "fiveSecondCompletionRate": _number(_first(merged, "five_second_finish_rate", "fiveSecondCompletionRate")),
        "url": _first(merged, "share_url", "video_url", "url") or "",
        "collectedAt": datetime.now(timezone.utc).isoformat(), "source": "douyin_creator_center",
    }


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
        login_ui = (("扫码登录" in body_text and ("验证码登录" in body_text or "密码登录" in body_text))
                    or ("创作者登录" in body_text and "作品管理" not in body_text))
        if not _logged_in(context) or login_ui:
            return {"ok": False, "status": 401, "loginRequired": True, "error": "未检测到抖音创作者中心登录态"}
        for _ in range(12):
            page.mouse.wheel(0, 1800)
            page.wait_for_timeout(650)
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
        return {"ok": True, "loggedIn": True, "records": result, "count": len(result),
                "collectedAt": datetime.now(timezone.utc).isoformat(),
                "message": f"已从抖音创作者中心读取 {len(result)} 条作品",
                "diagnostic": None if result else {"pageUrl": page.url, "pageTitle": page.title(),
                    "responsePaths": [item.split("?", 1)[0] for item in response_urls[-30:]],
                    "visibleText": re.sub(r"\s+", " ", page.locator("body").inner_text())[:600]}}
    try:
        return _with_context(collect)
    except Exception as error:
        return {"ok": False, "status": 502, "error": f"抖音创作者中心读取失败：{error}"}
