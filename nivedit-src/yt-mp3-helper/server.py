"""Local-only YouTube to MP3/MP4 UI. Python 3.10+, yt-dlp, FFmpeg, Node."""
import json, os, re, secrets, shutil, subprocess, sys, threading, time, webbrowser
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "downloads"
OUT.mkdir(exist_ok=True)
CONFIG = json.loads((ROOT / "config.json").read_text("utf-8"))
TOKEN = secrets.token_urlsafe(32)
LOCK = threading.RLock()
STATE = {"status": "idle", "progress": 0, "message": "貼上網址，開始擷取音樂。", "logs": [], "file": None, "format": "mp3", "version": "V13.1"}
PROCESS = None
CANCEL = threading.Event()
PORT = 0
FLAGS = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0

def canonical_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError("請輸入有效的 YouTube 影片網址。")
    p = urlparse(value.strip())
    if p.scheme not in ("http", "https") or p.username or p.password or p.port not in (None, 80, 443):
        raise ValueError("請使用 YouTube 的 http / https 網址。")
    if p.hostname == "youtu.be":
        vid = p.path.strip("/")
    elif p.hostname in ("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"):
        parts = p.path.strip("/").split("/")
        vid = parse_qs(p.query).get("v", [""])[0] if p.path == "/watch" else (
            parts[1] if len(parts) == 2 and parts[0] in ("shorts", "embed", "live") else "")
    else:
        raise ValueError("目前只支援 YouTube 影片網址。")
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", vid):
        raise ValueError("找不到影片 ID；請貼上單支影片的分享網址。")
    return "https://www.youtube.com/watch?v=" + vid

def update(**values):
    with LOCK:
        STATE.update(values)

def log(line):
    with LOCK:
        STATE["logs"] = (STATE["logs"] + [line])[-60:]

def command(url, quality, folder, media_format="mp3"):
    options = ["-f", "bestaudio/best", "-x", "--audio-format", "mp3", "--audio-quality", quality]
    if media_format == "mp4":
        # Bound the downloaded resolution; always normalize the final codecs below.
        options = ["-f", f"bv[height<={quality}]+ba/b[height<={quality}]", "--merge-output-format", "mkv"]
    return [sys.executable, "-m", "yt_dlp", "--ignore-config", "--no-plugin-dirs",
        "--no-playlist", "--no-color", "--newline", "--progress", "--no-quiet", "--windows-filenames",
        "--socket-timeout", "25", "--retries", "2", "--fragment-retries", "2",
        "--no-js-runtimes", "--js-runtimes", "node:" + CONFIG["node"],
        "--ffmpeg-location", CONFIG["ffmpeg"], "--match-filters", "!is_live",
        *options, "--embed-metadata", "--no-overwrites",
        "--progress-template", "download:PROGRESS:%(progress._percent_str)s",
        "--print", "after_move:FILE:%(filepath)s", "--no-simulate",
        "-o", str(folder / "%(title).140B [%(id)s].%(ext)s"), "--", url]

def stop_process():
    with LOCK:
        process = PROCESS
        if process and process.poll() is None:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                    capture_output=True, creationflags=FLAGS)
            else:
                process.terminate()

def convert_mp4(source, folder):
    """Normalize all downloaded video formats to browser-editable H.264/AAC."""
    global PROCESS
    output = folder / (source.stem + " - NiVedit.mp4")
    partial = output.with_suffix(".mp4.part")
    args = [CONFIG["ffmpeg"], "-hide_banner", "-nostdin", "-n", "-i", str(source),
        "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "veryfast",
        "-crf", "20", "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-f", "mp4", str(partial)]
    with LOCK:
        if CANCEL.is_set(): return None
        update(message="正在轉成相容 MP4（H.264 / AAC）…", progress=99)
        PROCESS = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", creationflags=FLAGS)
        process = PROCESS
    for line in process.stdout:
        if line.strip(): log(line.strip())
    code = process.wait()
    if CANCEL.is_set(): return None
    if code: raise RuntimeError("MP4 轉檔失敗，請查看 FFmpeg 詳細訊息。")
    partial.replace(output)
    return output


