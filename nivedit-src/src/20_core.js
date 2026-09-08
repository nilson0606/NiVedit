/* ==========================================================================
   NiVedit — 核心：狀態、工具、素材匯入、時間軸計算
   ========================================================================== */
'use strict';

const VER = 'v9.7';          // 每次更新都會變，用來確認瀏覽器有沒有載到新版

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const uid = () => Math.random().toString(36).slice(2, 9);

const ASPECTS = {
  '16:9': [[3840,2160,'4K'],[1920,1080,'1080p'],[1280,720,'720p'],[854,480,'480p']],
  '9:16': [[1080,1920,'1080p 直式'],[720,1280,'720p 直式']],
  '1:1':  [[1080,1080,'1080 方形'],[720,720,'720 方形']],
  '4:3':  [[1440,1080,'1080p 4:3'],[960,720,'720p 4:3']]
};

/* ── 轉場定義（Stage 2：30 種＋硬切） ────────────────────────
   g = 分類，給屬性面板的 optgroup 與預覽選單用。 */
const TRANSITIONS = [
  { id:'none',      g:'基本',   name:'無（硬切）' },

  { id:'fade',      g:'溶接',   name:'淡入黑' },
  { id:'fadeW',     g:'溶接',   name:'淡入白' },
  { id:'dissolve',  g:'溶接',   name:'交叉溶接' },
  { id:'blurDis',   g:'溶接',   name:'模糊溶接' },
  { id:'flash',     g:'溶接',   name:'光溢閃白' },

  { id:'pushL',     g:'位移',   name:'左推' },
  { id:'pushR',     g:'位移',   name:'右推' },
  { id:'pushU',     g:'位移',   name:'上推' },
  { id:'pushD',     g:'位移',   name:'下推' },
  { id:'slideL',    g:'位移',   name:'左滑入（蓋上）' },
  { id:'slideR',    g:'位移',   name:'右滑入（蓋上）' },
  { id:'slideU',    g:'位移',   name:'上滑入（蓋上）' },
  { id:'slideD',    g:'位移',   name:'下滑入（蓋上）' },

  { id:'wipeL',     g:'擦除',   name:'橫向擦除（左→右）' },
  { id:'wipeR',     g:'擦除',   name:'橫向擦除（右→左）' },
  { id:'wipeU',     g:'擦除',   name:'直向擦除（上→下）' },
  { id:'wipeD',     g:'擦除',   name:'直向擦除（下→上）' },
  { id:'wipeDiag',  g:'擦除',   name:'對角擦除' },
  { id:'clock',     g:'擦除',   name:'時鐘掃描' },
  { id:'blinds',    g:'擦除',   name:'百葉窗' },

  { id:'circle',    g:'幾何',   name:'圓形放大' },
  { id:'circleOut', g:'幾何',   name:'圓形收合' },
  { id:'diamond',   g:'幾何',   name:'菱形開合' },
  { id:'blocks',    g:'幾何',   name:'格狀方塊' },
  { id:'split',     g:'幾何',   name:'中央左右開' },

  { id:'lighten',   g:'溶接',   name:'疊亮溶接' },
  { id:'darken',    g:'溶接',   name:'疊暗溶接' },

  { id:'pushDL',    g:'位移',   name:'對角推（往左上）' },
  { id:'pushDR',    g:'位移',   name:'對角推（往右上）' },
  { id:'elastic',   g:'位移',   name:'彈性左推' },
  { id:'zoomPush',  g:'位移',   name:'縮放推移' },

  { id:'wipeCenterH', g:'擦除', name:'中央橫向開' },
  { id:'wipeCenterV', g:'擦除', name:'中央直向開' },
  { id:'blindsV',   g:'擦除',   name:'直式百葉窗' },
  { id:'clockR',    g:'擦除',   name:'逆時鐘掃描' },
  { id:'cross',     g:'擦除',   name:'十字開合' },
  { id:'star',      g:'擦除',   name:'星形開合' },

  { id:'square',    g:'幾何',   name:'方形放大' },
  { id:'checker',   g:'幾何',   name:'棋盤格' },
  { id:'brick',     g:'幾何',   name:'磚牆錯位' },
  { id:'triangle',  g:'幾何',   name:'三角開合' },

  { id:'zoom',      g:'風格化', name:'縮放溶接' },
  { id:'spin',      g:'風格化', name:'旋轉縮放' },
  { id:'glitch',    g:'風格化', name:'故障訊號' },
  { id:'pixel',     g:'風格化', name:'像素化' },
  { id:'rgb',       g:'風格化', name:'色差分離' },
  { id:'shake',     g:'風格化', name:'抖動切換' },
  { id:'ripple',    g:'風格化', name:'波紋擴散' },
  { id:'radial',    g:'風格化', name:'放射模糊' },
  { id:'melt',      g:'風格化', name:'融化滴落' },
  { id:'invert',    g:'風格化', name:'負片閃現' },
  { id:'zoomPunch', g:'風格化', name:'震動變焦' },
  { id:'noise',     g:'風格化', name:'雜訊溶解' }
];

/* ── 標題進場動畫（Stage 2：30 種＋無） ─────────────────────── */
const ANIMS = [
  { id:'none',       g:'基本',   name:'無' },

  { id:'fade',       g:'淡入',   name:'淡入' },
  { id:'fadeUp',     g:'淡入',   name:'淡入上浮' },
  { id:'fadeDown',   g:'淡入',   name:'淡入下沉' },
  { id:'blur',       g:'淡入',   name:'模糊聚焦' },
  { id:'fadeScale',  g:'淡入',   name:'淡入微放大' },
  { id:'fadeBlurUp', g:'淡入',   name:'模糊上浮' },

  { id:'slideR',     g:'位移',   name:'右移入' },
  { id:'slideL',     g:'位移',   name:'左移入' },
  { id:'slideU',     g:'位移',   name:'上滑入' },
  { id:'slideD',     g:'位移',   name:'下滑入' },
  { id:'springR',    g:'位移',   name:'彈性右移' },
  { id:'maskUp',     g:'位移',   name:'遮罩上推' },
  { id:'slideDL',    g:'位移',   name:'左上進入' },
  { id:'slideDR',    g:'位移',   name:'右上進入' },
  { id:'whip',       g:'位移',   name:'甩入' },
  { id:'glide',      g:'位移',   name:'滑行減速' },

  { id:'pop',        g:'縮放',   name:'放大彈入' },
  { id:'zoomIn',     g:'縮放',   name:'由大縮入' },
  { id:'rotate',     g:'縮放',   name:'旋轉入' },
  { id:'flip',       g:'縮放',   name:'翻牌' },
  { id:'spring',     g:'縮放',   name:'彈簧' },
  { id:'swing',      g:'縮放',   name:'擺動入' },
  { id:'flipY',      g:'縮放',   name:'立體翻轉' },
  { id:'heartbeat',  g:'縮放',   name:'心跳' },
  { id:'breathe',    g:'縮放',   name:'呼吸' },
  { id:'stamp',      g:'縮放',   name:'蓋章' },

  { id:'type',       g:'逐字',   name:'打字機' },
  { id:'typeCursor', g:'逐字',   name:'打字機（游標）' },
  { id:'charFade',   g:'逐字',   name:'逐字淡入' },
  { id:'charBounce', g:'逐字',   name:'逐字彈跳' },
  { id:'charRise',   g:'逐字',   name:'逐字上升' },
  { id:'wave',       g:'逐字',   name:'波浪起伏' },
  { id:'charFlip',   g:'逐字',   name:'逐字翻牌' },
  { id:'charSpin',   g:'逐字',   name:'逐字旋轉' },
  { id:'charRandom', g:'逐字',   name:'隨機順序出現' },
  { id:'charDrop',   g:'逐字',   name:'逐字墜落' },
  { id:'charZoom',   g:'逐字',   name:'逐字放大' },

  { id:'sprinkle',   g:'特效',   name:'灑花' },
  { id:'particle',   g:'特效',   name:'粒子飄散' },
  { id:'shine',      g:'特效',   name:'光暈掃過' },
  { id:'draw',       g:'特效',   name:'手寫描邊' },
  { id:'neon',       g:'特效',   name:'霓虹閃爍' },
  { id:'glitchT',    g:'特效',   name:'故障閃現' },
  { id:'shake',      g:'特效',   name:'震動出現' },
  { id:'dropIn',     g:'特效',   name:'重擊落下' },
  { id:'snow',       g:'特效',   name:'雪花飄落' },
  { id:'spark',      g:'特效',   name:'火花四射' },
  { id:'bubble',     g:'特效',   name:'泡泡上升' },
  { id:'scanline',   g:'特效',   name:'電視開機' },
  { id:'rainbow',    g:'特效',   name:'彩虹掃過' }
];

