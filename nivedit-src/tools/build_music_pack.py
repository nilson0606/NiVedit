"""Compose 40 original 25-second instrumental cues with synthesized instruments.
No downloaded songs, samples, soundfonts or external generation service.
Requires numpy and ffmpeg. Normal editor builds use checked-in music-assets.
Usage: python tools/build_music_pack.py --ffmpeg /path/to/ffmpeg
"""
from pathlib import Path
import argparse, base64, hashlib, html, json, math, shutil, subprocess, zipfile
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
SR=44100
SECONDS=25
N=SR*SECONDS
CATEGORIES=[
 ('calm','療癒放鬆','Calm & relaxing'),
 ('bright','輕快生活','Bright & everyday'),
 ('lofi','Lo-fi 爵士','Lo-fi & jazz'),
 ('cinematic','電影氛圍','Cinematic atmosphere'),
]
# Independent lead, accompaniment and ornament voicings, not transposed copies.
TITLES=[
 [('晨光書頁','Morning pages','piano','pad','bell'),('月色留言','Moonlit notes','epiano','strings','musicbox'),
  ('星河晚安','Starlit goodnight','musicbox','pad','harp'),('林間呼吸','Forest breathing','flute','harp','piano'),
  ('雨後庭院','Garden after rain','marimba','pad','flute'),('浮雲輕舟','Cloud boat','harp','strings','bell'),
  ('暖陽窗邊','Sunlit window','nylon','pad','piano'),('靜謐山色','Quiet mountains','strings','piano','flute'),
  ('玻璃微光','Glass shimmer','bell','epiano','harp'),('深藍漂浮','Deep blue drift','softsynth','pad','musicbox')],
 [('晨間散步','Morning stroll','ukulele','piano','glock'),('週末咖啡','Weekend coffee','guitar','epiano','shaker'),
  ('城市小旅行','City day trip','mandolin','guitar','marimba'),('雨後彩虹','Rainbow walk','marimba','ukulele','flute'),
  ('手作日常','Made by hand','pizzicato','piano','glock'),('微風野餐','Breezy picnic','guitar','harp','bell'),
  ('陽光單車','Sunny bicycle','whistle','ukulele','piano'),('甜點小店','Little bakery','accordion','guitar','glock'),
  ('木屋假期','Cabin holiday','banjo','nylon','marimba'),('好物開箱','Happy discoveries','clav','epiano','glock')],
 [('夜巷微醺','After-hours lane','epiano','jazzguitar','vibes'),('午後留白','Afternoon pause','vibes','epiano','nylon'),
  ('慢步街角','Corner stroll','jazzguitar','organ','vibes'),('復古磁帶','Tape postcards','wurli','pad','epiano'),
  ('窗邊獨白','Window monologue','clarinet','epiano','vibes'),('午夜電車','Midnight tram','sax','jazzguitar','epiano'),
  ('暖色小酒館','Amber lounge','organ','epiano','vibes'),('雨夜鍵盤','Rainy-night keys','epiano','pad','musicbox'),
  ('暖燈低語','Lamplight bass','bass','epiano','jazzguitar'),('霓虹慢拍','Neon slow beat','softsynth','wurli','vibes')],
 [('海平線','Horizon','strings','piano','horn'),('森林序曲','Forest overture','harp','strings','flute'),
  ('遠方旅程','Distant journey','horn','strings','piano'),('星際微光','Stellar glimmer','softsynth','pad','bell'),
  ('黎明升起','Dawn rising','piano','strings','glock'),('深海回聲','Deep-sea echoes','marimba','pad','harp'),
  ('沙丘足跡','Dune footsteps','oud','strings','flute'),('飛越山谷','Over the valley','flute','strings','horn'),
  ('城市曙光','City first light','pulse','pad','piano'),('溫柔片尾','Gentle closing','piano','pad','musicbox')]
]
INST={
'piano':('柔和鋼琴','Soft piano'),'epiano':('電鋼琴','Electric piano'),
'musicbox':('音樂盒','Music box'),'flute':('長笛','Flute'),'marimba':('木琴','Marimba'),
'harp':('豎琴','Harp'),'nylon':('尼龍弦吉他','Nylon guitar'),'strings':('弦樂','Strings'),
'bell':('玻璃鐘琴','Glass bells'),'softsynth':('柔和合成器','Soft synthesizer'),
'pad':('氛圍合成器','Ambient pad'),'ukulele':('烏克麗麗','Ukulele'),
'guitar':('木吉他','Acoustic guitar'),'mandolin':('曼陀林','Mandolin'),
'glock':('鐘琴','Glockenspiel'),'shaker':('沙鈴','Shaker'),'pizzicato':('撥奏弦樂','Pizzicato strings'),
'whistle':('口哨音色','Whistle tone'),'accordion':('手風琴','Accordion'),
'banjo':('班鳩琴','Banjo'),'clav':('擊弦電鍵琴','Clavinet'),
'jazzguitar':('爵士吉他','Jazz guitar'),'vibes':('顫音琴','Vibraphone'),
'wurli':('復古電鋼琴','Vintage electric piano'),'clarinet':('單簧管','Clarinet'),
'sax':('柔和薩克斯風','Soft saxophone'),'organ':('爵士風琴','Jazz organ'),
'bass':('貝斯','Bass'),'horn':('法國號','French horn'),'oud':('烏德琴','Oud'),
'pulse':('脈衝合成器','Pulse synthesizer')}
SCALES={'major':[0,2,4,5,7,9,11],'minor':[0,2,3,5,7,8,10],'dorian':[0,2,3,5,7,9,10]}
PROGRESSIONS=[
 [0,4,5,3,0,1,4,0],[0,5,3,4,2,5,4,0],[0,3,1,4,5,3,4,0],
 [0,2,5,1,3,4,4,0],[0,5,1,4,3,1,4,0],[0,3,5,4,0,2,4,0],
 [0,4,1,5,3,4,4,0],[0,1,3,4,5,1,4,0],[0,5,2,3,1,4,4,0],
 [0,3,4,2,5,1,4,0]]
