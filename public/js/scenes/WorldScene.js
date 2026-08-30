// The shared overworld: renders the map, handles grid movement, syncs remote trainers.
class WorldScene extends Phaser.Scene {
  constructor() { super('World'); }

  create(init) {
    this.T = init.tile;
    this.mapW = init.w; this.mapH = init.h;
    this.ground = init.ground; this.objects = init.objects;
    this.myId = init.id;
    this.others = new Map();      // id -> { sprite, label, tx, ty }
    this.moving = false;
    this.inBattle = false;

    this.buildMap();

    // our player
    this.me = { tx: init.you.x, ty: init.you.y, dir: init.you.dir, charId: init.you.charId };
    this.player = this.makeTrainer(init.you.charId, init.you.x, init.you.y);
    this.meName = init.you.name;
    this.meLevel = init.progress.level;
    this.meLabel = this.makeLabel(this.labelFor(this.meName, this.meLevel), init.you.x, init.you.y);
    window.ui.setProgress(init.progress);

    // existing players
    init.players.forEach((p) => this.addOther(p));

    // camera
    this.cameras.main.setBounds(0, 0, this.mapW * this.T, this.mapH * this.T);
    this.cameras.main.setZoom(2);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.setBackgroundColor('#0e1220');

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' });
    // Don't let Phaser preventDefault WASD/arrows — otherwise you can't type those
    // letters into the name / battle-line / chat text boxes.
    this.input.keyboard.clearCaptures();

    this.wireNetwork();
    window.ui.setOnline(init.players.length + 1);
    window.ui.log(null, 'Welcome to Pokémon Twister Version!', true);
  }

