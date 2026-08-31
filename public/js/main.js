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
  setProgress(p) {
    document.getElementById('prog').textContent =
      `${p.speciesName} Lv${p.level} · ${p.xp}/${p.xpNext} XP`;
    if (p.money !== undefined) ui.setMoney(p.money);
  },
  setMoney(n) { document.getElementById('money').textContent = `₽${n}`; },
  shopOpen: false,
  // Fills the partner dropdown from /api/species; boss mons are NPC-only.
  buildPartnerPicker(list) {
    const sel = document.getElementById('partnerSelect');
    if (!sel || sel.dataset.built) return;
    sel.dataset.built = '1';
    for (const gen of [1, 9]) {
      const group = document.createElement('optgroup');
      group.label = `Gen ${gen}`;
      list.filter((s) => s.gen === gen && s.tier !== 'boss')
          .sort((a, b) => a.dex - b.dex)
          .forEach((s) => {
            const opt = document.createElement('option');
            opt.value = s.key;
            opt.textContent = `${s.name} (${s.types.join('/')})`;
            group.appendChild(opt);
          });
      sel.appendChild(group);
    }
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
  const species = document.getElementById('partnerSelect').value;
  if (species) window.net.send({ t: 'setSpecies', species });
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

// ---------- the mart ----------
const shopOverlay = document.getElementById('shopOverlay');
const shopList = document.getElementById('shopList');
const shopNote = document.getElementById('shopNote');

function renderShop(catalogue, money, bag) {
  document.getElementById('shopMoney').textContent = `₽${money}`;
  const held = Object.fromEntries(bag.map((b) => [b.key, b.count]));
  shopList.innerHTML = '';
  catalogue.forEach((it) => {
    const what = it.heal ? `+${it.heal} HP` : `cures ${it.cures.map((c) => c.toUpperCase()).join('/')}`;
    const row = document.createElement('div');
    row.className = 'shopRow' + (money < it.price ? ' broke' : '');
    row.innerHTML = `<span class="n">${escapeHtml(it.name)}</span>` +
      `<span class="e">${escapeHtml(what)}</span>` +
      `<span class="h">${held[it.key] ? 'x' + held[it.key] : ''}</span>` +
      `<span class="p">₽${it.price}</span>`;
    row.addEventListener('click', () => window.net.send({ t: 'buy', item: it.key }));
    shopList.appendChild(row);
  });
}
function closeShop() {
  shopOverlay.classList.add('hidden');
  ui.shopOpen = false;
  shopNote.textContent = '';
}
document.getElementById('shopClose').addEventListener('click', closeShop);
window.addEventListener('keydown', (e) => { if (ui.shopOpen && e.key === 'Escape') closeShop(); });

window.net.on('shop', (m) => {
  ui.shopOpen = true;
  ui.lastCatalogue = m.catalogue;
  shopOverlay.classList.remove('hidden');
  renderShop(m.catalogue, m.money, m.bag);
});
window.net.on('shopUpdate', (m) => {
  renderShop(ui.lastCatalogue || [], m.money, m.bag);
  ui.setMoney(m.money);
  shopNote.textContent = m.note || '';
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
