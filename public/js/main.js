// Boots Phaser and wires the DOM UI (name overlay, chat, online counter).

// ---------- UI bridge shared with the scenes ----------
const ui = {
  entered: false,
  chatFocused: false,
  setOnline(n, off) {
    const el = document.getElementById('online');
    if (off) { el.textContent = '● disconnected'; el.classList.add('off'); return; }
    el.classList.remove('off');
    el.textContent = `● ${n} online`;
  },
  log(name, text, sys) {
    const log = document.getElementById('log');
    const row = document.createElement('div');
    row.className = 'row';
    if (sys) { row.innerHTML = `<span class="sys">${escapeHtml(text)}</span>`; }
    else { row.innerHTML = `<span class="who">${escapeHtml(name)}:</span> ${escapeHtml(text)}`; }
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 80) log.removeChild(log.firstChild);
  },
};
window.ui = ui;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- name overlay ----------
const nameOverlay = document.getElementById('nameOverlay');
const nameInput = document.getElementById('nameInput');
const enterBtn = document.getElementById('enterBtn');
nameInput.focus();

const lineInput = document.getElementById('lineInput');
function enterWorld() {
  const name = nameInput.value.trim().slice(0, 16);
  if (name) window.net.send({ t: 'setName', name });
  const line = lineInput.value.trim().slice(0, 70);
  if (line) window.net.send({ t: 'setBattleLine', line });
  ui.entered = true;
  nameOverlay.classList.add('hidden');
  document.getElementById('chatInput').blur();
}
enterBtn.addEventListener('click', enterWorld);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') enterWorld(); });
document.getElementById('lineInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') enterWorld(); });

// ---------- chat ----------
const chatInput = document.getElementById('chatInput');
chatInput.addEventListener('focus', () => { ui.chatFocused = true; });
chatInput.addEventListener('blur', () => { ui.chatFocused = false; });
chatInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    const text = chatInput.value.trim();
    if (text) window.net.send({ t: 'chat', text });
    chatInput.value = '';
    chatInput.blur();
  } else if (e.key === 'Escape') {
    chatInput.value = ''; chatInput.blur();
  }
});
// Enter (when playing) focuses chat
window.addEventListener('keydown', (e) => {
  if (!ui.entered) return;
  if (e.key === 'Enter' && document.activeElement !== chatInput) {
    e.preventDefault();
    chatInput.focus();
  }
});

// Keep the init packet if it arrives before Boot is ready.
window.net.on('init', (m) => { window.__initMsg = m; });

// ---------- Phaser ----------
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 480,
  height: 320,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#0e1220',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, WorldScene, BattleScene],
};
window.game = new Phaser.Game(config);