  // ---------- map ----------
  buildMap() {
    const T = this.T;
    const groundKey = (c) => ({ G: 'grass', F: 'grassflower', D: 'dirt', L: 'floor', W: 'water' }[c] || 'grass');
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        this.add.image(x * T, y * T, groundKey(this.ground[y][x])).setOrigin(0, 0).setDepth(0);
      }
    }
    // object layer (trees / mart) — drawn with bottom-anchored origin so they rise above the tile
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        const o = this.objects[y][x];
        if (o === 'T') {
          this.add.image(x * T + T / 2, y * T + T, 'tree')
            .setOrigin(0.5, 1).setDepth(y * T + T);
        } else if (o === 'M') {
          this.add.image(x * T, y * T + T, 'mart')
            .setOrigin(0, 1).setDepth(y * T + T);
        }
      }
    }
  }

  // ---------- trainers ----------
  makeTrainer(charId, tx, ty) {
    const id = String(charId).padStart(2, '0');
    const s = this.add.image(tx * this.T + this.T / 2, ty * this.T + this.T, `char_${id}`)
      .setOrigin(0.5, 0.95);
    // source trainer art is ~100px tall; scale down so it reads at roughly one tile
    s.setScale((this.T * 1.05) / s.height);
    s.setDepth(ty * this.T + this.T + 1);
    return s;
  }
  labelFor(name, level) { return level ? `${name} Lv${level}` : name; }
  makeLabel(name, tx, ty) {
    const t = this.add.text(tx * this.T + this.T / 2, ty * this.T - 6, name,
      { fontFamily: 'monospace', fontSize: 10, color: '#ffffff',
        stroke: '#0e1220', strokeThickness: 3 }).setOrigin(0.5, 1);
    t.setDepth(100000);
    return t;
  }
  addOther(p) {
    const sprite = this.makeTrainer(p.charId, p.x, p.y);
    const label = this.makeLabel(this.labelFor(p.name, p.level), p.x, p.y);
    if (p.inBattle) sprite.setTint(0x9aa4bf);
    if (p.isNPC) label.setColor('#ffd866');        // trainers you can challenge solo
    this.others.set(p.id, { sprite, label, tx: p.x, ty: p.y, charId: p.charId,
                            name: p.name, level: p.level });
  }
  placeSprite(sprite, label, tx, ty) {
    const px = tx * this.T + this.T / 2, py = ty * this.T + this.T;
    sprite.setDepth(ty * this.T + this.T + 1);
    this.tweens.add({ targets: sprite, x: px, y: py, duration: 130, ease: 'Linear' });
    this.tweens.add({ targets: label, x: px, y: ty * this.T - 6, duration: 130, ease: 'Linear' });
  }

  // ---------- input / movement ----------
  update() {
    if (this.moving || this.inBattle || window.ui.chatFocused || !window.ui.entered) return;
    let dx = 0, dy = 0, dir = this.me.dir;
    if (this.cursors.left.isDown || this.wasd.left.isDown)  { dx = -1; dir = 'left'; }
    else if (this.cursors.right.isDown || this.wasd.right.isDown) { dx = 1; dir = 'right'; }
    else if (this.cursors.up.isDown || this.wasd.up.isDown) { dy = -1; dir = 'up'; }
    else if (this.cursors.down.isDown || this.wasd.down.isDown) { dy = 1; dir = 'down'; }
    if (dx === 0 && dy === 0) return;

    const nx = this.me.tx + dx, ny = this.me.ty + dy;
    this.faceSprite(this.player, dir);
    this.me.dir = dir;

    // walking into another trainer -> ask server to start a battle (don't step)
    const occupant = [...this.others.values()].find((o) => o.tx === nx && o.ty === ny);
    if (occupant) { window.net.send({ t: 'move', tx: nx, ty: ny, dir }); this.lockBriefly(); return; }

    if (this.isBlocked(nx, ny)) { window.net.send({ t: 'move', tx: this.me.tx, ty: this.me.ty, dir }); this.lockBriefly(); return; }

    // optimistic step
    this.me.tx = nx; this.me.ty = ny;
    this.moving = true;
    const px = nx * this.T + this.T / 2, py = ny * this.T + this.T;
    this.player.setDepth(ny * this.T + this.T + 1);
    this.tweens.add({ targets: this.player, x: px, y: py, duration: 140, ease: 'Linear',
      onComplete: () => { this.moving = false; } });
    this.tweens.add({ targets: this.meLabel, x: px, y: ny * this.T - 6, duration: 140, ease: 'Linear' });
    window.net.send({ t: 'move', tx: nx, ty: ny, dir });
  }

  setMyLevel(level) {
    this.meLevel = level;
    this.meLabel.setText(this.labelFor(this.meName, this.meLevel));
  }

  lockBriefly() { this.moving = true; this.time.delayedCall(120, () => { this.moving = false; }); }

  faceSprite(sprite, dir) { sprite.setFlipX(dir === 'left'); }

  isBlocked(x, y) {
    if (x < 0 || y < 0 || x >= this.mapW || y >= this.mapH) return true;
    if (this.ground[y][x] === 'W') return true;
    const o = this.objects[y][x];
    if (o === 'T') return true;
    // mart footprint: this tile or up to 2 tiles to the left is an 'M'
    for (let dx = 0; dx <= 2; dx++) if (this.objects[y][x - dx] === 'M' && x - dx >= 0) return true;
    return false;
  }

  // ---------- network ----------
  wireNetwork() {
    window.net.on('join', (m) => {
      this.addOther(m.player);
      window.ui.setOnline(this.others.size + 1);
      window.ui.log(null, `${m.player.name} entered the world`, true);
    });
    window.net.on('leave', (m) => {
      const o = this.others.get(m.id);
      if (o) { o.sprite.destroy(); o.label.destroy(); this.others.delete(m.id); }
      window.ui.setOnline(this.others.size + 1);
    });
    window.net.on('moved', (m) => {
      if (m.id === this.myId) return;             // we move ourselves optimistically
      const o = this.others.get(m.id);
      if (!o) return;
      o.tx = m.x; o.ty = m.y;
      this.faceSprite(o.sprite, m.dir);
      this.placeSprite(o.sprite, o.label, m.x, m.y);
    });
    window.net.on('playerName', (m) => {
      const o = this.others.get(m.id);
      if (o) { o.name = m.name; o.label.setText(this.labelFor(o.name, o.level)); }
    });
    window.net.on('playerLevel', (m) => {
      const o = this.others.get(m.id);
      if (o) { o.level = m.level; o.label.setText(this.labelFor(o.name, o.level)); }
    });
    window.net.on('progress', (m) => {
      window.ui.setProgress(m.you);
      this.setMyLevel(m.you.level);
    });
    window.net.on('playerBattling', (m) => {
      if (m.id === this.myId) return;
      const o = this.others.get(m.id);
      if (o) o.sprite.setTint(m.inBattle ? 0x9aa4bf : 0xffffff), (!m.inBattle && o.sprite.clearTint());
    });
    window.net.on('chat', (m) => window.ui.log(m.name, m.text));
    window.net.on('nameOk', (m) => {
      this.meName = m.name;
      this.meLabel.setText(this.labelFor(this.meName, this.meLevel));
    });

    // battle handoff
    window.net.on('battleStart', (m) => {
      this.inBattle = true;
      document.getElementById('chat').style.display = 'none';   // clear the battle UI
      this.scene.launch('Battle', m);
      this.scene.pause();
    });
    window.net.on('battleEnd', (m) => {
      this.inBattle = false;
      document.getElementById('chat').style.display = '';
      if (m.you) { window.ui.setProgress(m.you); this.setMyLevel(m.you.level); }
    });

    window.net.on('_close', () => window.ui.setOnline(0, true));
  }
}
window.WorldScene = WorldScene;
