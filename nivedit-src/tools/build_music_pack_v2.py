"""NiVedit music pack v2: 40 original, 40-second instrumental arrangements.
Requires numpy, tinysoundfont 0.3.7 and ffmpeg. Uses GeneralUser GS sampled
instruments under its music-production license. No existing song audio is used.
Generated MP3s/payloads are sufficient for normal editor builds.
"""
from pathlib import Path
import argparse,base64,hashlib,html,json,math,shutil,subprocess,sys,zipfile
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
SR=44100; SECONDS=40; N=SR*SECONDS
CATEGORIES=[('bright','輕快日常','Cheerful everyday'),('calm','悠閒舒服','Easygoing'),
            ('lofi','活力律動','Groove & energy'),('cinematic','溫暖故事','Warm stories')]
# title, English, style, root MIDI, tempo, motif (diatonic scale degrees)
SONGS=[
('今天好心情','Good mood today','sunny',60,120,[2,4,5,4,2,1,0,2,4,5,7,6,4,2,1,0]),
('週末出發','Weekend getaway','folk',67,112,[0,2,4,4,5,4,2,1,2,4,5,7,6,4,2,0]),
('陽光轉個彎','Around the sunny corner','clap',62,126,[4,4,2,1,0,2,4,5,4,2,5,7,5,4,1,0]),
('散步遇見你','Meet you on a walk','soul',65,106,[2,1,0,2,4,3,2,0,5,4,2,1,2,4,1,0]),
('橘子汽水','Orange soda','tropical',60,124,[0,4,2,5,4,2,0,1,2,5,4,7,5,4,2,0]),
('旅途小確幸','Little joys on the road','folk',62,116,[4,5,7,5,4,2,1,2,0,2,4,5,3,2,1,0]),
('陽台的早晨','Balcony morning','sunny',65,110,[0,1,2,4,2,0,1,2,4,6,5,4,2,1,2,0]),
('口袋裡的晴天','Sunshine in my pocket','clap',69,128,[2,4,2,0,1,2,5,4,7,6,5,4,2,4,1,0]),
('一起去海邊','Off to the seaside','tropical',67,122,[4,2,0,1,2,4,5,4,5,7,4,2,3,2,1,0]),
('片尾也微笑','Smiling through the credits','soul',60,108,[0,2,1,0,4,5,4,2,2,4,6,5,4,2,1,0]),
('咖啡還溫熱','Coffee still warm','bossa',65,100,[2,4,6,5,4,2,1,0,2,3,4,6,5,2,1,0]),
('慢慢喜歡今天','Growing fond of today','rhodes',62,92,[4,2,1,0,2,4,5,2,6,5,4,2,3,2,1,0]),
('窗邊的午後','Afternoon by the window','waltz',60,104,[0,2,4,5,3,2,1,4,2,5,4,2,1,2,4,0]),
('微風翻書','Breeze through the pages','folk',69,98,[2,0,1,2,4,2,5,4,6,4,2,1,0,2,1,0]),
('街角麵包香','Corner bakery','bossa',67,106,[4,5,6,4,2,1,2,0,2,4,5,3,2,4,1,0]),
('貓咪的午睡','Catnap afternoon','jazz',60,96,[0,2,3,4,6,5,4,2,1,2,4,5,4,2,1,0]),
('雨停之後','After the rain clears','rhodes',65,90,[2,4,5,6,5,4,2,0,1,2,4,2,5,3,1,0]),
('小城日記','Small town diary','waltz',62,108,[4,2,1,0,1,2,4,5,7,5,3,2,4,2,1,0]),
('夕陽慢車','Slow train at sunset','soul',67,100,[2,2,4,5,4,1,0,2,5,6,4,2,1,2,1,0]),
('留一點空白','Room to breathe','jazz',65,94,[0,1,2,4,6,4,5,2,3,2,0,2,4,3,1,0]),
('城市輕跳','City bounce','funk',62,116,[0,0,2,4,2,5,4,1,2,4,6,5,4,2,1,0]),
('開箱派對','Unboxing party','disco',65,126,[4,5,4,2,0,2,4,7,6,5,4,2,5,4,1,0]),
('向前跑就對了','Keep moving forward','poprock',67,128,[0,2,5,4,2,4,7,6,5,4,2,1,2,5,4,0]),
('彩色節拍','Colorful beats','tropical',62,130,[2,5,4,2,0,1,4,5,7,4,5,2,4,3,1,0]),
('夜色霓虹','Neon evenings','disco',69,124,[0,2,4,6,5,4,2,1,4,5,7,5,4,2,1,0]),
('小小成就感','Small wins','funk',60,110,[4,2,4,5,2,1,0,2,4,7,6,4,2,3,1,0]),
('節奏旅行箱','Rhythm suitcase','latin',65,118,[2,0,4,2,5,4,1,2,4,6,5,3,4,2,1,0]),
('加一點驚喜','A little surprise','clap',67,132,[0,4,5,4,2,1,2,5,4,7,5,4,2,0,1,0]),
('週五放輕鬆','Friday unwind','latin',62,114,[4,2,1,2,0,4,5,6,5,4,3,2,4,2,1,0]),
('漂亮收工','A good finish','poprock',60,122,[0,2,4,5,7,5,4,2,5,4,2,1,0,2,4,0]),
('剛好的溫柔','Just enough tenderness','story',60,88,[2,4,5,4,2,0,1,2,4,5,6,4,3,2,1,0]),
('回家的方向','The way home','acoustic',67,102,[0,2,1,0,4,5,7,5,4,2,5,4,2,3,1,0]),
('遠方有光','Light in the distance','anthem',62,112,[0,4,5,7,6,5,4,2,2,5,7,6,4,2,1,0]),
('值得記住的一天','A day to remember','story',65,94,[4,2,0,2,4,6,5,4,2,1,0,2,3,2,1,0]),
('山路與雲朵','Mountain roads and clouds','acoustic',69,104,[2,4,2,1,0,2,5,7,6,4,5,2,3,2,1,0]),
('新的開始','A fresh beginning','anthem',60,118,[0,1,2,5,4,2,4,7,6,5,4,2,1,2,4,0]),
('暖燈下的故事','Stories by lamplight','waltz',65,98,[2,1,0,4,2,5,4,2,6,5,4,1,2,4,1,0]),
('並肩走一段','Side by side','acoustic',62,110,[4,2,5,4,2,1,0,2,4,5,7,4,3,2,1,0]),
('心裡的晴朗','Clear skies within','story',67,100,[0,2,4,2,1,0,2,5,4,6,5,2,3,4,1,0]),
('下次再見','Until next time','anthem',65,114,[2,4,5,7,5,4,2,1,0,2,4,6,5,4,1,0]),
]
# GM programs: recognizable sampled voices rather than waveform approximations.
# lead, keys, rhythmic accompaniment, pad, bass, answer, drum kit, swing
STYLES={
 'sunny':(11,0,24,89,33,73,0,0.00),'folk':(73,0,25,48,32,11,0,.02),
 'clap':(12,0,27,89,34,10,0,0),'soul':(4,4,27,89,33,65,0,.09),
 'tropical':(12,4,24,89,34,10,0,0),'bossa':(24,4,24,48,32,73,0,.03),
 'rhodes':(4,4,26,89,33,11,0,.16),'waltz':(0,0,24,48,32,73,0,.02),
 'jazz':(11,4,26,48,32,71,0,.20),'funk':(5,4,28,62,34,56,0,.10),
 'disco':(81,4,27,50,34,62,0,0),'poprock':(27,0,29,48,34,0,0,0),
 'latin':(73,0,24,48,32,56,0,.02),'story':(0,0,46,48,32,73,0,.02),
 'acoustic':(25,0,24,48,32,11,0,.01),'anthem':(0,0,27,48,33,60,0,0),
}
PROGS=[
 [0,4,5,3,0,2,3,4,5,3,0,4,1,3,4,0],
 [0,5,1,4,0,3,1,4,5,2,3,0,1,4,4,0],
 [0,3,0,4,5,3,1,4,3,0,5,4,1,3,4,0],
 [0,2,3,4,0,5,3,4,1,5,2,4,3,1,4,0],
 [0,4,3,0,5,2,3,4,3,4,2,5,1,3,4,0],
 [0,5,3,4,0,4,5,3,1,3,0,4,5,1,4,0],
 [0,1,3,4,2,5,1,4,3,2,5,0,1,3,4,0],
 [0,3,5,4,0,2,1,4,5,4,3,0,1,3,4,0],
 [0,2,5,3,0,4,1,4,3,5,2,0,1,3,4,0],
 [0,3,1,4,0,5,3,4,5,2,3,4,1,3,4,0]]
