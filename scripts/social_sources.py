import html
import json
import importlib.util
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import httpx


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOCIAL_PROFILE_ROOT = PROJECT_ROOT / "data" / "social-browser"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"


def _browser_executable():
    candidates = [
        Path(os.environ.get("PROGRAMFILES", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
    ]
    return next((item for item in candidates if item.is_file()), None)


def _profile_dir(platform):
    target = SOCIAL_PROFILE_ROOT / platform
    target.mkdir(parents=True, exist_ok=True)
    return target


def open_social_login(platform):
    if platform not in ("xueqiu", "twitter"):
        return {"ok": False, "status": 400, "error": "不支持的社交平台"}
    browser = _browser_executable()
    if not browser:
        return {"ok": False, "status": 500, "error": "没有找到 Chrome 或 Edge"}
    url = "https://xueqiu.com/" if platform == "xueqiu" else "https://x.com/home"
    subprocess.Popen(
        [str(browser), f"--user-data-dir={_profile_dir(platform)}", "--no-first-run", "--no-default-browser-check", url],
        cwd=str(PROJECT_ROOT), creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
    )
    return {"ok": True, "platform": platform, "message": "登录窗口已打开；完成登录后请关闭该窗口，再回到页面检查状态。"}


def _with_browser(platform, callback):
    from playwright.sync_api import sync_playwright
    executable = _browser_executable()
    if not executable:
        raise RuntimeError("没有找到 Chrome 或 Edge")
    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            str(_profile_dir(platform)), executable_path=str(executable), headless=True,
            args=["--disable-gpu", "--no-first-run"], viewport={"width": 1280, "height": 900},
        )
        try:
            return callback(context)
        finally:
            context.close()


def social_login_status(platform):
    if platform not in ("xueqiu", "twitter"):
        return {"ok": False, "status": 400, "error": "不支持的社交平台"}
    try:
        def probe(context):
            cookie_names = {item.get("name", "") for item in context.cookies()}
            if platform == "xueqiu" and ({"xq_a_token", "u"} & cookie_names):
                return {"ok": True, "platform": platform, "loggedIn": True, "verifiedBy": "session-cookie"}
            if platform == "twitter" and "auth_token" in cookie_names:
                return {"ok": True, "platform": platform, "loggedIn": True, "verifiedBy": "session-cookie"}

            page = context.pages[0] if context.pages else context.new_page()
            page.goto("https://xueqiu.com/" if platform == "xueqiu" else "https://x.com/home", wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(3500)
            cookie_names = {item.get("name", "") for item in context.cookies()}
            if platform == "xueqiu":
                signed_in = bool({"xq_a_token", "u"} & cookie_names) or (
                    page.locator("a[href*='/u/'], .user-name, [class*='avatar']").count() > 0
                    and "login" not in page.url
                )
            else:
                signed_in = "auth_token" in cookie_names or (
                    "/login" not in page.url
                    and page.locator("[data-testid='SideNav_AccountSwitcher_Button'], a[data-testid='AppTabBar_Home_Link'], a[href='/home']").count() > 0
                )
            return {
                "ok": True,
                "platform": platform,
                "loggedIn": signed_in,
                "verifiedBy": "session-cookie-or-account-ui" if signed_in else "none",
                "message": "已检测到专用浏览器登录会话" if signed_in else "专用浏览器中尚未发现有效登录会话；请确认是在弹出的窗口里完成登录并已关闭窗口",
            }
        return _with_browser(platform, probe)
    except Exception as error:
        message = str(error)
        if "user data directory is already in use" in message.lower() or "processsingleton" in message.lower():
            message = "登录窗口仍开着，请完成登录并关闭窗口后再检查"
        return {"ok": True, "platform": platform, "loggedIn": False, "error": message[:220], "message": message[:220]}


def _clean_text(value):
    text = re.sub(r"<[^>]+>", "", str(value or ""))
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def _iso_time(value):
    try:
        number = float(value)
        if number > 10_000_000_000:
            number /= 1000
        return datetime.fromtimestamp(number, timezone.utc).isoformat()
    except (TypeError, ValueError, OSError):
        return ""


def search_xueqiu(query, cookie, limit=20):
    if not cookie:
        try:
            def fetch_in_session(context):
                page = context.pages[0] if context.pages else context.new_page()
                page.goto("https://xueqiu.com/", wait_until="domcontentloaded", timeout=30000)
                target = f"https://xueqiu.com/statuses/search.json?source=all&q={quote(query)}&count={min(limit, 20)}&page=1&sort=time"
                result = page.evaluate("""async (url) => { const response = await fetch(url, {credentials: 'include'}); return {status: response.status, text: await response.text()}; }""", target)
                if result["status"] >= 400:
                    raise RuntimeError(f"HTTP {result['status']}")
                return json.loads(result["text"])
            payload = _with_browser("xueqiu", fetch_in_session)
            return _xueqiu_rows(payload, limit), ""
        except Exception as error:
            return [], f"雪球浏览器会话不可用：{str(error)[:180]}"
    headers = {"User-Agent": USER_AGENT, "Referer": "https://xueqiu.com/", "Cookie": cookie}
    try:
        with httpx.Client(headers=headers, timeout=18, follow_redirects=True) as client:
            client.get("https://xueqiu.com/")
            response = client.get(
                "https://xueqiu.com/statuses/search.json",
                params={"source": "all", "q": query, "count": min(limit, 20), "page": 1, "sort": "time"},
            )
            response.raise_for_status()
            payload = response.json()
        return _xueqiu_rows(payload, limit), ""
    except Exception as error:
        return [], f"雪球直连失败：{type(error).__name__}: {str(error)[:180]}"


def _xueqiu_rows(payload, limit):
    results = []
    for row in (payload.get("list") or [])[:limit]:
        user = row.get("user") or {}
        text = _clean_text(row.get("text") or row.get("description"))
        if not text:
            continue
        post_id = str(row.get("id") or "")
        user_id = str(user.get("id") or "")
        url = row.get("source_link") or (f"https://xueqiu.com/{user_id}/{post_id}" if user_id and post_id else "")
        author = user.get("screen_name") or "雪球用户"
        results.append({
            "title": f"{author}：{text[:72]}", "snippet": text[:600], "url": url,
            "website": "雪球", "published_time": _iso_time(row.get("created_at")),
            "social": True, "platform": "xueqiu", "author": author,
            "engagement": {"likes": row.get("like_count", 0), "comments": row.get("reply_count", 0), "shares": row.get("retweet_count", 0)},
        })
    return results


def _twitter_executable():
    candidates = [
        shutil.which("twitter"),
        PROJECT_ROOT / ".runtime" / "venv" / "Scripts" / "twitter.exe",
        PROJECT_ROOT / ".runtime" / "venv" / "Scripts" / "twitter-script.py",
    ]
    executable = next((str(item) for item in candidates if item and Path(item).is_file()), "")
    if executable:
        return [executable]
    if importlib.util.find_spec("twitter_cli.cli"):
        return [sys.executable, "-m", "twitter_cli.cli"]
    return []


def search_twitter(query, auth_token, ct0, limit=20):
    if not auth_token or not ct0:
        try:
            def scrape_session(context):
                page = context.pages[0] if context.pages else context.new_page()
                page.goto(f"https://x.com/search?q={quote(query)}&src=typed_query&f=live", wait_until="domcontentloaded", timeout=35000)
                page.wait_for_timeout(3500)
                results = []
                for article in page.locator("article").all()[:limit]:
                    text = _clean_text(article.inner_text())
                    links = article.locator("a[href*='/status/']").all()
                    href = links[0].get_attribute("href") if links else ""
                    times = article.locator("time").all()
                    published = times[0].get_attribute("datetime") if times else ""
                    author_match = re.search(r"@([A-Za-z0-9_]+)", text)
                    author = author_match.group(1) if author_match else "X用户"
                    if text and href:
                        results.append({"title": f"@{author}：{text[:72]}", "snippet": text[:600], "url": f"https://x.com{href}", "website": "X/Twitter", "published_time": published or "", "social": True, "platform": "twitter", "author": author, "engagement": {}})
                return results
            return _with_browser("twitter", scrape_session), ""
        except Exception as error:
            return [], f"X浏览器会话不可用：{str(error)[:180]}"
    executable = _twitter_executable()
    if not executable:
        return [], "twitter-cli 未安装"
    env = os.environ.copy()
    env.update({"TWITTER_AUTH_TOKEN": auth_token, "TWITTER_CT0": ct0, "OUTPUT": "json"})
    try:
        command = [*executable, "search", query, "--type", "Latest", "--max", str(min(limit, 30)), "--json"]
        completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env, timeout=45)
        if completed.returncode:
            return [], f"X 直连失败：{(completed.stderr or completed.stdout).strip()[:220]}"
        payload = json.loads(completed.stdout)
        rows = payload.get("data", payload if isinstance(payload, list) else [])
        results = []
        for row in rows[:limit]:
            author_data = row.get("author") or row.get("user") or {}
            author = author_data.get("screenName") or author_data.get("screen_name") or row.get("author") or "X用户"
            text = _clean_text(row.get("text") or row.get("full_text"))
            if not text:
                continue
            tweet_id = str(row.get("id") or row.get("id_str") or "")
            metrics = row.get("metrics") or {}
            results.append({
                "title": f"@{author}：{text[:72]}", "snippet": text[:600],
                "url": f"https://x.com/{author}/status/{tweet_id}" if tweet_id else "",
                "website": "X/Twitter", "published_time": row.get("createdAtISO") or row.get("createdAt") or row.get("created_at") or row.get("time") or "",
                "social": True, "platform": "twitter", "author": author,
                "engagement": {"likes": metrics.get("likes", row.get("favorite_count", 0)), "comments": metrics.get("replies", row.get("reply_count", 0)), "shares": metrics.get("retweets", row.get("retweet_count", 0)), "views": metrics.get("views", row.get("view_count", 0))},
            })
        return results, ""
    except Exception as error:
        return [], f"X 直连失败：{type(error).__name__}: {str(error)[:180]}"


def collect_social_sources(request_data):
    queries = [str(item).strip() for item in request_data.get("queries", []) if str(item).strip()][:8]
    if not queries:
        queries = ["全球股市 财报"]
    all_results = []
    statuses = {"xueqiu": {"ok": False, "count": 0, "error": ""}, "twitter": {"ok": False, "count": 0, "error": ""}}
    for query in queries:
        clean_query = re.sub(r"雪球|X/Twitter|Twitter|投资者讨论|分歧|热议", " ", query, flags=re.I)
        clean_query = re.sub(r"\s+", " ", clean_query).strip()[:80]
        xq_items, xq_error = search_xueqiu(clean_query, request_data.get("xueqiuCookie", ""), 15)
        tw_items, tw_error = search_twitter(clean_query, request_data.get("twitterAuthToken", ""), request_data.get("twitterCt0", ""), 15)
        for item in xq_items + tw_items:
            item["query"] = clean_query
            all_results.append(item)
        statuses["xueqiu"]["count"] += len(xq_items)
        statuses["twitter"]["count"] += len(tw_items)
        statuses["xueqiu"]["error"] = xq_error or statuses["xueqiu"]["error"]
        statuses["twitter"]["error"] = tw_error or statuses["twitter"]["error"]
    statuses["xueqiu"]["ok"] = statuses["xueqiu"]["count"] > 0
    statuses["twitter"]["ok"] = statuses["twitter"]["count"] > 0
    unique = {item.get("url") or f"{item.get('platform')}:{item.get('title')}": item for item in all_results}
    return {"ok": True, "references": list(unique.values()), "channels": statuses}
