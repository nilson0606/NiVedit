"""Three individually arranged draft cues responding to music-v3 listening feedback.
Does not change the shipped catalog. Uses the same licensed GeneralUser GS source.
"""
from pathlib import Path
import sys,json,hashlib,subprocess
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
import build_music_pack_v2 as base
ROOT=Path(__file__).resolve().parents[2]
SR=base.SR;N=base.N
SCALE=[0,2,4,5,7,9,11]
# Explicit phrases: (beat, scale-degree, duration). Rests are intentional.
POP_A=[
 [(0,2,.65),(.75,2,.35),(1.25,4,.55),(2,5,.4),(2.5,4,1.1)],
 [(.25,1,.6),(1,1,.35),(1.5,2,.35),(2,4,.7),(3,6,.7)],
 [(0,5,1.25),(1.5,4,.35),(2,2,.75),(3,0,.35),(3.5,2,.35)],
 [(0,3,.65),(.75,2,.35),(1.5,0,1.0),(3,1,.35),(3.5,0,.4)]]
POP_B=[
 [(0,1,.35),(.5,3,.35),(1,5,.75),(2,8,1.6)],
 [(0,7,.7),(1,5,.35),(1.5,3,.35),(2,5,1.5)],
 [(0,9,.9),(1.25,7,.5),(2,4,.6),(3,2,.7)],
 [(.25,4,.6),(1,6,.5),(2,8,.7),(3,6,.7)]]
WARM_A=[
 [(0,4,1.4),(1.75,2,.65),(2.75,1,.4),(3.5,0,.45)],
 [(.5,2,.85),(1.5,4,.7),(2.5,6,1.25)],
 [(0,5,1.25),(1.5,4,.75),(2.5,3,1.25)],
 [(0,4,.65),(1,2,.65),(2,1,1.6)]]
WARM_B=[
 [(0,7,1.4),(1.75,6,.45),(2.5,4,1.2)],
 [(.5,5,.7),(1.5,7,.75),(2.75,9,.95)],
 [(0,8,1.0),(1.25,7,.65),(2.25,5,1.2)],
 [(0,6,.8),(1,4,.65),(2,1,1.6)]]
GROOVE_A=[
 [(.5,2,.3),(1,4,.5),(1.75,5,.35),(2.5,7,.45),(3.25,5,.55)],
 [(0,5,.5),(.75,3,.4),(1.5,2,.4),(2.25,0,.5),(3,3,.65)],
 [(.25,2,.45),(1,4,.5),(1.75,7,.7),(3,4,.55)],
 [(0,1,.4),(.75,4,.4),(1.5,6,.65),(2.75,4,.4),(3.5,1,.3)]]
GROOVE_B=[
 [(0,7,.45),(.75,9,.5),(1.5,7,.4),(2.25,4,.45),(3,2,.65)],
 [(.25,5,.5),(1,7,.45),(1.75,9,.5),(2.75,7,.75)],
 [(0,8,.7),(1,5,.4),(1.75,3,.55),(2.75,5,.4),(3.5,8,.3)],
 [(0,6,.65),(1,4,.5),(1.75,1,.4),(2.5,4,1.1)]]