RHYTHMS=[
 [0,.75,1.5,2.5,3.25],[0,.5,1.5,2,3],[0,1,1.75,2.5,3.5],
 [.5,1.25,2,2.75],[0,.75,2,2.5,3.5],[0,1.5,2.25,3],
 [0,.5,1.25,2.5,3.25],[.25,1,2,3.5],[0,1,2.5,3.25],[0,.75,1.75,3]]
VOICE_CACHE={}
DRUM_CACHE={}

def tone(kind,note,gate):
    key=(kind,int(note),round(float(gate),3))
    if key in VOICE_CACHE:return VOICE_CACHE[key]
    f=440*2**((note-69)/12)
    sustained=kind in ['pad','strings','flute','whistle','clarinet','sax','horn','organ','softsynth','pulse','accordion']
    release=.7 if sustained else .5
    n=max(64,int((gate+release)*SR))
    t=np.arange(n,dtype=np.float32)/SR
    phase=2*np.pi*f*t
    vib=.005*np.sin(2*np.pi*4.8*t)*(1-np.exp(-t*4))
    if kind in ['flute','whistle','clarinet','sax','horn','strings']:
        phase=phase+f*.004/4.8*np.sin(2*np.pi*4.8*t)*(1-np.exp(-t*4))
    y=np.zeros(n,np.float32)
    if kind in ['epiano','wurli','vibes','musicbox','glock','bell','marimba']:
        if kind=='epiano':
            y=np.sin(phase+1.5*np.exp(-t*4)*np.sin(phase*2))*.8+np.sin(phase*3)*.08*np.exp(-t*7)
            env=np.exp(-t/1.8);attack=.008
        elif kind=='wurli':
            y=np.sin(phase+1.8*np.exp(-t*3)*np.sin(phase))+np.sin(phase*2)*.08
            env=np.exp(-t/1.2);attack=.008
        elif kind=='marimba':
            y=np.sin(phase)+.32*np.sin(phase*4.01)*np.exp(-t*9)+.12*np.sin(phase*9.1)*np.exp(-t*15)
            env=np.exp(-t/.48);attack=.004
        else:
            ratio={'vibes':3.99,'musicbox':2.98,'glock':2.76,'bell':2.41}[kind]
            decay={'vibes':1.7,'musicbox':.75,'glock':.9,'bell':1.4}[kind]
            y=np.sin(phase)+.23*np.sin(phase*ratio)*np.exp(-t*3)+.08*np.sin(phase*5.4)*np.exp(-t*5)
            if kind=='vibes':y*=.9+.1*np.sin(2*np.pi*5.1*t)
            env=np.exp(-t/decay);attack=.005
    elif kind in ['piano','nylon','guitar','ukulele','mandolin','banjo','harp','pizzicato','jazzguitar','clav','oud','bass']:
        cfg={
         'piano':(1.6,1.3,.003),'nylon':(1.65,1.0,.007),'guitar':(1.3,1.1,.004),
         'ukulele':(1.45,.62,.005),'mandolin':(1.05,.5,.003),'banjo':(.95,.4,.002),
         'harp':(1.8,1.35,.008),'pizzicato':(1.45,.43,.008),'jazzguitar':(2.1,.8,.01),
         'clav':(1.25,.3,.002),'oud':(1.25,.62,.006),'bass':(1.6,.85,.012)}
        power,decay,attack=cfg[kind]
        for k in range(1,min(14,int(18000/f))+1):
            amp=1/k**power
            if kind in ['guitar','nylon','ukulele','oud','jazzguitar']:amp*=abs(np.sin(k*np.pi*.22))+.15
            if kind=='clav' and k%2==0:amp*=.3
            stretch=1+.000035*k*k if kind=='piano' else 1
            y+=amp*np.sin(phase*k*stretch)*np.exp(-t*(.4+k*.32)/decay)
            if kind in ['mandolin','piano']:y+=.12*amp*np.sin(phase*k*1.0018)*np.exp(-t*(.4+k*.32)/decay)
        env=np.exp(-t/decay)
    else:
        attack={'pad':.28,'strings':.18,'softsynth':.12,'horn':.1,'organ':.016,'pulse':.035}.get(kind,.055)
        maxharm={'flute':4,'whistle':2,'clarinet':12,'sax':10,'horn':9,'organ':8,'accordion':10,'pad':8,'strings':14}.get(kind,10)
        for k in range(1,min(maxharm,int(16000/f))+1):
            power={'strings':1.45,'sax':1.3,'clarinet':1.5,'horn':1.7,'accordion':1.55,'organ':2.0,'pulse':1.5}.get(kind,2.3)
            amp=1/k**power
            if kind=='clarinet' and k%2==0:amp*=.08
            if kind=='horn':amp*=np.exp(-k/5)
            if kind=='organ':amp={1:1,2:.33,3:.24,4:.14,6:.08,8:.04}.get(k,.02)
            y+=amp*np.sin(phase*k)
            if kind in ['strings','pad','softsynth']:
                y+=amp*.25*np.sin(phase*k*1.003+0.3)
                y+=amp*.25*np.sin(phase*k*.997-0.3)
        env=np.ones(n,np.float32)
        if kind in ['flute','sax']:
            rng=np.random.default_rng(912+note)
            noise=rng.standard_normal(n).astype(np.float32)
            smooth=np.convolve(noise,np.ones(9,np.float32)/9,'same')
            y+=smooth*.035
    env*=np.minimum(1,t/attack)
    off=np.maximum(0,t-gate)
    env*=np.exp(-off/(release/5))
    env[-min(256,n):]*=np.linspace(1,0,min(256,n))
    y=(y*env).astype(np.float32)
    y/=max(1,float(np.max(np.abs(y)))*1.12)
    VOICE_CACHE[key]=y
    return y

