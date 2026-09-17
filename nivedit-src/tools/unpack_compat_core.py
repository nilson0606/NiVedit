"""Extract the unmodified core distributed in the file-compatible JS wrapper."""
import json,base64,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'compat-assets'
s=(root/'ffmpeg-0.12.10.js').read_text()
args=s.split('window.__nvCompatAsset(',1)[1].rsplit(');',1)[0]
core,chunks=json.loads('['+args+']')
out=Path('ffmpeg-core-extracted');out.mkdir(exist_ok=True)
manifest=json.loads((root/'manifest.json').read_text())
for name,data,sha in [('ffmpeg-core.js',core.encode(),manifest['coreSha256']),('ffmpeg-core.wasm',base64.b64decode(''.join(chunks)),manifest['sha256'])]:
 assert hashlib.sha256(data).hexdigest()==sha
 (out/name).write_bytes(data)
 print(out/name,sha)
