"""Windows x64 first-run setup. Installs tools into this folder, no administrator needed."""
import hashlib, json, os, shutil, subprocess, sys, urllib.request, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
TOOLS=ROOT/"tools"
TOOLS.mkdir(exist_ok=True)
def get(url,path):
    print("Downloading: "+url,flush=True)
    request=urllib.request.Request(url,headers={"User-Agent":"NiVedit-YT-MP3-Setup"})
    with urllib.request.urlopen(request,timeout=180) as src, path.open("wb") as dest:
        shutil.copyfileobj(src,dest)
def json_get(url):
    request=urllib.request.Request(url,headers={"User-Agent":"NiVedit-YT-MP3-Setup"})
    with urllib.request.urlopen(request,timeout=60) as response:return json.load(response)
def unpack(path,dest):
    dest.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            target=(dest/name).resolve()
            if not target.is_relative_to(dest.resolve()):raise RuntimeError("Unsafe archive path")
        archive.extractall(dest)
def main():
    if sys.version_info < (3,10):raise RuntimeError("Install Python 3.10 or newer.")
    if os.name!="nt":raise RuntimeError("This launcher requires Windows x64.")
    import platform
    if platform.machine().lower() not in ("amd64","x86_64"):raise RuntimeError("Windows x64 is required.")
    runtime=ROOT/"runtime"
    if not (runtime/"Scripts/python.exe").is_file():
        subprocess.run([sys.executable,"-m","venv",str(runtime)],check=True)
    python=runtime/"Scripts/python.exe"
    subprocess.run([str(python),"-m","pip","install","--upgrade","yt-dlp[default]"],check=True)
    node=next(TOOLS.glob("node-*-win-x64/node.exe"),None)
    if not node and shutil.which("node"):
        candidate=Path(shutil.which("node"))
        version=subprocess.check_output([str(candidate),"--version"],text=True).strip()
        if int(version.split(".")[0].lstrip("v"))>=22:node=candidate
    if not node:
        releases=json_get("https://nodejs.org/dist/index.json")
        release=next(r for r in releases if r.get("lts") and "win-x64-zip" in r["files"] and int(r["version"].split(".")[0][1:])>=22)
        name="node-"+release["version"]+"-win-x64.zip"
        url="https://nodejs.org/dist/"+release["version"]+"/"
        package=TOOLS/name
        get(url+name,package)
        checks=TOOLS/"node-SHASUMS256.txt"
        get(url+"SHASUMS256.txt",checks)
        expected=next(line.split()[0] for line in checks.read_text().splitlines() if line.split()[-1]==name)
        if hashlib.sha256(package.read_bytes()).hexdigest()!=expected:raise RuntimeError("Node SHA256 mismatch")
        unpack(package,TOOLS)
        node=TOOLS/name.removesuffix(".zip")/"node.exe"
    ffmpeg=next(TOOLS.glob("ffmpeg/**/ffmpeg.exe"),None)
    if not ffmpeg and shutil.which("ffmpeg") and shutil.which("ffprobe"):ffmpeg=Path(shutil.which("ffmpeg"))
    if not ffmpeg:
        release=json_get("https://api.github.com/repos/yt-dlp/FFmpeg-Builds/releases/latest")
        asset=next(a for a in release["assets"] if a["name"]=="ffmpeg-master-latest-win64-gpl.zip")
        package=TOOLS/"ffmpeg.zip"
        get(asset["browser_download_url"],package)
        digest=asset.get("digest") or ""
        if digest.startswith("sha256:") and hashlib.sha256(package.read_bytes()).hexdigest()!=digest[7:]:
            raise RuntimeError("FFmpeg SHA256 mismatch")
        unpack(package,TOOLS/"ffmpeg")
        ffmpeg=next(TOOLS.glob("ffmpeg/**/ffmpeg.exe"))
    for executable in [node,ffmpeg]:
        subprocess.run([str(executable),"-version" if executable==ffmpeg else "--version"],check=True,stdout=subprocess.DEVNULL)
    config={"node":str(node.resolve()),"ffmpeg":str(ffmpeg.resolve()),"use_local_deps":False}
    temp=ROOT/"config.json.tmp"
    temp.write_text(json.dumps(config,indent=2),"utf-8")
    temp.replace(ROOT/"config.json")
    (ROOT/"pythonw.txt").write_text(str(runtime/"Scripts/pythonw.exe"),"utf-8")
    print("Ready. Double-click the VBS launcher. MP3 files are saved under downloads.",flush=True)
if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("Setup failed: "+str(exc),file=sys.stderr)
        sys.exit(1)
