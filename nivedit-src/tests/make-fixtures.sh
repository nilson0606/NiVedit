#!/bin/bash
# 產生測試素材。容器每次都是新的，跑測試前先執行這支。
# 需要 ffmpeg。輸出到 $NIVEDIT_FIX（預設 /tmp/tv）。
set -e
FIX="${NIVEDIT_FIX:-/tmp/tv}"
mkdir -p "$FIX"; cd "$FIX"

# 素材版本戳記。改了下面任何一個 ffmpeg 參數就把號碼 +1，
# 舊素材會被整批清掉重做。
#
# 為什麼需要這個：每一段都是 `[ -f xxx ] || ffmpeg …`，看到檔案就跳過。
# 容器留著上一版的同名舊檔時，這支腳本會「成功」但其實什麼都沒重做，
# 測試照跑、結果照紅，而且紅得像是程式壞了 —— 2026-09-12 就這樣誤判過一次：
# /tmp/tv 裡是舊的 VP8 320x180，規格要的是 VP9 640x360，
# crop 與 dual-track 少過十幾項，差點被當成功能退步。
STAMP_WANT=2
if [ "$(cat .fixtures-version 2>/dev/null)" != "$STAMP_WANT" ]; then
  echo "素材版本不符（或第一次產生），全部重做…"
  rm -f t300.webm t900.webm tone440.wav m.mp3 pic1.png upper-motion.webm
fi

# 300Hz / 900Hz 純音 + 純色畫面。
# 用兩種頻率是為了「聽得出來哪一段的聲音接錯位置」——
# 匯出後解碼量頻譜就知道第幾秒該響哪個音。
# headless Chromium 沒有 H.264 解碼器，所以只能用 VP9/WebM。
[ -f t300.webm ] || ffmpeg -hide_banner -loglevel error \
  -f lavfi -i "sine=frequency=300:duration=5" \
  -f lavfi -i "color=c=blue:s=640x360:d=5" \
  -c:v libvpx-vp9 -c:a libopus -shortest -y t300.webm
[ -f t900.webm ] || ffmpeg -hide_banner -loglevel error \
  -f lavfi -i "sine=frequency=900:duration=5" \
  -f lavfi -i "color=c=red:s=640x360:d=5" \
  -c:v libvpx-vp9 -c:a libopus -shortest -y t900.webm

# 音量曲線測試用：等振幅 440Hz，量 RMS 包絡才有基準
[ -f tone440.wav ] || ffmpeg -hide_banner -loglevel error \
  -f lavfi -i "sine=frequency=440:duration=10:sample_rate=48000" \
  -ac 2 -c:a pcm_s16le -y tone440.wav

# 任意音檔（音軌用）
[ -f m.mp3 ] || ffmpeg -hide_banner -loglevel error \
  -f lavfi -i "sine=frequency=220:duration=10" -y m.mp3

# 疊圖用的小圖：白底＋一個明顯的方塊，量重心才準
[ -f pic1.png ] || ffmpeg -hide_banner -loglevel error \
  -f lavfi -i "color=c=yellow:s=200x200:d=1" -frames:v 1 -y pic1.png

# 上軌會換色，驗證匯出有持續解碼兩軌。
[ -f upper-motion.webm ] || ffmpeg -hide_banner -loglevel error \
  -f lavfi -i "color=c=red:s=320x180:r=20:d=1" \
  -f lavfi -i "color=c=lime:s=320x180:r=20:d=2" \
  -f lavfi -i "sine=frequency=900:duration=3" \
  -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0[v]" \
  -map "[v]" -map "2:a" -c:v libvpx-vp9 -c:a libopus -shortest -y upper-motion.webm

echo "$STAMP_WANT" > .fixtures-version
echo "測試素材就緒： $FIX"
ls -la "$FIX"
