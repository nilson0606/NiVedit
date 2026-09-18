"""Add 60 original, stylistically varied instrumental cues to the unchanged v2 library.
Requires the same GeneralUser GS / tinysoundfont / numpy / ffmpeg as v2.
Normal editor builds use the generated assets and do not need the SoundFont.
"""
from pathlib import Path
import argparse,base64,hashlib,html,json,math,shutil,subprocess,sys,zipfile
import numpy as np
import build_music_pack_v2 as base
ROOT=Path(__file__).resolve().parents[1]
SR=base.SR; N=base.N
# genre, category, Chinese/English style, 5 title pairs, tempo, meter, scale, programs
PROFILES=[
('folk','bright','木吉他民謠','Acoustic folk',
 [('山間小旅行','Little mountain journey'),('把晴天裝進口袋','Pocket full of daylight'),('沿著河堤走','Along the riverside'),('週日野餐墊','Sunday picnic blanket'),('出發前的微笑','A smile before departure')],
 108,4,'major',[25,0,24,48,32,73,0]),
('bossa','bright','巴薩咖啡館','Cafe bossa nova',
 [('里約的午後','Afternoon in Rio'),('海鹽拿鐵','Sea salt latte'),('南風小陽台','Balcony in the south wind'),('玻璃杯的陽光','Sunlight in a glass'),('椰影下的書頁','Pages under palm shadows')],
 104,4,'major',[24,4,24,48,32,73,0]),
('reggae','bright','海島雷鬼','Island reggae',
 [('海邊不用趕時間','No rush by the sea'),('藍色小港口','Little blue harbor'),('島上的星期五','Friday on the island'),('赤腳看浪花','Barefoot by the waves'),('陽光住在這裡','Sunshine lives here')],
 88,4,'mixolydian',[114,16,27,89,33,73,0]),
('jazz','calm','輕爵士搖擺','Light jazz swing',
 [('巷口爵士燈','Jazz light on the corner'),('今晚喝無糖','Unsweetened tonight'),('雨傘與薩克斯','Umbrellas and saxophones'),('午夜小書店','Midnight bookshop'),('留聲機旁的貓','Cat by the record player')],
 116,4,'major',[11,0,26,48,32,65,0]),
('chillhop','calm','慵懶嘻哈','Laid-back chillhop',
 [('雨聲裡的筆記','Notes in the rain'),('城市慢半拍','Half a beat slower'),('凌晨的窗光','Window light before dawn'),('雲朵暫停鍵','Cloud pause button'),('把今天放輕','Let today feel lighter')],
 82,4,'dorian',[4,4,26,89,33,11,0]),
('oriental','calm','東方禪意','East Asian acoustic',
 [('山茶與晨霧','Camellias and morning mist'),('竹影過溪','Bamboo shadows on the stream'),('月下小庭院','Moonlit courtyard'),('山中一盞茶','Tea in the mountains'),('遠山的回信','A letter from distant hills')],
 78,4,'major',[107,46,15,48,32,77,0]),
('funk','lofi','復古放克','Retro funk',
 [('走路自帶節奏','Walking with a groove'),('橘色球鞋','Orange sneakers'),('開箱就開心','Unbox a good mood'),('轉角有派對','Party around the corner'),('週末先跳一下','A little weekend dance')],
 112,4,'mixolydian',[5,4,28,62,34,56,0]),
('synthwave','lofi','霓虹合成器','Neon synthwave',
 [('霓虹晚班車','Neon night bus'),('八點的城市線','City line at eight'),('穿過紫色隧道','Through a violet tunnel'),('銀河便利店','Galaxy convenience store'),('夜行的平行線','Parallel lines at night')],
 112,4,'minor',[81,5,27,90,38,80,0]),
('house','lofi','輕盈浩室','Light melodic house',
 [('微光舞步','Steps in the glow'),('天台日落派對','Rooftop sunset party'),('有風的節拍','Beats in the breeze'),('下一站晴朗','Next stop clear skies'),('把快樂開大聲','Turn up the happiness')],
 122,4,'major',[12,4,27,89,38,81,0]),
('soul','cinematic','溫柔靈魂樂','Warm neo-soul',
 [('慢慢說晚安','A slowly spoken goodnight'),('路燈下的擁抱','A hug under the streetlight'),('你在的日常','Everyday with you'),('故事還沒說完','The story is not over'),('心裡留一盞燈','Leave a light in your heart')],
 90,4,'dorian',[4,5,26,89,33,59,0]),
('waltz','cinematic','三拍華爾滋','Three-beat waltz',
 [('轉圈的明信片','Postcards in a waltz'),('小巷裡的旋轉木馬','Carousel in the lane'),('花園舞會','Garden dance'),('午後的三拍子','Afternoon in three'),('信封裡的春天','Spring in an envelope')],
 102,3,'major',[0,0,46,48,32,71,0]),
('cinema','cinematic','電影敘事','Cinematic storytelling',
 [('等日出的人','Waiting for sunrise'),('遠方終於亮了','Light on the horizon'),('走過的每一步','Every step we took'),('記得抬頭看星星','Remember to look at the stars'),('讓故事繼續','Let the story continue')],
 84,4,'minor',[0,0,46,48,43,73,0]),
]
SCALES={'major':[0,2,4,5,7,9,11],'minor':[0,2,3,5,7,8,10],
        'dorian':[0,2,3,5,7,9,10],'mixolydian':[0,2,4,5,7,9,10]}