def drum(kind):
    if kind in DRUM_CACHE:return DRUM_CACHE[kind]
    duration={'kick':.4,'snare':.24,'hat':.09,'shaker':.11,'rim':.085,'tom':.5,'cymbal':.9}[kind]
    t=np.arange(int(SR*duration),dtype=np.float32)/SR
    rng=np.random.default_rng(1200+list(['kick','snare','hat','shaker','rim','tom','cymbal']).index(kind))
    noise=rng.standard_normal(len(t)).astype(np.float32)
    high=noise-np.convolve(noise,np.ones(13,np.float32)/13,'same')
    if kind=='kick':
        phase=2*np.pi*(48*t+5*(1-np.exp(-t*30)))
        y=np.sin(phase)*np.exp(-t*12)+high*.06*np.exp(-t*160)
    elif kind=='snare':
        y=(high*.55+np.sin(2*np.pi*185*t)*.38)*np.exp(-t*21)
    elif kind=='rim':
        y=(np.sin(2*np.pi*520*t)+.5*np.sin(2*np.pi*1650*t))*np.exp(-t*85)
    elif kind=='tom':
        y=np.sin(2*np.pi*(85*t+4*(1-np.exp(-t*18))))*np.exp(-t*10)
    else:
        y=high*np.exp(-t*({'hat':70,'shaker':40,'cymbal':6}[kind]))
    y*=np.minimum(1,t/.0015)
    y/=max(1,float(np.max(np.abs(y)))*1.1)
    DRUM_CACHE[kind]=y.astype(np.float32)
    return DRUM_CACHE[kind]

