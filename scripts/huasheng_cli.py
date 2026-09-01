import json
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VIDEO_DIR = ROOT / "data" / "huasheng"
VIDEO_DIR.mkdir(parents=True, exist_ok=True)
_tasks = {}
_lock = threading.Lock()
_login_process = None
_login_url = ""
_login_output = []
_login_ready = threading.Event()


def find_hs():
    candidates = [
        shutil.which("hs"),
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "hs" / "hs.exe",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(Path(candidate))
    return ""


def _json_from_output(raw):
    text = (raw or "").strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        for line in reversed(text.splitlines()):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
    return {"message": text[-2000:]}


def _run(args, timeout=30):
    executable = find_hs()
    if not executable:
        return {"ok": False, "status": 503, "error": "未找到 huasheng-cli。请先安装 hs。"}
    completed = subprocess.run(
        [executable, *args, "--json", "--no-color"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    payload = _json_from_output(completed.stdout or completed.stderr)
    if completed.returncode != 0:
        detail = payload.get("error", payload) if isinstance(payload, dict) else payload
        return {"ok": False, "status": 401 if completed.returncode == 1 else 502, "error": detail, "exitCode": completed.returncode}
    return {"ok": True, "data": payload}


def auth_status():
    executable = find_hs()
    if not executable:
        return {"ok": True, "installed": False, "authenticated": False, "message": "huasheng-cli 尚未安装"}
    result = _run(["auth", "status"], timeout=20)
    account = _run(["account"], timeout=20) if result.get("ok") else None
    return {
        "ok": True,
        "installed": True,
        "authenticated": bool(result.get("ok")),
        "auth": result.get("data") if result.get("ok") else None,
        "account": account.get("data") if account and account.get("ok") else None,
        "message": "已登录花生" if result.get("ok") else "需要登录花生",
    }


def _capture_login_output(process):
    global _login_url
    try:
        for line in iter(process.stdout.readline, ""):
            clean = line.strip()
            if clean:
                _login_output.append(clean)
                match = re.search(r"https://\S+", clean)
                if match and "passport.bilibili.com" in match.group(0):
                    _login_url = match.group(0)
                    _login_ready.set()
    finally:
        _login_ready.set()


def _open_auth_in_user_browser(auth_url):
    """Open OAuth in the normal Chrome profile; never read or export its cookies."""
    chrome_candidates = [
        Path(os.environ.get("PROGRAMFILES", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
    ]
    for chrome in chrome_candidates:
        if chrome.is_file():
            subprocess.Popen(
                [str(chrome), "--new-tab", auth_url],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            return "Chrome"
    if hasattr(os, "startfile"):
        os.startfile(auth_url)
        return "系统默认浏览器"
    return ""


def start_login():
    global _login_process, _login_url, _login_output
    executable = find_hs()
    if not executable:
        return {"ok": False, "status": 503, "error": "未找到 huasheng-cli。"}
    if _login_process and _login_process.poll() is None:
        opened_with = _open_auth_in_user_browser(_login_url) if _login_url else ""
        return {"ok": True, "authUrl": _login_url, "openedWith": opened_with, "message": f"已在{opened_with or '浏览器'}打开花生授权，请完成登录。"}
    _login_url = ""
    _login_output = []
    _login_ready.clear()
    _login_process = subprocess.Popen(
        [executable, "auth", "login", "--json", "--no-color"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    threading.Thread(target=_capture_login_output, args=(_login_process,), daemon=True).start()
    _login_ready.wait(10)
    if _login_url:
        opened_with = _open_auth_in_user_browser(_login_url)
        return {"ok": True, "authUrl": _login_url, "openedWith": opened_with, "message": f"已在{opened_with or '浏览器'}打开花生授权，完成后页面会自动检测。"}
    if _login_process.poll() is not None:
        return {"ok": False, "status": 502, "error": "花生登录进程已退出：" + " ".join(_login_output[-4:])}
    return {"ok": False, "status": 504, "error": "花生登录进程已启动，但10秒内没有返回授权地址，请重试。"}


def _task_worker(task_id, command):
    with _lock:
        _tasks[task_id]["status"] = "running"
        _tasks[task_id]["startedAt"] = time.time()
    completed = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    payload = _json_from_output(completed.stdout or completed.stderr)
    with _lock:
        task = _tasks[task_id]
        task["finishedAt"] = time.time()
        task["result"] = payload
        if completed.returncode == 0 and Path(task["outputPath"]).is_file():
            task["status"] = "ready"
            task["downloadUrl"] = f"http://127.0.0.1:4318/huasheng-files/{Path(task['outputPath']).name}"
        else:
            task["status"] = "failed"
            task["error"] = payload.get("error", payload.get("message", f"hs 退出码 {completed.returncode}")) if isinstance(payload, dict) else str(payload)


def start_make(data):
    executable = find_hs()
    if not executable:
        return {"ok": False, "status": 503, "error": "未找到 huasheng-cli。"}
    if not data.get("confirmedCharge"):
        return {"ok": False, "status": 409, "error": "确认分镜会扣除花生积分，必须由你在页面明确确认后才能开始。"}
    script = str(data.get("script") or "").strip()
    if len(re.sub(r"\s+", "", script)) < 100:
        return {"ok": False, "status": 400, "error": "口播稿为空或过短，无法成片。"}
    project_id = re.sub(r"[^A-Za-z0-9_-]", "-", str(data.get("projectId") or "project"))[:80]
    mode = str(data.get("mode") or "auto")
    if mode not in {"auto", "clip", "mg"}:
        mode = "auto"
    aspect = str(data.get("aspect") or "9:16")
    if aspect not in {"9:16", "16:9"}:
        aspect = "9:16"
    task_id = uuid.uuid4().hex
    script_path = VIDEO_DIR / f"{project_id}-{task_id}.txt"
    output_path = VIDEO_DIR / f"{project_id}-{task_id}.mp4"
    script_path.write_text(script, encoding="utf-8")
    command = [
        executable, "make", "--script", f"@{script_path}", "--mode", mode, "--aspect", aspect,
        "--yes", "--out", str(output_path), "--json", "--no-color",
    ]
    task = {
        "taskId": task_id,
        "projectId": project_id,
        "status": "queued",
        "mode": mode,
        "aspect": aspect,
        "outputPath": str(output_path),
        "createdAt": time.time(),
    }
    with _lock:
        _tasks[task_id] = task
    threading.Thread(target=_task_worker, args=(task_id, command), daemon=True).start()
    return {"ok": True, "task": task}


def task_status(task_id):
    with _lock:
        task = dict(_tasks.get(str(task_id), {}))
    if not task:
        return {"ok": False, "status": 404, "error": "没有找到这次花生成片任务，可能是本地服务重启过。"}
    return {"ok": True, "task": task}