PROFILES=[
 dict(id='01',name='晴天有回音',style='melodic-pop',key=60,bpm=112,programs=[11,0,25,48,33,73,0],
 form=['intro']+['A']*4+['B']*4+['break']+['chorus']*4+['outro']*2,
 chords=[0,0,4,5,3,1,3,0,4,5,0,4,5,3,4,0],a=POP_A,b=POP_B),
 dict(id='02',name='把故事留在暖光裡',style='warm-ballad',key=65,bpm=92,programs=[0,4,24,48,32,73,0],
 form=['intro']+['A']*4+['break']+['B']*4+['chorus']*2+['outro']*2,
 chords=[0,0,2,3,4,5,0,3,1,4,3,4,4,0],a=WARM_A,b=WARM_B),
 dict(id='03',name='週末開始發光',style='groove-pop',key=62,bpm=118,programs=[4,0,27,89,33,12,0],
 form=['intro']+['A']*4+['B']*4+['break']+['chorus']*6+['outro']*2,
 chords=[5,5,3,0,4,0,3,1,4,5,5,3,0,4,3,4,4,0],a=GROOVE_A,b=GROOVE_B),
]
def compose(spec):
 notes=[];rng=np.random.default_rng(9218+int(spec['id']));beat=60/spec['bpm'];key=spec['key'];style=spec['style']
 def pitch(d,oct=0):return key+SCALE[d%7]+12*(d//7+oct)
 def put(role,p,at,dur,vel):
  at=max(0,at+float(rng.uniform(-.004,.004)))
  if at>=38:return
  notes.append([role,int(p),round(at,5),round(min(dur,38.3-at),5),int(np.clip(vel+rng.integers(-3,4),1,120))])
 previous=[55,60,64]
 ai=bi=ci=0
 for bar,(section,degree) in enumerate(zip(spec['form'],spec['chords'])):
  t=bar*4*beat;last=bar==len(spec['form'])-1
  pcs=[pitch(degree+j)%12 for j in [0,2,4]]
  candidates=[]
  for inversion in range(3):
   chord=sorted(48+(p-48)%12 for p in pcs)
   chord=chord[inversion:]+[n+12 for n in chord[:inversion]]
   candidates.extend([chord,[n+12 for n in chord]])
  chord=min(candidates,key=lambda c:sum(abs(a-b) for a,b in zip(c,previous)));previous=chord
  root=pitch(degree,-2)
  while root<35:root+=12
  while root>48:root-=12
  if last:
   for j,n in enumerate(chord):put('keys',n,t+j*.02,38-t,69)
   for n in chord:put('pad',n,t,38.2-t,55)
   put('bass',root,t,37.7-t,76);put('lead',pitch(7),t+.05,2.2,78)
   for j,n in enumerate(chord):put('answer',n+12,t+1+j*.28,.65,44)
   continue
  full=section in ['B','chorus'];sparse=section in ['intro','break','outro']
  vel=56 if sparse else 72 if full else 64
  # Accompaniment changes between A (picked), B (broad), break and full return.
  if style=='warm-ballad' or (style=='melodic-pop' and not full):
   for j,pos in enumerate([0,.75,1.5,2,2.75,3.5] if not sparse else [0,1.5,3]):
    put('keys',chord[[0,1,2,1,2,1][j]],t+pos*beat,.8*beat,vel-4+(j==0)*5)
  else:
   for pos in ([0,1.5,2.75] if style=='groove-pop' else [0,2]):
    for j,n in enumerate(chord):put('keys',n,t+pos*beat+j*.014,beat*(.65 if style=='groove-pop' else 1.5),vel-7)
  if section not in ['intro','break']:
   poslist=[0,1,2,3] if style=='warm-ballad' else [.5,1.5,2.5,3.5]
   if section=='A' and bar%2==0:poslist=poslist[::2]
   for k,pos in enumerate(poslist):
    if style=='warm-ballad':
     put('rhythm',chord[k%3],t+pos*beat,.8*beat,vel-10)
    else:
     for j,n in enumerate(chord):put('rhythm',n,t+pos*beat+j*.012,.35*beat,vel-15+(k%2)*7)
  if full or style=='warm-ballad' and section!='intro':
   for n in chord:put('pad',n,t,4*beat*.92,48 if section!='chorus' else 61)
  bass=[(0,root,1.6),(2,root+7,1.3)]
  if style=='groove-pop':bass=[(0,root,.5),(.75,root,.3),(1.5,root+12,.3),(2,root,.6),(2.75,root+7,.4),(3.5,root+12,.35)]
  elif full and style=='melodic-pop':bass=[(0,root,1.2),(1.5,root+7,.35),(2,root,.8),(3,root+12,.4)]
  if sparse:bass=bass[:1]
  for pos,n,d in bass:put('bass',n,t+pos*beat,d*beat,78 if not full else 86)
  if section in ['A','B','chorus']:
   if section=='A':phrase=spec['a'][ai%4];ai+=1
   elif section=='B':phrase=spec['b'][bi%4];bi+=1
   else:phrase=spec['a'][ci%4];ci+=1
   for j,(pos,d,dur) in enumerate(phrase):
    n=pitch(d)
    while n<64:n+=12
    while n>86:n-=12
    # Custom harmony on chorus phrases whose chords differ from A.
    if section=='chorus' and style!='melodic-pop' and pos==0:
     n=min([p for p in range(64,87) if p%12 in pcs],key=lambda p:abs(n-p))
    put('lead',n,t+pos*beat,dur*beat,87 if section=='chorus' else 78 if style=='warm-ballad' else 83)
    # Add sparse harmony only on longer chorus tones, below the lead.
    if section=='chorus' and dur>=.7:
     harmony=max([p for p in range(n-7,n-2) if p%12 in pcs],default=n-5)
     put('answer',harmony,t+pos*beat+.016,dur*beat*.92,57)
   # Answer phrases live in an actual rest; A's voice leaves space.
   end=max(pos+dur for pos,d,dur in phrase)
   if end<3.7:
    for j,pos in enumerate([end+.05,3.65]):
     if pos<3.95:put('answer',chord[-1-j]+12,t+pos*beat,.23*beat,60)
  elif section in ['intro','break']:
   # Break: remove drums and bass movement; second instrument answers the hook.
   for j,pos in enumerate([.5,1.5,2.5]):
    put('answer',chord[j]+12,t+pos*beat,.55*beat,60 if section=='break' else 49)
  elif section=='outro':
   for pos,d in [(0,4),(1.5,2),(3,1)]:put('lead',pitch(d,1 if style=='warm-ballad' else 0),t+pos*beat,.7*beat,73)
  if section in ['intro','break','outro']:continue
  if style=='warm-ballad':
   if section=='A':continue
   kicks=[0,2];snares=[3];hats=[1,3];snote=37
  elif style=='groove-pop':
   kicks=[0,.75,2,2.75] if full else [0,1.75,2.5];snares=[1,3];hats=np.arange(0,4,.5);snote=38
  else:
   kicks=[0,2,2.75] if full else [0,2];snares=[1,3];hats=np.arange(0,4,.5);snote=38 if section=='chorus' else 37
  for pos in kicks:put('drums',36,t+pos*beat,.1,82 if full else 73)
  for pos in snares:
   put('drums',snote,t+pos*beat+.009,.13,75 if full else 65)
   if section=='chorus' and style=='groove-pop':put('drums',39,t+pos*beat+.018,.14,49)
  for j,pos in enumerate(hats):put('drums',42,t+pos*beat,.1,40+(j%2)*13)
  if section=='chorus':
   for pos in [.25,1.25,2.25,3.25]:put('drums',54,t+pos*beat,.12,34)
  # Fills mark real section changes, with a shorter breath before the arrival.
  if bar+1<len(spec['form']) and spec['form'][bar+1]!=section:
   for j,n in enumerate([38,45,47,50]):put('drums',n,t+(3+j*.25)*beat,.14,48+j*5)
  elif bar%2==1 and full:put('drums',46,t+3.5*beat,.23,45)
  if full and (bar==0 or spec['form'][bar-1]!=section):put('drums',49,t,.8,43)
 return dict(name=spec['name'],key=key,bpm=spec['bpm'],programs=dict(zip(base.ROLE_NAMES,spec['programs'])),notes=notes,sections=spec['form'],chords=spec['chords'])

def main():
 sys.path.insert(0,str(ROOT/'qa-music-v2/tools/python'))
 out=ROOT/'assets/music_revision_samples';out.mkdir(exist_ok=True)
 sf=(ROOT/'qa-music-v2/tools/GeneralUser-GS.sf2').read_bytes()
 assert hashlib.sha256(sf).hexdigest()=='9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe'
 ff='D:/ffmpeg-2023-05-15-git-2953ebe7b6-full_build/bin/ffmpeg.exe'
 manifest=[]
 for spec in PROFILES:
  score=compose(spec);audio=base.render(score,sf)
  file=out/(spec['id']+'_'+spec['name']+'_編曲試聽.mp3')
  run=subprocess.run([ff,'-hide_banner','-loglevel','info','-y','-f','f32le','-ar',str(SR),'-ac','2','-i','pipe:0','-af','loudnorm=I=-17:TP=-1.8:LRA=9:print_format=json,aresample=44100,atrim=end_sample=1764000','-ar',str(SR),'-c:a','libmp3lame','-b:a','192k','-metadata','title='+spec['name']+'（編曲試聽）',str(file)],input=audio.tobytes(),capture_output=True,check=True)
  pcm=np.frombuffer(subprocess.check_output([ff,'-v','error','-i',str(file),'-f','f32le','-ar',str(SR),'-ac','2','pipe:1']),dtype='<f4').reshape(-1,2)
  rms=float(np.sqrt(np.mean(pcm**2)));peak=float(np.max(np.abs(pcm)))
  assert len(pcm)==N and .03<rms<.3 and peak<.98
  entry=dict(name=spec['name'],file=file.name,seconds=len(pcm)/SR,peak=peak,rms=rms,sha256=hashlib.sha256(file.read_bytes()).hexdigest(),form=spec['form'],notes=len(score['notes']))
  manifest.append(entry)
  (out/(spec['id']+'-score.json')).write_text(json.dumps(score,ensure_ascii=False,indent=2),encoding='utf-8')
  print(json.dumps(entry,ensure_ascii=False),flush=True)
 (out/'verification.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
 import shutil
 shutil.copy2(ROOT/'qa-music-v2/tools/GeneralUser-GS-LICENSE.txt',out/'GeneralUser-GS-LICENSE.txt')
 (out/'README.md').write_text('三首獨立編曲試聽稿，每首 40 秒。用於確認旋律／段落／配器方向，尚未替換網站素材庫。使用 GeneralUser GS 取樣樂器編曲合成，非真人演奏。授權與作曲事件隨附。',encoding='utf-8')
if __name__=='__main__':main()
