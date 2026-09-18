"""Regenerate the 60 replacement cues with independent themes and arrangements.
Preserves the original v2 forty tracks and authorized example byte for byte.
"""
from pathlib import Path
import argparse,base64,hashlib,html,json,shutil,subprocess,sys,zipfile
import numpy as np
import build_music_pack_v2 as base
from music_v4_compositions import compose,render,MOODS,STYLES
ROOT=Path(__file__).resolve().parents[1]
SR=base.SR;N=base.N
def write(p,s):p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(s.encode('utf-8'))

def main():
 p=argparse.ArgumentParser();p.add_argument('--ffmpeg',required=True);p.add_argument('--soundfont',type=Path,required=True);p.add_argument('--bindings',type=Path);p.add_argument('--only')
 args=p.parse_args()
 if args.bindings:sys.path.insert(0,str(args.bindings.resolve()))
 out=ROOT.parent/'assets/music_pack_101_v4';qa=ROOT.parent/'qa-music-v4';payload=qa/'music-assets'
 for d in [out,qa,payload]:d.mkdir(parents=True,exist_ok=True)
 sf=args.soundfont.read_bytes();assert hashlib.sha256(sf).hexdigest()=='9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe'
 oldroot=ROOT.parent/'assets/music_pack_41_v2';old=json.loads((oldroot/'manifest.json').read_text(encoding='utf-8'))
 assert len(old)==41
 # Retain all old MP3 bytes and identifiers, including the separately authorized example.
 for e in old:
  src=oldroot/e['mp3'];raw=src.read_bytes();assert hashlib.sha256(raw).hexdigest()==e['sha256']
  dst=out/e['mp3'];dst.parent.mkdir(exist_ok=True,parents=True);shutil.copy2(src,dst)
 cats=[dict(id=i,name=z,en=e) for i,z,e in base.CATEGORIES];catmap={c['id']:c for c in cats}
 entries=[];scores=[];checks=[]
 only={int(x)-1 for x in args.only.split(',')} if args.only else None
 for i in range(60):
  if only is not None and i not in only:continue
  score=compose(i);cid=score['category'];number=i+41;ident=f'v4-{number:03}-{cid}'
  folder=out/(str([c['id'] for c in cats].index(cid)+1).zfill(2)+'_'+catmap[cid]['name']);folder.mkdir(exist_ok=True)
  filename=f'{number:03}_{score["name"]}.mp3';file=folder/filename;cache=qa/(ident+'.json')
  fingerprint=hashlib.sha256(json.dumps(score,sort_keys=True).encode()).hexdigest()
  saved=json.loads(cache.read_text(encoding='utf-8')) if cache.exists() else None
  if saved and saved['scoreSha256']==fingerprint and file.exists() and hashlib.sha256(file.read_bytes()).hexdigest()==saved['entry']['sha256']:
   entry=saved['entry'];check=saved['check']
   print(f'{i+1:02}/60 cached {score["name"]}',flush=True)
  else:
   audio=render(score,sf)
   if score['genre']=='house':
    # Mild beat-linked breathing, no chopped gates.
    phase=(np.arange(N)/SR*score['bpm']/60)%1
    audio*= (.84+.16*np.minimum(1,phase/.28))[:,None]
   cmd=[args.ffmpeg,'-hide_banner','-loglevel','info','-y','-f','f32le','-ar',str(SR),'-ac','2','-i','pipe:0','-af','loudnorm=I=-17:TP=-1.8:LRA=9:print_format=json,aresample=44100,atrim=end_sample=1764000','-ar',str(SR),'-c:a','libmp3lame','-b:a','192k','-write_xing','1','-metadata','title='+score['name'],'-metadata','artist=NiVedit','-metadata','album=NiVedit Diverse Music v4','-metadata','genre='+score['genreEn'],str(file)]
   run=subprocess.run(cmd,input=audio.tobytes(),capture_output=True,check=True)
   loud=json.loads('{'+run.stderr.decode(errors='replace').rsplit('{',1)[1])
   pcm=np.frombuffer(subprocess.check_output([args.ffmpeg,'-v','error','-i',str(file),'-ar',str(SR),'-ac','2','-f','f32le','pipe:1']),dtype='<f4').reshape(-1,2)
   rms=float(np.sqrt(np.mean(pcm**2)));peak=float(np.max(np.abs(pcm)))
   assert abs(len(pcm)-N)<=32 and .035<rms<.3 and peak<.98,(ident,len(pcm),rms,peak)
   assert np.max(np.abs(pcm[-100:]))<.03,(ident,'tail')
   raw=file.read_bytes();digest=hashlib.sha256(raw).hexdigest()
   entry=dict(id=ident,category=cid,name=score['name'],en=score['en'],instruments='新曲・'+score['moodName']+'・'+score['genreName'],instrumentsEn='New · '+score['moodEn']+' · '+score['genreEn'],genre=score['genre'],mood=score['mood'],moodName=score['moodName'],meter=score['meter'],denominator=score['denominator'],structure=score['structure'],duration=40,bpm=score['bpm'],filename=filename,stem=ident+'-'+digest[:12],bytes=len(raw),sha256=digest,mp3=file.relative_to(out).as_posix())
   check=dict(id=ident,seconds=len(pcm)/SR,rms=rms,peak=peak,loudness=loud,notes=len(score['notes']),meter=score['meter'],denominator=score['denominator'],mood=score['mood'],structure=score['structure'],sections=score['sections'],genre=score['genre'],scoreSha256=fingerprint)
   write(cache,json.dumps(dict(entry=entry,check=check,scoreSha256=fingerprint),ensure_ascii=False,indent=2))
   print(f'{i+1:02}/60 {score["name"]}: {score["genreName"]}, {score["bpm"]} BPM, {score["meter"]}/{score['denominator']}, {len(score["notes"])} notes, peak {peak:.3f}',flush=True)
  raw=file.read_bytes()
  write(payload/(entry['stem']+'.js'),'window.__nvMusicData('+json.dumps(ident)+','+json.dumps(base64.b64encode(raw).decode())+');\n')
  entries.append(entry);scores.append(dict(id=ident,**score));checks.append(check)
 if only is not None:return
 catalog=entries+old
 assert len(catalog)==101 and len({e['sha256'] for e in catalog})==101
 for e in old:assert (out/e['mp3']).read_bytes()==(oldroot/e['mp3']).read_bytes()
 pack=dict(version='v4',seconds=40,count=101,originalTracks=100,newTracks=60,previousTracks=40,exampleTracks=1,genres=len({s['genre'] for s in scores}),moods=12,zip='NiVedit_Music_101_40s_v4.zip')
 write(qa/'28_music_catalog.js','// 60 new original cues + 40 unchanged v2 cues + 1 authorized example.\nconst MUSIC_PACK = '+json.dumps(pack)+';\nconst MUSIC_CATEGORIES = '+json.dumps(cats,ensure_ascii=False)+';\nconst MUSIC_CATALOG = '+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';\n')
 for name,data in [('manifest.json',catalog),('new-scores.json',scores),('new-verification.json',checks)]:write(out/name,json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 shutil.copy2(oldroot/'scores.json',out/'previous-scores.json')
 shutil.copy2(oldroot/'GeneralUser-GS-LICENSE.txt',out/'GeneralUser-GS-LICENSE.txt')
 shutil.copy2(oldroot/'example-provenance.json',out/'example-provenance.json')
 write(out/'README.md','# NiVedit 背景音樂合集 v4\n\n60 首新編曲＋原有 40 首＋1 首授權範例配樂，共 101 首，每首約 40 秒、無人聲、44.1 kHz 立體聲 MP3 192 kbps。\n60 首重新編寫：開心、俏皮、希望、放鬆、浪漫、懷念、自信、冒險、振奮、感傷、懸疑、壯闊，各 5 首。每首獨立 A/B 旋律、段落配置，跨多種曲風；包含 4/4、3/4、6/8 拍，主奏交替、對答、間奏、節奏留白與漸進堆疊。\n四個情境資料夾：輕快日常 26 首，其餘各 25 首。編號 041～100 為新曲；原曲及範例曲保留原檔名與音訊。\n打開 index.html 可離線搜尋與試聽。單次只播放一首。曲目表在 manifest.json，完整作曲事件在 new-scores.json 與 previous-scores.json。\n使用 GeneralUser GS v2.0.3 取樣樂器和 TinySoundFont 編曲合成，並非真人演奏錄音；未取用其他既有歌曲音訊。音源完整授權隨包附上。範例曲例外，由使用者另行授權且音訊未改動。\n音源製作資訊見 provenance.json；音源本體不包含在素材包內。新曲約 -17 LUFS，進出淡化及自然收尾。\n')
 provenance=json.loads((ROOT/'tools/music-v2-notices/provenance.json').read_text(encoding='utf-8'))
 provenance.update(music_pack='v4',tracks=101,new_tracks=60,previous_original_tracks=40,authorized_example_tracks=1,genre_count=len({s['genre'] for s in scores}),mood_count=12,duration_seconds=40)
 write(out/'provenance.json',json.dumps(provenance,ensure_ascii=False,indent=2))
 cards=[]
 for e in catalog:
  search=html.escape(' '.join([e['name'],e['en'],e['instruments'],e['instrumentsEn']]),quote=True)
  cards.append('<article data-category="'+e['category']+'" data-search="'+search+'"><h3>'+html.escape(e['name'])+'</h3><p>'+html.escape(e['instruments'])+'</p><p>40 秒 · '+str(e['bpm'])+' BPM</p><audio controls preload="none" src="'+html.escape(e['mp3'],quote=True)+'"></audio><a download href="'+html.escape(e['mp3'],quote=True)+'">下載 MP3</a></article>')
 options=''.join('<option value="'+c['id']+'">'+c['name']+'</option>' for c in cats)
 page='<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NiVedit 背景音樂合集 101 首</title><style>:root{color-scheme:light dark}body{font:16px/1.6 system-ui;max-width:1150px;margin:30px auto;padding:20px}.filters{display:flex;gap:12px;flex-wrap:wrap}input,select{font:inherit;padding:8px;max-width:100%}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:18px}article{border:1px solid #8886;border-radius:12px;padding:18px}audio{width:100%}p{opacity:.85}[hidden]{display:none!important}</style><h1>NiVedit 背景音樂合集</h1><p>60 首新曲＋40 首原有配樂＋1 首範例曲 · 每首約 40 秒</p><div class="filters"><input id="q" type="search" placeholder="搜尋曲名／曲風／新曲" aria-label="搜尋曲目"><select id="cat" aria-label="分類"><option value="">全部分類</option>'+options+'</select></div><p id="count" aria-live="polite">101 首</p><div class="grid">'+''.join(cards)+'</div><script>function filter(){let n=0;document.querySelectorAll("article").forEach(a=>{a.hidden=!!(cat.value&&cat.value!==a.dataset.category)||!a.dataset.search.toLowerCase().includes(q.value.trim().toLowerCase());if(!a.hidden)n++});document.getElementById("count").textContent=n+" 首"}q.oninput=cat.onchange=filter;document.addEventListener("play",e=>{if(e.target.tagName==="AUDIO")document.querySelectorAll("audio").forEach(a=>{if(a!==e.target)a.pause()})},true)</script></html>'
 write(out/'index.html',page)
 zpath=out.parent/pack['zip']
 with zipfile.ZipFile(zpath,'w',zipfile.ZIP_DEFLATED) as z:
  for f in sorted(out.rglob('*')):
   if f.is_file():z.write(f,f.relative_to(out).as_posix())
 assert zpath.stat().st_size<100*1024*1024,'GitHub per-file limit'
 shutil.copy2(zpath,payload/pack['zip'])
 write(qa/'verification.json',json.dumps(dict(count=101,new=60,oldPreserved=41,uniqueAudioHashes=101,genres={g:sum(s['genre']==g for s in scores) for g in sorted({s['genre'] for s in scores})},moods={g[0]:5 for g in MOODS},uniqueThemePairs=len({str((s['themeA'],s['themeB'])) for s in scores}),uniqueForms=len({str(s['sections']) for s in scores}),categories={c['id']:sum(e['category']==c['id'] for e in catalog) for c in cats},zipBytes=zpath.stat().st_size,checks=checks),ensure_ascii=False,indent=2))
 print('Ready:',zpath,zpath.stat().st_size,flush=True)
if __name__=='__main__':main()
