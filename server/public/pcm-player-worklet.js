class PCMPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this._currentChunk = null;
    this._idx = 0;
    this.port.onmessage = (e) => {
      if (e.data && e.data.byteLength) {
        this.queue.push(new Int16Array(e.data));
      } else {
        this.queue = [];
        this._currentChunk = null;
        this._idx = 0;
      }
    };
  }
  process(_, outputs) {
    const out = outputs[0][0];
    let i = 0;
    while (i < out.length) {
      if (!this._currentChunk || this._idx >= this._currentChunk.length) {
        this._currentChunk = this.queue.shift();
        this._idx = 0;
        if (!this._currentChunk) break;
      }
      const s = this._currentChunk[this._idx++] / 32768;
      out[i++] = s;
      if (i < out.length) out[i++] = s;
    }
    for (; i < out.length; i++) out[i] = 0;
    return true;
  }
}
registerProcessor('pcm-player', PCMPlayer);