// Thin WebSocket wrapper with a tiny pub/sub bus so scenes can subscribe by message type.
class Net {
  constructor() {
    this.handlers = {};
    this.ready = false;
    this.queue = [];
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}`);
    this.ws.onopen = () => {
      this.ready = true;
      this.queue.forEach((m) => this.ws.send(m));
      this.queue = [];
      this.emit('_open');
    };
    this.ws.onclose = () => { this.ready = false; this.emit('_close'); };
    this.ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      this.emit(msg.t, msg);
    };
  }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  off(type, fn) { this.handlers[type] = (this.handlers[type] || []).filter((h) => h !== fn); return this; }
  emit(type, msg) { (this.handlers[type] || []).forEach((fn) => fn(msg)); }
  send(obj) {
    const s = JSON.stringify(obj);
    if (this.ready) this.ws.send(s); else this.queue.push(s);
  }
}
window.net = new Net();
