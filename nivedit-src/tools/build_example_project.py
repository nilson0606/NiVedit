"""Create a web-sized copy of the user-provided example project.
The original .nvproj is read-only. All editing settings and non-video media are retained.
Normal builds consume example-assets; this generator alone needs ffmpeg.
"""
from pathlib import Path
import argparse,base64,hashlib,json,struct,subprocess,shutil
ROOT=Path(__file__).resolve().parents[1]
def main():
 p=argparse.ArgumentParser();p.add_argument('--input',type=Path,default=ROOT.parent/'example.nvproj')
 p.add_argument('--ffmpeg',default=shutil.which('ffmpeg'));args=p.parse_args()
 raw=args.input.read_bytes();assert raw[:7]==b'NVPROJ1'
 hlen=struct.unpack('<I',raw[7:11])[0];head=json.loads(raw[11:11+hlen]);base=11+hlen
 original_state=json.loads(json.dumps(head['state']));parts=[];off=0
 temp=ROOT.parent/'qa-v12.4/example';temp.mkdir(parents=True,exist_ok=True)
 for i,m in enumerate(head['index']):
  data=raw[base+m['off']:base+m['off']+m['len']];assert len(data)==m['len']
  if m['type'].startswith('video/'):
   inp=temp/(str(i)+'-source.mov');out=temp/(str(i)+'-web.mp4');inp.write_bytes(data)
   subprocess.run([args.ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(inp),
    '-map','0:v:0','-map','0:a:0?','-vf','scale=1280:720:flags=lanczos,setsar=1',
    '-r','30','-c:v','libx264','-preset','medium','-crf','25','-pix_fmt','yuv420p',
    '-c:a','aac','-b:a','96k','-movflags','+faststart','-map_metadata','-1',str(out)],check=True)
   data=out.read_bytes();m['name']=Path(m['name']).stem+'_720p.mp4';m['type']='video/mp4'
   for c in head['state']['clips']:
    if c.get('mediaKey')==m['key']:c.update(name=m['name'],w=1280,h=720)
  m.update(size=len(data),len=len(data),off=off);off+=len(data);parts.append(data)
 head['name']='NiVedit_範例練習'
 header=json.dumps(head,ensure_ascii=False,separators=(',',':')).encode()
 result=b'NVPROJ1'+struct.pack('<I',len(header))+header+b''.join(parts)
 digest=hashlib.sha256(result).hexdigest();stem='example-'+digest[:12]
 assets=ROOT/'example-assets';assets.mkdir(exist_ok=True)
 payload='window.__nvExampleData('+json.dumps(base64.b64encode(result).decode())+');\n'
 (assets/(stem+'.js')).write_bytes(payload.encode('ascii'))
 # Keep a normal project file locally for comparison and direct opening.
 (temp/'NiVedit_範例練習.nvproj').write_bytes(result)
 meta=dict(stem=stem,bytes=len(result),sha256=digest,name=head['name'],
           originalBytes=len(raw),originalSha256=hashlib.sha256(raw).hexdigest(),
           counts={k:len(head['state'].get(k,[])) for k in ['clips','titles','subs','overlays','musics']})
 (ROOT/'src/46_example_catalog.js').write_bytes(('const EXAMPLE_PROJECT = '+json.dumps(meta,ensure_ascii=False)+';\n').encode())
 # Prove the only changes to the timeline state are source name/resolution.
 for c in head['state']['clips']:
  prior=next(x for x in original_state['clips'] if x['id']==c['id'])
  for k in ['name','w','h']:c[k]=prior[k]
 assert head['state']==original_state
 (temp/'verification.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(meta,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