/* ── 標題退場動畫 ─────────────────────────────────────────── */
const ANIMS_OUT = [
  { id:'none',     name:'無（直接消失）' },
  { id:'fade',     name:'淡出' },
  { id:'fadeUp',   name:'淡出上飄' },
  { id:'fadeDown', name:'淡出下沉' },
  { id:'slideL',   name:'左移出' },
  { id:'slideR',   name:'右移出' },
  { id:'slideU',   name:'上移出' },
  { id:'slideD',   name:'下移出' },
  { id:'zoomOut',  name:'縮小消失' },
  { id:'pop',      name:'放大消失' },
  { id:'blur',     name:'模糊消失' },
  { id:'spin',     name:'旋轉消失' },
  { id:'maskDown', name:'遮罩下收' },
  { id:'shrinkUp', name:'縮小上飄' },
  { id:'whipOut',  name:'甩出' },
  { id:'charOut',  name:'逐字消失' },
  { id:'glitchOut',name:'故障消失' },
  { id:'flipOut',  name:'翻轉收起' }
];

/* ── 標題樣式預設庫 ───────────────────────────────────────────
   套用後仍可自己再微調；只覆寫列出來的欄位。 */
const TITLE_PRESETS = [
  { id:'opening', name:'片頭大字卡',
    s:{ size:120, color:'#ffffff', stroke:'#000000', strokeW:0, bold:true, shadow:true,
        x:0.5, y:0.46, align:'center', animIn:'zoomIn', animDur:0.9, animOut:'fade', animOutDur:0.5 } },
  { id:'lower3',  name:'下三分之一人名條',
    s:{ size:56, color:'#ffffff', stroke:'#000000', strokeW:3, bold:true, shadow:true,
        x:0.12, y:0.82, align:'left', animIn:'maskUp', animDur:0.6, animOut:'fadeDown', animOutDur:0.4 } },
  { id:'ending',  name:'片尾字幕',
    s:{ size:46, color:'#e8e8e8', stroke:'#000000', strokeW:0, bold:false, shadow:false,
        x:0.5, y:0.5, align:'center', animIn:'fade', animDur:1.2, animOut:'fade', animOutDur:1.2 } },
  { id:'variety', name:'綜藝黃字',
    s:{ size:80, color:'#ffd93d', stroke:'#1a1a1a', strokeW:9, bold:true, shadow:true,
        x:0.5, y:0.76, align:'center', animIn:'pop', animDur:0.5, animOut:'pop', animOutDur:0.3 } },
  { id:'neon',    name:'霓虹招牌',
    s:{ size:96, color:'#38e1ff', stroke:'#0a2a3a', strokeW:2, bold:true, shadow:false,
        x:0.5, y:0.5, align:'center', animIn:'neon', animDur:1.1, animOut:'fade', animOutDur:0.4 } },
  { id:'hand',    name:'手寫描邊',
    s:{ font:'"DFKai-SB","BiauKai","Kaiti TC",serif', size:92, color:'#ffffff',
        stroke:'#ffffff', strokeW:2, bold:false, shadow:true,
        x:0.5, y:0.5, align:'center', animIn:'draw', animDur:1.4, animOut:'fade', animOutDur:0.4 } },
  { id:'party',   name:'慶祝灑花',
    s:{ size:104, color:'#ffffff', stroke:'#000000', strokeW:0, bold:true, shadow:true,
        x:0.5, y:0.44, align:'center', animIn:'sprinkle', animDur:1.2, animOut:'fadeUp', animOutDur:0.5 } },
  { id:'minimal', name:'極簡細字',
    s:{ size:62, color:'#ffffff', stroke:'#000000', strokeW:0, bold:false, shadow:false,
        x:0.5, y:0.5, align:'center', animIn:'fade', animDur:1.0, animOut:'fade', animOutDur:0.6 } }
];

/** 把樣式預設套到某個標題上 */
function applyTitlePreset(t, id){
  const p = TITLE_PRESETS.find(x => x.id === id);
  if (!p || !t) return;
  pushUndo();
  Object.assign(t, p.s, { preset: id });
  t.font = safeFont(t.font);
}

/* ── 畫面調整（Stage 2 · E） ─────────────────────────────────
   每一段影片／圖片各自獨立。五個參數都是 -100 ～ 100，0 代表不動。
   sepia 只給「復古」這類預設用，面板上不另外開滑桿。
   ─────────────────────────────────────────────────────── */
const GRADE0 = { bri:0, con:0, sat:0, temp:0, tint:0, sharp:0,
                 sepia:0, fade:0, vig:0, grain:0, bloom:0, preset:null };

/* 風格預設。分類是給預覽選單的頁籤用的。
   多了褪色／暗角／顆粒／光暈／色調這幾個參數之後，
   不同風格才真的長得不一樣，而不是只有亮一點暗一點的差別。 */
const GRADE_PRESETS = [
  /* 基本 */
  { id:'none',    g:'基本', name:'原始',     s:{} },
  { id:'bw',      g:'基本', name:'黑白',     s:{ bri:2, con:16, sat:-100, sharp:12 } },
  { id:'bwsoft',  g:'基本', name:'柔黑白',   s:{ bri:8, con:-6, sat:-100, fade:26, sharp:-10, grain:18 } },
  { id:'punch',   g:'基本', name:'高對比',   s:{ con:34, sat:20, sharp:18 } },
  { id:'faded',   g:'基本', name:'低飽和',   s:{ bri:6, con:-14, sat:-34, temp:4, fade:16 } },

  /* 人像 */
  { id:'skin',    g:'人像', name:'柔膚',     s:{ bri:6, con:-6, sat:8, temp:12, sharp:-24 } },
  { id:'bright',  g:'人像', name:'明亮通透', s:{ bri:14, con:6, sat:8, temp:-4, fade:10, sharp:10 } },
  { id:'natural', g:'人像', name:'自然膚色', s:{ bri:5, con:8, sat:-4, temp:8, tint:6, sharp:8 } },
  { id:'cream',   g:'人像', name:'奶油色調', s:{ bri:10, con:-10, sat:-8, temp:18, fade:24, sepia:10 } },
  { id:'glowp',   g:'人像', name:'柔光人像', s:{ bri:8, con:-4, sat:6, temp:10, bloom:38, sharp:-14 } },

  /* 風景 */
  { id:'vivid',   g:'風景', name:'鮮豔風景', s:{ bri:2, con:20, sat:34, sharp:20 } },
  { id:'sky',     g:'風景', name:'清透藍天', s:{ bri:8, con:14, sat:18, temp:-20, tint:-6, sharp:14 } },
  { id:'autumn',  g:'風景', name:'秋色',     s:{ bri:4, con:14, sat:16, temp:30, tint:8, sharp:10 } },
  { id:'forest',  g:'風景', name:'森林綠',   s:{ bri:-2, con:16, sat:12, temp:-10, tint:-22, sharp:12, vig:18 } },
  { id:'desert',  g:'風景', name:'荒漠',     s:{ bri:8, con:12, sat:-10, temp:28, fade:14, vig:14 } },

  /* 電影 */
  { id:'cinema',  g:'電影', name:'電影感',   s:{ bri:-4, con:20, sat:-12, temp:-16, sharp:8, fade:18, vig:22 } },
  { id:'noir',    g:'電影', name:'暗黑',     s:{ bri:-14, con:34, sat:-30, temp:-10, vig:44, sharp:10 } },
  { id:'teal',    g:'電影', name:'橘藍大片', s:{ bri:0, con:24, sat:14, temp:-26, tint:10, vig:24, sharp:10 } },
  { id:'cyber',   g:'電影', name:'賽博霓虹', s:{ bri:-6, con:28, sat:38, temp:-34, tint:20, bloom:44, vig:30 } },
  { id:'western', g:'電影', name:'西部片',   s:{ bri:6, con:18, sat:-16, temp:36, sepia:22, vig:26, grain:20 } },
  { id:'nordic',  g:'電影', name:'北歐冷調', s:{ bri:6, con:10, sat:-24, temp:-28, fade:22, sharp:6 } },

  /* 復古 */
  { id:'retro',   g:'復古', name:'復古',     s:{ bri:4, con:-8, sat:-28, temp:22, sharp:-8, sepia:38, vig:18 } },
  { id:'old',     g:'復古', name:'老照片',   s:{ bri:6, con:-4, sat:-60, temp:26, sepia:62, fade:26, grain:34, vig:30 } },
  { id:'eighties',g:'復古', name:'80 年代',  s:{ bri:4, con:16, sat:30, temp:-14, tint:18, bloom:30, grain:16 } },
  { id:'film',    g:'復古', name:'膠捲',     s:{ bri:2, con:12, sat:-6, temp:10, fade:20, grain:38, vig:20 } },
  { id:'memory',  g:'復古', name:'褪色記憶', s:{ bri:12, con:-18, sat:-30, temp:14, fade:44, grain:14 } },

  /* 夜晚 */
  { id:'night',   g:'夜晚', name:'夜景',     s:{ bri:-8, con:22, sat:-6, temp:-18, vig:34, sharp:12 } },
  { id:'neonN',   g:'夜晚', name:'霓虹夜',   s:{ bri:-10, con:26, sat:32, temp:-24, tint:16, bloom:52, vig:32 } },
  { id:'moon',    g:'夜晚', name:'月光',     s:{ bri:-6, con:14, sat:-40, temp:-32, fade:16, vig:26 } },

  /* 社群 */
  { id:'clear',   g:'社群', name:'清透',     s:{ bri:8, con:8, sat:12, temp:-8, sharp:24 } },
  { id:'warm',    g:'社群', name:'暖陽',     s:{ bri:6, con:6, sat:14, temp:34, sharp:6, sepia:6, bloom:18 } },
  { id:'cool',    g:'社群', name:'冷調',     s:{ bri:2, con:12, sat:-6, temp:-34, sharp:8 } },
  { id:'pink',    g:'社群', name:'粉嫩',     s:{ bri:12, con:-8, sat:6, temp:12, tint:22, fade:22, bloom:20 } },
  { id:'matcha',  g:'社群', name:'抹茶',     s:{ bri:8, con:-4, sat:-14, temp:-6, tint:-24, fade:18 } }
];

