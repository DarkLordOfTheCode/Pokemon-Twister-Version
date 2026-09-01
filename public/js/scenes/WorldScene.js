// The shared overworld: renders the map, handles grid movement, syncs remote trainers.

// Row order inside every walker sheet, set by tools/slice_walkers.py. Each row
// holds four walk frames, so direction d uses frames d*4 .. d*4+3 and stands
// still on frame d*4.
const WALK_DIRS = { down: 0, left: 1, right: 2, up: 3 };
// Walkers are 48px tall on a 32px tile, so they stick up 16px above it — the
// name label has to clear that or it sits across their face.
const LABEL_DY = -22;
const sheetFor = (p) =>
  (p.overworld === 'dragonite' ? 'walk_dragonite' : `walk_${(p.charId || 0) % 6}`);
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
    this.secretOpen = false;              // set when the Twister blows the wall
    this.objSprites = new Map();          // 'x,y' -> sprite, so we can remove one

    this.buildAnims();
    this.buildMap();

    // our player
    this.me = { tx: init.you.x, ty: init.you.y, dir: init.you.dir || 'down',
                sheet: sheetFor(init.you) };
    this.player = this.makeWalker(this.me.sheet, init.you.x, init.you.y, this.me.dir);
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

    this.space = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.space.on('down', () => {
      if (this.inBattle || window.ui.chatFocused || window.ui.shopOpen ||
          window.ui.dialogOpen || !window.ui.entered) return;
      window.net.send({ t: 'shopOpen' });          // the server checks we're actually there
    });
    // T sets the Twister off. The server checks you hold the TM and are stood
    // at the sealed wall; anywhere else it just tells you nothing happened.
    this.keyT = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.keyT.on('down', () => {
      if (this.inBattle || window.ui.chatFocused || window.ui.shopOpen ||
          window.ui.dialogOpen || !window.ui.entered) return;
      window.net.send({ t: 'useTm' });
    });
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' });
    // Don't let Phaser preventDefault WASD/arrows — otherwise you can't type those
    // letters into the name / battle-line / chat text boxes.
    this.input.keyboard.clearCaptures();

    if (init.debug) window.ui.enableDebug();
    this.reportPos();

    this.wireNetwork();
    window.ui.setOnline(init.players.length + 1);
    window.ui.log(null, 'Welcome to Pokémon Twister Version!', true);
  }

  // ---------- map ----------
  buildMap() {
    const T = this.T;
    const groundKey = (c) => ({ G: 'grass', F: 'grassflower', D: 'dirt', L: 'floor', W: 'water',
                                S: 'stone', P: 'rubble', A: 'sand', B: 'dune',
                                H: 'tallgrass' }[c] || 'grass');
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        this.add.image(x * T, y * T, groundKey(this.ground[y][x])).setOrigin(0, 0).setDepth(0);
      }
    }
    // object layer (trees / mart / rocks) — drawn with bottom-anchored origin so they rise above the tile
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        const o = this.objects[y][x];
        if (o === 'T') {
          this.add.image(x * T + T / 2, y * T + T, 'tree')
            .setOrigin(0.5, 1).setDepth(y * T + T);
        } else if (o === 'M') {
          this.add.image(x * T, y * T + T, 'mart')
            .setOrigin(0, 1).setDepth(y * T + T);
        } else if (o === 'R' || o === 'X') {
          // 'X' is the sealed secret exit — drawn as ordinary rock so nothing
          // gives it away, but kept so we can delete exactly those two tiles.
          const spr = this.add.image(x * T + T / 2, y * T + T, 'rock')
            .setOrigin(0.5, 1).setDepth(y * T + T);
          if (o === 'X') this.objSprites.set(`${x},${y}`, spr);
        } else if (o === 'C') {
          this.add.image(x * T + T / 2, y * T + T, 'cactus')
            .setOrigin(0.5, 1).setDepth(y * T + T);
        }
      }
    }
  }

  // ---------- trainers ----------
  // One looping animation per sheet per direction.
  buildAnims() {
    const sheets = ['walk_0', 'walk_1', 'walk_2', 'walk_3', 'walk_4', 'walk_5', 'walk_dragonite'];
    sheets.forEach((sheet) => {
      Object.entries(WALK_DIRS).forEach(([dir, d]) => {
        const key = `${sheet}_${dir}`;
        if (this.anims.exists(key)) return;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(sheet, { start: d * 4, end: d * 4 + 3 }),
          frameRate: 8,
          repeat: -1,
        });
      });
    });
  }

  // The 32x48 trainers and 32x32 Dragonite are already drawn at tile scale, so
  // they go in 1:1 with their feet on the bottom edge of the tile.
  makeWalker(sheet, tx, ty, dir) {
    const s = this.add.sprite(tx * this.T + this.T / 2, ty * this.T + this.T,
                              sheet, WALK_DIRS[dir] * 4).setOrigin(0.5, 1);
    s.setDepth(ty * this.T + this.T + 1);
    return s;
  }
  walk(sprite, sheet, dir) { sprite.anims.play(`${sheet}_${dir}`, true); }
  face(sprite, sheet, dir) { sprite.anims.stop(); sprite.setFrame(WALK_DIRS[dir] * 4); }
  labelFor(name, level) { return level ? `${name} Lv${level}` : name; }
  makeLabel(name, tx, ty) {
    const t = this.add.text(tx * this.T + this.T / 2, ty * this.T + LABEL_DY, name,
      { fontFamily: 'monospace', fontSize: 10, color: '#ffffff',
        stroke: '#0e1220', strokeThickness: 3 }).setOrigin(0.5, 1);
    t.setDepth(100000);
    return t;
  }
  addOther(p) {
    const sheet = sheetFor(p);
    const sprite = this.makeWalker(sheet, p.x, p.y, p.dir || 'down');
    const label = this.makeLabel(this.labelFor(p.name, p.level), p.x, p.y);
    if (p.inBattle) sprite.setTint(0x9aa4bf);
    if (p.isNPC) label.setColor('#ffd866');        // trainers you can challenge solo
    if (p.talk) label.setColor('#8ee6ff');         // talk to these, don't fight them
    if (p.wild) label.setColor('#ff7b72');         // wild — and not yours to keep
    this.others.set(p.id, { sprite, label, tx: p.x, ty: p.y, sheet,
                            dir: p.dir || 'down', name: p.name, level: p.level });
  }
  // Animate a remote trainer across one tile, then settle them facing that way.
  placeSprite(o, tx, ty, dir) {
    const px = tx * this.T + this.T / 2, py = ty * this.T + this.T;
    o.sprite.setDepth(ty * this.T + this.T + 1);
    this.walk(o.sprite, o.sheet, dir);
    this.tweens.add({ targets: o.sprite, x: px, y: py, duration: 130, ease: 'Linear',
      onComplete: () => this.face(o.sprite, o.sheet, dir) });
    this.tweens.add({ targets: o.label, x: px, y: ty * this.T + LABEL_DY, duration: 130, ease: 'Linear' });
  }

  // ---------- input / movement ----------
  update() {
    if (this.moving || this.inBattle || window.ui.chatFocused || window.ui.shopOpen ||
        window.ui.dialogOpen || !window.ui.entered) return;
    let dx = 0, dy = 0, dir = this.me.dir;
    if (this.cursors.left.isDown || this.wasd.left.isDown)  { dx = -1; dir = 'left'; }
    else if (this.cursors.right.isDown || this.wasd.right.isDown) { dx = 1; dir = 'right'; }
    else if (this.cursors.up.isDown || this.wasd.up.isDown) { dy = -1; dir = 'up'; }
    else if (this.cursors.down.isDown || this.wasd.down.isDown) { dy = 1; dir = 'down'; }
    if (dx === 0 && dy === 0) { this.face(this.player, this.me.sheet, this.me.dir); return; }

    const nx = this.me.tx + dx, ny = this.me.ty + dy;
    this.me.dir = dir;

    // walking into another trainer -> ask server to start a battle (don't step)
    const occupant = [...this.others.values()].find((o) => o.tx === nx && o.ty === ny);
    if (occupant) {
      this.face(this.player, this.me.sheet, dir);       // turn to them, don't step
      window.net.send({ t: 'move', tx: nx, ty: ny, dir });
      this.lockBriefly(); return;
    }

    if (this.isBlocked(nx, ny)) {
      this.face(this.player, this.me.sheet, dir);       // walked into a wall
      window.net.send({ t: 'move', tx: this.me.tx, ty: this.me.ty, dir });
      this.lockBriefly(); return;
    }

    // optimistic step
    this.me.tx = nx; this.me.ty = ny;
    this.moving = true;
    const px = nx * this.T + this.T / 2, py = ny * this.T + this.T;
    this.player.setDepth(ny * this.T + this.T + 1);
    this.walk(this.player, this.me.sheet, dir);
    this.tweens.add({ targets: this.player, x: px, y: py, duration: 140, ease: 'Linear',
      onComplete: () => { this.moving = false; } });
    this.tweens.add({ targets: this.meLabel, x: px, y: ny * this.T + LABEL_DY, duration: 140, ease: 'Linear' });
    this.reportPos();
    window.net.send({ t: 'move', tx: nx, ty: ny, dir });
  }

  setMyLevel(level) {
    this.meLevel = level;
    this.meLabel.setText(this.labelFor(this.meName, this.meLevel));
  }

  // Feeds the debug panel's coordinate readout.
  reportPos() {
    window.ui.setPos(this.me.tx, this.me.ty, this.ground[this.me.ty][this.me.tx]);
  }

  lockBriefly() { this.moving = true; this.time.delayedCall(120, () => { this.moving = false; }); }

  isBlocked(x, y) {
    if (x < 0 || y < 0 || x >= this.mapW || y >= this.mapH) return true;
    if (this.ground[y][x] === 'W') return true;
    const o = this.objects[y][x];
    if (o === 'T' || o === 'R' || o === 'C') return true;
    if (o === 'X') return !this.secretOpen;
    // mart footprint: this tile or up to 2 tiles to the left is an 'M'
    for (let dx = 0; dx <= 2; dx++) if (this.objects[y][x - dx] === 'M' && x - dx >= 0) return true;
    return false;
  }

  // Blow the sealed tiles away: stop drawing them and stop colliding with them.
  openSecret(tiles) {
    this.secretOpen = true;
    (tiles || []).forEach((t) => {
      const key = `${t.x},${t.y}`;
      const spr = this.objSprites.get(key);
      if (spr) { spr.destroy(); this.objSprites.delete(key); }
    });
  }

  // Hard cut, no tween — used when the desert throws you back to the plaza.
  teleport(tx, ty) {
    this.me.tx = tx; this.me.ty = ty;
    const px = tx * this.T + this.T / 2, py = ty * this.T + this.T;
    this.player.setPosition(px, py).setDepth(ty * this.T + this.T + 1);
    this.meLabel.setPosition(px, ty * this.T + LABEL_DY);
    this.me.dir = 'down';
    this.face(this.player, this.me.sheet, 'down');
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
      const stepped = o.tx !== m.x || o.ty !== m.y;
      o.tx = m.x; o.ty = m.y;
      o.dir = m.dir || o.dir;
      if (stepped) this.placeSprite(o, m.x, m.y, o.dir);
      else this.face(o.sprite, o.sheet, o.dir);          // turned on the spot
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

    // ---- story ----
    window.net.on('dialogue', (m) => {
      window.ui.showLines(m.name, m.lines);
      if (m.gave) window.ui.log(null, `You received ${m.gave}!`, true);
    });
    window.net.on('note', (m) => window.ui.log(null, m.text, true));
    window.net.on('warped', (m) => { this.teleport(m.x, m.y); this.reportPos(); });

    // The big one: shake the camera, open the wall, then play the whole sequence
    // — your lines, then everyone who came running, then the aftermath.
    window.net.on('twister', (m) => {
      this.openSecret(m.tiles);
      this.cameras.main.shake(1000, 0.018);
      this.cameras.main.flash(600, 255, 244, 214);
      const crowd = (m.crowd || []).map((c) => `${c.name}: ${c.text}`);
      window.ui.showLines('', [...m.lines, ...crowd, ...m.after]);
      window.ui.log(null, 'The south wall of the pass is gone.', true);
    });

    // Someone else set it off — we only see the result.
    window.net.on('exitOpened', (m) => this.openSecret(m.tiles));

    window.net.on('died', (m) => {
      this.cameras.main.flash(400, 190, 30, 30);
      this.teleport(m.x, m.y);
      window.ui.showLines('', m.lines, { dead: true });
    });

    window.net.on('_close', () => window.ui.setOnline(0, true));
  }
}
window.WorldScene = WorldScene;
