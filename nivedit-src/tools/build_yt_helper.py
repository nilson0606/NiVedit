"""Package the public MP3/MP4 helper, excluding all user/runtime data."""
from pathlib import Path
import zipfile,shutil
root=Path(__file__).resolve().parents[1]
helper=root/'yt-mp3-helper';assets=root/'yt-mp3-assets'
files=['server.py','index.html','setup.py','setup.cmd','啟動下載器.vbs','start.vbs','使用說明.md']
assets.mkdir(exist_ok=True)
with zipfile.ZipFile(assets/'NiVedit_YT_MP3_Windows.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
 for name in files:z.write(helper/name,'NiVedit_YT_MP3/'+name)
shutil.copy2(helper/'使用說明.md',assets/'README.md')
print('Packaged MP3/MP4 helper:',len(files),'public source files')
