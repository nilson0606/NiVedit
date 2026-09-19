const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync(__dirname+'/../src/49_asr.js','utf8');
const timers=new Map(),workers=[],elements=new Map(),screens=[];
let tid=0,uid=0;
const el=id=>{if(!elements.has(id))elements.set(id,{classList:{remove(){},add(){}},onclick:null});return elements.get(id)};
class Worker{
 constructor(){workers.push(this)}
 postMessage(m){this.message=m}
 terminate(){this.terminated=true}
}
const ctx=vm.createContext({console,Worker,Blob,URL,performance,navigator:{gpu:{}},
 setTimeout:(f,ms)=>{timers.set(++tid,{f,ms});return tid},clearTimeout:id=>timers.delete(id),
 $:el,A:{clips:[{id:'c',track:0}],subs:[],musics:[]},fmt:x=>String(x),uid:()=>String(++uid),
 mShow(){},mProg(){},mDone:(...a)=>screens.push(a),toast(){},esc:x=>String(x),toTW:x=>x,
 pushUndo(){},render(){},refreshProp(){},clipTrack:()=>0});
vm.runInContext(src,ctx);
vm.runInContext("asrExtract16k=async()=>({pcm:new Float32Array(400000),offset:0,dur:25});asrDir=async()=>null;asrDirName=()=>'';asrUpdateState=()=>{};srtSaveBeside=async()=>null",ctx);
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
const run=()=>vm.runInContext('asrRun()',ctx);
(async()=>{
 let p=run();await flush();const first=workers.at(-1),oldCallback=first.onmessage;
 assert.equal(first.message.segmentMode,'normal');assert.equal(timers.size,1);el('#mCancel').onclick();await p;
 assert(first.terminated);assert.equal(timers.size,0);assert.equal(vm.runInContext('ASR.busy',ctx),false);
 vm.runInContext("ASR.segmentMode='short'",ctx);
 p=run();await flush();const second=workers.at(-1);
 assert.equal(second.message.segmentMode,'short');
 oldCallback({data:{t:'error',msg:'late error'}});assert(!second.terminated);
 second.onmessage({data:{t:'done',chunks:[{timestamp:[20,24],text:'最後一句'}]}});await p;
 assert.equal(ctx.A.subs[0].end,24);assert.equal(timers.size,0);assert(!second.terminated);
 ctx.A.subs=[];p=run();await flush();
 workers.at(-1).onerror({message:'GPU device lost',preventDefault(){}});await p;
 assert.equal(timers.size,0);assert(screens.at(-1)[2].includes('GPU device lost'));
 p=run();await flush();
 workers.at(-1).onmessage({data:{t:'status',s:'正在初始化 FP16'}});
 [...timers.values()][0].f();await p;
 assert(screens.at(-1)[2].includes('正在初始化 FP16'));assert.equal(timers.size,0);
 // Cancellation during extraction must not let a new run race the old cleanup.
 vm.runInContext("asrExtract16k=()=>new Promise(r=>globalThis.extractResolve=r)",ctx);
 p=run();await flush();el('#mCancel').onclick();assert(vm.runInContext('ASR.busy',ctx));
 ctx.extractResolve({pcm:new Float32Array(16),offset:0,dur:1});await p;assert(!vm.runInContext('ASR.busy',ctx));
 // Missing/unknown mode preserves original defaults; mode switches reuse the model and reset progress.
 const messages=[],plans=[];let expected;
 const wc=vm.createContext({self:{postMessage:m=>messages.push(m),addEventListener(){}},navigator:{gpu:{requestAdapter:async()=>({features:new Set(['shader-f16'])})}},console});
 vm.runInContext(vm.runInContext('ASR_WORKER_SRC',ctx),wc);
 wc.factory=async(task,model,opt)=>{
  plans.push(opt);const pipe=async(audio,options)=>{
   assert.equal(options.chunk_length_s,expected.chunk);assert.equal(options.stride_length_s,expected.stride);
   for(let i=0;i<expected.steps;i++)await pipe.model.generate();
   return {text:'片尾',chunks:[{timestamp:[22,24],text:'片尾'}]};
  };pipe.model={generate:async()=>null};pipe.dispose=async()=>{};return pipe;
 };
 vm.runInContext("T={pipeline:factory}",wc);
 for(const testCase of [
  {mode:undefined,chunk:30,stride:5,steps:1},
  {mode:'short',chunk:20,stride:2,steps:2},
  {mode:'short',chunk:20,stride:2,steps:2},
  {mode:'normal',chunk:30,stride:5,steps:1},
  {mode:'unknown',chunk:30,stride:5,steps:1}
 ]){
  expected=testCase;messages.length=0;
  await wc.self.onmessage({data:{cmd:'run',model:'onnx-community/whisper-large-v3-turbo',device:'webgpu',audio:new Float32Array(391493),lang:'zh',segmentMode:expected.mode}});
  assert.deepEqual(messages.filter(x=>x.t==='step').map(x=>[x.done,x.total]),expected.steps===1?[[0,1],[1,1]]:[[0,2],[1,2],[2,2]]);
 }
 assert.equal(plans.length,1);assert.equal(plans[0].dtype,'fp16');
 console.log('PASS: cancellation, retry, late messages, worker errors, timeout stage, extraction cancellation, original defaults, optional short mode, repeated progress and Turbo FP16');
})().catch(e=>{console.error(e);process.exit(1)});
