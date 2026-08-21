import base64
import json
import mimetypes
import re
import sys
import time
import uuid
from pathlib import Path

# The bundled Codex Python runtime can contain a certifi package whose CA file
# has been removed during a runtime update. Prefer the project's vendored
# dependencies before importing the HTTP client so TLS always uses a real CA bundle.
PROJECT_PACKAGES = Path(__file__).resolve().parents[1] / ".python_packages"
if PROJECT_PACKAGES.is_dir():
    sys.path.insert(0, str(PROJECT_PACKAGES))

import certifi
import httpx
import requests


POE_CHAT_COMPLETIONS_URL = "https://api.poe.com/v1/chat/completions"
COVER_DIR = Path(__file__).resolve().parents[1] / "data" / "covers"
PUBLIC_COVER_DIR = Path(__file__).resolve().parents[1] / "public" / "generated-covers"
PUBLIC_COVER_INDEX = PUBLIC_COVER_DIR / "index.json"


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


def read_streamed_completion(response):
    """Consume Poe's SSE response so long image jobs do not look like idle HTTP requests."""
    text_parts = []
    events = []
    try:
        for line in response.iter_lines():
            if not line or not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if not data or data == "[DONE]":
                continue
            try:
                event = json.loads(data)
            except ValueError:
                continue
            events.append(event)
            choices = event.get("choices") if isinstance(event, dict) else None
            if not isinstance(choices, list):
                continue
            for choice in choices:
                if not isinstance(choice, dict):
                    continue
                delta = choice.get("delta") or {}
                content = delta.get("content") if isinstance(delta, dict) else None
                if isinstance(content, str):
                    text_parts.append(content)
                elif content is not None:
                    text_parts.append(json.dumps(content, ensure_ascii=False))
    except (httpx.RemoteProtocolError, requests.exceptions.ChunkedEncodingError):
        partial = {"events": events, "content": "".join(text_parts)}
        if find_image(partial):
            return partial
        raise
    combined = "".join(text_parts)
    return {"events": events, "content": combined}


def download_provider_image(image_url):
    """Download a temporary provider asset without regenerating or charging again."""
    last_error = None
    headers = {
        "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*",
        "User-Agent": "Mozilla/5.0 FinancialTitanCover/1.0",
        "Connection": "close",
    }
    for attempt in range(4):
        try:
            with httpx.Client(
                follow_redirects=True,
                timeout=httpx.Timeout(120.0, connect=25.0),
                verify=certifi.where(),
                http2=False,
            ) as client:
                downloaded = client.get(image_url, headers=headers)
                downloaded.raise_for_status()
                content = downloaded.content
                content_type = (downloaded.headers.get("content-type") or "").split(";", 1)[0].lower()
                is_image = content.startswith(b"\x89PNG\r\n\x1a\n") or content.startswith(b"\xff\xd8\xff") or (content.startswith(b"RIFF") and content[8:12] == b"WEBP")
                if len(content) < 8_000 or not is_image:
                    raise ValueError("Poe 临时地址没有返回完整图片")
                return content_type or "image/png", content
        except (httpx.ReadError, httpx.ConnectError, httpx.RemoteProtocolError, httpx.TimeoutException) as error:
            last_error = error
            if attempt < 3:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise RuntimeError(f"图片临时地址连续4次读取失败：{type(error).__name__}: {error}") from error
    raise RuntimeError(f"图片下载失败：{last_error}")