RHYTHMS=[
 [(0,.8),(.75,.45),(1.5,.8),(2.5,1.3)],
 [(0,.45),(.5,.45),(1,1.25),(2.5,.45),(3, .8)],
 [(.5,.8),(1.5,.45),(2,.8),(3, .85)],
 [(0,1.3),(1.5,.4),(2,.8),(3, .8)],
 [(0,.6),(.75,.6),(1.5,1.2),(3,.85)],
 [(0,.85),(1,.45),(1.5,.9),(2.5,1.25)],
 [(.25,.6),(1,.7),(2,1.75)],
 [(0,.45),(.5,.8),(1.5,.45),(2.5,1.25)],
 [(0,1.75),(2,.4),(2.5,.4),(3, .8)],
 [(0,.8),(1,.8),(2.5,.45),(3,.8)]]
SCALE=[0,2,4,5,7,9,11]
ROLE_NAMES=['lead','keys','rhythm','pad','bass','answer','drums']

def write(p,s):p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(s.encode('utf-8'))
def compose(i):
 title,en,style,key,bpm,motif=SONGS[i];rng=np.random.default_rng(94173+i*179)
 beat=60/bpm;barlen=4*beat;bars=int(38.1/barlen);prog=PROGS[i%10]
 specs=STYLES[style];notes=[];sections=[]
 def pitch(d,octave=0):return key+SCALE[d%7]+12*(d//7+octave)
 def put(role,p,when,length,vel=80):
  if when<0 or when>=38.5:return
  length=max(.06,min(length,38.6-when))
  when=max(0,when+float(rng.uniform(-.006,.006)))
  notes.append([role,int(p),round(when,5),round(length,5),int(np.clip(vel+rng.integers(-4,5),1,120))])
 previous=[key-5,key,key+4,key+9]
 for bar in range(bars):
  t=bar*barlen
  if bar==0:section='intro'
  elif bar<5:section='theme'
  elif bar<9:section='answer'
  elif bar<13:section='bridge'
  elif bar<bars-2:section='refrain'
  else:section='ending'
  sections.append(section)
  d=0 if bar==bars-1 else 4 if bar==bars-2 else prog[bar%16]
  jazz=style in ['bossa','jazz','rhodes','soul']
  pcs=[pitch(d+j)%12 for j in ([0,2,4,6] if jazz else [0,2,4])]
  # Smooth chord voice leading; extended color is voiced above the bass.
  candidates=[]
  for inv in range(len(pcs)):
   voicing=sorted([48+((pc-48)%12) for pc in pcs])
   voicing=voicing[inv:]+[p+12 for p in voicing[:inv]]
   for shift in [0,12]:
    v=[p+shift for p in voicing]
    if min(v)>=48 and max(v)<=78:candidates.append(v)
  chord=min(candidates,key=lambda v:sum(abs(p-previous[min(j,len(previous)-1)]) for j,p in enumerate(v)))
  previous=chord
  drive=1.10 if section=='refrain' else .86 if section in ['intro','bridge'] else 1
  vel=int(67*drive)
  # Broken piano / syncopated electric keys / broad storytelling chords.
  if style in ['story','anthem','acoustic','waltz']:
   pattern=[(0,0),(1,1),(1.5,2),(2,0),(2.5,1),(3,2),(3.5,1)]
   if section=='bridge':pattern=pattern[:4]
   for pos,j in pattern:put('keys',chord[j],t+pos*beat,beat*.95,vel)
  else:
   positions=[0,1.5,2.75] if jazz else [0,2] if style in ['poprock','sunny'] else [.5,1.5,2.5,3.5]
   for pos in positions:
    for j,p in enumerate(chord):put('keys',p,t+pos*beat+j*.009,beat*(.75 if jazz else 1.1),vel-5)
  # Strummed / picked rhythm bus enters after the intro, with a sparse bridge.
  if bar>0 and not(section=='bridge' and bar%2==0):
   poslist=[0,.75,1.5,2.5,3.25] if style in ['bossa','latin'] else [.5,1.5,2.5,3.5]
   if style in ['folk','acoustic','story','waltz']:poslist=[0,1,2,3]
   for k,pos in enumerate(poslist):
    if style in ['folk','acoustic','story','waltz']:
     put('rhythm',chord[(k+bar)%len(chord)]+(12 if style=='story' else 0),t+pos*beat,.65*beat,vel)
    else:
     for j,p in enumerate(chord):put('rhythm',p,t+pos*beat+j*.012,.25*beat,vel-12+(k%2)*6)
  if section in ['bridge','refrain','ending'] or style in ['anthem','story']:
   for j,p in enumerate(chord):put('pad',p,t+j*.02,barlen*.97,50+(section=='refrain')*12)
  root=pitch(d,-2)
  while root<36:root+=12
  while root>51:root-=12
  basspattern=[(0,root,1.35),(1.5,root+7,.4),(2.5,root,.8),(3.5,root+12,.4)]
  if style in ['funk','disco','clap']:
   basspattern=[(0,root,.65),(.75,root,.35),(1.5,root+12,.4),(2,root,.65),(2.75,root+7,.35),(3.5,root+12,.4)]
  if style in ['story','waltz','acoustic']:basspattern=[(0,root,1.8),(2,root+7,1.5)]
  if section=='intro':basspattern=basspattern[:1]
  if bar==bars-1:basspattern=[(0,root,3.5)]
  for pos,p,g in basspattern:put('bass',p,t+pos*beat,g*beat,86)
  # Two-bar question/answer phrases. Strong notes resolve onto the current chord.
  if 0<bar<bars-1:
   rhythm=RHYTHMS[(i+(bar%4))%len(RHYTHMS)]
   if bar%4==0:rhythm=[(0,.7),(1,.6),(2,1.7)] # a long phrase ending provides breath
   if section=='bridge':rhythm=[(.5,1.25),(2.5,1.2)]
   for j,(pos,g) in enumerate(rhythm):
    degree=motif[((bar-1)%4)*4+j]
    if section=='answer':degree=motif[((bar-1)%4)*4+(len(rhythm)-1-j)]
    if section=='bridge':degree=motif[(j+bar)%16]+(2 if i%2 else -2)
    if section=='refrain':degree+=2 if j%2==0 else 0
    p=pitch(degree)
    while p<65:p+=12
    while p>83:p-=12
    if pos in [0,2] or (bar%4==0 and j==len(rhythm)-1):
     p=min([n for n in range(64,85) if n%12 in pcs],key=lambda n:abs(n-p))
    swing=specs[-1]*beat if pos%1>=.5 else 0
    put('lead',p,t+pos*beat+swing,g*beat,92 if section=='refrain' else 83)
   # Counter-line only during pauses / endings; not another constant busy melody.
   if bar%2==0:
    for j,pos in enumerate([3.0,3.5]):
     put('answer',pitch((d+[4,2][j])%7,1),t+pos*beat,.38*beat,62)
  if bar==bars-1:
   put('lead',pitch(0,1),t,min(2.5,38-t),79)
   for j,p in enumerate(chord):put('keys',p,t+j*.014,max(1.8,38-t),75)
   for j,p in enumerate(chord):put('pad',p,t,max(2,38.4-t),58)
   # A quiet final pickup/arpeggio carries the ending towards the natural tail.
   for j,p in enumerate(chord[:3]):put('answer',p+12,min(37.1,t+1.2)+j*.23,.65,48)
  # Drum patterns differ by genre; fills and breakdowns change with the form.
  if bar==bars-1:
   if style not in ['story','waltz']:put('drums',49,t,1,58);put('drums',36,t,.2,85)
   continue
  sparse=section in ['intro','bridge']
  if style in ['story','waltz'] and bar<5:continue
  kicks=[0,2]
  if style in ['disco','tropical','clap']:kicks=[0,1,2,3]
  if style in ['funk','rhodes']:kicks=[0,1.75,2.5]
  if style in ['bossa','latin']:kicks=[0,1.5,2,3.5]
  if style=='poprock':kicks=[0,.5,2,2.75]
  if sparse:kicks=[0,2]
  for pos in kicks:put('drums',36,t+pos*beat,.12,91 if style not in ['bossa','story'] else 75)
  snare=37 if jazz or style in ['folk','acoustic','waltz'] else 38
  for pos in [1,3]:
   if not(section=='intro' and pos==1):put('drums',snare,t+pos*beat+.007,.1,76 if snare==38 else 83)
   if style in ['clap','disco'] and not sparse:put('drums',39,t+pos*beat+.013,.12,56)
  for k in range(8):
   if sparse and k%2:continue
   at=t+(k*.5+(specs[-1] if k%2 else 0))*beat
   put('drums',46 if k==7 and bar%2 else 42,at,.10,49 if k%2 else 64)
  if style in ['latin','bossa','tropical']:
   for pos,note in [(.75,64),(1.5,63),(2.75,64),(3.5,62)]:put('drums',note,t+pos*beat,.12,56)
  if bar%4==0 and bar>0:
   for k,note in enumerate([38,45,47,50]):put('drums',note,t+(3+k*.25)*beat,.14,58+k*5)
  if section=='refrain' and (bar==13):put('drums',49,t,.9,61)
 return dict(name=title,en=en,style=style,key=key,bpm=bpm,bars=bars,
             sections=sections,programs=dict(zip(ROLE_NAMES,specs[:7])),notes=notes)

def render(score,sfbytes):
 import tinysoundfont
 stems={};rng=np.random.default_rng(score['key']*100+score['bpm'])
 # Render real note-offs and samples for each role. Separate buses allow balanced mixing.
 targets={'lead':.070,'keys':.041,'rhythm':.026,'pad':.020,'bass':.068,'answer':.028,'drums':.054}
 for role in ROLE_NAMES:
  ns=[e for e in score['notes'] if e[0]==role]
  if not ns:continue
  synth=tinysoundfont.Synth(gain=-9,samplerate=SR);sf=synth.sfload(sfbytes)
  synth.program_select(0,sf,0,score['programs'][role],is_drums=role=='drums')
  synth.control_change(0,7,100)
  synth.control_change(0,10,{'lead':64,'keys':48,'rhythm':85,'pad':64,'bass':64,'answer':92,'drums':64}[role])
  ev=[]
  for _,pitch,at,dur,vel in ns:
   ev.append((round(at*SR),1,pitch,vel));ev.append((min(N,round((at+dur)*SR)),0,pitch,0))
  ev.sort()
  audio=np.zeros((N,2),np.float32);pos=0
  for tick,on,pitch,vel in ev:
   tick=min(N,tick)
   if tick>pos:audio[pos:tick]=np.frombuffer(synth.generate(tick-pos),dtype='<f4').reshape(-1,2);pos=tick
   if on:synth.noteon(0,pitch,vel)
   else:synth.noteoff(0,pitch)
  if pos<N:audio[pos:]=np.frombuffer(synth.generate(N-pos),dtype='<f4').reshape(-1,2)
  chunks=audio[:(N//22050)*22050].reshape(-1,22050,2)
  levels=np.sqrt(np.mean(chunks**2,axis=(1,2)))
  active=levels[levels>.0001]
  level=float(np.percentile(active,70)) if len(active) else 1
  audio*=min(12,targets[role]/max(.0001,level))
  # Diffuse stereo room on melodic buses; bass and kick stay clear.
  if role not in ['bass','drums','rhythm']:
   length=int(SR*(1.05 if role=='pad' else .66))
   ir=rng.normal(0,1,(length,2)).astype(np.float32)
   t=np.arange(length)/SR
   for ch in range(2):
    ir[:,ch]=np.convolve(ir[:,ch],np.ones(7)/7,'same')*np.exp(-t*7)
    ir[:int(.018*SR),ch]=0
    ir[:,ch]/=max(.001,float(np.linalg.norm(ir[:,ch])))
   size=1<<(N+length-1).bit_length()
   wet=.16 if role=='pad' else .09
   for ch in range(2):audio[:,ch]+=np.fft.irfft(np.fft.rfft(audio[:,ch],size)*np.fft.rfft(ir[:,ch],size),size)[:N].astype(np.float32)*wet
  stems[role]=audio
 mix=sum(stems.values());mix-=mix.mean(axis=0)
 mix=np.tanh(mix*1.10)/1.10
 mix[:int(.035*SR)]*=np.linspace(0,1,int(.035*SR))[:,None]
 mix[-int(1.65*SR):]*=np.linspace(1,0,int(1.65*SR))[:,None]**1.3
 peak=np.max(np.abs(mix));mix*=.85/max(.85,float(peak))
 return mix.astype('<f4')

DESCS={
'sunny':('明亮流行・輕快旋律','Bright pop · cheerful melody'),'folk':('清新民謠・旅行日常','Acoustic pop · everyday journeys'),
'clap':('拍手流行・開心節奏','Clap pop · happy rhythms'),'soul':('暖色靈魂・輕鬆律動','Warm soul · easy groove'),
'tropical':('熱帶流行・海邊氣氛','Tropical pop · seaside mood'),'bossa':('輕柔巴薩・咖啡時光','Soft bossa · coffee time'),
'rhodes':('悠閒節拍・午後放鬆','Laid-back beats · afternoon calm'),'waltz':('柔和抒情・輕盈分解和弦','Gentle ballad · flowing arpeggios'),
'jazz':('輕爵士・搖擺步調','Light jazz · swinging groove'),'funk':('輕放克・彈跳貝斯','Light funk · bouncy bass'),
'disco':('復古舞曲・明亮律動','Retro dance · bright groove'),'poprock':('陽光流行搖滾・向前感','Sunny pop rock · forward motion'),
'latin':('拉丁節奏・熱情日常','Latin groove · lively days'),'story':('溫暖抒情・故事片段','Warm ballad · little stories'),
'acoustic':('木吉他流行・溫柔陪伴','Acoustic pop · gentle company'),'anthem':('勵志流行・逐層展開','Uplifting pop · growing arrangement')}

def main():
 p=argparse.ArgumentParser();p.add_argument('--ffmpeg',required=True);p.add_argument('--soundfont',type=Path,required=True)
 p.add_argument('--license',type=Path,required=True);p.add_argument('--bindings',type=Path)
 p.add_argument('--only',type=int);args=p.parse_args()
 if args.bindings:sys.path.insert(0,str(args.bindings.resolve()))
 out=ROOT.parent/'assets/music_pack_40_v2';payload=ROOT.parent/'qa-music-v2/music-assets'
 out.mkdir(exist_ok=True,parents=True);payload.mkdir(exist_ok=True,parents=True)
 sfbytes=args.soundfont.read_bytes();assert hashlib.sha256(sfbytes).hexdigest()=='9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe'
 catalog=[];scores=[];checks=[]
 for i in range(40):
  if args.only and i+1!=args.only:continue
  score=compose(i);audio=render(score,sfbytes);catid,catname,caten=CATEGORIES[i//10]
  ident=f'v2-{i+1:02}-{catid}';filename=f'{i+1:02}_{score["name"]}.mp3'
  folder=out/(str(i//10+1).zfill(2)+'_'+catname);folder.mkdir(exist_ok=True)
  file=folder/filename
  cmd=[args.ffmpeg,'-hide_banner','-loglevel','info','-y','-f','f32le','-ar',str(SR),'-ac','2','-i','pipe:0',
       '-af','loudnorm=I=-17:TP=-1.8:LRA=9:print_format=json,aresample=44100,atrim=end_sample=1764000',
       '-ar',str(SR),'-c:a','libmp3lame','-b:a','192k','-write_xing','1',
       '-metadata','title='+score['name'],'-metadata','artist=NiVedit',
       '-metadata','album=NiVedit Everyday Music v2','-metadata','comment=Original instrumental arrangement; GeneralUser GS sampled instruments',str(file)]
  run=subprocess.run(cmd,input=audio.tobytes(),capture_output=True,check=True)
  loud=json.loads('{'+run.stderr.decode(errors='replace').rsplit('{',1)[1])
  pcm=np.frombuffer(subprocess.check_output([args.ffmpeg,'-v','error','-i',str(file),'-ar',str(SR),'-ac','2','-f','f32le','pipe:1']),dtype='<f4').reshape(-1,2)
  rms=float(np.sqrt(np.mean(pcm**2)));peak=float(np.max(np.abs(pcm)))
  assert abs(len(pcm)-N)<=32 and .04<rms<.3 and peak<.98,(i,len(pcm),rms,peak)
  assert np.max(np.abs(pcm[-100:]))<.03,(i,'tail')
  raw=file.read_bytes();digest=hashlib.sha256(raw).hexdigest();stem=ident+'-'+digest[:12]
  write(payload/(stem+'.js'),'window.__nvMusicData('+json.dumps(ident)+','+json.dumps(base64.b64encode(raw).decode())+');\n')
  desc,en=DESCS[score['style']]
  catalog.append(dict(id=ident,category=catid,name=score['name'],en=score['en'],instruments=desc,instrumentsEn=en,
    duration=40,bpm=score['bpm'],filename=filename,stem=stem,bytes=len(raw),sha256=digest,mp3=file.relative_to(out).as_posix()))
  scores.append(dict(id=ident,**score))
  checks.append(dict(id=ident,seconds=len(pcm)/SR,peak=peak,rms=rms,loudness=loud,sha256=digest,notes=len(score['notes']),
    roles=len(set(x[0] for x in score['notes'])),sections=sorted(set(score['sections']))))
  print(f'{i+1:02}/40 {score["name"]}: {score["style"]}, {score["bpm"]} BPM, {len(score["notes"])} notes, peak {peak:.3f}',flush=True)
 if args.only:return
 assert len(catalog)==40 and len({x['sha256'] for x in catalog})==40
 cats=[dict(id=i,name=z,en=e) for i,z,e in CATEGORIES]
 pack=dict(version='v2',seconds=40,count=40,zip='NiVedit_Music_40_40s_v2.zip')
 write(ROOT.parent/'qa-music-v2/28_music_catalog.js',
  '// Generated by tools/build_music_pack_v2.py. Original arrangements, sampled instruments.\nconst MUSIC_PACK = '+json.dumps(pack)+';\nconst MUSIC_CATEGORIES = '+json.dumps(cats,ensure_ascii=False)+';\nconst MUSIC_CATALOG = '+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';\n')
 for name,data in [('manifest.json',catalog),('scores.json',scores),('verification.json',checks)]:write(out/name,json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 shutil.copyfile(args.license,out/'GeneralUser-GS-LICENSE.txt')
 write(out/'README.md',"""# NiVedit 背景音樂 v2：40 首 × 40 秒

依「開心輕快_40秒.mp3」所代表的輕快日常方向，重新作曲與編排；沒有複製該首音訊。
40 首無人聲短曲，具主題、呼應、轉折與收尾。分類依情緒用途，不再以單一樂器區分。
MP3 192 kbps、44.1 kHz、立體聲，目標約 −17 LUFS。index.html 可離線試聽。
樂器音色由 GeneralUser GS v2.0.3（S. Christian Collins）取樣音源渲染，非真人合奏錄音。
音源許可允許自作音樂及商業音樂製作；完整原文 GeneralUser-GS-LICENSE.txt 隨包附上。
來源：https://github.com/mrbumpy409/GeneralUser-GS
渲染：TinySoundFont / tinysoundfont 0.3.7（MIT），作曲與 MIDI 事件在 scores.json。
NiVedit 的原創程式授權與這份音源許可不同；音源本體不隨網站下載，也未嵌入 MP3 以外的瀏覽器執行檔。
舊 v1 素材包與已保存專案不會被新版覆写。
""")
 cards=[]
 for cat in cats:
  cards.append('<h2>'+html.escape(cat['name'])+'</h2><div class="grid">')
  for e in catalog:
   if e['category']!=cat['id']:continue
   cards.append('<article><h3>'+html.escape(e['name'])+'</h3><p>'+html.escape(e['instruments'])+'</p><p>40 秒 · '+str(e['bpm'])+' BPM</p><audio controls preload="none" src="'+html.escape(e['mp3'])+'"></audio></article>')
  cards.append('</div>')
 write(out/'index.html','<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NiVedit 背景音樂 v2</title><style>:root{color-scheme:light dark}body{font:16px/1.6 system-ui;max-width:1100px;margin:30px auto;padding:20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}article{border:1px solid #8886;border-radius:12px;padding:18px}audio{width:100%}p{opacity:.8}</style><h1>NiVedit 背景音樂 v2</h1><p>40 首 × 40 秒 · 有旋律、有段落的無人聲配樂</p>'+''.join(cards)+'<script>document.addEventListener("play",e=>{if(e.target.tagName==="AUDIO")document.querySelectorAll("audio").forEach(a=>{if(a!==e.target)a.pause()})},true)</script></html>')
 zipfile_path=out.parent/pack['zip']
 with zipfile.ZipFile(zipfile_path,'w',zipfile.ZIP_DEFLATED) as z:
  for f in sorted(out.rglob('*')):
   if f.is_file():z.write(f,f.relative_to(out).as_posix())
 shutil.copyfile(zipfile_path,payload/pack['zip'])
 print('Pack ready:',zipfile_path,zipfile_path.stat().st_size,flush=True)
if __name__=='__main__':main()
