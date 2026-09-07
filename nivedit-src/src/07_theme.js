/* 介面主題是瀏覽器偏好，不寫入專案，也不改預覽或匯出資料。 */
function updateThemeButton(){
  const b = document.getElementById('themeBtn');
  if (!b) return;
  const light = document.documentElement.dataset.theme === 'light';
  b.textContent = (light ? '☀ ' : '☾ ') + L(light ? '白天模式' : '夜間模式');
  b.title = L(light ? '切換至夜間模式' : '切換至白天模式');
  // 固定的切換名稱，搭配 aria-pressed 表示白天模式是否啟用。
  b.setAttribute('aria-label', L('白天模式'));
  b.setAttribute('aria-pressed', String(light));
}
function setTheme(theme){
  if (theme !== 'light' && theme !== 'dark') return;
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('nv.theme', theme); } catch (e) {}
  updateThemeButton();
}
function themeInit(){
  const b = document.getElementById('themeBtn');
  if (!b) return;
  b.onclick = () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  // 空白鍵保留原生按鈕操作，不讓時間軸快捷鍵攔走。
  b.addEventListener('keydown', e => { if (e.code === 'Space') e.stopPropagation(); });
  updateThemeButton();
}