def worker(url, quality, folder, media_format="mp3"):
    global PROCESS
    try:
        env = dict(os.environ, PYTHONPATH=str(ROOT / "deps") if CONFIG.get("use_local_deps", True) else "", PYTHONIOENCODING="utf-8")
        with LOCK:
            if CANCEL.is_set():
                update(status="cancelled", message="已取消。")
                return
            PROCESS = subprocess.Popen(command(url, quality, folder, media_format),
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace", env=env,
                creationflags=FLAGS, cwd=ROOT)
            process = PROCESS
        result = None
        for line in process.stdout:
            line = line.strip()
            if not line:
                continue
            if line.startswith("PROGRESS:"):
                match = re.search(r"([\d.]+)%", line)
                if match:
                    progress = min(99, float(match[1]))
                    update(progress=progress, message="下載中…" if progress < 99 else "下載完成，正在處理 " + media_format.upper() + "…")
            elif line.startswith("FILE:"):
                result = Path(line[5:]).resolve()
            else:
                log(line)
                if "[ExtractAudio]" in line:
                    update(message="正在轉成 MP3…")
        code = process.wait()
        if code == 0 and result and result.is_relative_to(folder.resolve()) and result.is_file() and media_format == "mp4" and not CANCEL.is_set():
            result = convert_mp4(result, folder)
        if CANCEL.is_set():
            update(status="cancelled", message="已取消下載；未完成檔案留在該次資料夾。")
        elif code == 0 and result and result.is_relative_to(folder.resolve()) and result.suffix.lower() == "." + media_format and result.is_file():
            update(status="done", progress=100, message=media_format.upper() + " 已存到電腦，可以預覽或另存。",
                   file=str(result.relative_to(OUT.resolve())).replace("\\", "/"), name=result.name)
        else:
            update(status="error", message="下載失敗。請查看詳細訊息；影片限制、網路或 YouTube 驗證都可能造成失敗。")
    except Exception as exc:
        log(str(exc))
        update(status="error", message="執行失敗，請查看詳細訊息。")
    finally:
        with LOCK:
            if PROCESS and PROCESS.poll() is not None:
                PROCESS = None

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send(self, code, body, kind="application/json; charset=utf-8", headers=None):
        data = json.dumps(body, ensure_ascii=False).encode() if isinstance(body, (dict, list)) else body
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def trusted(self):
        return self.headers.get("Host") == f"127.0.0.1:{PORT}"

    def authenticated(self):
        return secrets.compare_digest(self.headers.get("X-Local-Token", ""), TOKEN)

    def do_GET(self):
        if not self.trusted():
            return self.send(403, {"error": "Host not allowed"})
        p = urlparse(self.path)
        if p.path == "/":
            return self.send(200, (ROOT / "index.html").read_text("utf-8").replace("__LOCAL_TOKEN__", TOKEN).encode("utf-8"), "text/html; charset=utf-8")
        if p.path == "/api/state":
            if not self.authenticated():
                return self.send(403, {"error": "請從啟動捷徑開啟。"})
            with LOCK:
                snapshot = dict(STATE, output=str(OUT))
            return self.send(200, snapshot)
        if p.path in ("/audio", "/media"):
            q = parse_qs(p.query)
            if not secrets.compare_digest(q.get("token", [""])[0], TOKEN):
                return self.send(403, {"error": "Invalid token"})
            name = q.get("file", [""])[0]
            path = (OUT / name).resolve()
            if not path.is_relative_to(OUT.resolve()) or path.suffix.lower() not in (".mp3", ".mp4") or not path.is_file():
                return self.send(404, {"error": "找不到檔案"})
            extra = {}
            if q.get("download"):
                extra["Content-Disposition"] = "attachment; filename*=UTF-8''" + quote(path.name)
            # Stream files; support seeking in the HTML audio player.
            size = path.stat().st_size
            start, end, code = 0, size - 1, 200
            range_header = self.headers.get("Range")
            if range_header:
                m = re.fullmatch(r"bytes=(\d+)-(\d*)", range_header)
                if not m:
                    return self.send(416, b"", headers={"Content-Range": f"bytes */{size}"})
                start = int(m[1])
                end = min(int(m[2]), end) if m[2] else end
                if start > end or start >= size:
                    return self.send(416, b"", headers={"Content-Range": f"bytes */{size}"})
                code = 206
                extra["Content-Range"] = f"bytes {start}-{end}/{size}"
            self.send_response(code)
            for key, value in dict(extra, **{"Content-Type": "video/mp4" if path.suffix.lower() == ".mp4" else "audio/mpeg", "Content-Length": str(end-start+1),
                "Accept-Ranges": "bytes", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}).items():
                self.send_header(key, value)
            self.end_headers()
            try:
                with path.open("rb") as f:
                    f.seek(start)
                    remaining = end-start+1
                    while remaining:
                        block = f.read(min(65536, remaining))
                        if not block: break
                        self.wfile.write(block)
                        remaining -= len(block)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass
            return
        return self.send(404, {"error": "Not found"})

    def do_POST(self):
        if not self.trusted() or not self.authenticated() or self.headers.get("Origin") not in (None, f"http://127.0.0.1:{PORT}"):
            return self.send(403, {"error": "只接受本機介面的操作。"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            if not 0 <= n <= 4096:
                raise ValueError("請求過大。")
            data = json.loads(self.rfile.read(n) or b"{}")
            if not isinstance(data, dict): raise ValueError("無效的請求。")
            if self.path == "/api/start":
                url = canonical_url(data.get("url", ""))
                media_format = data.get("format", "mp3")
                if media_format not in ("mp3", "mp4"): raise ValueError("無效的下載格式。")
                quality = str(data.get("quality", "1080" if media_format == "mp4" else "192"))
                allowed = ("720", "1080", "2160") if media_format == "mp4" else ("128", "192", "320")
                if quality not in allowed: raise ValueError("無效的畫質／音質選項。")
                for key in ("ffmpeg", "node"):
                    if not Path(CONFIG[key]).is_file(): raise ValueError(f"找不到 {key}，請檢查 config.json。")
                with LOCK:
                    if STATE["status"] == "running":
                        return self.send(409, {"error": "已有下載進行中。"})
                    folder = OUT / (time.strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(3))
                    folder.mkdir()
                    CANCEL.clear()
                    update(status="running", progress=0, message="正在讀取影片資料…", logs=[], file=None, name=None, format=media_format)
                    threading.Thread(target=worker, args=(url, quality, folder, media_format), daemon=True).start()
                return self.send(200, {"ok": True})
            if self.path == "/api/cancel":
                CANCEL.set()
                stop_process()
                return self.send(200, {"ok": True})
            if self.path == "/api/folder":
                os.startfile(str(OUT))
                return self.send(200, {"ok": True})
            if self.path == "/api/quit":
                CANCEL.set()
                stop_process()
                self.send(200, {"ok": True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return
            self.send(404, {"error": "Not found"})
        except (ValueError, TypeError, OSError) as exc:
            self.send(400, {"error": str(exc)})

def open_browser(url):
    edge = Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)")) / "Microsoft/Edge/Application/msedge.exe"
    if edge.exists():
        subprocess.Popen([str(edge), url], creationflags=FLAGS)
    else:
        webbrowser.open(url)

def live_session():
    try:
        session = json.loads((ROOT / "session.json").read_text("utf-8"))
        previous = urlparse(session["url"])
        if previous.scheme != "http" or previous.hostname != "127.0.0.1":
            return None
        req = Request(f"http://127.0.0.1:{previous.port}/api/state",
                      headers={"X-Local-Token": previous.fragment})
        with urlopen(req, timeout=1) as response:
            state = json.load(response)
        if state.get("output") == str(OUT):
            return session["url"]
    except Exception:
        pass
    return None

def main():
    global PORT
    url = live_session()
    if url:
        if "--no-browser" not in sys.argv:
            open_browser(url)
        return
    # Hold a Windows file lock for the lifetime of this service, including startup.
    # A second launcher waits for the first service instead of starting a duplicate.
    lockfile = None
    if os.name == "nt":
        import msvcrt
        lockfile = (ROOT / "service.lock").open("a+b")
        if lockfile.tell() == 0:
            lockfile.write(b"0")
            lockfile.flush()
        lockfile.seek(0)
        try:
            msvcrt.locking(lockfile.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            for _ in range(50):
                url = live_session()
                if url:
                    if "--no-browser" not in sys.argv:
                        open_browser(url)
                    return
                time.sleep(0.1)
            raise RuntimeError("The local service is still starting. Please try again.")
    server = ThreadingHTTPServer(("127.0.0.1", 19627), Handler)
    PORT = server.server_port
    url = f"http://127.0.0.1:{PORT}/#{TOKEN}"
    (ROOT / "session.json").write_text(json.dumps({"pid": os.getpid(), "url": url}), "utf-8")
    if "--no-browser" not in sys.argv:
        open_browser(url)
    try:
        server.serve_forever()
    finally:
        CANCEL.set()
        stop_process()
        server.server_close()
        if lockfile:
            lockfile.close()

if __name__ == "__main__":
    main()