PROGRESSIONS=[
 [0,5,3,4,0,2,1,4,5,3,0,4,1,3,4,0],
 [0,3,1,4,0,5,1,4,3,2,5,0,1,3,4,0],
 [0,2,5,3,0,4,1,4,5,2,3,0,1,3,4,0],
 [0,4,5,2,3,0,1,4,3,5,0,4,1,3,4,0],
 [0,5,1,4,3,2,5,0,1,4,3,0,5,3,4,0]]
MOTIFS=[
 [0,2,4,2,1,2,5,4,4,5,7,5,4,2,1,0],
 [4,2,1,0,2,4,5,2,6,5,4,2,3,2,1,0],
 [2,4,5,7,5,4,2,1,0,2,4,5,4,3,1,0],
 [0,1,2,4,5,4,2,0,2,5,4,6,5,2,1,0],
 [4,5,4,2,0,2,1,4,7,6,5,4,2,3,1,0]]
RHYTHMS=[
 [(0,.65),(.75,.55),(1.5,.85),(2.75,1.0)],
 [(0,1.3),(1.5,.4),(2,.7),(3, .7)],
 [(.5,.75),(1.5,.35),(2,1.65)],
 [(0,.45),(.5,.65),(1.5,.65),(2.5,1.1)],
 [(0,.8),(1,.45),(1.75,.6),(3,.75)]]