def persist_image(image_url, request_id="", project_id="", cover_format=""):
    """Convert provider-owned output into an immutable project-local asset."""
    COVER_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_COVER_DIR.mkdir(parents=True, exist_ok=True)
    mime_type = "image/png"
    if image_url.startswith("data:image/"):
        match = re.match(r"data:([^;]+);base64,(.+)", image_url, re.S)
        if not match:
            raise ValueError("图片模型返回了无法解析的 Data URL")
        mime_type = match.group(1).lower()
        content = base64.b64decode(match.group(2))
    else:
        mime_type, content = download_provider_image(image_url)
    if len(content) < 8_000:
        raise ValueError("图片模型返回的图片文件过小或不完整")
    extension = mimetypes.guess_extension(mime_type) or ".png"
    if extension == ".jpe":
        extension = ".jpg"
    safe_request = re.sub(r"[^A-Za-z0-9_-]+", "", request_id or "")[:36]
    safe_project = re.sub(r"[^A-Za-z0-9_-]+", "-", project_id or "").strip("-")[:80]
    safe_format = cover_format if cover_format in ("landscape", "portrait") else ""
    filename = f"{safe_project}-{safe_format}{extension}" if safe_project and safe_format else f"{safe_request + '-' if safe_request else ''}{uuid.uuid4().hex}{extension}"
    (COVER_DIR / filename).write_bytes(content)
    (PUBLIC_COVER_DIR / filename).write_bytes(content)
    if safe_project and safe_format:
        try:
            index = json.loads(PUBLIC_COVER_INDEX.read_text("utf-8")) if PUBLIC_COVER_INDEX.is_file() else {}
        except (ValueError, OSError):
            index = {}
        project_entry = index.get(project_id) if isinstance(index.get(project_id), dict) else {}
        project_entry[safe_format] = f"/generated-covers/{filename}"
        project_entry["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        index[project_id] = project_entry
        temp_index = PUBLIC_COVER_INDEX.with_suffix(".tmp")
        temp_index.write_text(json.dumps(index, ensure_ascii=False, indent=2), "utf-8")
        temp_index.replace(PUBLIC_COVER_INDEX)
    return filename


def generate(request_data):
    api_key = str(request_data.get("apiKey", "")).strip()
    model = str(request_data.get("model", "gpt-image-2")).strip() or "gpt-image-2"
    prompt = str(request_data.get("prompt", "")).strip()
    aspect_ratio = str(request_data.get("aspectRatio", "")).strip()
    reference_image = str(request_data.get("referenceImage", "")).strip()
    project_id = str(request_data.get("projectId", "")).strip()
    cover_format = str(request_data.get("format", "")).strip()
    allow_person = bool(request_data.get("allowPerson", False))
    named_person = str(request_data.get("namedPerson", "")).strip()

    if not api_key or not prompt or not aspect_ratio:
        return {"ok": False, "status": 400, "error": "缺少 Poe API Key、提示词或画幅参数。"}
    reference_bytes = len(reference_image.encode("utf-8"))
    if reference_bytes > 650_000:
        return {"ok": False, "status": 413, "error": f"参考图请求体仍然过大（{reference_bytes // 1024}KB），已在发送 Poe 前停止，未产生模型费用。请刷新页面后重新选择素材。"}

    try:
        message_content = prompt
        if reference_image:
            message_content = [
                {"type": "text", "text": prompt + (f"\n\nThe only permitted human is the verified named real person: {named_person}. Preserve that person's recognizable identity from the attached source, and do not invent or add any other human." if allow_person and named_person else "\n\nThis is not a people-led topic. The final image must contain zero humans or human-like forms: no face, body, hand, silhouette, crowd, mannequin, statue, figurine, miniature person, doll, avatar, or humanoid shape. If the attached source contains any person, remove the person completely and do not preserve them. Use only the relevant non-human object, environment, material, or market tension from the source.") + "\n\nRebuild lighting, background, composition and typography as instructed. Do not merely place a filter over the source."},
                {"type": "image_url", "image_url": {"url": reference_image}},
            ]
        with requests.Session() as client:
            client.trust_env = False
            with client.post(
                POE_CHAT_COMPLETIONS_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "FinancialTitanCover/1.0",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": message_content}],
                    "stream": True,
                },
                stream=True,
                timeout=(25, 360),
                verify=certifi.where(),
            ) as response:
                request_id = response.headers.get("x-request-id") or response.headers.get("cf-ray") or ""
                if not response.ok:
                    raw_error = response.text
                    try:
                        payload = response.json()
                    except ValueError:
                        payload = None
                    if isinstance(payload, dict):
                        error_value = payload.get("error")
                        if isinstance(error_value, dict):
                            message = error_value.get("message") or json.dumps(error_value, ensure_ascii=False)
                        else:
                            message = error_value or payload.get("message") or payload.get("detail")
                    else:
                        message = None
                    return {
                        "ok": False,
                        "status": response.status_code,
                        "requestId": request_id,
                        "error": f"Poe {response.status_code}：{str(message or raw_error[:600] or 'Poe 未返回错误正文')}",
                    }
                class TextLineResponse:
                    def iter_lines(self):
                        return response.iter_lines(decode_unicode=True)

                payload = read_streamed_completion(TextLineResponse())
    except requests.exceptions.ReadTimeout:
        return {
            "ok": False,
            "status": 504,
            "error": "Poe 图片生成超过 6 分钟仍未返回。为避免重复扣费，本次没有自动重试；请稍后单独重新生成失败的画幅。",
        }
    except requests.exceptions.ConnectTimeout:
        return {"ok": False, "status": 504, "error": "连接 Poe 超时，请检查网络后重试。"}
    except (requests.exceptions.ChunkedEncodingError, requests.exceptions.ConnectionError) as error:
        return {"ok": False, "status": 502, "error": f"Poe 在返回结果前断开连接。为避免重复扣费，系统没有自动重试本次生图请求；请稍后只重试失败画幅。底层错误：{error}"}
    except requests.exceptions.RequestException as error:
        return {"ok": False, "status": 502, "error": f"连接 Poe 失败：{type(error).__name__}: {error}"}

    image_url = find_image(payload)
    if not image_url:
        return {
            "ok": False,
            "status": 502,
            "requestId": request_id,
            "error": "Poe 已响应，但没有返回可识别的图片地址或图片数据。",
        }

    try:
        filename = persist_image(image_url, request_id, project_id, cover_format)
    except Exception as error:
        return {"ok": False, "status": 502, "requestId": request_id, "error": f"封面已生成，但保存到本地资产库失败：{type(error).__name__}: {error}"}
    return {
        "ok": True,
        "imageUrl": f"/generated-covers/{filename}",
        "providerImageUrl": image_url,
        "localFilename": filename,
        "requestId": request_id,
    }


def main():
    request_data = json.load(sys.stdin)
    emit(generate(request_data))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit({"ok": False, "status": 500, "error": f"Python 调用失败：{error}"})
