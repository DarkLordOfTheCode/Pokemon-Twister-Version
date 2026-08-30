// Turn-based battle overlay. Runs on top of a paused WorldScene.
const TYPE_COLOR = {
  normal: 0xa8a878, fire: 0xf08030, water: 0x6890f0, electric: 0xf8d030,
  grass: 0x78c850, ice: 0x98d8d8, fighting: 0xc03028, poison: 0xa040a0,
  ground: 0xe0c068, flying: 0xa890f0, psychic: 0xf85888, bug: 0xa8b820,
  rock: 0xb8a038, ghost: 0x705898, dragon: 0x7038f8, dark: 0x705848,
  steel: 0xb8b8d0, fairy: 0xee99ac,
};

class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  create(data) {
    this.you = data.you;      // { name, mon, moves:[{key,name,type,power}] }
    this.foe = data.foe;      // { name, line, mon }
    this.busy = false;
    this.ended = false;

    const W = this.scale.width, H = this.scale.height;

    // background
    this.add.rectangle(0, 0, W, H, 0x101828).setOrigin(0);
    this.add.rectangle(0, 0, W, H * 0.62, 0x1d3a2e).setOrigin(0);   // battlefield
    this.add.rectangle(0, H * 0.62, W, H * 0.38, 0x0e1220).setOrigin(0);

    // foe (top-right) + your mon (bottom-left)
    this.drawMon(this.foe.mon, W * 0.72, H * 0.24, 54, true);
    this.drawMon(this.you.mon, W * 0.26, H * 0.50, 74, false);

    // info boxes
    this.foeBox = this.makeInfoBox(this.foe.mon, W * 0.04, H * 0.11, false);
    this.youBox = this.makeInfoBox(this.you.mon, W * 0.52, H * 0.40, true);

    // message line — lead with the opponent's custom battle line if they set one
    const intro = this.foe.line
      ? `${this.foe.name}: "${this.foe.line}"`
      : `${this.foe.name} wants to battle!`;
    this.msg = this.add.text(12, H * 0.64 + 4, intro,
      { fontFamily: 'monospace', fontSize: 11, color: '#ffd866', wordWrap: { width: W - 24 } });
    // after a beat, prompt for the first move
    this.time.delayedCall(1600, () => { if (!this.busy && !this.ended) this.msg.setColor('#f6f4ec').setText(`Go, ${this.you.mon.name}! Choose your move.`); });

    // move buttons
    this.moveButtons = [];
    this.buildMoves();

