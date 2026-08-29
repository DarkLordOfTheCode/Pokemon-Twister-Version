// Loads all art, then waits for the `init` packet before starting the world.
class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.load.image('grass',       '/assets/tiles/grass.png');
    this.load.image('grassflower', '/assets/tiles/flower.png');
    this.load.image('dirt',        '/assets/tiles/dirt.png');
    this.load.image('water',       '/assets/tiles/water.png');
    this.load.image('floor',       '/assets/tiles/floor.png');
    this.load.image('tree',   '/assets/objects/tree.png');
    this.load.image('mart',   '/assets/objects/mart.png');
    for (let i = 0; i < 19; i++) {
      const id = String(i).padStart(2, '0');
      this.load.image(`char_${id}`, `/assets/chars/char_${id}.png`);
    }

    const bar = this.add.rectangle(0, 0, 0, 4, 0xe3350d).setOrigin(0, 0.5);
    const cx = this.scale.width / 2, cy = this.scale.height / 2;
    this.add.text(cx, cy - 20, 'loading…', { fontFamily: 'monospace', fontSize: 14, color: '#f6f4ec' }).setOrigin(0.5);
    this.load.on('progress', (p) => { bar.width = this.scale.width * p; bar.x = 0; bar.y = cy; });
  }

  create() {
    // Hand off to the world once the server sends the map + our identity.
    window.net.on('init', (msg) => {
      if (this._started) return;
      this._started = true;
      this.scene.start('World', msg);
    });
    // If init already arrived before boot finished, WorldScene handles a replay via window.__initMsg.
    if (window.__initMsg) { this._started = true; this.scene.start('World', window.__initMsg); }
  }
}
window.BootScene = BootScene;
