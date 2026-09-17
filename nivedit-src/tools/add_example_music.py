"""Add the user's explicitly authorized example MP3 to the completed 40-cue pack.
Run after build_music_pack_v2.py. Original audio bytes and original project are untouched.
"""
from pathlib import Path
import argparse,base64,hashlib,json,shutil,zipfile,html
ROOT=Path(__file__).resolve().parents[1]
def write(p,s):p.write_bytes(s.encode('utf-8'))
def main():
 p=argparse.ArgumentParser();p.add_argument('--reference',type=Path,required=True);args=p.parse_args()
 old=ROOT.parent/'assets/music_pack_40_v2';out=ROOT.parent/'assets/music_pack_41_v2'
 shutil.copytree(old,out,dirs_exist_ok=True)
 raw=args.reference.read_bytes();digest=hashlib.sha256(raw).hexdigest()
 assert raw[:3]==b'ID3' or raw[0]==255
 name='00_開心輕快_範例配樂.mp3';rel='01_輕快日常/'+name
 (out/rel).write_bytes(raw)
 entry=dict(id='v2-example-bright',category='bright',name='開心輕快（範例配樂）',en='Cheerful example music',
   instruments='範例配樂・輕快流行',instrumentsEn='Example music · cheerful pop',duration=40,bpm=120,
   filename=name,stem='v2-example-bright-'+digest[:12],bytes=len(raw),sha256=digest,mp3=rel,
   provenance='Existing project music, explicitly authorized by the user on 2026-09-17. Original bytes retained.')
 catalog=[entry]+json.loads((old/'manifest.json').read_text(encoding='utf-8'))
 write(out/'manifest.json',json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
 payload=ROOT.parent/'qa-music-v2/music-assets'
 write(payload/(entry['stem']+'.js'),'window.__nvMusicData('+json.dumps(entry['id'])+','+json.dumps(base64.b64encode(raw).decode())+');\n')
 js=(ROOT.parent/'qa-music-v2/28_music_catalog.js').read_text(encoding='utf-8')
 # Use the generated category definitions, but expose the bonus track in the same picker.
 catline=next(x for x in js.splitlines() if x.startswith('const MUSIC_CATEGORIES'))
 pack=dict(version='v2',seconds=40,count=41,originalTracks=40,exampleTracks=1,zip='NiVedit_Music_41_40s_v2.zip')
 write(ROOT.parent/'qa-music-v2/28_music_catalog.js',
  '// 40 original arrangements plus the explicitly authorized example music.\nconst MUSIC_PACK = '+json.dumps(pack)+';\n'+catline+'\nconst MUSIC_CATALOG = '+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';\n')
 readme=(out/'README.md').read_text(encoding='utf-8')
 readme=readme.replace('# NiVedit 背景音樂 v2：40 首 × 40 秒','# NiVedit 背景音樂 v2：40 首新配樂＋1 首範例配樂')
 readme+='\n## 使用者授權的範例配樂\n另附「開心輕快（範例配樂）」原音檔，使用者於 2026-09-17 明確授權加入。總數 41 首，每首約 40 秒。\n範例曲維持原始音訊位元組，原來源聲明在 example-provenance.json；前述 GeneralUser GS 製作說明僅適用另外 40 首新配樂。\n'
 write(out/'README.md',readme)
 write(out/'example-provenance.json',json.dumps({'authorization':'User explicitly authorized reuse of the example music on 2026-09-17.','source_name':args.reference.name,'sha256':digest,'bytes':len(raw),'audio_modified':False},ensure_ascii=False,indent=2)+'\n')
 page=(out/'index.html').read_text(encoding='utf-8')
 page=page.replace('40 首 × 40 秒','40 首新配樂＋1 首範例配樂 · 每首約 40 秒')
 card='<article><h3>'+html.escape(entry['name'])+'</h3><p>你熟悉的範例配樂，原音檔保留</p><p>40 秒 · 約 120 BPM</p><audio controls preload="none" src="'+rel+'"></audio></article>'
 page=page.replace('<div class="grid">','<div class="grid">'+card,1);write(out/'index.html',page)
 target=out.parent/pack['zip']
 with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
  for f in sorted(out.rglob('*')):
   if f.is_file():z.write(f,f.relative_to(out).as_posix())
 shutil.copyfile(target,payload/pack['zip'])
 print(json.dumps({'count':41,'example_sha256':digest,'zip':str(target),'zip_bytes':target.stat().st_size},ensure_ascii=False))
if __name__=='__main__':main()
