"""Music v4: 60 independent themes, 12 moods, varied meter, forms and ensembles.
Scores are original algorithmic arrangements, rendered with licensed sampled voices.
"""
import math
import numpy as np
import build_music_pack_v2 as base
ROLE_NAMES=['lead','leadB','keys','rhythm','pad','bass','answer','drums','texture']
# Each style defines an ensemble, not a single instrument substitution.
# lead, alternate lead, keys, rhythmic instrument, pad, bass, answering instrument, kit, texture
STYLES={
 'acoustic':('木吉他流行','Acoustic pop',[25,73,0,24,48,32,11,0,46]),
 'pop':('鋼琴流行','Piano pop',[0,11,4,27,89,33,73,0,10]),
 'ukulele':('撥弦小品','Plucked strings',[24,12,0,25,45,32,72,0,10]),
 'ska':('跳躍斯卡','Bouncy ska',[65,56,16,27,62,33,11,0,12]),
 'latin':('拉丁律動','Latin groove',[73,56,0,24,48,32,11,0,114]),
 'bossa':('巴薩爵士','Bossa jazz',[24,73,4,26,48,32,11,0,10]),
 'reggae':('海島雷鬼','Island reggae',[114,65,16,27,89,33,73,0,12]),
 'jazz':('爵士搖擺','Swing jazz',[11,65,0,26,48,32,71,0,10]),
 'blues':('慢藍調','Slow blues',[26,65,4,27,16,33,11,0,0]),
 'soul':('暖色靈魂','Warm soul',[4,65,5,26,89,33,73,0,11]),
 'chillhop':('慵懶節拍','Chillhop',[4,11,0,26,89,33,73,0,10]),
 'ambient':('空間氛圍','Ambient',[0,73,46,11,89,43,12,0,91]),
 'piano':('鋼琴敘事','Piano storytelling',[0,73,4,46,48,32,11,0,10]),
 'orchestra':('弦樂敘事','Orchestral',[40,68,0,46,48,43,73,0,10]),
 'waltz':('三拍圓舞曲','Waltz',[0,71,46,24,48,32,73,0,10]),
 'tango':('小酒館探戈','Tango',[21,40,0,24,48,32,71,0,11]),
 'cinema':('電影配樂','Cinematic',[0,60,46,24,48,43,73,0,10]),
 'rock':('流行搖滾','Pop rock',[27,0,0,29,48,34,81,0,10]),
 'funk':('放克律動','Funk',[5,56,4,28,62,34,65,0,12]),
 'disco':('復古迪斯可','Disco',[81,62,4,27,50,34,11,0,12]),
 'house':('旋律浩室','Melodic house',[12,81,4,27,89,38,11,0,98]),
 'breakbeat':('碎拍電子','Breakbeat',[81,12,5,27,90,38,11,0,98]),
 'tripHop':('慢拍電影感','Trip-hop',[4,73,0,26,89,38,11,0,91]),
 'march':('行進冒險','Adventure march',[56,73,0,45,48,43,68,0,10]),
 'woodwind':('木管合奏','Woodwind ensemble',[71,68,0,45,48,32,73,0,10]),
 'celesta':('奇幻音樂盒','Celesta fantasy',[8,73,46,45,48,32,10,0,11]),
 'minimal':('漸進鋼琴','Evolving piano',[0,11,46,24,89,43,73,0,91]),
 'drama':('懸疑敘事','Suspense score',[11,68,0,45,48,43,73,0,91]),
 'synthwave':('霓虹合成器','Synthwave',[81,80,5,27,90,38,12,0,98]),
 'gospel':('溫暖福音流行','Warm gospel pop',[0,16,4,27,48,33,65,0,11]),
 'folk68':('六八拍民謠','6/8 folk',[25,73,0,24,48,32,11,0,46]),
 'ballad68':('六八拍抒情','6/8 ballad',[0,68,4,46,48,32,73,0,10]),
}
# 12 emotions, five arrangements each. Individual form strings use:
# I intro, A theme, B contrasting theme, D duet, S alternate solo, P build,
# C full refrain, X breakdown, R quiet reprise, H immediate hook, O resolution.
MOODS=[
 ('joy','開心','Joy','bright','major',[
 ('今天自帶陽光','Sunshine comes along','pop',116,4,'H2 A3 B3 X1 C5 O2'),
 ('向海邊出發','Heading to the sea','acoustic',110,4,'I1 A4 D2 B3 C4 O2'),
 ('橘子色星期天','Orange Sunday','ska',124,4,'H1 A3 S2 A2 B4 C4 O2'),
 ('小幸福排成隊','Little joys in a row','ukulele',102,4,'I2 A3 B3 R2 D3 C2 O1'),
 ('午後熱帶市集','Tropical afternoon market','latin',118,4,'I1 P2 A4 S3 B2 C3 O1')]),
 ('playful','俏皮','Playful','bright','major',[
 ('貓咪偷開派對','The cat starts a party','woodwind',112,4,'I1 A2 B2 D2 X1 A3 C3 O2'),
 ('口袋裡的小魔法','Pocket-sized magic','celesta',106,3,'I2 A4 S2 B4 D3 O3'),
 ('走錯路也開心','A happy wrong turn','jazz',126,4,'H2 A2 S4 B3 X1 D4 O2'),
 ('泡泡糖探險隊','Bubblegum explorers','ukulele',118,4,'I1 A4 X1 B4 S2 C3 O1'),
 ('積木城市起床了','The toy city wakes','march',108,4,'I2 P2 A3 D3 B2 H2 O2')]),
 ('hope','希望','Hope','bright','major',[
 ('下一站有光','Light at the next stop','gospel',104,4,'I1 R3 P2 B4 C4 D2 O2'),
 ('慢慢走也會到','We will get there','folk68',106,6,'I2 A4 B3 X1 D4 C4 O2'),
 ('雲縫中的早晨','Morning through the clouds','cinema',96,4,'I2 A3 P3 C4 R2 D2 O2'),
 ('一個新的起點','A new starting point','pop',122,4,'H1 A4 P2 B3 C4 X1 C2 O1'),
 ('把願望種下','Plant a little wish','orchestra',102,3,'I3 A4 D3 P2 C5 O3')]),
 ('relax','放鬆','Relaxed','calm','major',[
 ('微風替我翻頁','The breeze turns the page','bossa',98,4,'I2 A4 S3 B3 R2 O2'),
 ('什麼都不用趕','There is no hurry','ambient',88,4,'I3 R3 D3 B2 X2 R3 O2'),
 ('陽台上的小假日','A balcony holiday','reggae',92,4,'I1 A4 S4 X1 B3 D3 O2'),
 ('咖啡慢一點喝','Coffee at an easy pace','jazz',104,4,'I1 A4 B2 S4 R3 O2'),
 ('山邊的下午三點','Three by the mountains','minimal',108,6,'I3 A4 D4 X2 B4 R2 O3')]),
 ('romance','浪漫','Romantic','calm','major',[
 ('把晚安唱給你','A goodnight for you','ballad68',100,6,'I2 A4 B4 D3 C3 R2 O2'),
 ('兩個人的窗景','Our window view','soul',94,4,'I1 A3 D3 B3 X1 C3 O2'),
 ('花園裡的第一支舞','First dance in the garden','waltz',112,3,'I2 A4 B4 S3 D4 C3 O2'),
 ('月光停在肩上','Moonlight on your shoulder','bossa',102,4,'I2 A3 B4 S2 R2 D2 O1'),
 ('雨傘靠近一點','A little closer under the umbrella','piano',88,4,'R2 A4 B3 D3 X1 C2 O1')]),
 ('nostalgia','懷念','Nostalgic','calm','minor',[
 ('舊相簿的夏天','Summer in an old album','acoustic',98,4,'I1 A4 R2 B3 S2 D2 O2'),
 ('最後一班慢車','The last slow train','blues',90,4,'H1 A3 S3 B4 X1 R3 O1'),
 ('那年巷口的燈','The corner light that year','waltz',102,3,'I3 A4 R2 B4 D4 C2 O3'),
 ('寄不出的明信片','An unsent postcard','piano',84,4,'I2 A3 B3 R2 S2 O2'),
 ('留聲機還在轉','The record keeps turning','jazz',108,4,'I1 A4 S3 B4 R2 D2 O2')]),
 ('confidence','自信','Confident','lofi','mixolydian',[
 ('今天輪到我上場','My turn today','funk',116,4,'H2 A4 B3 S3 X1 C3 O2'),
 ('步伐就是答案','The answer in my stride','rock',124,4,'I1 H2 A4 P2 C4 S2 O1'),
 ('把門打開','Open that door','disco',120,4,'H1 A3 D2 B4 P2 C4 O2'),
 ('一路亮綠燈','Green lights all the way','house',126,4,'I2 P2 H4 X2 B4 C4 O2'),
 ('做完再來慶祝','Celebrate when it is done','soul',106,4,'I1 A4 B3 D2 X1 S2 C3 O2')]),
 ('adventure','冒險','Adventure','lofi','dorian',[
 ('背包裡的地平線','A horizon in the backpack','folk68',120,6,'H2 A4 B4 X2 D4 P2 C4 O2'),
 ('穿過未知森林','Through the unknown forest','orchestra',116,6,'I2 P3 A4 S3 B4 D3 C3 O2'),
 ('公路盡頭的日出','Sunrise at the end of the road','rock',132,4,'I1 A4 B4 S2 X1 C5 O1'),
 ('航向藍色星球','Sailing toward a blue planet','synthwave',118,4,'I2 A4 X2 B4 P2 C4 O2'),
 ('地圖上的新記號','A new mark on the map','march',114,4,'H1 A3 D4 B3 S2 C3 O2')]),
 ('excitement','振奮','Excited','lofi','major',[
 ('歡呼倒數三秒','Three seconds to cheering','breakbeat',144,4,'P2 H4 A4 X2 B4 D2 C4 O2'),
 ('燈亮了就跳舞','Dance when the lights come on','disco',128,4,'H2 A4 S2 B4 X2 C4 D2 O2'),
 ('全速追上彩虹','Chasing a rainbow at full speed','house',130,4,'I2 P3 C4 X2 A4 B3 C4 O2'),
 ('比昨天再高一點','A little higher than yesterday','rock',138,4,'H2 A4 P2 B4 S3 C5 O2'),
 ('好消息正在路上','Good news is on the way','latin',126,4,'I1 A4 B3 S4 D2 C4 O2')]),
 ('sad','感傷','Melancholic','cinematic','minor',[
 ('還沒說出口的話','Words left unsaid','piano',82,4,'I1 A4 X1 B4 R2 O2'),
 ('空椅子旁的午後','Afternoon beside an empty chair','ballad68',92,6,'I2 R3 A4 D3 B4 R2 O2'),
 ('雨停之前想起你','Thinking of you before the rain ends','blues',86,4,'R1 A4 S4 B3 X1 O1'),
 ('遠方沒有回音','No echo from afar','orchestra',94,4,'I2 A4 B3 D2 R3 O2'),
 ('把告別放輕','A gentle goodbye','ambient',92,4,'I2 R3 B3 D3 X1 A2 O2')]),
 ('mystery','懸疑','Mysterious','cinematic','minor',[
 ('門後的第二個腳步','The second footstep','drama',104,4,'I2 A3 X2 B3 P2 D3 O1'),
 ('午夜失蹤的時鐘','The missing midnight clock','tripHop',88,4,'H1 A3 X1 S3 B3 D2 O1'),
 ('霧裡有人點燈','A light in the fog','minimal',110,3,'I3 A3 D3 X2 B3 P2 C3 O3'),
 ('藏在信封裡的線索','Clue in an envelope','tango',112,4,'I1 A3 S2 B3 X1 D3 C2 O1'),
 ('星空下的密語','Whispers beneath the stars','celesta',108,6,'I2 R4 A3 X2 B4 D3 S2 O2')]),
 ('epic','壯闊','Epic','cinematic','minor',[
 ('山海之間的約定','A promise between sea and mountains','cinema',106,4,'I2 A3 P3 B4 C4 D2 O2'),
 ('等到天空打開','Until the sky opens','orchestra',116,6,'I3 R3 P3 A4 D4 C5 O2'),
 ('最後一程也向前','Forward through the final mile','rock',122,4,'I1 A4 B4 X1 P2 C4 O2'),
 ('把名字寫在遠方','Write our names in the distance','gospel',108,4,'I2 R3 A4 B3 P2 C4 O2'),
 ('故事未完待續','The story will continue','synthwave',114,4,'I2 A3 B4 X2 D3 P2 C3 O1')])
]
# Individually authored A/B melodic blueprints (first and second halves).
# Different note counts/rhythms and phrase endings are applied by each score.
THEMES=[
'2245412464520230 1358753597424686','0247542145743201 2457975476453210','4420145427542100 6579754235421674','0124542024575210 3579752465423100','4254201257453210 6797542357421684',
'0204245034210240 4576420135754210','0427054242053120 5797546275432100','2420542175452310 6757240575423101','0242045754213020 4579765423102540','4024510245723100 2468754975423164',
'0124575424210320 4579752426795420','0421425754213200 2579754624753210','2457542012453210 5798765424675421','2045241754210320 4579752426574310','0245720421543210 4679752425785420',
'4210245421023100 6424576423542100','0420214524201020 4575420246754200','0454201245023120 5746754254210464','0246454212453100 4679754654210240','0242145024523100 4576424575420210',
'4210246575423100 5797542467542100','2420145754210420 4675426575423100','0245354212543210 5797654257421030','4256421024573100 6754975423574210','0245742102453210 4797542657423100',
'4202145321024100 6575421356423100','0254201435423100 4576420575423101','0245342154321020 5765432575423100','4021425324210100 4576542345423100','0265424135243100 6797542653423100',
'0024524124654210 4579746575423100','0254247654212500 5797542468754210','4542024765424100 6754975424573210','0246754214572100 4798752467543210','4245210265423100 6795423575421464',
'0254754217543210 5798746575423100','0246754324572100 4579875426754210','0457542176543200 5798754267543210','0247576424572100 6798754264573210','0245751426754210 4578975426543210',
'2457240576454210 6798754675423100','0457574212465210 5798752467943210','0247975426752100 5798754264576410','0257476542425100 6798752467543210','4257452174653210 5798765426574210',
'4202145324102100 6547542354321100','0425321425432100 5765432457421100','0243542142532100 4576542354321010','4253421024532100 6575432544321100','0421425325421100 4576432453210100',
'0104521435421010 3467542365432100','0243542014532100 4576432546321100','0204532145321010 3567542365421010','4253210435432100 6754324576432100','0241354204532100 4576542356321100',
'0245754216543210 5798765426754210','0457542365423100 6798754675423100','0257476545324100 5798765426753210','0246542357542100 6798754267543210','2457542167543210 5798746576543210',
]
SCALES={'major':[0,2,4,5,7,9,11],'minor':[0,2,3,5,7,8,10],'dorian':[0,2,3,5,7,9,10],'mixolydian':[0,2,4,5,7,9,10]}
PROGS=[[0,4,5,3],[0,5,1,4],[0,2,3,4],[0,3,5,4],[5,3,0,4],[0,1,3,4],[0,3,1,4],[0,5,3,4],[0,4,1,3],[5,2,3,4],[0,2,5,4],[0,3,4,0]]
CONTRAST=[[1,3,0,4],[3,4,2,5],[5,3,1,4],[3,0,1,4],[0,3,1,4],[2,5,1,4]]
RHYTHMS=[
[(0,.65),(.75,.4),(1.5,.85),(2.75,1.0)],
[(0,1.2),(1.5,.35),(2,.6),(3,.7)],
[(.5,.7),(1.5,.4),(2.25,.65),(3.25,.6)],
[(0,.4),(.5,.6),(1.5,.7),(2.75,1)],
[(0,.8),(1,.4),(1.75,.8),(3,.7)],
[(.25,.6),(1,.7),(2,1.4),(3.5,.25)],
[(0,1.6),(2,.35),(2.5,.4),(3,.8)],
[(0,.6),(1,.6),(2,.8),(3.25,.4)],
[(0,.35),(.75,.65),(1.75,.75),(3, .6)],
[(.5,1.1),(2,.4),(2.75,.4),(3.5,.3)],
[(0,.9),(1.25,.5),(2,.6),(3, .8)],
[(0,.5),(.75,.5),(1.5,1.15),(3,.75)],
]
def structure(pattern,bars):
 blocks=[[p[0],int(p[1:])] for p in pattern.split()]
 while sum(n for _,n in blocks)>bars:
  options=[j for j,(s,n) in enumerate(blocks) if n>1 and s not in ['I','O','X']]
  if not options:options=[j for j,(_,n) in enumerate(blocks) if n>1]
  j=max(options,key=lambda j:blocks[j][1]);blocks[j][1]-=1
 while sum(n for _,n in blocks)<bars:
  options=[j for j,(s,n) in enumerate(blocks) if s in ['A','B','C','D','S']]
  j=min(options,key=lambda j:blocks[j][1]);blocks[j][1]+=1
 return [s for s,n in blocks for _ in range(n)]

