#!/usr/bin/env python3
"""Local JSON content asset store: archive, search, and backfill performance."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import uuid

DEFAULT_STORE = pathlib.Path("data/content-store.json")


def load_store(path: pathlib.Path) -> dict:
    if not path.exists():
        return {"version": 1, "updated_at": None, "items": []}
    return json.loads(path.read_text(encoding="utf-8"))


def save_store(path: pathlib.Path, store: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    store["updated_at"] = dt.datetime.now().astimezone().isoformat()
    path.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")


def read_script(value: str) -> str:
    return pathlib.Path(value).read_text(encoding="utf-8-sig") if value != "-" else sys.stdin.read()


def parse_csv(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--store", default=str(DEFAULT_STORE))
    sub = parser.add_subparsers(dest="command", required=True)

    add = sub.add_parser("add")
    add.add_argument("--topic", required=True)
    add.add_argument("--title", required=True)
    add.add_argument("--script", required=True)
    add.add_argument("--platforms", default="")
    add.add_argument("--tags", default="")
    add.add_argument("--series", default="")

    listing = sub.add_parser("list")
    listing.add_argument("--status")

    search = sub.add_parser("search")
    search.add_argument("--query", required=True)

    metrics = sub.add_parser("metrics")
    metrics.add_argument("--id", required=True)
    metrics.add_argument("--views", type=int)
    metrics.add_argument("--likes", type=int)
    metrics.add_argument("--comments", type=int)
    metrics.add_argument("--shares", type=int)
    metrics.add_argument("--completion", type=float)

    args = parser.parse_args()
    path = pathlib.Path(args.store)
    store = load_store(path)

    if args.command == "add":
        now = dt.datetime.now().astimezone()
        item = {
            "id": f"{now:%Y%m%d}-{uuid.uuid4().hex[:8]}",
            "created_at": now.isoformat(),
            "topic": args.topic,
            "title": args.title,
            "script": read_script(args.script).strip(),
            "platforms": parse_csv(args.platforms),
            "tags": parse_csv(args.tags),
            "series": args.series,
            "status": "pending",
            "metrics": {},
        }
        store["items"].append(item)
        save_store(path, store)
        print(json.dumps(item, ensure_ascii=False, indent=2))
    elif args.command == "list":
        items = store["items"]
        if args.status:
            items = [item for item in items if item["status"] == args.status]
        print(json.dumps(list(reversed(items)), ensure_ascii=False, indent=2))
    elif args.command == "search":
        query = re.compile(re.escape(args.query), re.IGNORECASE)
        hits = [
            item for item in store["items"]
            if query.search(" ".join([item["topic"], item["title"], *item["tags"], item["series"]]))
        ]
        print(json.dumps(hits, ensure_ascii=False, indent=2))
    else:
        item = next((entry for entry in store["items"] if entry["id"] == args.id), None)
        if item is None:
            raise SystemExit(f"找不到内容：{args.id}")
        values = {
            "views": args.views,
            "likes": args.likes,
            "comments": args.comments,
            "shares": args.shares,
            "completion_rate": args.completion,
        }
        item["metrics"].update({key: value for key, value in values.items() if value is not None})
        item["status"] = "published"
        item["metrics_updated_at"] = dt.datetime.now().astimezone().isoformat()
        save_store(path, store)
        print(json.dumps(item, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
