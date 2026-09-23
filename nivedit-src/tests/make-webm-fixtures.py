"""Generate synthetic WebM import fixtures: python make-webm-fixtures.py FFMPEG OUT."""
from pathlib import Path
import subprocess,sys
ff=sys.argv[1];out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
for name,codec,extra in [('audio-opus.webm','libopus',[]),('audio-vorbis.webm','libvorbis',[]),('legacy.mp3','libmp3lame',[]),('audio-no-duration.webm','libopus',['-live','1'])]:
 subprocess.run([ff,'-y','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:a',codec,*extra,str(out/name)],check=True)
subprocess.run([ff,'-y','-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=20','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','2','-c:v','libvpx-vp9','-c:a','libopus',str(out/'video.webm')],check=True)
b=bytearray((out/'audio-opus.webm').read_bytes());pos=b.index(bytes.fromhex('18538067'))+4;n=1;mask=128
while not b[pos]&mask:mask>>=1;n+=1
b[pos:pos+n]=bytes([mask*2-1])+b'\xff'*(n-1);(out/'audio-unknown-size.webm').write_bytes(b)
print('Generated six audio/video import fixtures.')
