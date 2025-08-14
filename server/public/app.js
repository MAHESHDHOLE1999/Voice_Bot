let ws, audioCtx, micNode, micStream, micRunning = false;
let playerNode;
let lastTurnAt = 0;

const statusE1 = document.getElementById('status');
const rttE1 = document.getElementById('rtt');
const transcriptE1 = document.getElementById('transcript');

const connectBtn = document.getElementById('connectBtn');
const micBtn = document.getElementById('micBtn');
const stopBtn = document.getElementById('stopBtn');

function setStatus(s) { statusE1.textContent = s; }
function appendTranscript(t, partial=false) {
  if (partial) {
    const lines = transcriptE1.textContent.split('\n');
    lines[lines.length - 1] = t;
    transcriptE1.textContent = lines.join('\n');
  } else {
    transcriptE1.textContent += (transcriptE1.textContent ? '\n' : '') + t;
  }
}

async function ensureAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
  await audioCtx.audioWorklet.addModule('/mic-worklet.js');
  await audioCtx.audioWorklet.addModule('/pcm-player-worklet.js');
  playerNode = new AudioWorkletNode(audioCtx, 'pcm-player');
  playerNode.connect(audioCtx.destination);
}

async function startMic() {
  if (micRunning) return;
  await ensureAudio();
  micStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, noiseSuppression: true, echoCancellation: true, autoGainControl: true } });
  const src = audioCtx.createMediaStreamSource(micStream);
  const worklet = new AudioWorkletNode(audioCtx, 'mic-processor');
  worklet.port.onmessage = (e) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(e.data); };
  src.connect(worklet);
  worklet.connect(audioCtx.destination);
  micNode = worklet;
  micRunning = true;
  micBtn.textContent = 'Mic Running…';
  micBtn.disabled = true;
  stopBtn.disabled = false;
}

function stopAll() {
  if (micNode) { micNode.disconnect(); micNode = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  micRunning = false;
  if (ws) { ws.close(); ws = null; }
  setStatus('stopped');
  micBtn.disabled = true;
  stopBtn.disabled = true;
}

connectBtn.onclick = async () => {
  await ensureAudio();
  if (ws && ws.readyState === WebSocket.OPEN) return;
  // ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://voice-bot-lake.vercel.app/ws`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { setStatus('connected'); micBtn.disabled = false; lastTurnAt = performance.now(); };
  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') { playerNode.port.postMessage(ev.data); return; }
    const msg = JSON.parse(ev.data);
    if (msg.type === 'ready') { setStatus(`ready (${msg.model})`); return; }
    if (msg.type === 'bargeIn') { playerNode.port.postMessage(new ArrayBuffer(0)); return; }
    if (msg.type === 'transcript') { appendTranscript(msg.text, msg.partial); return; }
    if (msg.type === 'turnComplete') { const now = performance.now(); rttE1.textContent = Math.max(0, Math.round(now - lastTurnAt)); lastTurnAt = now; return; }
    if (msg.type === 'error') setStatus('error: ' + msg.message);
  };
  ws.onclose = () => setStatus('closed');
};

micBtn.onclick = startMic;
stopBtn.onclick = stopAll;