/** 有沒有真的做了調整（全部是 0 就不用多跑那幾個 pass） */
function hasGrade(g){
  return !!g && (g.bri || g.con || g.sat || g.temp || g.tint || g.sharp ||
                 g.sepia || g.fade || g.vig || g.grain || g.bloom);
}

/** 把風格預設套到某一段上 */
function applyGradePreset(c, id){
  const p = GRADE_PRESETS.find(x => x.id === id);
  if (!p || !c) return;
  pushUndo();
  c.grade = Object.assign({}, GRADE0, p.s, { preset: id });
}

/** 把這一段的調整複製到其他所有片段 */
function copyGradeToAll(c){
  if (!c) return;
  pushUndo();
  for (const x of A.clips) if (x !== c) x.grade = Object.assign({}, GRADE0, c.grade);
}

/* 每個項目都是不同的字體，不再有「預設」和「微軟正黑體」其實是同一個字體的重複項 */
const FONTS = [
  { id:'"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif', name:'微軟正黑體（預設）' },
  { id:'"Microsoft YaHei","Heiti TC","Noto Sans SC",sans-serif',       name:'微軟雅黑' },
  { id:'"PMingLiU","Noto Serif TC","Songti TC",serif',                 name:'新細明體' },
  { id:'"DFKai-SB","BiauKai","Kaiti TC",serif',                        name:'標楷體' },
  { id:'Arial,Helvetica,sans-serif',                                   name:'Arial' },
  { id:'"Arial Black","Arial",sans-serif',                             name:'Arial Black' },
  { id:'Impact,sans-serif',                                            name:'Impact' },
  { id:'Georgia,serif',                                                name:'Georgia' },
  { id:'"Times New Roman",Times,serif',                                name:'Times New Roman' },
  { id:'"Courier New",monospace',                                      name:'Courier New' }
];

/* ── 全域狀態 ──────────────────────────────────────────────── */
/* ── 字幕樣式預設 ─────────────────────────────────────────────
   字幕跟標題不同：一整批共用同一個樣式，改樣式全部一起變。 */
const SUB_PRESETS = [
  { id:'classic', name:'經典白字黑邊',
    s:{ color:'#ffffff', stroke:'#000000', strokeW:5, bold:true, shadow:true,
        box:false, size:52, pos:'bottom' } },
  { id:'box',     name:'黑底白字條',
    s:{ color:'#ffffff', stroke:'#000000', strokeW:0, bold:false, shadow:false,
        box:true, boxColor:'#000000', boxOpacity:0.62, size:50, pos:'bottom' } },
  { id:'soft',    name:'柔和陰影（Netflix 風）',
    s:{ color:'#f2f2f2', stroke:'#000000', strokeW:2, bold:false, shadow:true,
        box:false, size:52, pos:'bottom' } },
  { id:'rounded', name:'半透明圓角底',
    s:{ color:'#ffffff', stroke:'#000000', strokeW:0, bold:true, shadow:false,
        box:true, boxColor:'#101216', boxOpacity:0.72, size:48, pos:'bottom' } },
  { id:'variety', name:'綜藝黃字粗黑邊',
    s:{ color:'#ffd93d', stroke:'#1a1a1a', strokeW:8, bold:true, shadow:true,
        box:false, size:60, pos:'bottom' } },
  { id:'minimal', name:'極簡細字',
    s:{ color:'#ffffff', stroke:'#000000', strokeW:1, bold:false, shadow:true,
        box:false, size:44, pos:'bottom' } },
  { id:'top',     name:'置頂白字黑邊',
    s:{ color:'#ffffff', stroke:'#000000', strokeW:5, bold:true, shadow:true,
        box:false, size:50, pos:'top' } }
];

const A = {
  clips: [], titles: [], musics: [], overlays: [], subs: [],
  subStyle: { preset:'classic', font: FONTS[0].id, size:52, color:'#ffffff',
              stroke:'#000000', strokeW:5, bold:true, shadow:true,
              box:false, boxColor:'#000000', boxOpacity:0.62,
              pos:'bottom', marginY:0.075, maxW:0.86 },
  sel: { type: 'proj', id: null },
  proj: { aspect:'16:9', w:1920, h:1080, fps:30, bitrate:8, fit:'contain',
          tracks: ['video','over','sub','title','music'] },   // 軌道上下順序，可自己換
  playhead: 0, playing: false, pps: 80, exporting: false,
  gradeBypass: false                 // 「看原始」按鈕用，不存進專案也不進復原
};

/* ── 復原 / 重做 ────────────────────────────────────────────────
   只把「編輯資料」存進歷史，媒體本身（video/img/audio 元素、檔案、
   解碼後的音訊）放在 MEDIA 這個登記表，用 id 對回去。
   所以復原不會重載檔案，刪掉的東西也還原得回來。
   ─────────────────────────────────────────────────────────── */
const MEDIA = new Map();
const UNDO_MAX = 60;
const _undo = [], _redo = [];

function regMedia(item, extra){
  MEDIA.set(item.id, Object.assign({
    file: item.file, url: item.url, el: item.el, video: item.video,
    img: item.img, thumb: item.thumb, _gif: item._gif
  }, extra || {}));
  if (item._gif) item._gif.pending = false;
}
const _OMIT = ['file','url','el','video','img','thumb','buf','audioBuf','_ab','_gif'];
const _strip = o => { const r = {}; for (const k in o) if (!_OMIT.includes(k)) r[k] = o[k]; return r; };

function snapshot(){
  return JSON.stringify({
    clips: A.clips.map(_strip), titles: A.titles.map(_strip),
    musics: A.musics.map(_strip), overlays: A.overlays.map(_strip),
    subs: A.subs.map(_strip), subStyle: { ...A.subStyle }, subStyleUpper:A.subStyleUpper || null,
    proj: { ...A.proj }, sel: { ...A.sel }
  });
}
/** 動作發生「之前」呼叫。內容沒變就不會重複記。 */
function pushUndo(){
  const s = snapshot();
  if (_undo.length && _undo[_undo.length - 1] === s) return;
  _undo.push(s);
  if (_undo.length > UNDO_MAX) _undo.shift();
  _redo.length = 0;
  pruneGifMedia();
  updateUndoBtns();
}
function applySnapshot(json){
  const s = JSON.parse(json);
  const hydrate = arr => arr.map(o => Object.assign({}, o, MEDIA.get(o.id) || {}));
  A.clips = hydrate(s.clips);
  A.titles = hydrate(s.titles);
  A.musics = hydrate(s.musics);
  A.overlays = hydrate(s.overlays);
  A.subs = (s.subs || []).map(o => ({ ...o }));
  if (s.subStyle) Object.assign(A.subStyle, s.subStyle);
  A.subStyleUpper=s.subStyleUpper ? {...s.subStyleUpper} : null;
  Object.assign(A.proj, s.proj);
  upgradeClipSettings(s.proj || {});
  A.sel = s.sel;
  A.playhead = clamp(A.playhead, 0, totalDur());
  render(); refreshProp(); updateUndoBtns();
}
function undo(){
  if (!_undo.length){ toast('沒有可以復原的動作'); return; }
  _redo.push(snapshot());
  applySnapshot(_undo.pop());
  toast(`已復原（還可復原 ${_undo.length} 步）`);
}
function redo(){
  if (!_redo.length){ toast('沒有可以重做的動作'); return; }
  _undo.push(snapshot());
  applySnapshot(_redo.pop());
  toast(`已重做（還可重做 ${_redo.length} 步）`);
}
function updateUndoBtns(){
  const u = $('#btnUndo'), r = $('#btnRedo');
  if (u){ u.disabled = !_undo.length; u.title = `復原（Ctrl+Z）　剩 ${_undo.length} 步`; }
  if (r){ r.disabled = !_redo.length; r.title = `重做（Ctrl+Y）　剩 ${_redo.length} 步`; }
}

