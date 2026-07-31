#!/usr/bin/env python3
"""Fetch fresh public hotlists and fail closed when freshness cannot be proven."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys
import urllib.error
import urllib.request

ALLOWED = {"douyin", "bilibili", "weibo", "zhihu", "baidu", "toutiao", "kuaishou", "36kr"}


def load_config(path: str) -> dict:
    with open(path, encoding="utf-8") as handle:
        config = json.load(handle)
    if not config.get("daily_hot_api_base"):
        raise ValueError("daily_hot_api_base 未配置")
    return config


def fetch_one(base: str, platform: str, timeout: int) -> list[dict]:
    request = urllib.request.Request(
        f"{base.rstrip('/')}/{platform}",
        headers={"User-Agent": "financial-titan-topic-engine/1.0"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if str(payload.get("code", 200)) != "200":
        raise RuntimeError(f"{platform} 返回异常状态")
    items = payload.get("data")
    if not isinstance(items, list) or not items:
        raise RuntimeError(f"{platform} 没有实时榜单数据")
    return [
        {
            "rank": index,
            "title": item.get("title", "").strip(),
            "heat": item.get("hot"),
            "url": item.get("url"),
        }
        for index, item in enumerate(items, 1)
        if item.get("title")
    ]


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--platforms", default="douyin,bilibili,weibo,zhihu")
    parser.add_argument("--top", type=int, default=20)
    parser.add_argument("--output", default="data/latest-hotlists.json")
    args = parser.parse_args()
    try:
        config = load_config(args.config)
        requested = [item.strip() for item in args.platforms.split(",") if item.strip()]
        unknown = set(requested) - ALLOWED
        if unknown:
            raise ValueError(f"未知平台：{', '.join(sorted(unknown))}")
        collected_at = dt.datetime.now(dt.timezone.utc).isoformat()
        data = {
            "collected_at": collected_at,
            "fresh": True,
            "platforms": {
                platform: fetch_one(
                    config["daily_hot_api_base"],
                    platform,
                    int(config.get("request_timeout_seconds", 10)),
                )[: args.top]
                for platform in requested
            },
        }
        output = pathlib.Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(output)
        return 0
    except (OSError, ValueError, RuntimeError, urllib.error.URLError, json.JSONDecodeError) as exc:
        print(f"实时热榜不可用：{exc}。已停止，不使用缓存冒充实时数据。", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