def compose(i):
 group=i//5;v=i%5; mood,moodzh,mooden,cat,mode,rows=MOODS[group]
 name,en,style,bpm,meter,pattern=rows[v]
 desc,descen,programs=STYLES[style];key=[60,62,65,67,69,63][(i*5+group)%6];scale=SCALES[mode]
 beat=60/bpm*(.5 if meter==6 else 1);barlen=meter*beat
 bars=int(36.5/barlen);form=structure(pattern,bars)
 rng=np.random.default_rng(761100+i*431);notes=[];melodic=[];progress=[];phraseN={}
 themeA,themeB=[[int(c) for c in s] for s in THEMES[i].split()]
 def pitch(d,oct=0):return key+scale[d%7]+12*(d//7+oct)
 def put(role,n,at,dur,vel):
  if at>=38.15:return
  at=max(0,at+float(rng.uniform(-.006,.006)))
  event=[role,int(n),round(at,5),round(max(.04,min(dur,38.35-at)),5),int(np.clip(vel+rng.integers(-3,4),1,116))]
  notes.append(event)
  if role in ['lead','leadB']:melodic.append(event)
 def times(norm):return [(a*meter/4,b*meter/4) for a,b in norm]
 previous=[55,60,64]
 styleswing=.19 if style=='jazz' else .13 if style in ['chillhop','soul','blues'] else .06 if style=='funk' else 0
 for bar,section in enumerate(form):
  t=bar*barlen;local=phraseN.get(section,0);phraseN[section]=local+1
  prev=form[bar-1] if bar else None;next_=form[bar+1] if bar+1<bars else None
  contrast=section in ['B','S','D'];full=section in ['C','H'];sparse=section in ['I','X','R','O']
  prog=(CONTRAST[(i+v)%6] if contrast else PROGS[i%12])
  degree=prog[local%4]
  if style=='blues':degree=[0,0,3,0,4,3,0,4][local%8]
  if section=='P':degree=[1,3,4,4][local%4]
  if section=='O':degree=0 if bar==bars-1 else 4
  progress.append(degree)
  ext=style in ['bossa','jazz','soul','chillhop','blues','tripHop']
  ds=[degree,degree+2,degree+4]+([degree+6] if ext else [])
  pcs=[pitch(x)%12 for x in ds]
  candidates=[]
  for inv in range(len(pcs)):
   c=sorted(48+(p-48)%12 for p in pcs);c=c[inv:]+[p+12 for p in c[:inv]]
   for oct in (0,12):
    vo=[n+oct for n in c]
    if max(vo)<=77:candidates.append(vo)
  chord=min(candidates,key=lambda c:sum(abs(n-previous[min(j,len(previous)-1)]) for j,n in enumerate(c)))
  previous=chord;root=pitch(degree,-2)
  while root<35:root+=12
  while root>48:root-=12
  vel=52 if sparse else 75 if full else 65
  if bar==bars-1:
   # Tonic, cadence response and room for the sampled release.
   chord=[key-12,key+scale[2]-12,key+7-12]
   for j,n in enumerate(chord):
    put('keys',n,t+j*.018,38-t,72);put('pad',n,t,38.2-t,52)
   put('bass',pitch(0,-2),t,37.7-t,74)
   put('leadB' if contrast else 'lead',pitch(7),t+.02,min(2.1,38-t),74)
   for j,n in enumerate(chord):put('answer',n+12,t+.85+j*.23,.7,46)
   if style in ['rock','disco','house','cinema','march']:put('drums',49,t,.9,45)
   continue
  # The harmonic rhythm/texture changes across sections, even within one style.
  picked=style in ['acoustic','folk68','piano','ballad68','cinema','orchestra','minimal','ambient','celesta']
  if meter==3:
   accompaniment=[(0,0),(1,1),(2,2)]
  elif meter==6:
   accompaniment=[(0,0),(1,1),(2,2),(3,0),(4,2),(5,1)]
  else:
   accompaniment=[(0,0),(.75,1),(1.5,2),(2,0),(2.75,2),(3.5,1)]
  if picked:
   if full and style in ['cinema','orchestra','piano']:
    for pos in [0,meter/2]:
     for j,n in enumerate(chord):put('keys',n,t+pos*beat+j*.011,beat*meter/2*.83,vel-6)
   else:
    for j,(pos,nidx) in enumerate(accompaniment[::2] if sparse else accompaniment):
     put('keys',chord[(nidx+v)%len(chord)],t+pos*beat,beat*(1.25 if style=='ambient' else .8),vel-5)
  else:
   rhythm=[0,1.5,2.75] if style in ['latin','bossa'] else [.5,1.5,2.5,3.5] if style in ['ska','reggae','funk','disco','house'] else [0,1.667,2.5] if style=='jazz' else [0,2.5]
   if section in ['X','I']:rhythm=rhythm[:1]
   if section=='B' and v%2==0:rhythm=[0,2]
   for pos in rhythm:
    for j,n in enumerate(chord):
     put('keys',n,t+pos*meter/4*beat+j*.01,beat*(.3 if style in ['ska','reggae','funk'] else .9),vel-5)
  # Rhythmic voices enter and leave, with strums/ostinatos/long strings separate.
  if section not in ['I','X'] and not(section=='R' and local%2==0):
   if style in ['ambient','minimal','drama','celesta']:
    positions=[.5,2.5] if meter==4 else [1,meter-1]
    for j,pos in enumerate(positions):put('rhythm',chord[(bar+j)%len(chord)]+12,t+pos*beat,beat*.65,vel-13)
   elif picked or meter in [3,6]:
    for j,(pos,nidx) in enumerate(accompaniment[::2] if section=='A' else accompaniment):
     put('rhythm',chord[(nidx+bar)%len(chord)],t+pos*beat+j*.004,.6*beat,vel-10)
   else:
    positions=[.75,1.5,2.75,3.5] if style in ['latin','bossa'] else [.5,1.5,2.5,3.5]
    if not full and local%2==0:positions=positions[::2]
    for pos in positions:
     seq=chord if local%2==0 else chord[::-1]
     for j,n in enumerate(seq):put('rhythm',n,t+pos*beat+j*.012,.22*beat,vel-15)
  padon=full or section in ['B','P','D'] or style in ['ambient','cinema','orchestra','drama','tripHop'] and section!='I'
  if padon:
   for j,n in enumerate(chord):put('pad',n,t+j*.015,barlen*.91,42 if sparse else 60 if full else 50)
  if section in ['B','D','C'] and local%2==0:
   put('texture',chord[-1]+12,t+.16,barlen*.7,44)
  # Dedicated bass parts: walking, tumbao, offbeat, riffs, 6/8 and long pedals.
  if style=='jazz':
   bass=[(j,root+(pitch(degree+[0,2,4,5][j])-root)%12,.78) for j in range(4)]
  elif style in ['funk','disco']:
   bass=[(0,root,.55),(.75,root,.3),(1.5,root+12,.3),(2.25,root,.55),(3,root+7,.25),(3.5,root+12,.3)]
  elif style in ['latin','bossa']:
   bass=[(0,root,1),(1.5,root+7,.4),(2.5,root,.65),(3.5,root+7,.35)]
  elif style in ['reggae','ska']:
   bass=[(0,root,.65),(1.5,root+7,.4),(2,root+12,.7),(3.25,root,.45)]
  elif style in ['house','synthwave','breakbeat']:
   bass=[(j*.5,root+(12 if j%4==3 else 0),.36) for j in range(8)]
  elif meter==3:bass=[(0,root,1.6),(2,root+7,.7)]
  elif meter==6:bass=[(0,root,2.5),(3,root+7,2.2)]
  elif style in ['ambient','drama','minimal']:bass=[(0,root,3.6)]
  else:bass=[(0,root,1.5),(2,root+7,1.2),(3.5,root+12,.35)]
  if sparse:bass=bass[:1]
  if section=='X' and local==0:bass=[]
  for pos,n,dur in bass:put('bass',n,t+pos*beat,dur*beat,85 if full else 74)
  # A and B have different authored melodies. A later return recalls the hook.
  if section not in ['I','X','P','O']:
   theme=themeB if contrast else themeA;start=(local%4)*4
   rhythm=times(RHYTHMS[(i+local+(3 if contrast else 0))%len(RHYTHMS)])
   if section=='R':rhythm=[(0,meter*.36),(meter*.55,meter*.35)]
   if style in ['ambient','piano','cinema'] and not full:
    rhythm=[(0,meter*.31),(meter*.4,meter*.18),(meter*.7,meter*.25)]
   if local%4==3:rhythm=[(0,meter*.17),(meter*.25,meter*.17),(meter*.5,meter*.38)]
   main='leadB' if contrast else 'lead'
   if section=='D' and local%2:main='lead'
   for j,(pos,dur) in enumerate(rhythm):
    d=theme[(start+j)%16];n=pitch(d)
    while n<62:n+=12
    while n>85:n-=12
    if j==0 and pos==0:n=min([z for z in range(62,86) if z%12 in pcs],key=lambda z:abs(z-n))
    shift=styleswing*beat if pos%1>=.5 and meter==4 else 0
    put(main,n,t+pos*beat+shift,dur*beat,87 if full else 73 if sparse else 80)
    if section in ['D','C'] and dur>=meter*.22:
     harmony=max([z for z in range(n-7,n-2) if z%12 in pcs],default=n-5)
     put('answer',harmony,t+pos*beat+.018,dur*beat*.88,54)
   # Counter-line in measured gaps, rather than doubling a full-time melody.
   end=max(pos+dur for pos,dur in rhythm)
   if end<meter-.35:
    for j,pos in enumerate([end+.04,meter-.28]):
     if pos<meter:put('answer',chord[-1-j%2]+12,t+pos*beat,.22*beat,57)
   elif section in ['B','S'] and local%2==1:
    put('answer',chord[0]+12,t+.35*beat,.23*beat,43)
  elif section in ['I','X','P']:
   theme=themeB if section=='X' else themeA
   for j,pos in enumerate([.5,meter*.45,meter*.75]):
    n=pitch(theme[(j+local*4)%16])
    while n<62:n+=12
    put('leadB' if section=='X' else 'answer',n,t+pos*beat,.55*beat,58 if section=='X' else 49)
  elif section=='O':
   for pos,d in [(0,4),(meter*.4,2),(meter*.75,1)]:put('lead',pitch(d,1),t+pos*beat,.65*beat,67)
  # Percussion families differ fundamentally, not merely in kit or tempo.
  if section in ['I','X','R','O']:continue
  if style in ['ambient','minimal','piano'] and section not in ['C','P','D']:continue
  if style in ['orchestra','cinema','drama','celesta','woodwind']:
   if section in ['B','C','D','P']:
    for pos in [0,meter/2]:put('drums',41 if style!='woodwind' else 36,t+pos*beat,.35,58 if full else 44)
    if local%2==1:put('drums',49,t+meter*.75*beat,.55,27)
   continue
  if meter==3:kicks=[0];snare=[2];hat=[1,2];sn=37
  elif meter==6:kicks=[0,3];snare=[3];hat=[0,1,2,3,4,5];sn=37 if style=='folk68' else 38
  elif style=='jazz':kicks=[0,2];snare=[1,3];hat=[0,1,1.667,2,3,3.667];sn=37
  elif style in ['latin','bossa']:kicks=[0,1.5,2,3.5];snare=[1,3];hat=list(np.arange(0,4,.5));sn=37
  elif style=='reggae':kicks=[2];snare=[2];hat=list(np.arange(0,4,.5));sn=37
  elif style in ['house','disco','synthwave']:kicks=[0,1,2,3];snare=[1,3];hat=list(np.arange(0,4,.5));sn=38
  elif style=='breakbeat':kicks=[0,.75,2.5];snare=[1,3];hat=[0,.5,.75,1.5,2,2.5,3.5,3.75];sn=38
  elif style in ['chillhop','tripHop','soul','funk']:kicks=[0,1.75,2.5];snare=[1,3];hat=list(np.arange(0,4,.5));sn=38
  elif style=='march':kicks=[0,2];snare=[1,1.5,3,3.5];hat=[0,1,2,3];sn=38
  elif style=='tango':kicks=[0,2.5];snare=[1.5,3.5];hat=[0,1,2,3];sn=37
  elif style=='rock':kicks=[0,.5,2,2.75];snare=[1,3];hat=list(np.arange(0,4,.5));sn=38
  else:kicks=[0,2];snare=[1,3];hat=list(np.arange(0,4,.5));sn=37 if style in ['acoustic','ukulele','blues'] else 38
  if section=='A' and local<2:hat=hat[::2]
  if section=='P':
   snare=list(np.arange(0,meter,.5 if local%2 else 1));kicks=[0]
  for pos in kicks:put('drums',36,t+pos*beat,.12,83 if full else 71)
  for pos in snare:put('drums',sn,t+pos*beat+.008,.12,72 if full else 60)
  for j,pos in enumerate(hat):
   note=51 if style=='jazz' else 46 if style in ['house','disco'] and j%2 else 42
   put('drums',note,t+(pos+(styleswing if j%2 and meter==4 else 0))*beat,.12,39+(j%2)*11)
  if style in ['latin','bossa','reggae']:
   for pos,n in [(.75,64),(1.5,63),(2.75,64),(3.5,62)]:put('drums',n,t+pos*beat,.11,43)
  if section=='C':
   for pos in np.arange(.5,meter,1):put('drums',54,t+pos*beat,.1,33)
  if next_ not in [section,'O'] and next_ is not None:
   for j,n in enumerate([38,45,47,50]):put('drums',n,t+(meter-1+j*.25)*beat,.15,44+j*5)
  if prev!=section and full:put('drums',49,t,.8,43)
 notes.sort(key=lambda x:x[2])
 return dict(name=name,en=en,category=cat,genre=style,genreName=desc,genreEn=descen,mood=mood,moodName=moodzh,moodEn=mooden,key=key,bpm=bpm,meter=meter,denominator=8 if meter==6 else 4,mode=mode,bars=bars,sections=form,structure=pattern,programs=dict(zip(ROLE_NAMES,programs)),notes=notes,chords=progress,themeA=themeA,themeB=themeB)

def render(score,sfbytes):
 import tinysoundfont
 SR=base.SR;N=base.N;stems={};rng=np.random.default_rng(score['key']*100+score['bpm'])
 targets={'lead':.068,'leadB':.064,'keys':.034,'rhythm':.026,'pad':.016,'bass':.060,'answer':.027,'drums':.050,'texture':.013}
 pans={'lead':61,'leadB':70,'keys':47,'rhythm':85,'pad':64,'bass':64,'answer':91,'drums':64,'texture':33}
 for role in ROLE_NAMES:
  ns=[e for e in score['notes'] if e[0]==role]
  if not ns:continue
  synth=tinysoundfont.Synth(gain=-9,samplerate=SR);sf=synth.sfload(sfbytes)
  synth.program_select(0,sf,0,score['programs'][role],is_drums=role=='drums')
  synth.control_change(0,7,100);synth.control_change(0,10,pans[role])
  ev=[]
  for _,pitch,at,dur,vel in ns:
   ev.append((round(at*SR),1,pitch,vel));ev.append((min(N,round((at+dur)*SR)),0,pitch,0))
  ev.sort();audio=np.zeros((N,2),np.float32);pos=0
  for tick,on,pitch,vel in ev:
   tick=min(N,tick)
   if tick>pos:audio[pos:tick]=np.frombuffer(synth.generate(tick-pos),dtype='<f4').reshape(-1,2);pos=tick
   if on:synth.noteon(0,pitch,vel)
   else:synth.noteoff(0,pitch)
  if pos<N:audio[pos:]=np.frombuffer(synth.generate(N-pos),dtype='<f4').reshape(-1,2)
  levels=np.sqrt(np.mean(audio[:N//22050*22050].reshape(-1,22050,2)**2,axis=(1,2)))
  active=levels[levels>.0001];level=float(np.percentile(active,70)) if len(active) else 1
  audio*=min(12,targets[role]/max(.0001,level))
  if role not in ['bass','drums','rhythm']:
   length=int(SR*(1.15 if role=='pad' else .62));ir=rng.normal(0,1,(length,2)).astype(np.float32);t=np.arange(length)/SR
   for ch in range(2):
    ir[:,ch]=np.convolve(ir[:,ch],np.ones(7)/7,'same')*np.exp(-t*7)
    ir[:int(.018*SR),ch]=0;ir[:,ch]/=max(.001,float(np.linalg.norm(ir[:,ch])))
   size=1<<(N+length-1).bit_length();wet=.14 if role=='pad' else .075
   for ch in range(2):audio[:,ch]+=np.fft.irfft(np.fft.rfft(audio[:,ch],size)*np.fft.rfft(ir[:,ch],size),size)[:N].astype(np.float32)*wet
  stems[role]=audio
 mix=sum(stems.values());mix-=mix.mean(axis=0);mix=np.tanh(mix*1.06)/1.06
 mix[:int(.03*SR)]*=np.linspace(0,1,int(.03*SR))[:,None]
 mix[-int(1.5*SR):]*=np.linspace(1,0,int(1.5*SR))[:,None]**1.3
 return mix.astype('<f4')
