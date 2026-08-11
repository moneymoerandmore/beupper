import base64
import json
import re
import sys
from pathlib import Path

# The bundled Codex Python runtime can contain a certifi package whose CA file
# has been removed during a runtime update. Prefer the project's vendored
# dependencies before importing the HTTP client so TLS always uses a real CA bundle.
PROJECT_PACKAGES = Path(__file__).resolve().parents[1] / ".python_packages"
if PROJECT_PACKAGES.is_dir():
    sys.path.insert(0, str(PROJECT_PACKAGES))

import certifi
import httpx


POE_CHAT_COMPLETIONS_URL = "https://api.poe.com/v1/chat/completions"


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


def find_image(value):
    if isinstance(value, dict):
        for key in ("b64_json", "base64", "image_base64"):
            encoded = value.get(key)
            if isinstance(encoded, str) and encoded:
                return f"data:image/png;base64,{encoded}"
        for key in ("url", "image_url", "imageUrl"):
            url = value.get(key)
            if isinstance(url, str) and (url.startswith("http") or url.startswith("data:image/")):
                return url
        for child in value.values():
            found = find_image(child)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = find_image(child)
            if found:
                return found
    elif isinstance(value, str):
        data_match = re.search(r"data:image/[^;]+;base64,[A-Za-z0-9+/=]+", value)
        if data_match:
            return data_match.group(0)
        url_match = re.search(r"https?://[^\s\"'<>()[\]]+", value)
        if url_match:
            return url_match.group(0).rstrip(").,;")
    return None


def generate(request_data):
    api_key = str(request_data.get("apiKey", "")).strip()
    model = str(request_data.get("model", "gpt-image-2")).strip() or "gpt-image-2"
    prompt = str(request_data.get("prompt", "")).strip()
    aspect_ratio = str(request_data.get("aspectRatio", "")).strip()
    reference_image = str(request_data.get("referenceImage", "")).strip()
    allow_person = bool(request_data.get("allowPerson", False))
    named_person = str(request_data.get("namedPerson", "")).strip()

    if not api_key or not prompt or not aspect_ratio:
        return {"ok": False, "status": 400, "error": "缺少 Poe API Key、提示词或画幅参数。"}

    try:
        message_content = prompt
        if reference_image:
            message_content = [
                {"type": "text", "text": prompt + (f"\n\nThe only permitted human is the verified named real person: {named_person}. Preserve that person's recognizable identity from the attached source, and do not invent or add any other human." if allow_person and named_person else "\n\nThis is not a people-led topic. The final image must contain zero humans or human-like forms: no face, body, hand, silhouette, crowd, mannequin, statue, figurine, miniature person, doll, avatar, or humanoid shape. If the attached source contains any person, remove the person completely and do not preserve them. Use only the relevant non-human object, environment, material, or market tension from the source.") + "\n\nRebuild lighting, background, composition and typography as instructed. Do not merely place a filter over the source."},
                {"type": "image_url", "image_url": {"url": reference_image}},
            ]
        response = httpx.post(
            POE_CHAT_COMPLETIONS_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": message_content}],
                "stream": False,
            },
            # 图片模型经常需要数分钟。连接阶段快速失败，生成读取阶段允许 6 分钟；
            # 读取超时后不自动重试，避免同一张图重复提交和重复计费。
            timeout=httpx.Timeout(360.0, connect=20.0),
            verify=certifi.where(),
        )
    except httpx.ReadTimeout:
        return {
            "ok": False,
            "status": 504,
            "error": "Poe 图片生成超过 6 分钟仍未返回。为避免重复扣费，本次没有自动重试；请稍后单独重新生成失败的画幅。",
        }
    except httpx.ConnectTimeout:
        return {"ok": False, "status": 504, "error": "连接 Poe 超时，请检查网络后重试。"}
    except httpx.RequestError as error:
        return {"ok": False, "status": 502, "error": f"连接 Poe 失败：{error}"}

    request_id = response.headers.get("x-request-id") or response.headers.get("cf-ray") or ""
    try:
        payload = response.json()
    except ValueError:
        payload = None

    if not response.is_success:
        if isinstance(payload, dict):
            error_value = payload.get("error")
            if isinstance(error_value, dict):
                message = error_value.get("message") or json.dumps(error_value, ensure_ascii=False)
            else:
                message = error_value or payload.get("message") or payload.get("detail")
        else:
            message = None
        message = str(message or response.text[:600] or "Poe 未返回错误正文")
        return {
            "ok": False,
            "status": response.status_code,
            "requestId": request_id,
            "error": f"Poe {response.status_code}：{message}",
        }

    image_url = find_image(payload)
    if not image_url:
        return {
            "ok": False,
            "status": 502,
            "requestId": request_id,
            "error": "Poe 已响应，但没有返回可识别的图片地址或图片数据。",
        }

    return {"ok": True, "imageUrl": image_url, "requestId": request_id}


def main():
    request_data = json.load(sys.stdin)
    emit(generate(request_data))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit({"ok": False, "status": 500, "error": f"Python 调用失败：{error}"})