def write(p,s):p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(s.encode('utf-8'))
def compose(i):
 g=i//5;v=i%5
 style,cat,zh,en,titles,bpm,meter,mode,programs=PROFILES[g]
 title,title_en=titles[v];bpm=bpm+[-4,0,4,2,-2][v]
 key=[60,65,62,67,69][(v+g)%5];scale=SCALES[mode]
 beat=60/bpm;barlen=meter*beat;bars=max(10,int(36.5/barlen))
 rng=np.random.default_rng(2026091800+i*127);notes=[];sections=[]
 swing=.18 if style in ['jazz','chillhop','soul'] else .06 if style=='funk' else 0
 # Different melodies within each style; strong-beat notes resolve to current harmony.
 motif=np.roll(MOTIFS[v],g%4).tolist()
 if style=='oriental':
  motif=[min([0,1,2,4,5,7],key=lambda x:abs(x-d)) for d in motif]
 programs=list(programs)
 if style=='jazz':programs[0]=[11,65,26,0,71][v]
 if style=='oriental':programs[0]=[107,77,15,46,73][v]
 if style=='cinema':programs[0]=[0,8,0,11,0][v]
 if style=='waltz':programs[0]=[0,71,68,0,73][v]
 if style=='folk':programs[0]=[25,73,24,11,25][v]
 def pitch(d,oct=0):return key+scale[d%7]+12*(d//7+oct)
 def put(role,n,at,dur,vel):
  if not (0<=at<38.35):return
  at=max(0,at+float(rng.uniform(-.004,.004)))
  notes.append([role,int(n),round(at,5),round(max(.055,min(dur,38.5-at)),5),int(np.clip(vel+rng.integers(-4,5),1,115))])
 def harmony(d):
  ext=style in ['bossa','jazz','chillhop','soul','house']
  degrees=[d,d+2,d+4]+([d+6] if ext else [])
  pcs=[pitch(x)%12 for x in degrees]
  chords=[]
  for inv in range(len(pcs)):
   vo=sorted(48+(p-48)%12 for p in pcs);vo=vo[inv:]+[p+12 for p in vo[:inv]]
   for shift in (0,12):
    q=[p+shift for p in vo]
    if min(q)>=48 and max(q)<=77:chords.append(q)
  return pcs,min(chords,key=lambda q:sum(abs(n-previous[min(j,len(previous)-1)]) for j,n in enumerate(q)))
 previous=[55,60,64,69]
 for bar in range(bars):
  t=bar*barlen
  section='intro' if bar==0 else 'theme' if bar<5 else 'answer' if bar<9 else 'bridge' if bar<12 else 'refrain' if bar<bars-2 else 'ending'
  sections.append(section);sparse=section in ['intro','bridge']
  d=PROGRESSIONS[v][bar%16]
  if style=='jazz' and v==2:d=[0,3,0,0,3,3,0,0,4,3,0,4][bar%12]
  if style=='cinema':d=[0,5,2,6,0,3,5,4][(bar+v)%8]
  if bar==bars-2:d=4
  if bar==bars-1:d=0
  pcs,chord=harmony(d);previous=chord
  velocity=64+(9 if section=='refrain' else -9 if sparse else 0)
  # The last bar resolves and leaves an audible release, rather than cutting a loop mid-phrase.
  if bar==bars-1:
   for j,n in enumerate(chord):put('keys',n,t+j*.015,38-t,velocity+8)
   if style not in ['jazz','funk','reggae']:
    for n in chord:put('pad',n,t,38.1-t,52)
   put('lead',pitch(0,1),t+.04,min(2.6,38-t),78)
   root=pitch(0,-2)
   put('bass',root,t,37.8-t,82)
   if style not in ['oriental','waltz','cinema']:put('drums',36,t,.2,83)
   if style in ['house','synthwave','cinema']:put('drums',49,t,.9,48)
   continue
  # Accompaniment idioms: picked folk, bossa syncopation, offbeat reggae, arpeggios,
  # jazz comping and the genuine three-beat oom-pah-pah of a waltz.
  if style in ['folk','oriental','cinema','synthwave']:
   div=.5 if style in ['folk','synthwave'] else 1
   pos=np.arange(0,meter,div)
   if sparse:pos=pos[::2]
   for j,x in enumerate(pos):
    put('keys',chord[(j+v)%len(chord)],t+x*beat,beat*(.7 if style=='synthwave' else 1.15),velocity-4)
  elif style=='waltz':
   put('keys',chord[0],t,beat*.8,velocity)
   for x in (1,2):
    for j,n in enumerate(chord[1:]):put('keys',n,t+x*beat+j*.01,beat*.7,velocity-8)
  else:
   positions=[0,.75,1.5,2.5,3.25] if style=='bossa' else [.5,1.5,2.5,3.5] if style in ['reggae','house','funk'] else [0,1.667,2.5] if style=='jazz' else [0,1.75,3]
   if sparse:positions=positions[::2]
   for pos in positions:
    for j,n in enumerate(chord):put('keys',n,t+pos*beat+j*.008,beat*(.3 if style in ['reggae','funk','house'] else .85),velocity)
  if bar>0 and not (sparse and bar%2==0):
   if style in ['folk','waltz','oriental','cinema']:
    for j,pos in enumerate(range(meter)):put('rhythm',chord[(j+bar)%len(chord)],t+pos*beat,.65*beat,velocity-10)
   else:
    positions=[.75,1.5,2.75,3.5] if style=='bossa' else [1.5,3.5] if style in ['jazz','soul','chillhop'] else [.5,1.5,2.5,3.5]
    for pos in positions:
     for j,n in enumerate(chord[:3]):put('rhythm',n,t+pos*beat+j*.01,.2*beat,velocity-15)
  if style in ['cinema','oriental','synthwave','soul'] or section in ['bridge','refrain']:
   if not(style in ['funk','jazz'] and section!='bridge'):
    for n in chord:put('pad',n,t,barlen*.92,47+(section=='refrain')*9)
  root=pitch(d,-2)
  while root<35:root+=12
  while root>48:root-=12
  if style=='jazz':
   bp=[(j,root+(pitch(d+[0,2,4,5][j])-root)%12,.78) for j in range(4)]
  elif style=='waltz':bp=[(0,root,1.7),(2,root+7,.75)]
  elif style=='reggae':bp=[(0,root,.65),(1.5,root+7,.4),(2,root+12,.55),(3.25,root,.5)]
  elif style=='funk':bp=[(0,root,.45),(.75,root,.3),(1.5,root+12,.35),(2.25,root,.5),(3,root+7,.3),(3.5,root+12,.3)]
  elif style in ['house','synthwave']:bp=[(x,root+(12 if int(x*2)%4==3 else 0),.35) for x in np.arange(0,4,.5)]
  elif style in ['oriental','cinema']:bp=[(0,root,3.5)]
  else:bp=[(0,root,1.3),(1.5,root+7,.4),(2.5,root,.8),(3.5,root+12,.35)]
  if sparse:bp=bp[:2] if style not in ['oriental','cinema'] else bp
  for pos,n,dur in bp:put('bass',n,t+pos*beat,dur*beat,83)
  # Four-bar melodic sentences, a contrasting middle, and a varied return.
  if bar>0:
   rhythm=RHYTHMS[(bar+v)%5]
   if meter==3:rhythm=[(0,.8),(1,.45),(1.5,.4),(2,.75)] if bar%2 else [(0,1.25),(1.5,1.2)]
   if style in ['oriental','cinema']:rhythm=[(0,1.6),(2,1.4)] if bar%2 else [(.5,.75),(1.5,.6),(2.5,1.2)]
   if sparse:rhythm=[(0,1.4),(2 if meter==4 else 1.5,1.1)]
   if bar%4==0:rhythm=[(0,.6),(1,.5),(2,1.6 if meter==4 else .8)]
   for j,(pos,dur) in enumerate(rhythm):
    degree=motif[((bar-1)%4)*4+j]
    if section=='answer':degree=motif[((bar-1)%4)*4+len(rhythm)-1-j]
    if section=='bridge':degree=motif[(bar+j+v)%16]-2
    if section=='refrain' and j==0:degree+=2
    n=pitch(degree)
    while n<62:n+=12
    while n>83:n-=12
    if style=='oriental':n=min([z for z in range(62,85) if (z-key)%12 in (0,2,4,7,9)],key=lambda z:abs(z-n))
    if pos in (0,2) or j==len(rhythm)-1:
     n=min([z for z in range(62,85) if z%12 in pcs],key=lambda z:abs(z-n))
    shift=swing*beat if pos%1>=.5 else 0
    put('lead',n,t+pos*beat+shift,dur*beat,82+(section=='refrain')*7)
   if bar%4==2 and style not in ['oriental','cinema']:
    for j,pos in enumerate([meter-1,meter-.5]):put('answer',chord[-1-j%2]+12,t+pos*beat,.3*beat,55)
  # Genre-specific groove, with sparse introductions and middle sections.
  if style=='oriental':
   if bar%2==0:put('drums',54,t+2*beat,.15,36)
   continue
  if style=='cinema':
   if section in ['refrain','ending']:
    for pos in [0,2]:put('drums',41,t+pos*beat,.6,60)
    if bar%4==0:put('drums',49,t,1.1,38)
   continue
  if style=='waltz':
   if bar>2:
    put('drums',36,t,.1,55)
    for pos in [1,2]:put('drums',37,t+pos*beat,.1,47)
   continue
  if style=='reggae':kicks=[2];snare=[2];snote=37
  elif style in ['house','synthwave']:kicks=[0,1,2,3];snare=[1,3];snote=38
  elif style=='funk':kicks=[0,1.75,2.5];snare=[1,3];snote=38
  elif style=='bossa':kicks=[0,1.5,2,3.5];snare=[1,3];snote=37
  elif style=='jazz':kicks=[0,2];snare=[1,3];snote=37
  elif style in ['chillhop','soul']:kicks=[0,1.75,2.75];snare=[1,3];snote=38 if style=='chillhop' else 37
  else:kicks=[0,2];snare=[1,3];snote=37
  if sparse:kicks=kicks[:1];snare=snare[-1:]
  for pos in kicks:put('drums',36,t+pos*beat,.1,80 if style in ['house','funk'] else 64)
  for pos in snare:
   put('drums',snote,t+pos*beat+.008,.1,71 if snote==38 else 66)
   if style in ['house','synthwave'] and section=='refrain':put('drums',39,t+pos*beat+.014,.1,48)
  hats=[0,.667,1,2,2.667,3] if style=='jazz' else np.arange(0,4,.5)
  for j,pos in enumerate(hats):
   if sparse and j%2:continue
   note=51 if style=='jazz' else 46 if style=='house' and j%2 else 42
   put('drums',note,t+(pos+(swing if j%2 and style!='jazz' else 0))*beat,.1,45+(j%2)*8)
  if style in ['bossa','reggae']:
   for pos,n in [( .75,64),(1.5,63),(2.75,64),(3.5,62)]:put('drums',n,t+pos*beat,.1,43)
  if bar%4==3 and not sparse:
   for j,n in enumerate([38,45,47]):put('drums',n,t+(3.25+j*.25)*beat,.12,46+j*5)
 score=dict(name=title,en=title_en,genre=style,genreName=zh,genreEn=en,category=cat,key=key,bpm=bpm,meter=meter,mode=mode,bars=bars,sections=sections,programs=dict(zip(base.ROLE_NAMES,programs)),notes=notes)
 return score

def main():
 p=argparse.ArgumentParser();p.add_argument('--ffmpeg',required=True);p.add_argument('--soundfont',type=Path,required=True);p.add_argument('--bindings',type=Path);p.add_argument('--only')
 args=p.parse_args()
 if args.bindings:sys.path.insert(0,str(args.bindings.resolve()))
 out=ROOT.parent/'assets/music_pack_101_v3';qa=ROOT.parent/'qa-music-v3';payload=qa/'music-assets'
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
  score=compose(i);cid=score['category'];number=i+41;ident=f'v3-{number:03}-{cid}'
  folder=out/(str([c['id'] for c in cats].index(cid)+1).zfill(2)+'_'+catmap[cid]['name']);folder.mkdir(exist_ok=True)
  filename=f'{number:03}_{score["name"]}.mp3';file=folder/filename;cache=qa/(ident+'.json')
  fingerprint=hashlib.sha256(json.dumps(score,sort_keys=True).encode()).hexdigest()
  saved=json.loads(cache.read_text(encoding='utf-8')) if cache.exists() else None
  if saved and saved['scoreSha256']==fingerprint and file.exists() and hashlib.sha256(file.read_bytes()).hexdigest()==saved['entry']['sha256']:
   entry=saved['entry'];check=saved['check']
   print(f'{i+1:02}/60 cached {score["name"]}',flush=True)
  else:
   audio=base.render(score,sf)
   if score['genre']=='house':
    # Mild beat-linked breathing, no chopped gates.
    phase=(np.arange(N)/SR*score['bpm']/60)%1
    audio*= (.84+.16*np.minimum(1,phase/.28))[:,None]
   cmd=[args.ffmpeg,'-hide_banner','-loglevel','info','-y','-f','f32le','-ar',str(SR),'-ac','2','-i','pipe:0','-af','loudnorm=I=-17:TP=-1.8:LRA=9:print_format=json,aresample=44100,atrim=end_sample=1764000','-ar',str(SR),'-c:a','libmp3lame','-b:a','192k','-write_xing','1','-metadata','title='+score['name'],'-metadata','artist=NiVedit','-metadata','album=NiVedit Diverse Music v3','-metadata','genre='+score['genreEn'],str(file)]
   run=subprocess.run(cmd,input=audio.tobytes(),capture_output=True,check=True)
   loud=json.loads('{'+run.stderr.decode(errors='replace').rsplit('{',1)[1])
   pcm=np.frombuffer(subprocess.check_output([args.ffmpeg,'-v','error','-i',str(file),'-ar',str(SR),'-ac','2','-f','f32le','pipe:1']),dtype='<f4').reshape(-1,2)
   rms=float(np.sqrt(np.mean(pcm**2)));peak=float(np.max(np.abs(pcm)))
   assert abs(len(pcm)-N)<=32 and .035<rms<.3 and peak<.98,(ident,len(pcm),rms,peak)
   assert np.max(np.abs(pcm[-100:]))<.03,(ident,'tail')
   raw=file.read_bytes();digest=hashlib.sha256(raw).hexdigest()
   entry=dict(id=ident,category=cid,name=score['name'],en=score['en'],instruments='新曲・'+score['genreName'],instrumentsEn='New · '+score['genreEn'],genre=score['genre'],duration=40,bpm=score['bpm'],filename=filename,stem=ident+'-'+digest[:12],bytes=len(raw),sha256=digest,mp3=file.relative_to(out).as_posix())
   check=dict(id=ident,seconds=len(pcm)/SR,rms=rms,peak=peak,loudness=loud,notes=len(score['notes']),meter=score['meter'],genre=score['genre'],scoreSha256=fingerprint)
   write(cache,json.dumps(dict(entry=entry,check=check,scoreSha256=fingerprint),ensure_ascii=False,indent=2))
   print(f'{i+1:02}/60 {score["name"]}: {score["genreName"]}, {score["bpm"]} BPM, {score["meter"]}/4, {len(score["notes"])} notes, peak {peak:.3f}',flush=True)
  raw=file.read_bytes()
  write(payload/(entry['stem']+'.js'),'window.__nvMusicData('+json.dumps(ident)+','+json.dumps(base64.b64encode(raw).decode())+');\n')
  entries.append(entry);scores.append(dict(id=ident,**score));checks.append(check)
 if only is not None:return
 catalog=entries+old
 assert len(catalog)==101 and len({e['sha256'] for e in catalog})==101
 for e in old:assert (out/e['mp3']).read_bytes()==(oldroot/e['mp3']).read_bytes()
 pack=dict(version='v3',seconds=40,count=101,originalTracks=100,newTracks=60,previousTracks=40,exampleTracks=1,genres=12,zip='NiVedit_Music_101_40s_v3.zip')
 write(qa/'28_music_catalog.js','// 60 new original cues + 40 unchanged v2 cues + 1 authorized example.\nconst MUSIC_PACK = '+json.dumps(pack)+';\nconst MUSIC_CATEGORIES = '+json.dumps(cats,ensure_ascii=False)+';\nconst MUSIC_CATALOG = '+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';\n')
 for name,data in [('manifest.json',catalog),('new-scores.json',scores),('new-verification.json',checks)]:write(out/name,json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 shutil.copy2(oldroot/'scores.json',out/'previous-scores.json')
 shutil.copy2(oldroot/'GeneralUser-GS-LICENSE.txt',out/'GeneralUser-GS-LICENSE.txt')
 shutil.copy2(oldroot/'example-provenance.json',out/'example-provenance.json')
 write(out/'README.md','# NiVedit 背景音樂合集 v3\n\n60 首新編曲＋原有 40 首＋1 首授權範例配樂，共 101 首，每首約 40 秒、無人聲、44.1 kHz 立體聲 MP3 192 kbps。\n新曲為 12 種曲風各 5 首：木吉他民謠、巴薩、海島雷鬼、爵士、慵懶嘻哈、東方禪意、放克、合成器、浩室、靈魂樂、三拍華爾滋與電影敘事。\n四個情境資料夾：輕快日常 26 首，其餘各 25 首。編號 041～100 為新曲；原曲及範例曲保留原檔名與音訊。\n打開 index.html 可離線搜尋與試聽。單次只播放一首。曲目表在 manifest.json，完整作曲事件在 new-scores.json 與 previous-scores.json。\n使用 GeneralUser GS v2.0.3 取樣樂器和 TinySoundFont 編曲合成，並非真人演奏錄音；未取用其他既有歌曲音訊。音源完整授權隨包附上。範例曲例外，由使用者另行授權且音訊未改動。\n音源製作資訊見 provenance.json；音源本體不包含在素材包內。新曲約 -17 LUFS，進出淡化及自然收尾。\n')
 provenance=json.loads((ROOT/'tools/music-v2-notices/provenance.json').read_text(encoding='utf-8'))
 provenance.update(music_pack='v3',tracks=101,new_tracks=60,previous_original_tracks=40,authorized_example_tracks=1,genre_count=12,duration_seconds=40)
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
 write(qa/'verification.json',json.dumps(dict(count=101,new=60,oldPreserved=41,uniqueAudioHashes=101,genres={p[0]:5 for p in PROFILES},categories={c['id']:sum(e['category']==c['id'] for e in catalog) for c in cats},zipBytes=zpath.stat().st_size,checks=checks),ensure_ascii=False,indent=2))
 print('Ready:',zpath,zpath.stat().st_size,flush=True)
if __name__=='__main__':main()
