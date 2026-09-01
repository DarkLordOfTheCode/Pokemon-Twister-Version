// Loads all art, then waits for the `init` packet before starting the world.
class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.load.image('grass',       '/assets/tiles/grass.png');
    this.load.image('grassflower', '/assets/tiles/flower.png');
    this.load.image('dirt',        '/assets/tiles/dirt.png');
    this.load.image('water',       '/assets/tiles/water.png');
    this.load.image('floor',       '/assets/tiles/floor.png');
    this.load.image('stone',       '/assets/tiles/stone.png');
    this.load.image('rubble',      '/assets/tiles/rubble.png');
    this.load.image('sand',        '/assets/tiles/sand.png');
    this.load.image('dune',        '/assets/tiles/dune.png');
    this.load.image('tallgrass',   '/assets/tiles/tallgrass.png');
    this.load.image('tree',   '/assets/objects/tree.png');
    this.load.image('mart',   '/assets/objects/mart.png');
    this.load.image('rock',   '/assets/objects/rock.png');
    this.load.image('cactus', '/assets/objects/cactus.png');
    // Walking trainers: six sheets of 4x4 frames (down/left/right/up, four frames
    // each) sliced by tools/slice_walkers.py. The wild Dragonite use the same
    // layout at a smaller frame size.
    for (let i = 0; i < 6; i++) {
      this.load.spritesheet(`walk_${i}`, `/assets/chars/walk_${i}.png`,
        { frameWidth: 32, frameHeight: 48 });
    }
    this.load.spritesheet('walk_dragonite', '/assets/mons/walk_dragonite.png',
      { frameWidth: 32, frameHeight: 32 });

    // The roster lives in server/data.js; pull the list, then queue one battle
    // sprite per species. Files added from `filecomplete` still load in this pass.
    this.load.json('speciesList', '/api/species');
    this.load.once('filecomplete-json-speciesList', (_k, _t, list) => {
      window.SPECIES_LIST = list;
      list.forEach((s) => this.load.image(`mon_${s.key}`, `/assets/mons/${s.key}.png`));
    });

    const bar = this.add.rectangle(0, 0, 0, 4, 0xe3350d).setOrigin(0, 0.5);
    const cx = this.scale.width / 2, cy = this.scale.height / 2;
    this.add.text(cx, cy - 20, 'loading…', { fontFamily: 'monospace', fontSize: 14, color: '#f6f4ec' }).setOrigin(0.5);
    this.load.on('progress', (p) => { bar.width = this.scale.width * p; bar.x = 0; bar.y = cy; });
  }

  create() {
    if (window.ui && window.SPECIES_LIST) window.ui.buildPartnerPicker(window.SPECIES_LIST);
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
