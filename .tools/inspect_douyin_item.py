import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path('scripts').resolve()))
from douyin_creator import CREATOR_URL, _walk, _with_context


def inspect(context):
    page = context.pages[0] if context.pages else context.new_page()
    page.goto(CREATOR_URL, wait_until='domcontentloaded', timeout=60000)
    payload = page.evaluate("""async () => {
      const u='/janus/douyin/creator/pc/work_list?status=0&count=50&max_cursor=0&scene=star_atlas&device_platform=android&aid=1128';
      const r=await fetch(u,{credentials:'include'}); return await r.json();
    }""")
    matches=[]
    for item in _walk(payload):
        if not isinstance(item, dict):
            continue
        text=json.dumps(item, ensure_ascii=False)
        if '7685604418997259560' in text or '美股崩、A股涨' in text:
            matches.append(item)
    return matches


print(json.dumps(_with_context(inspect), ensure_ascii=False, indent=2))