def compose(cat,index):
    VOICE_CACHE.clear()
    title,en,lead,back,ornament=TITLES[cat][index]
    rng=np.random.default_rng(2026091700+cat*100+index)
    bpm=([60,80,80,60,80,80,60,80,80,60] if cat==0 else
         [120,100,120,100,120,100,120,100,120,100] if cat==1 else
         [80,80,100,80,80,100,80,80,80,100] if cat==2 else
         [80,80,100,80,80,80,100,100,120,80])[index]
    beat=60/bpm;bars=int(bpm/10) # 6/8/10/12 bars fill 24 sec; one second of release.
    mode='major' if cat==1 or (cat==0 and index%3!=1) else ('dorian' if cat==2 and index%2 else 'minor')
    scale=SCALES[mode];key=[60,62,65,67,69,63,58,64,61,66][index]
    if cat==3:key-=5
    prog=PROGRESSIONS[(index+cat*3)%10]
    audio=np.zeros((N,2),np.float32);events=[]
    def midi(degree,octave=0):
        return key+scale[degree%7]+12*(degree//7+octave)
    def add(at,y,gain,pan=0):
        start=int(at*SR)
        if start<0:start=0
        length=min(len(y),N-start)
        if length<=0:return
        angle=(max(-1,min(1,pan))+1)*math.pi/4
        audio[start:start+length,0]+=y[:length]*gain*math.cos(angle)
        audio[start:start+length,1]+=y[:length]*gain*math.sin(angle)
    def note(inst,pitch,at,length,amp=.2,pan=0):
        if at>=23.3:return
        length=min(length,24-at)
        add(at,tone(inst,int(pitch),length),amp,pan)
        events.append([inst,int(pitch),round(at,4),round(length,4),round(amp,3)])
    # Each cue has a distinct interval motif, rhythmic motif and arrangement.
    contour=np.array([0,int(rng.choice([1,2,3])),int(rng.choice([-1,1,3,4])),int(rng.choice([0,2,4,5])),int(rng.choice([-2,0,1,3]))])
    rhythm=RHYTHMS[(index+cat*2)%10]
    prev=midi(4,1)
    for bar in range(bars):
        at=bar*4*beat
        degree=prog[bar%8] if bar<bars-1 else 0
        chord=[midi(degree+d) for d in [0,2,4]]
        if cat==2:chord+=[midi(degree+6)]
        chord=[p-12 if p>key+11 else p for p in chord]
        chord.sort()
        # Varied accompaniment: held pads, broken chords, strums and jazz comping.
        if back in ['pad','strings','organ']:
            for j,p in enumerate(chord):
                note(back,p-12,at+j*.026,beat*3.85,.085 if back!='organ' else .105,(j-1.5)*.23)
        elif cat==2:
            for pulse in [0,1.5,2.75]:
                for j,p in enumerate(chord):
                    note(back,p,at+pulse*beat+j*.012,beat*.85,.105,(j-1.5)*.16)
        elif cat==1 and back in ['guitar','ukulele','nylon']:
            for pulse in [0,.75,1.5,2.5,3.5]:
                for j,p in enumerate(chord):
                    note(back,p,at+pulse*beat+j*.011,beat*.48,.087,-.38+j*.12)
        else:
            arp=[0,1,2,1,0,2,1,2] if index%2==0 else [0,2,1,2,0,1,2,1]
            for k,j in enumerate(arp):
                note(back,chord[j]+(12 if back=='harp' and k%3==2 else 0),at+k*.5*beat,beat*.67,.12,-.35)
        root=midi(degree,-2)
        if cat==2:
            for pulse,pitch in [(0,root),(1.5,root+7),(2.5,root),(3.5,root+scale[(degree+1)%7]-scale[degree%7])]:
                note('bass',pitch,at+pulse*beat,beat*.55,.24,-.06)
        else:
            note('bass',root,at,beat*1.8,.15 if cat==0 else .24,0)
            if cat==1 or (cat==3 and bar>=bars//2):note('bass',root+7,at+2.5*beat,beat,.19,0)
        if bar<bars-1:
            for k,pos in enumerate(rhythm):
                if cat==0 and k%2==1 and bar%2:continue
                target=midi(degree+int(contour[k%5]),1 if lead not in ['bass','horn','strings'] else 0)
                candidates=[target+o for o in [-12,0,12]]
                pitch=min(candidates,key=lambda v:abs(v-prev)+max(0,60-v)*2+max(0,v-88)*2)
                if lead=='bass':pitch-=12 if pitch>59 else 0
                prev=pitch
                swing=.11*beat if cat==2 and pos%1 else 0
                gate=beat*(.85 if cat in [0,3] else .44)
                if lead in ['strings','horn','pad','softsynth']:gate*=1.6
                human=float(rng.uniform(-.008,.008))
                note(lead,pitch,max(0,at+pos*beat+swing+human),gate,.21*float(rng.uniform(.85,1.12)),.17)
        else:
            # Land on the tonic, then let the instruments release without an abrupt cut.
            note(lead,key+(12 if lead not in ['bass','horn','strings'] else 0),at, min(2.2,24-at),.21,.12)
        if ornament!='shaker' and bar%2==1:
            note(ornament,midi(7+(index+bar)%5),at+3*beat,beat*.7,.095,.5)
        # Percussion is sparse in calm cues; light acoustic, swung or cinematic elsewhere.
        if cat==1:
            for pos in [0,2]:add(at+pos*beat,drum('kick'),.19)
            for pos in [1,3]:add(at+pos*beat,drum('rim'),.115,.1)
            for k in range(8):add(at+k*.5*beat,drum('shaker'),.043 if k%2 else .064,.5)
        elif cat==2:
            for pos in [0,1.75,2.5]:add(at+pos*beat,drum('kick'),.23)
            for pos in [1,3]:add(at+pos*beat,drum('snare'),.095,.12)
            for k in range(8):add(at+(k*.5+(.13 if k%2 else 0))*beat,drum('hat'),.027 if k%2 else .045,.4)
        elif cat==3:
            if bar>=bars//3:add(at,drum('tom'),.12)
            if bar==bars//2:add(at,drum('cymbal'),.075,.4)
            if index==8:
                for pos in [0,1,2,3]:add(at+pos*beat,drum('kick'),.15)
    # Stereo room taps; retain a clear foreground and a quiet background.
    dry=audio.copy()
    for k,delay in enumerate([.043,.067,.103,.149,.211,.283,.367,.463,.571,.697,.823,1.013]):
        d=int(delay*SR);gain=(.058 if cat in [0,3] else .026)*np.exp(-delay*2.4)
        audio[d:,0]+=dry[:-d,k%2]*gain
        audio[d:,1]+=dry[:-d,1-k%2]*gain
    # Gentle band limiting and DC removal, avoiding harsh synthetic upper partials.
    freqs=np.fft.rfftfreq(N,1/SR)
    low=8800 if cat!=2 else 5700
    filt=(1-np.exp(-(freqs/32)**4))/np.sqrt(1+(freqs/low)**8)
    for ch in range(2):
        audio[:,ch]=np.fft.irfft(np.fft.rfft(audio[:,ch])*filt,n=N).real
    audio[:int(.08*SR)]*=np.linspace(0,1,int(.08*SR))[:,None]
    audio[-int(1.15*SR):]*=np.linspace(1,0,int(1.15*SR))[:,None]**1.3
    peak=float(np.max(np.abs(audio)))
    audio*=.78/max(peak,1e-5)
    return audio,dict(name=title,en=en,lead=lead,accompaniment=back,ornament=ornament,
                     bpm=bpm,key=key,mode=mode,bars=bars,events=events)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--ffmpeg',default=shutil.which('ffmpeg'))
    parser.add_argument('--only',type=int,help='Render just one 1-based track for audition; no pack build.')
    args=parser.parse_args()
    if not args.ffmpeg:raise SystemExit('Supply --ffmpeg or put ffmpeg on PATH.')
    out=ROOT.parent/'assets/music_pack_40_v1';out.mkdir(parents=True,exist_ok=True)
    payload=ROOT/'music-assets';payload.mkdir(parents=True,exist_ok=True)
    catalog=[];scores=[];checks=[]
    for cat,(catid,catname,caten) in enumerate(CATEGORIES):
        for index in range(10):
            number=cat*10+index+1
            if args.only and number!=args.only:continue
            audio,score=compose(cat,index)
            stem=f'{number:02}_{catid}';filename=stem+'_'+score['name']+'.mp3'
            folder=out/(f'{cat+1:02}_'+catname.replace('/','_'));folder.mkdir(exist_ok=True)
            path=folder/filename
            cmd=[args.ffmpeg,'-hide_banner','-loglevel','info','-y','-f','f32le','-ar',str(SR),'-ac','2','-i','pipe:0',
                 '-t','25','-af','loudnorm=I=-20:TP=-2:LRA=9:print_format=json,aresample=44100,atrim=end_sample=1102500','-ar',str(SR),
                 '-c:a','libmp3lame','-b:a','160k','-write_xing','1',
                 '-metadata','title='+score['name'],'-metadata','artist=NiVedit',
                 '-metadata','album=NiVedit Background Music 40','-metadata','comment=Original composition with synthesized instruments',
                 str(path)]
            run=subprocess.run(cmd,input=audio.astype('<f4').tobytes(),capture_output=True,check=True)
            loud=json.loads('{'+run.stderr.decode('utf-8',errors='replace').rsplit('{',1)[1])
            decoded=subprocess.run([args.ffmpeg,'-v','error','-i',str(path),'-f','f32le','-ar',str(SR),'-ac','2','pipe:1'],
                                   capture_output=True,check=True)
            pcm=np.frombuffer(decoded.stdout,dtype='<f4').reshape(-1,2)
            assert abs(len(pcm)-N)<=32,(filename,len(pcm)) # MP3 decoder padding tolerance < 0.8 ms.
            peak=float(np.max(np.abs(pcm)));rms=float(np.sqrt(np.mean(pcm**2)))
            assert 0.025<rms<.2 and peak<.96,(filename,peak,rms)
            assert np.max(np.abs(pcm[:100]))<.08 and np.max(np.abs(pcm[-100:]))<.08
            windows=[float(np.sqrt(np.mean(pcm[i*SR:(i+1)*SR]**2))) for i in range(24)]
            assert min(windows)>.0005,(filename,'unexpected silence')
            raw=path.read_bytes();digest=hashlib.sha256(raw).hexdigest();asset=stem+'-'+digest[:12]
            callback='window.__nvMusicData('+json.dumps(stem)+','+json.dumps(base64.b64encode(raw).decode())+');\n'
            (payload/(asset+'.js')).write_bytes(callback.encode('ascii'))
            instruments=list(dict.fromkeys([score['lead'],score['accompaniment'],score['ornament']]))
            if cat in [1,2]:instruments+=['bass']
            entry=dict(id=stem,category=catid,name=score['name'],en=score['en'],
                       instruments='／'.join(INST[i][0] for i in instruments),
                       instrumentsEn=' / '.join(INST[i][1] for i in instruments),
                       duration=25,bpm=score['bpm'],filename=filename,stem=asset,bytes=len(raw),sha256=digest,
                       mp3=path.relative_to(out).as_posix())
            catalog.append(entry);scores.append(dict(id=stem,**score))
            checks.append(dict(id=stem,decoded_samples=len(pcm),duration=len(pcm)/SR,peak=peak,rms=rms,
                               loudness=loud,sha256=digest,note_events=len(score['events'])))
            print(f'{number:02}/40 {score["name"]}: 25.000 sec, {len(score["events"])} notes, peak {peak:.3f}',flush=True)
    if args.only:return
    assert len(catalog)==40 and len({e['sha256'] for e in catalog})==40
    categories=[dict(id=i,name=z,en=e) for i,z,e in CATEGORIES]
    js='// Generated by tools/build_music_pack.py. Original instrumental cues.\n'
    js+='const MUSIC_CATEGORIES = '+json.dumps(categories,ensure_ascii=False)+';\n'
    js+='const MUSIC_CATALOG = '+json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+';\n'
    (ROOT/'src/28_music_catalog.js').write_bytes(js.encode('utf-8'))
    (out/'manifest.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
    (out/'scores.json').write_text(json.dumps(scores,ensure_ascii=False,indent=2),encoding='utf-8')
    (out/'verification.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
    readme='''# NiVedit 背景音樂 40 首
四類各 10 首：療癒放鬆、輕快生活、Lo-fi 爵士、電影氛圍。
每首 25 秒（44.1 kHz、立體聲、MP3 160 kbps），無人聲；原創編曲與合成樂器。
沒有取用現成歌曲、外部取樣或音源庫。樂器名稱表示合成音色風格，並非真人錄奏。
响度目標約 -20 LUFS，音量仍可在 NiVedit 音軌內調整；各曲已有短淡入與尾端淡出。
index.html 可離線試聽。NiVedit v12.4 起也可在「＋ 音軌」選內建音樂，
或用「匯入電腦音檔」自行選擇 MP3／WAV 等檔案。素材隨專案保存。
scores.json 保留逐音符編曲；verification.json 記錄逐曲解碼、音量與雜湊核對。
'''
    (out/'README.md').write_text(readme,encoding='utf-8')
    cards=[]
    for category in categories:
        cards.append('<h2>'+category['name']+' · 10 首</h2><div class="grid">')
        for e in catalog:
            if e['category']!=category['id']:continue
            cards.append('<article><h3>'+html.escape(e['name'])+'</h3><p>'+html.escape(e['instruments'])+
                         '</p><p>25 秒 · '+str(e['bpm'])+' BPM</p><audio controls preload="none" src="'+html.escape(e['mp3'])+'"></audio></article>')
        cards.append('</div>')
    page='''<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NiVedit 背景音樂 40 首</title><style>
:root{color-scheme:light dark}body{font:16px/1.6 system-ui;max-width:1200px;margin:30px auto;padding:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
article{border:1px solid #8886;padding:18px;border-radius:12px}h3{margin:0}p{opacity:.8;font-size:14px}audio{width:100%}
</style><h1>NiVedit 背景音樂 40 首</h1><p>四類各 10 首，每首 25 秒。原創編曲與合成樂器，無人聲。</p>'''+''.join(cards)+'''
<script>document.addEventListener('play',e=>{if(e.target.tagName==='AUDIO')document.querySelectorAll('audio').forEach(a=>{if(a!==e.target)a.pause()})},true)</script></html>'''
    (out/'index.html').write_bytes(page.encode('utf-8'))
    zip_path=out.parent/'NiVedit_Music_40_25s_v1.zip'
    with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(out.rglob('*')):
            if p.is_file():z.write(p,p.relative_to(out).as_posix())
    print('Pack:',zip_path,'bytes:',zip_path.stat().st_size,flush=True)
if __name__=='__main__':main()
