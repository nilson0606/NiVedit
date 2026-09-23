"""Isolated helper integration tests. Real FFmpeg; synthetic downloader, no network.
Usage: python tests/yt-mp4.py CONFIG_JSON QA_DIRECTORY [--serve]
"""
from pathlib import Path
import importlib.util,json,sys,shutil,subprocess,threading,time,urllib.request,urllib.error
src=Path(__file__).resolve().parents[1];out=Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True)
runtime=out/'helper';runtime.mkdir(exist_ok=True)
config=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'));(runtime/'config.json').write_text(json.dumps(config),encoding='utf-8')
for name in ['server.py','index.html']:shutil.copy2(src/'yt-mp3-helper'/name,runtime/name)
ffmpeg=config['ffmpeg'];ffprobe=str(Path(ffmpeg).with_name('ffprobe.exe' if sys.platform=='win32' else 'ffprobe'))
fixture=runtime/'fixture.mkv';audio=runtime/'fixture.mp3'
subprocess.run([ffmpeg,'-y','-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=20','-f','lavfi','-i','sine=frequency=440','-t','2','-c:v','libvpx-vp9','-c:a','libopus',str(fixture)],check=True)
subprocess.run([ffmpeg,'-y','-v','error','-i',str(fixture),'-vn',str(audio)],check=True)
(runtime/'fake_download.py').write_text('''import sys,time,shutil
from pathlib import Path
folder=Path(sys.argv[1]);fmt=sys.argv[2];url=sys.argv[3]
if 'cancel00000' in url:time.sleep(30)
if 'error000000' in url:sys.exit(2)
ext='mp3' if fmt=='mp3' else 'mkv'
p=folder/('sample.'+ext);shutil.copy2(Path(__file__).parent/('fixture.'+ext),p)
print('PROGRESS:100%',flush=True);print('FILE:'+str(p),flush=True)
''',encoding='utf-8')
spec=importlib.util.spec_from_file_location('tested_helper',runtime/'server.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
checks=[]
def check(name,ok):
 assert ok,name
 checks.append(name)
mp4cmd=m.command('https://www.youtube.com/watch?v=jNQXAC9IVRw','1080',runtime,'mp4')
check('MP4 command selects bounded video plus audio',mp4cmd[mp4cmd.index('-f')+1]=='bv[height<=1080]+ba/b[height<=1080]')
check('MP3 extraction preserved','--audio-format' in m.command('x','192',runtime))
m.command=lambda url,quality,folder,media_format='mp3':[sys.executable,str(runtime/'fake_download.py'),str(folder),media_format,url]
server=m.ThreadingHTTPServer(('127.0.0.1',0),m.Handler);m.PORT=server.server_port
thread=threading.Thread(target=server.serve_forever);thread.start();base='http://127.0.0.1:'+str(m.PORT)
def req(path,data=None,headers=None):
 h={'X-Local-Token':m.TOKEN};h.update(headers or {})
 try:
  f=urllib.request.urlopen(urllib.request.Request(base+path,data=None if data is None else json.dumps(data).encode(),headers=h),timeout=10)
 except urllib.error.HTTPError as e:f=e
 return f.status,f.headers,f.read()
def state():return json.loads(req('/api/state')[2])
def done():
 for _ in range(200):
  s=state()
  if s['status']!='running':return s
  time.sleep(.1)
 raise AssertionError('job timeout')
try:
 check('Unauthenticated state denied',req('/api/state',headers={'X-Local-Token':''})[0]==403)
 check('Foreign Origin denied',req('/api/start',{},headers={'Origin':'https://other.invalid'})[0]==403)
 check('Foreign Host denied',req('/',headers={'Host':'other.invalid'})[0]==403)
 for name,payload in [('Non-YouTube URL',{'url':'https://example.com/x'}),('Invalid format',{'url':'https://youtu.be/jNQXAC9IVRw','format':'exe'}),('Invalid MP4 quality',{'url':'https://youtu.be/jNQXAC9IVRw','format':'mp4','quality':'192'}),('Invalid MP3 quality',{'url':'https://youtu.be/jNQXAC9IVRw','format':'mp3','quality':'1080'})]:
  check(name+' rejected',req('/api/start',payload)[0]==400)
 check('Start MP4',req('/api/start',{'url':'https://youtu.be/jNQXAC9IVRw','format':'mp4','quality':'1080'})[0]==200)
 s=done();check('MP4 conversion complete',s['status']=='done' and s['file'].endswith('.mp4'))
 final=m.OUT/s['file'];d=json.loads(subprocess.check_output([ffprobe,'-v','error','-show_streams','-of','json',str(final)],text=True))
 check('Real H264 picture',any(x['codec_name']=='h264' and x['width']==320 for x in d['streams']))
 check('Real AAC audio',any(x['codec_name']=='aac' for x in d['streams']))
 check('Source file preserved',list(final.parent.glob('*.mkv'))!=[])
 path='/media?token='+m.TOKEN+'&file='+urllib.parse.quote(s['file'])
 code,headers,body=req(path,headers={'Range':'bytes=0-99'});check('MP4 seek range',code==206 and len(body)==100 and body==final.read_bytes()[:100]);check('MP4 media type',headers['Content-Type']=='video/mp4')
 check('Media missing token denied',req('/media?file=x.mp4')[0]==403)
 check('Traversal denied',req('/media?token='+m.TOKEN+'&file=../fixture.mp3')[0]==404)
 check('Invalid byte range rejected',req(path,headers={'Range':'bytes=999999999-'})[0]==416)
 code,headers,body=req(path+'&download=1');check('Download exact file',body==final.read_bytes() and 'attachment' in headers['Content-Disposition'])
 check('Start legacy MP3 request',req('/api/start',{'url':'https://youtu.be/jNQXAC9IVRw','quality':'192'})[0]==200)
 s=done();check('Legacy MP3 done',s['status']=='done' and s['format']=='mp3')
 check('Legacy audio endpoint',req('/audio?token='+m.TOKEN+'&file='+urllib.parse.quote(s['file']))[1]['Content-Type']=='audio/mpeg')
 req('/api/start',{'url':'https://youtu.be/cancel00000','format':'mp4','quality':'720'})
 check('Concurrent job rejected',req('/api/start',{'url':'https://youtu.be/jNQXAC9IVRw'})[0]==409)
 req('/api/cancel',{});s=done();check('Cancellation clears result',s['status']=='cancelled' and not s['file'])
 req('/api/start',{'url':'https://youtu.be/error000000','format':'mp4','quality':'720'});check('Download failure is surfaced',done()['status']=='error')
 report={'passed':len(checks),'checks':checks,'base':base,'fixture':str(final),'syntheticDownloader':True,'realFFmpeg':True}
 (out/'backend.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report),flush=True)
 if '--serve' in sys.argv:thread.join()
finally:
 server.shutdown();server.server_close();thread.join()