    this.wireNetwork();
    this.events.once('shutdown', () => this.unwire());
  }

  drawMon(mon, x, y, targetH, isFoe) {
    const key = `mon_${mon.key}`;
    this.add.ellipse(x, y + targetH * 0.5, targetH * 0.85, targetH * 0.26, 0x000000, 0.28); // shadow
    let body;
    if (mon.key && this.textures.exists(key)) {
      body = this.add.image(x, y, key).setOrigin(0.5, 0.5);
      body.setScale(targetH / body.height);
    } else {                                       // fallback: type-coloured blob
      const color = TYPE_COLOR[mon.types[0]] || 0xaaaaaa;
      body = this.add.circle(x, y, targetH * 0.5, color).setStrokeStyle(3, 0x0e1220);
      this.add.text(x, y, mon.name[0], { fontFamily: 'monospace', fontSize: targetH * 0.5,
        color: '#0e1220', fontStyle: 'bold' }).setOrigin(0.5);
    }
    this.add.text(x, y + targetH * 0.5 + 8, `GEN ${mon.gen}`, { fontFamily: 'monospace',
      fontSize: 9, color: '#ffd866' }).setOrigin(0.5);
    if (isFoe) this.foeBody = body; else this.youBody = body;
  }

  makeInfoBox(mon, x, y, isYou) {
    const w = 160, h = 42;
    this.add.rectangle(x, y, w, h, 0xf6f4ec).setOrigin(0).setStrokeStyle(2, 0x1b2233);
    this.add.text(x + 8, y + 4, mon.name, { fontFamily: 'monospace', fontSize: 11,
      color: '#1b2233', fontStyle: 'bold' });
    this.add.text(x + w - 8, y + 5, `Lv${mon.level}`, { fontFamily: 'monospace', fontSize: 10,
      color: '#1b2233', fontStyle: 'bold' }).setOrigin(1, 0);
    this.drawTypeChips(mon.types, x + 8, y + 19);
    // hp bar, with your own exact HP tucked into the gap beside the type chips
    this.add.rectangle(x + 8, y + 31, w - 16, 6, 0x555555).setOrigin(0);
    const fill = this.add.rectangle(x + 8, y + 31, w - 16, 6, 0x7ee787).setOrigin(0);
    const box = { fill, w: w - 16, max: mon.maxhp, hp: mon.hp,
                  txt: isYou ? this.add.text(x + w - 8, y + 19, `${mon.hp}/${mon.maxhp}`,
                    { fontFamily: 'monospace', fontSize: 9, color: '#1b2233' }).setOrigin(1, 0) : null };
    this.setHP(box, mon.hp);
    return box;
  }

  drawTypeChips(types, x, y) {
    let cx = x;
    types.forEach((t) => {
      const label = t.toUpperCase();
      const w = label.length * 5 + 8;
      this.add.rectangle(cx, y, w, 10, TYPE_COLOR[t] || 0x888888).setOrigin(0);
      this.add.text(cx + 4, y + 1, label, { fontFamily: 'monospace', fontSize: 7,
        color: '#0e1220', fontStyle: 'bold' });
      cx += w + 3;
    });
  }

  setHP(box, hp) {
    box.hp = Math.max(0, hp);
    const ratio = box.hp / box.max;
    box.fill.width = Math.max(0, box.w * ratio);
    box.fill.fillColor = ratio > 0.5 ? 0x7ee787 : ratio > 0.2 ? 0xf8d030 : 0xff7b72;
    if (box.txt) box.txt.setText(`${box.hp}/${box.max}`);
  }

  buildMoves() {
    const W = this.scale.width, H = this.scale.height;
    const moves = this.you.moves;
    const cols = 2, bw = 150, bh = 24, gx = 14, gy = 6;
    const x0 = W - cols * bw - (cols - 1) * gx - 12, y0 = H * 0.64 + 30;
    moves.forEach((mv, i) => {
      const bx = x0 + (i % cols) * (bw + gx), by = y0 + Math.floor(i / cols) * (bh + gy);
      const rect = this.add.rectangle(bx, by, bw, bh, 0x2c3550).setOrigin(0).setStrokeStyle(2, 0x3b5ca8)
        .setInteractive({ useHandCursor: true });
      const label = this.add.text(bx + 8, by + 6, `${mv.name}`, { fontFamily: 'monospace',
        fontSize: 10, color: '#f6f4ec' });
      this.add.rectangle(bx + bw - 6, by + bh / 2, 6, bh - 8, TYPE_COLOR[mv.type] || 0x888888).setOrigin(1, 0.5);
      this.add.text(bx + bw - 16, by + 7, mv.type, { fontFamily: 'monospace', fontSize: 8,
        color: '#9aa4bf' }).setOrigin(1, 0);
      rect.on('pointerover', () => !this.busy && rect.setFillStyle(0x3b5ca8));
      rect.on('pointerout', () => rect.setFillStyle(0x2c3550));
      rect.on('pointerdown', () => this.chooseMove(mv.key));
      this.moveButtons.push({ rect, label });
    });
    // flee
    const fx = 14, fy = y0;
    const flee = this.add.rectangle(fx, fy, 96, bh, 0x3a2030).setOrigin(0)
      .setStrokeStyle(2, 0xe3350d).setInteractive({ useHandCursor: true });
    this.add.text(fx + 30, fy + 6, 'Run', { fontFamily: 'monospace', fontSize: 10, color: '#ff9d9d' });
    flee.on('pointerdown', () => { if (!this.ended) window.net.send({ t: 'battleFlee' }); });
  }

  chooseMove(key) {
    if (this.busy || this.ended) return;
    this.busy = true;
    this.setButtons(false);
    this.msg.setText('Waiting for the other trainer…');
    window.net.send({ t: 'battleMove', move: key });
  }

  setButtons(on) {
    this.moveButtons.forEach((b) => { b.rect.setFillStyle(0x2c3550); b.rect.input && (b.rect.input.enabled = on); });
  }

  // ---------- network ----------
  wireNetwork() {
    this._onTurn = (m) => this.playTurn(m);
    this._onEnd = (m) => this.finish(m);
    this._onWait = () => this.msg.setText('Waiting for the other trainer…');
    window.net.on('battleTurn', this._onTurn);
    window.net.on('battleEnd', this._onEnd);
    window.net.on('battleWait', this._onWait);
  }
  unwire() {
    window.net.off('battleTurn', this._onTurn);
    window.net.off('battleEnd', this._onEnd);
    window.net.off('battleWait', this._onWait);
  }

  playTurn(m) {
    // sequentially reveal each attack in the log, then refresh both HP bars
    const lines = m.log.map((e) => {
      const effTxt = e.eff === 0 ? " It doesn't affect the target…"
        : e.eff > 1 ? " It's super effective!"
        : e.eff < 1 ? " It's not very effective…" : '';
      return `${e.byName} used ${e.move}! (-${e.dmg})${effTxt}`;
    });
    let i = 0;
    const step = () => {
      if (i < lines.length) {
        this.msg.setText(lines[i]); i++;
        this.flash(this.youBody); this.flash(this.foeBody);
        this.time.delayedCall(750, step);
      } else {
        this.setHP(this.youBox, m.youHp);
        this.setHP(this.foeBox, m.foeHp);
        if (!this.ended) {
          this.busy = false; this.setButtons(true);
          this.msg.setText('Choose your move.');
        }
      }
    };
    step();
  }

  flash(body) {
    if (!body) return;
    this.tweens.add({ targets: body, alpha: 0.3, yoyo: true, duration: 90, repeat: 1 });
  }

  finish(m) {
    this.ended = true;
    this.setButtons(false);
    const W = this.scale.width, H = this.scale.height;
    const banner = m.win ? 'You won the battle!' : 'You lost the battle…';
    const tail = m.win && m.xp
      ? `  +${m.xp} XP` + (m.levelUps.length ? `  ·  ${this.you.mon.name} grew to Lv${m.levelUps[m.levelUps.length - 1]}!` : '')
      : '';
    this.msg.setText(banner + tail);
    this.add.rectangle(W / 2, H / 2, W * 0.78, m.win && m.xp ? 62 : 50, 0x0e1220, 0.92)
      .setStrokeStyle(3, m.win ? 0x7ee787 : 0xff7b72);
    this.add.text(W / 2, H / 2 - (m.win && m.xp ? 10 : 0), banner, { fontFamily: 'monospace',
      fontSize: 14, color: m.win ? '#7ee787' : '#ff7b72', fontStyle: 'bold' }).setOrigin(0.5);
    if (m.win && m.xp) {
      const gained = m.levelUps.length
        ? `+${m.xp} XP — level up! Lv${m.levelUps[m.levelUps.length - 1]}`
        : `+${m.xp} XP  (${m.you.xp}/${m.you.xpNext} to Lv${m.you.level + 1})`;
      this.add.text(W / 2, H / 2 + 12, gained, { fontFamily: 'monospace', fontSize: 10,
        color: '#ffd866' }).setOrigin(0.5);
    }
    this.time.delayedCall(2100, () => {
      this.scene.resume('World');
      this.scene.stop();
    });
  }
}
window.BattleScene = BattleScene;