/* ── 小工具 ────────────────────────────────────────────────── */
function fmt(t){
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor((t * 10) % 10);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${d}`;
}
let toastTimer;
function toast(msg, err){
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'on' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = '', err ? 4200 : 2400);
}

/* ── 時間軸計算 ────────────────────────────────────────────────
   轉場採「重疊」模式：轉場時間由前後兩段共用，總長會縮短。
   clip.trans 代表「進入這一段」的轉場（第一段沒有接縫，故忽略）。
   ─────────────────────────────────────────────────────────── */
const clipDur = c => Math.max(0.05, c.outP - c.inP);
/** 這一段最後畫出來的尺寸（含使用者自己轉的角度） */
function clipSize(c){
  const r = ((c.rot || 0) % 360 + 360) % 360;
  return (r % 180) ? { w: c.h, h: c.w } : { w: c.w, h: c.h };
}

/** 片段拿來畫的來源：影片是 <video>，圖片是 <img> */
const clipSource = c => c.exportSrc || c.el;
const isImg = c => c.kind === 'image';
const IMG_MAX = 600;          // 圖片最長可以停留幾秒
/** 配樂一輪可用的長度（扣掉從音檔第幾秒開始） */
const musicSeg = m => Math.max(0.5, (m.dur || 0) - m.offset);
/** 沒有手動拉過長度的音軌，跟著影片總長自動延伸 */
function syncAutoLens(){
  const tot = totalDur();
  for (const m of A.musics){
    if (m.autoLen) m.len = Math.max(0.5, (m.loop ? tot : Math.min(musicSeg(m), tot)) - m.startAt);
    m.len = Math.max(0.3, Math.min(m.len, Math.max(0.3, tot - m.startAt)));
  }
}

// track 0 = 下軌（舊專案），track 1 = 上軌；兩軌各自串接。
const clipTrack = c => c && c.track === 1 ? 1 : 0;
const VIDEO_MODES = [
  ['overlap','內扣（使用原片動態畫面）'],
  ['add','外加（延長首尾定格畫面）']
];
function clipMode(c){return c.transMode==='add'?'add':'overlap';}
function clipFadeLens(c,span){
  let fi=Math.max(0,Number(c.fadeIn)||0),fo=Math.max(0,Number(c.fadeOut)||0);
  if(fi+fo>span&&fi+fo>0){const k=span/(fi+fo);fi*=k;fo*=k;}
  return [fi,fo];
}
function clipFadeGain(c,T,q){
  const [fi,fo]=clipFadeLens(c,q.span),t=T-q.startAt;
  return clamp(Math.min(1,fi>0?t/fi:1,fo>0?(q.span-t)/fo:1),0,1);
}
// 舊版每軌轉場複製到各片段；整片淡化移到每軌首段／末段，之後各段獨立。
function upgradeClipSettings(proj){
  for(const track of [0,1]){
    const clips=A.clips.filter(c=>clipTrack(c)===track);
    const legacy=proj.videoModes&&proj.videoModes[track];
    for(const [i,c] of clips.entries()){
      if(c.transMode==null)c.transMode=legacy==='add'||(!legacy&&proj.transAdd===true)?'add':'overlap';
      if(c.fadeIn==null)c.fadeIn=i===0?Math.max(0,+proj.fadeIn||0):0;
      if(c.fadeOut==null)c.fadeOut=i===clips.length-1?Math.max(0,+proj.fadeOut||0):0;
      if(c.fadeAudio==null)c.fadeAudio=proj.fadeAudio!==false;
    }
  }
  for(const key of ['videoModes','transAdd','fadeIn','fadeOut','fadeAudio'])delete A.proj[key];
}
function clipEdges(c){
  const add=clipMode(c)==='add',d=clipDur(c);
  let head=c.trans&&c.trans.type!=='none'?Math.max(0,c.trans.dur||0):0;
  let tail=c.transOut&&c.transOut.type!=='none'?Math.max(0,c.transOut.dur||0):0;
  if(!add&&head+tail>d*.95){const k=d*.95/(head+tail);head*=k;tail*=k;}
  return {add,head,tail,span:d+(add?head+tail:0)};
}
function layout(){
  const L=[],prev=[-1,-1];
  A.clips.forEach((c,i)=>{
    const track=clipTrack(c),pi=prev[track],edge=clipEdges(c),dur=clipDur(c);
    const startAt=Math.max(pi<0?0:L[pi].end,Number.isFinite(c.at)?c.at:0);
    const start=startAt+(edge.add?edge.head:0),end=startAt+edge.span;
    L.push({startAt,start,end,span:edge.span,dur,track,prev:pi,mode:clipMode(c),
      add:edge.add,inDur:edge.head,outDur:edge.tail,tr:edge.head,trAt:startAt});
    prev[track]=i;
  });
  return L;
}
function totalDur(){return layout().reduce((end,q)=>Math.max(end,q.end),0);}
function nextClipIndex(i, L){
  L = L || layout();
  return L.findIndex(q => q.prev === i);
}
/** 放進指定影片軌與時間。同軌按先後串接，不產生第三層重疊。 */
function placeClip(c,track,at){
  pinFreeClips();
  const L=layout(),i=A.clips.indexOf(c);if(i<0)return;
  at=Math.max(0,Number.isFinite(at)?at:L[i].startAt);
  const peers=A.clips.filter(x=>x!==c&&clipTrack(x)===track),span=clipEdges(c).span;
  for(const x of peers){
    const q=L[A.clips.indexOf(x)];
    if(at<q.end-1e-6&&at+span>q.startAt+1e-6)at=q.end;
  }
  const before=peers.find(x=>at<L[A.clips.indexOf(x)].startAt);
  A.clips.splice(i,1);c.track=track;c.at=at;
  const to=before?A.clips.indexOf(before):peers.length?A.clips.indexOf(peers[peers.length-1])+1:A.clips.length;
  A.clips.splice(to,0,c);
}
function pinFreeClips(){
  const L=layout();A.clips.forEach((c,i)=>c.at=L[i].startAt);
}
/** 屬性裁切保持時間軸起點；向右延長不能覆蓋同軌下一段。 */
function clipRoom(c){
  const L=layout(),i=A.clips.indexOf(c),ni=nextClipIndex(i,L);
  return ni<0 ? Infinity : Math.max(.1,L[ni].startAt-L[i].start-(L[i].add?L[i].outDur:0));
}
function trimClip(c,from,to){
  c.inP=clamp(from,0,c.outP-.1);
  c.outP=clamp(to,c.inP+.1,Math.min(c.dur,c.inP+clipRoom(c)));
}

/** 回傳某個時間點該畫什麼：a=主片段，b=轉場中的下一段 */
/* ── 字幕跟著影片走 ──────────────────────────────────────────
   字幕存的是「時間軸上的絕對秒數」，可是片段一被搬動、裁切、
   換轉場接法，每一段的起點就都變了，字幕會整批對不上。
   解法：每一句字幕記住「我屬於哪一段、在那一段素材的第幾秒」，
   排版一變就把它搬回同一個畫面上。
   ─────────────────────────────────────────────────────────── */
/** 記住某一句字幕現在對到哪一段素材的哪一秒 */
const subTrack=c=>c && c.track===1 ? 1 : 0;
function subStyleFor(track){
  if(track!==1)return A.subStyle;
  if(!A.subStyleUpper)A.subStyleUpper={...A.subStyle,marginY:.2};
  return A.subStyleUpper;
}
function subtitleTargetTrack(){
  if(A.sel.type==='sub')return subTrack(A.subs.find(c=>c.id===A.sel.id));
  if(A.sel.type==='clip')return clipTrack(A.clips.find(c=>c.id===A.sel.id));
  return 0;
}
function tagSub(c, L, preferred){
  L = L || layout();
  c.cid = null; c.cs = 0;
  const indices=L.map((_,i)=>i).reverse();
  const pi=A.clips.findIndex(x=>x.id===preferred);
  if(pi>=0){indices.splice(indices.indexOf(pi),1);indices.unshift(pi);}
  for (const i of indices){
    if (c.start >= L[i].start - 1e-9 && c.start < L[i].start + L[i].dur + 1e-6){
      c.cid = A.clips[i].id;
      c.cs = A.clips[i].inP + (c.start - L[i].start);   // 記素材時間，裁頭也跟得上
      break;
    }
  }
  c._at = c.start;                 // 記下「我們認可的位置」，用來分辨後來有沒有被手動搬過
}
function tagSubs(){ const L = layout(); for (const c of A.subs) tagSub(c, L); A._laySig = layoutSig(L); }

function layoutSig(L){
  L = L || layout();
  return A.clips.map((c, i) => c.id + '@' + L[i].start.toFixed(4) + '+' + L[i].dur.toFixed(4)
                               + '#' + c.inP.toFixed(4)).join('|');
}

/** 排版變了就把字幕搬回原來對到的畫面上。
    自己會分辨「使用者手動拖過的字幕」（start 跟上次記的不一樣），那種就重新記位置，
    所以不用在每個會動到字幕的地方都補一行呼叫。 */
function syncSubsToClips(){
  const L = layout();
  const sig = layoutSig(L);
  const changed = sig !== A._laySig;
  A._laySig = sig;
  let moved = 0;
  for (const c of A.subs){
    if (c.cid === undefined || c._at === undefined || Math.abs(c.start - c._at) > 1e-4){
      tagSub(c, L);                     // 新加的、匯入的、剛被拖過的 —— 以現在的位置為準
      continue;
    }
    if (!changed || !c.cid) continue;
    const i = A.clips.findIndex(x => x.id === c.cid);
    if (i < 0) continue;
    const want = L[i].start + (c.cs - A.clips[i].inP);
    const d = want - c.start;
    if (Math.abs(d) > 1e-4){ c.start += d; c.end += d; moved++; }
    // 只有還落在自己那一段裡面才重新記位置。
    // 被裁到段外的（那句話已經被剪掉了）維持原本的對應關係，
    // 之後把裁切拉回來，字幕就會自己回到原位。
    if (c.start >= L[i].start - 1e-9 && c.start < L[i].start + L[i].dur + 1e-6) tagSub(c, L, A.clips[i].id);
    else c._at = c.start;
  }
  return moved;
}

/** 舊排版的某個時間點，換算成新排版的同一個位置（以「在第幾段的第幾秒」為準） */
function remapTime(t, Lold, Lnew){
  for (let i = Lold.length - 1; i >= 0; i--){
    if (t >= Lold[i].start - 1e-9) return Math.max(0, Lnew[i].start + (t - Lold[i].start));
  }
  return t;
}
/** 舊版全片重排工具（保留供相容）；v9.1 各片段轉場設定不呼叫此函式 */
function remapAllTimes(Lold, Lnew){
  if (!Lold.length || Lold.length !== Lnew.length) return;
  const R = t => remapTime(t, Lold, Lnew);
  for (const arr of [A.titles, A.overlays]){
    for (const o of arr){
      const st = R(o.start), en = R(o.end);
      o.start = st;
      o.end = Math.max(st + 0.2, en);
    }
  }
  for (const m of A.musics) m.startAt = R(m.startAt);
}

/** 這一段「離開時的轉場」佔用的時間窗（絕對秒數）。沒設就回 null。

    內扣使用原片尾段，外加在原片之後延長定格時間；均由本段 layout 邊界決定。 */
function outWindow(i,L=layout()){
  const c=A.clips[i],q=L[i];
  if(!c||!q||!(q.outDur>0))return null;
  return {start:q.end-q.outDur,end:q.end,dur:q.outDur,type:c.transOut.type};
}
function outGain(i,T,L){const w=outWindow(i,L);return !w||T<=w.start?1:T>=w.end?0:1-(T-w.start)/w.dur;}
function clipMixGain(i,T,L){
  const q=L[i],c=A.clips[i],t=T-q.start,fade=c.fadeAudio===false?1:clipFadeGain(c,T,q);
  if(t<0||t>=q.dur)return 0;
  if(q.add){const e=Math.min(.04,q.dur/4);return fade*Math.min(1,t/e,(q.dur-t)/e);}
  let g=outGain(i,T,L);
  if(q.inDur>0)g=Math.min(g,clamp(t/q.inDur,0,1));
  return fade*g;
}
function activeAt(T,track=0,L=layout()){
  let i=-1;
  for(let k=0;k<L.length;k++){
    const q=L[k];
    if(q.track===track&&T>=q.startAt-1e-9&&T<q.end)i=k;
  }
  const total=L.reduce((end,q)=>Math.max(end,q.end),0);
  if(i<0&&Math.abs(T-total)<1e-6)i=L.findIndex(q=>q.track===track&&Math.abs(q.end-total)<1e-6);
  if(i<0)return null;
  const c=A.clips[i],q=L[i],held=q.add&&(T<q.start||T>=q.start+q.dur);
  const a={clip:c,t:c.inP+clamp(T-q.start,0,Math.max(0,q.dur-.0001)),T,hold:held};
  const entering=q.inDur>0&&T<q.startAt+q.inDur;
  const w=outWindow(i,L),out=w&&T>=w.start?{type:w.type,p:clamp((T-w.start)/w.dur,0,1)}:null;
  return {a,b:null,p:0,type:null,idx:i,track,
    intro:entering?{type:c.trans.type,p:clamp((T-q.startAt)/q.inDur,0,1)}:null,out};
}
function activeTracksAt(T){const L=layout();return [activeAt(T,0,L),activeAt(T,1,L)].filter(Boolean);}

/* ── 素材匯入 ──────────────────────────────────────────────── */
/** 一批檔案進來，依副檔名／型別各自送到對的地方。
    左側素材區的點擊、拖曳到視窗，兩條路都走這裡，行為才會一致。 */
async function addAnyFiles(files){
  const fs = [...(files || [])];
  if (!fs.length) return;
  const au = fs.filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(f.name));
  const sr = fs.filter(f => /\.(srt|vtt)$/i.test(f.name));
  const pj = fs.filter(f => /\.nvproj$/i.test(f.name));
  const im = fs.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(f.name));
  const vi = fs.filter(f => !au.includes(f) && !im.includes(f) && !sr.includes(f) && !pj.includes(f));
  if (vi.length) await addVideoFiles(vi);
  if (im.length) await addImageFiles(im);          // 圖片預設插進影片軌
  for (const f of au) await addMusicFile(f);
  for (const f of sr) await importSRT(f);
  if (pj.length && typeof projImportFile === 'function') await projImportFile(pj[0]);
}

async function addVideoFiles(files){
  const list = [...files].filter(f => f.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v|avi)$/i.test(f.name));
  if (!list.length){ toast('沒有偵測到影片檔', true); return; }
  pushUndo();
  for (const f of list){
    try { await addVideo(f); }
    catch(e){ console.error(e); toast(`「${f.name}」載入失敗：${e.message}`, true); }
  }
  render();
  fitZoom();          // 匯入後自動把整支影片縮到看得完
  refreshProp();
}

function addVideo(file){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    // 這裡刻意「不設」crossOrigin：素材一律是 URL.createObjectURL(File)，
    // blob 網址本來就同源，不需要 CORS；而 file:// 開的頁面沒有正常來源，
    // 設了反而讓 CORS 檢查過不了，畫面照放但畫布會被當成被汙染，匯出就死。
    // 萬一某個環境相反，匯出前的 healSources() 會實測後自動換掉。
    v.src = url; v.preload = 'auto'; v.playsInline = true; v.muted = true;
    const fail = () => rej(new Error('瀏覽器無法解碼這個檔案'));
    v.onerror = fail;
    v.onloadedmetadata = async () => {
      // 一次性：用完就拆掉。這個元素之後可能會被重新指定 src（素材重接、
      // 修畫布汙染），沒拆掉的話「建立片段」會再跑一次，片段就無限增生。
      v.onloadedmetadata = null; v.onerror = null;
      if (!isFinite(v.duration) || v.duration <= 0) return fail();
      const c = {
        id: uid(), kind: 'video', name: file.name, file, url, video: v, el: v,
        dur: v.duration, w: v.videoWidth, h: v.videoHeight,
        inP: 0, outP: v.duration, muted: false, vol: 1,
        x: 0.5, y: 0.5, scale: 1, opacity: 1, motionRot: 0,
        track: 0, at: null, transMode: 'overlap', fadeIn: 0, fadeOut: 0, fadeAudio: true,
        cropShape: 'none', cropX: 0.5, cropY: 0.5, cropW: 1, cropH: 1, cropSize: 1,
        rot: 0,                    // 使用者自己再轉的角度（0/90/180/270），跟檔案本身的矩陣無關
        trans:    { type: A.clips.length ? 'dissolve' : 'none', dur: 0.6 },
        transOut: { type: 'none', dur: 0.6 },     // 離開這一段時的轉場（轉到黑），聲音一起淡出
        grade: { ...GRADE0 },
        thumb: '', audioBuf: null, audioTried: false
      };
      A.clips.push(c); pinFreeClips();
      $('#videoPool').appendChild(v);
      try { c.thumb = await grabThumb(v); } catch(e){}
      regMedia(c);
      res(c);
    };
  });
}

function grabThumb(v){
  return new Promise(res => {
    const done = () => {
      const cv = document.createElement('canvas');
      cv.width = 104; cv.height = 64;
      const g = cv.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0,0,104,64);
      const s = Math.min(104 / v.videoWidth, 64 / v.videoHeight);
      const w = v.videoWidth * s, h = v.videoHeight * s;
      try { g.drawImage(v, (104-w)/2, (64-h)/2, w, h); } catch(e){}
      v.removeEventListener('seeked', done);
      res(cv.toDataURL('image/jpeg', .7));
    };
    v.addEventListener('seeked', done, { once:true });
    v.currentTime = Math.min(0.15, v.duration * 0.1);
    setTimeout(() => { v.removeEventListener('seeked', done); res(''); }, 3000);
  });
}

/* ── 圖片 ──────────────────────────────────────────────────── */
function loadImage(file){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();                  // 同上：blob 同源，不設 crossOrigin
    im.onload = () => res({ im, url });
    im.onerror = () => rej(new Error('無法讀取這個圖檔'));
    im.src = url;
  });
}
function imgThumb(im){
  const cv = document.createElement('canvas');
  cv.width = 104; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 104, 64);
  const s = Math.min(104 / im.naturalWidth, 64 / im.naturalHeight);
  const w = im.naturalWidth * s, h = im.naturalHeight * s;
  try { g.drawImage(im, (104 - w) / 2, (64 - h) / 2, w, h); } catch(e){}
  return cv.toDataURL('image/jpeg', .7);
}

/** 把圖片當成一段插進影片軌：佔一段時間、可接轉場、可拖曳排序 */
async function addImageFiles(files, secs){
  const list = [...files].filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(f.name));
  if (!list.length){ toast('沒有偵測到圖片檔', true); return; }
  pushUndo();
  for (const f of list){
    try {
      const { im, url } = await loadImage(f);
      const d = secs || 3;
      const nc = {
        id: uid(), kind: 'image', name: f.name, file: f, url, video: null, el: im, img: im,
        dur: IMG_MAX, w: im.naturalWidth, h: im.naturalHeight,
        inP: 0, outP: d, muted: true, vol: 0,
        x: 0.5, y: 0.5, scale: 1, opacity: 1, motionRot: 0,
        track: 0, at: null, transMode: 'overlap', fadeIn: 0, fadeOut: 0, fadeAudio: true,
        cropShape: 'none', cropX: 0.5, cropY: 0.5, cropW: 1, cropH: 1, cropSize: 1,
        trans:    { type: A.clips.length ? 'dissolve' : 'none', dur: 0.6 },
        transOut: { type: 'none', dur: 0.6 },     // 離開這一段時的轉場（轉到黑），聲音一起淡出
        grade: { ...GRADE0 },
        thumb: imgThumb(im), audioBuf: null, audioTried: true
      };
      A.clips.push(nc); pinFreeClips(); regMedia(nc);
    } catch(e){ toast(`「${f.name}」載入失敗：${e.message}`, true); }
  }
  render(); fitZoom(); refreshProp();
}

/** 疊在畫面上的圖層：底下影片照播，圖片浮在前面 */
async function addOverlayFiles(files){
  const list = [...files].filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(f.name));
  if (!list.length){ toast('沒有偵測到圖片檔', true); return; }
  pushUndo();
  const tot = totalDur();
  for (const f of list){
    try {
      const { im, url, gif } = await loadOverlayImage(f);
      const st = clamp(A.playhead, 0, Math.max(0, tot - 0.5));
      const o = {
        id: uid(), name: f.name, file: f, url, img: im, _gif: gif, gifOffset: 0,
        w: im.naturalWidth, h: im.naturalHeight,
        start: st, end: Math.min(tot || st + 5, st + 5),
        x: 0.5, y: 0.5, scale: 0.3, opacity: 1, rot: 0,
        fadeIn: 0, fadeOut: 0, thumb: imgThumb(im)
      };
      if (o.end - o.start < 0.5) o.end = o.start + 3;
      A.overlays.push(o); regMedia(o);
      A.sel = { type: 'overlay', id: o.id };
    } catch(e){ toast(`「${f.name}」載入失敗：${e.message}`, true); }
  }
  render(); refreshProp();
  toast('圖層已加入 —— 可在「疊圖」軌左右拖、兩端拉長縮短');
}

/* ── 字幕 ──────────────────────────────────────────────────── */
const srtTime = t => {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60);
  const s = Math.floor(t % 60), ms = Math.round((t % 1) * 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
};
function parseSRT(text){
  const out = [];
  let skipped = 0;
  const blocks = String(text).replace(/\r/g, '').replace(/^﻿/, '').split(/\n{2,}/);
  for (const b of blocks){
    const lines = b.split('\n').filter(l => l.trim() !== '');
    if (!lines.length) continue;
    let i = 0;
    if (/^\d+$/.test(lines[0].trim())) i = 1;             // 序號可有可無
    // 小數位不限長度，遇到寫壞的檔（例如 ,1000）也讀得進來
    const m = (lines[i] || '').match(
      /(\d{1,3}):(\d{1,2}):(\d{1,2})[,.](\d+)\s*-->\s*(\d{1,3}):(\d{1,2}):(\d{1,2})[,.](\d+)/);
    if (!m){ if (b.indexOf('-->') >= 0) skipped++; continue; }
    const frac = d => +d / Math.pow(10, Math.max(3, d.length));   // 3 位以內當毫秒
    const sec = (h, mi, s, d) => +h * 3600 + +mi * 60 + +s + frac(d) * (d.length <= 3 ? Math.pow(10, 3 - d.length) : 1);
    const st = sec(m[1], m[2], m[3], m[4]), en = sec(m[5], m[6], m[7], m[8]);
    const txt = lines.slice(i + 1).join('\n').trim();
    if (en > st) out.push({ id: uid(), start: st, end: en, text: txt });
  }
  out.skipped = skipped;
  return out;
}
function toSRT(cues){
  return [...cues].sort((a, b) => a.start - b.start)
    .map((c, i) => `${i+1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
    .join('\n');
}
async function importSRT(file){
  const cues = parseSRT(await file.text());
  if (!cues.length){ toast('這個檔案裡沒有讀到字幕', true); return; }
  pushUndo();
  cues.forEach(c=>c.track=subtitleTargetTrack());
  A.subs.push(...cues);
  A.sel = { type:'sub', id: cues[0].id };
  render(); refreshProp();
  toast(`已匯入 ${cues.length} 句字幕（${fmt(cues[0].start)} ~ ${fmt(cues[cues.length-1].end)}）` +
        (cues.skipped ? `，另有 ${cues.skipped} 句時間碼格式有問題讀不進來` : ''), !!cues.skipped);
}
function exportSRT(cues, name){
  cues = Array.isArray(cues) ? cues : A.subs;
  if (!cues.length){ toast('目前沒有字幕', true); return; }
  const blob = new Blob([toSRT(cues)], { type:'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = typeof name === 'string' ? name : 'NiVedit字幕.srt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  toast(`已匯出 ${cues.length} 句字幕`);
}
function addSub(startAt,track=subtitleTargetTrack()){
  const s = Math.max(0, startAt === undefined ? A.playhead : startAt);
  const c = { id: uid(), track, start: s, end: Math.min(totalDur() || s + 3, s + 3), text: '在這裡輸入字幕' };
  if (c.end - c.start < 0.5) c.end = c.start + 2;
  pushUndo();
  A.subs.push(c);
  A.sel = { type:'sub', id:c.id };
  seekTo(s + 0.2);
  render(); refreshProp();
  return c;
}
/** 整批位移，用來把某一段的字幕對到正確位置 */
function shiftSubs(delta){
  if (!A.subs.length) return;
  pushUndo();
  for (const c of A.subs){ c.start = Math.max(0, c.start + delta); c.end = Math.max(c.start + 0.2, c.end + delta); }
  render(); refreshProp();
  toast(`全部字幕位移 ${delta > 0 ? '+' : ''}${delta.toFixed(1)} 秒`);
}
function applySubPreset(id,track=subtitleTargetTrack()){
  const p = SUB_PRESETS.find(x => x.id === id);
  if (!p) return;
  pushUndo();
  Object.assign(subStyleFor(track), p.s, { preset: id });
  render(); refreshProp();
}

async function addMusicFile(file){
  const url = URL.createObjectURL(file);
  const a = document.createElement('audio');
  a.src = url; a.preload = 'auto';
  await new Promise((res, rej) => { a.onloadedmetadata = res; a.onerror = () => rej(new Error('無法讀取音檔')); });
  const m = { id: uid(), name:file.name, file, url, el:a, dur:a.duration, buf:null,
              offset:0, startAt:0, len:Math.max(0.5, totalDur() || a.duration), autoLen:true,
              vol:0.5, fadeIn:1, fadeOut:1, loop:true, xfade:1.5, vk:[] };
  pushUndo();
  A.musics.push(m); regMedia(m);
  $('#videoPool').appendChild(a);
  A.sel = { type:'music', id:m.id };
  render(); refreshProp();
  toast(`音軌 ${A.musics.length} 已加入 —— 可以左右拖，兩端可拉長縮短`);
}

/* ── 新增標題 ──────────────────────────────────────────────── */
function addTitle(startAt){
  const s = Math.max(0, startAt === undefined ? A.playhead : startAt);
  const t = {
    id: uid(), text: '在這裡輸入標題',
    font: FONTS[0].id, size: 84, color: '#ffffff',
    stroke: '#000000', strokeW: 0, bold: true, shadow: true,
    x: 0.5, y: 0.5, opacity: 1, rot: 0, align: 'center',
    start: s, end: Math.min(totalDur() || 5, s + 3),
    animIn: 'fade', animDur: 0.6, animOut: 'fade', animOutDur: 0.4, preset: null
  };
  if (t.end - t.start < 0.5) t.end = t.start + 1.5;
  A.titles.push(t);
  A.sel = { type:'title', id:t.id };
  seekTo(s + 0.3);                       // 跳到標題上，預覽馬上看得到
  render(); refreshProp();
  toast('標題加在播放頭位置，可在「標題」軌左右拖、兩端拉長縮短');
}

function delSelected(){
  const s = A.sel;
  if (s.type !== 'proj') pushUndo();
  if (s.type === 'clip'){
    const i = A.clips.findIndex(c => c.id === s.id);
    if (i < 0) return;
    const c = A.clips[i];
    if (c.video) c.video.pause();      // 保留元素與 URL，這樣復原才回得來
    A.clips.splice(i, 1);
  } else if (s.type === 'title'){
    A.titles = A.titles.filter(t => t.id !== s.id);
  } else if (s.type === 'sub'){
    A.subs = A.subs.filter(x => x.id !== s.id);
  } else if (s.type === 'overlay'){
    A.overlays = A.overlays.filter(x => x.id !== s.id);
  } else if (s.type === 'music'){
    const i = A.musics.findIndex(m => m.id === s.id);
    if (i < 0) return;
    A.musics[i].el.pause();
    A.musics.splice(i, 1);
  } else return;
  A.sel = { type:'proj', id:null };
  A.playhead = clamp(A.playhead, 0, totalDur());
  render(); refreshProp();
}

/** ✂ 分割：依照目前選取的東西，決定切影片、切音軌還是切標題 */
function splitAtPlayhead(){
  if (A.sel.type === 'music')   return splitMusic();
  if (A.sel.type === 'title')   return splitTitle();
  if (A.sel.type === 'overlay') return splitOverlay();
  if (A.sel.type === 'sub')     return splitSub();
  return splitClip();
}

function splitSub(){
  const c = A.subs.find(x => x.id === A.sel.id);
  if (!c){ toast('先選一句字幕', true); return; }
  const T = A.playhead;
  if (T <= c.start + 0.2 || T >= c.end - 0.2){ toast('播放頭不在這句字幕上，或太靠近邊緣', true); return; }
  pushUndo();
  const right = { ...c, id: uid(), start: T };
  c.end = T;
  A.subs.push(right);
  A.sel = { type:'sub', id: right.id };
  render(); refreshProp();
  toast('字幕已分割');
}

/** 在播放頭把疊圖切成兩段 */
function splitOverlay(){
  const _u = () => pushUndo();
  const o = A.overlays.find(x => x.id === A.sel.id);
  if (!o){ toast('先選一個疊圖', true); return; }
  const T = A.playhead;
  if (T <= o.start + 0.2 || T >= o.end - 0.2){ toast('播放頭不在這個疊圖上，或太靠近邊緣', true); return; }
  _u();
  const right = { ...o, id: uid(), start: T, fadeIn: 0 };
  kfSplit(o, right, T);                  // 動態也要切開（順便把共用的 kf 拆乾淨）
  if (o._gif) right.gifOffset = (o.gifOffset || 0) + T - o.start;
  regMedia(right);
  o.end = T; o.fadeOut = 0;
  A.overlays.push(right);
  A.sel = { type:'overlay', id: right.id };
  render(); refreshProp();
  toast('疊圖已分割');
}

/** 在播放頭把音軌切成兩塊，切完各自可以移動、刪除、調音量 */
/* ── 影片／疊圖／標題的動態（v7.6，v8.1 加入影片）────────────────
   obj.kf = { x:[{t,v,e}], y:[…], scale:[…], opacity:[…], rot/motionRot:[…] }

   兩個刻意的設計：

   1. **t 是「佔這一段長度的比例」0～1，不是秒。** 這樣拖動或裁切方塊時
      動態自動跟著縮放，「從頭走到尾」永遠成立，不用在六個地方補平移程式碼。
   2. **起點不存。** 陣列裡只放「之後要走到的目標」，t=0 的值就是面板上原本
      那組滑桿（o.x / o.y / o.scale …）。所以沒有任何關鍵幀時行為完全不變，
      舊專案讀進來也一樣；之後要升級成多個關鍵幀，往同一個陣列加點就好。

   關鍵：這一層動的是「基準值」。51 種進場、18 種退場動畫吐的是
   dx/dy/rot/sx/sy/alpha 這種「相對量」，照樣疊在上面，一行都不用改。 */
const EASES = [
  ['linear', '等速'],
  ['inout',  '慢進慢出'],
  ['out',    '結尾放慢'],
  ['in',     '開頭放慢'],
];
function easeK(id, p){
  if (id === 'inout') return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  if (id === 'out')   return 1 - Math.pow(1 - p, 3);
  if (id === 'in')    return p * p * p;
  return p;
}

/** 動態發生在哪一段（佔方塊長度的比例）。沒設就是整段 0～1。 */
function kfWin(obj){
  const w = obj && obj.kfT;
  if (!w || w.length < 2) return [0, 1];
  return [clamp(Math.min(w[0], w[1]), 0, 1), clamp(Math.max(w[0], w[1]), 0, 1)];
}

/** 動態物件在總時間軸上的起訖。疊圖／標題自己有 start/end；
    影片片段的位置由 layout() 依 track/at 與各軌接法決定。 */
function kfBounds(obj){
  if (obj && Number.isFinite(obj.start) && Number.isFinite(obj.end)) return [obj.start, obj.end];
  const i = A.clips.indexOf(obj);
  if (i >= 0){
    const q = layout()[i];
    if (q) return [q.start, q.start + q.dur];
  }
  return [0, 0.05];
}

/** 這個物件在時間 T 的某個屬性值。沒有關鍵幀就原封不動回傳 base。
    起點之前維持起點的樣子、終點之後維持終點的樣子，中間才走。 */
function kfAt(obj, prop, base, T){
  const k = obj && obj.kf && obj.kf[prop];
  if (!k || !k.length) return base;
  const [start, end] = kfBounds(obj);
  const span = Math.max(0.05, end - start);
  let t = clamp((T - start) / span, 0, 1);
  const [w0, w1] = kfWin(obj);
  t = (w1 > w0 + 1e-6) ? clamp((t - w0) / (w1 - w0), 0, 1) : (t < w0 ? 0 : 1);
  let pt = 0, pv = base;
  for (const q of k){
    if (t <= q.t){
      const w = q.t - pt;
      const p = w > 1e-6 ? clamp((t - pt) / w, 0, 1) : 1;
      return pv + (q.v - pv) * easeK(q.e, p);
    }
    pt = q.t; pv = q.v;
  }
  return pv;
}

/** B1 的介面只動「終點」那一個關鍵幀 */
function kfEnd(obj, prop){ const k = obj.kf && obj.kf[prop]; return k && k.length ? k[k.length - 1] : null; }
function kfSetEnd(obj, prop, v, e){
  if (!obj.kf) obj.kf = {};
  const k = obj.kf[prop];
  if (k && k.length) { k[k.length - 1].v = v; if (e) k[k.length - 1].e = e; }
  else obj.kf[prop] = [{ t: 1, v, e: e || 'inout' }];
}
/** 某個屬性的「起點」是物件上同名的欄位；舊標題缺少 opacity 欄位時預設 1 */
function kfBase(obj, prop){
  const v = obj[prop];
  return typeof v === 'number' ? v : (prop === 'opacity' ? 1 : 0);
}

/** 把動態視窗搬到分割後的兩半上：c 是切點佔原本長度的比例 */
function kfSplitWin(a, b, c){
  const [w0, w1] = kfWin(a);
  a.kfT = c > 1e-6 ? [clamp(w0 / c, 0, 1), clamp(w1 / c, 0, 1)] : [0, 1];
  const r = 1 - c;
  b.kfT = r > 1e-6 ? [clamp((w0 - c) / r, 0, 1), clamp((w1 - c) / r, 0, 1)] : [0, 1];
}

/** 分割時把動態也切成兩段，接縫才不會跳。
    注意 { ...o } 是淺拷貝，kf 會被兩半共用 —— 一定要自己重建。 */
function kfSplit(a, b, T){
  if (!kfOn(a)){ b.kf = null; b.kfT = null; return; }
  const props = Object.keys(a.kf).filter(k => a.kf[k] && a.kf[k].length);
  const mid = {}, la = {}, lb = {};
  for (const pr of props) mid[pr] = kfAt(a, pr, kfBase(a, pr), T);
  const [start, end] = kfBounds(a);
  const c = clamp((T - start) / Math.max(0.05, end - start), 0, 1);
  for (const pr of props){
    const last = a.kf[pr][a.kf[pr].length - 1];
    la[pr] = [{ t: 1, v: mid[pr], e: last.e }];      // 左半：走到切點的值
    lb[pr] = [{ t: 1, v: last.v,  e: last.e }];      // 右半：從切點的值走到原本的終點
    b[pr] = mid[pr];                                  // 右半的起點 = 切點的值
  }
  a.kf = la; b.kf = lb;
  kfSplitWin(a, b, c);
}

function kfOn(obj){ return !!(obj.kf && Object.keys(obj.kf).some(k => obj.kf[k] && obj.kf[k].length)); }
function kfClear(obj){ obj.kf = null; obj.kfT = null; }

/* ── 配樂音量曲線（v7.5）──────────────────────────────────────
   m.vk = [{ t, v }]：t 是「相對這一塊配樂起點」的秒數，v 是 0～1 的倍率。
   最後乘在 m.vol 上 —— 沒有任何點時恆為 1，行為跟以前一模一樣，
   舊專案讀進來沒有這個欄位也照常運作。

   為什麼是倍率而不是直接當音量：這樣「音量」滑桿還是整體音量，
   曲線只管「這一段要壓多低」，兩者不會互相打架。

   t 相對方塊起點，所以移動方塊時曲線自動跟著走；裁切左端時
   音檔內容也是相對方塊起點固定的（offset 不變），兩者一致。

   預覽（syncMedia 每幀設 el.volume）與匯出（OfflineAudioContext 的
   linearRamp）必須算出同一條線，所以兩邊都只認 musicGainAt 這個公式。 */
function musicGainAt(m, T){
  const k = m && m.vk;
  if (!k || !k.length) return 1;
  const t = T - m.startAt;
  if (t <= k[0].t) return clamp(k[0].v, 0, 1);
  const last = k[k.length - 1];
  if (t >= last.t) return clamp(last.v, 0, 1);
  for (let i = 1; i < k.length; i++){
    if (t <= k[i].t){
      const a = k[i - 1], b = k[i], w = b.t - a.t;
      const p = w > 1e-6 ? (t - a.t) / w : 0;
      return clamp(a.v + (b.v - a.v) * p, 0, 1);
    }
  }
  return 1;
}

/** 加一個點；永遠保持照時間排好，求值與匯出才不用每次重排 */
function vkAdd(m, t, v){
  m.vk = (m.vk || []).concat([{ t: Math.max(0, t), v: clamp(v, 0, 1) }])
                     .sort((a, b) => a.t - b.t);
}
function vkTidy(m){ if (m.vk) m.vk.sort((a, b) => a.t - b.t); }

function splitMusic(){
  const _u = () => pushUndo();
  const m = A.musics.find(x => x.id === A.sel.id);
  if (!m){ toast('先選一條音軌', true); return; }
  const T = A.playhead, end = m.startAt + m.len;
  if (T <= m.startAt + 0.2 || T >= end - 0.2){ toast('播放頭不在這條音軌上，或太靠近邊緣', true); return; }
  const seg = musicSeg(m);
  const consumed = m.loop ? ((T - m.startAt) % Math.max(0.2, seg - m.xfade)) : (T - m.startAt);
  const a = document.createElement('audio');
  a.src = m.url; a.preload = 'auto';
  $('#videoPool').appendChild(a);
  _u();
  // 切點的音量先算好，兩半各補一個點，切開之後音量不會在接縫跳一下
  const cut = T - m.startAt, gv = musicGainAt(m, T), had = !!(m.vk && m.vk.length);
  const right = { ...m, id: uid(), el: a, startAt: T, len: end - T, autoLen: false,
                  offset: clamp(m.offset + consumed, 0, Math.max(0, m.dur - 0.3)),
                  vk: had ? [{ t: 0, v: gv }].concat(
                        m.vk.filter(x => x.t > cut).map(x => ({ t: x.t - cut, v: x.v }))) : [] };
  regMedia(right);
  if (had) m.vk = m.vk.filter(x => x.t < cut).concat([{ t: cut, v: gv }]);
  m.len = T - m.startAt; m.autoLen = false;
  A.musics.splice(A.musics.indexOf(m) + 1, 0, right);
  A.sel = { type:'music', id: right.id };
  render(); refreshProp();
  toast('音軌已分割成兩塊');
}

/** 在播放頭把標題切成兩個，後半可以獨立換文字或動畫 */
function splitTitle(){
  const _u = () => pushUndo();
  const t = A.titles.find(x => x.id === A.sel.id);
  if (!t){ toast('先選一個標題', true); return; }
  const T = A.playhead;
  if (T <= t.start + 0.2 || T >= t.end - 0.2){ toast('播放頭不在這個標題上，或太靠近邊緣', true); return; }
  _u();
  const right = { ...t, id: uid(), start: T, animIn: 'none' };
  kfSplit(t, right, T);                  // 動態也要切開（順便把共用的 kf 拆乾淨）
  t.end = T;
  t.animOut = 'none';                    // 接縫處不要淡出，兩半看起來才是連著的
  A.titles.push(right);
  A.sel = { type:'title', id: right.id };
  render(); refreshProp();
  toast('標題已分割');
}

/** 在播放頭把目前片段切成兩段 */
function splitClip(){
  const L = layout(), T = A.playhead;
  let i = A.sel.type === 'clip' ? A.clips.findIndex(c => c.id === A.sel.id) : -1;
  if (i >= 0 && !(T >= L[i].start && T < L[i].start + L[i].dur)) i = -1;
  if (i < 0 && A.sel.type !== 'clip'){
    const act = activeAt(T,1,L) || activeAt(T,0,L);
    if (act) i = A.clips.indexOf((act.b || act.a).clip);
  }
  if (i < 0){ toast('播放頭不在目前選取的影片片段上', true); return; }
  const c = A.clips[i];
  const local = c.inP + (T - L[i].start);
  if (local - c.inP < 0.2 || c.outP - local < 0.2){ toast('太靠近片段邊緣，切不了', true); return; }
  pushUndo();
  let nc;
  if (isImg(c)){                                   // 圖片直接共用同一個 <img>
    nc = { ...c, id: uid(), inP: 0, outP: c.outP - local,
           trans: { type:'none', dur:0.6 },
           transOut: { ...(c.transOut || { type:'none', dur:0.6 }) },
           grade: { ...(c.grade || GRADE0) } };
    nc.fadeIn = 0; c.fadeOut = 0;
    nc.at = A.playhead;
    kfSplit(c, nc, T);                         // 影片構圖動態也切成連續的兩半
    c.transOut = { type:'none', dur:0.6 };      // 結尾效果留給後半段，前半段接著播不用收尾
    regMedia(nc);
    c.outP = local;
    A.clips.splice(i + 1, 0, nc);
    A.sel = { type:'clip', id:nc.id };
    render(); refreshProp(); toast('已分割');
    return;
  }
  const v = document.createElement('video');   // 跟 addVideo 一樣，blob 同源不設 crossOrigin
  v.src = c.url;
  v.preload = 'auto'; v.playsInline = true; v.muted = true;
  $('#videoPool').appendChild(v);
  nc = { ...c, id: uid(), video: v, el: v, inP: local, outP: c.outP,
         trans: { type:'none', dur:0.6 },
         transOut: { ...(c.transOut || { type:'none', dur:0.6 }) },
         grade: { ...(c.grade || GRADE0) }, audioBuf: c.audioBuf };
  nc.fadeIn = 0; c.fadeOut = 0;
  nc.at = A.playhead;
  kfSplit(c, nc, T);                            // 兩半不共用 kf，接縫畫面也不跳
  c.transOut = { type:'none', dur:0.6 };
  regMedia(nc, { audioBuf: c.audioBuf });
  c.outP = local;
  A.clips.splice(i + 1, 0, nc);
  A.sel = { type:'clip', id:nc.id };
  render(); refreshProp();
  toast('已分割');
}
