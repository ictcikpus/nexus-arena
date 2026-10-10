import * as THREE from 'three';
import { Client } from './network/cloudflare-client.js';
import './style.css';

const DEFAULT_SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;
const COLORS = ['#4fe6d1', '#ff7b54', '#a88bff', '#ffe06b', '#77a8ff', '#ff7ecb'];
const MAX_PLAYERS = 8;
const FINISH_Z = -103;
const CHECKPOINT_Z = [-42, -79];
const GAPS = [{ start: -38, end: -33 }, { start: -75, end: -71 }];
const OBSTACLES = [
  { x: -4.2, z: -14, width: 5.5, depth: 1.25, height: 1.65 },
  { x: 4.2, z: -14, width: 5.5, depth: 1.25, height: 1.65 },
  { x: -2.6, z: -23, width: 8.6, depth: 1.25, height: 1.55 },
  { x: 5.4, z: -23, width: 3.1, depth: 1.25, height: 1.55 },
  { x: -6, z: -47, width: 2, depth: 1.25, height: 1.7 },
  { x: 2.35, z: -47, width: 9.2, depth: 1.25, height: 1.7 },
  { x: -4.2, z: -58, width: 5.5, depth: 1.25, height: 1.55 },
  { x: 4.2, z: -58, width: 5.5, depth: 1.25, height: 1.55 },
  { x: -2.6, z: -84, width: 8.6, depth: 1.25, height: 1.7 },
  { x: 5.4, z: -84, width: 3.1, depth: 1.25, height: 1.7 },
  { x: -4.2, z: -94, width: 5.5, depth: 1.25, height: 1.55 },
  { x: 4.2, z: -94, width: 5.5, depth: 1.25, height: 1.55 }
];

const $ = (id) => document.getElementById(id);
const ui = {
  menu: $('menu-screen'), lobby: $('lobby-screen'), results: $('results-screen'), hud: $('hud'),
  menuStatus: $('menu-status'), name: $('player-name'), roomCode: $('room-code'), serverUrl: $('server-url'),
  connectionPill: $('connection-pill'), connectionText: $('connection-text'), loading: $('loading-overlay'),
  loadingTitle: $('loading-title'), loadingCopy: $('loading-copy'), toast: $('toast'),
  lobbyCode: $('lobby-room-code'), playersGrid: $('players-grid'), playerCount: $('player-count'),
  lobbyPhase: $('lobby-phase'), lobbyMessage: $('lobby-message'), readyButton: $('ready-button'),
  timer: $('timer'), position: $('position'), progress: $('progress-fill'), checkpoint: $('checkpoint-label'),
  raceStatus: $('race-status'), resultsList: $('results-list'), resultsTitle: $('results-title'),
  resultsSubtitle: $('results-subtitle'), rematchMessage: $('rematch-message'),
  joystick: $('joystick'), joystickKnob: $('joystick-knob'), touchJump: $('touch-jump'), touchSprint: $('touch-sprint')
};

let selectedColor = COLORS[0];
let client = null;
let room = null;
let stateSnapshot = null;
let leavingIntentionally = false;
let toastTimer = null;
let storedServerUrl = localStorage.getItem('nexusArenaServerUrl') || '';
if (storedServerUrl.includes('onrender.com')) storedServerUrl = '';
let selectedServerUrl = storedServerUrl || DEFAULT_SERVER_URL;
let keys = new Set();
let touchMove = { x: 0, z: 0 };
let touchJumpHeld = false;
let touchSprintHeld = false;
let inputSeq = 0;
let lastInputSent = 0;
let previousPhase = '';
let localPrediction = null;
let localAuth = null;
let roomPlayers = new Map();

ui.serverUrl.value = selectedServerUrl;

function normalizeServerUrl(value) {
  const raw = String(value || '').trim().replace(/\/$/, '');
  if (!raw) throw new Error('Alamat server belum diisi.');
  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Alamat server harus menggunakan HTTP atau HTTPS.');
  return parsed.origin;
}
function setConnection(status, text) {
  ui.connectionPill.classList.toggle('online', status === 'online');
  ui.connectionPill.classList.toggle('offline', status === 'offline');
  ui.connectionText.textContent = text;
}
function showToast(message, duration = 3000) {
  ui.toast.textContent = message;
  ui.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), duration);
}
function setLoading(show, title = 'MENGHUBUNGKAN', copy = 'Mencari pintu masuk ke arena...') {
  ui.loading.classList.toggle('hidden', !show);
  ui.loadingTitle.textContent = title;
  ui.loadingCopy.textContent = copy;
}
function showScreen(name) {
  for (const [key, element] of [['menu', ui.menu], ['lobby', ui.lobby], ['results', ui.results]]) {
    element.classList.toggle('active', key === name);
  }
  ui.hud.classList.toggle('hidden', name !== 'game');
  document.body.classList.toggle('playing', name === 'game');
  if (name !== 'game') keys.clear();
}
function getPlayerOptions() {
  const name = String(ui.name.value || 'Runner').replace(/[<>\u0000-\u001F]/g, '').trim().slice(0, 16) || 'Runner';
  return { name, color: selectedColor };
}
function getServerUrl() {
  return normalizeServerUrl(selectedServerUrl || DEFAULT_SERVER_URL);
}
function getPlayerEntries(state = room?.state) {
  if (!state?.players) return [];
  const entries = [];
  state.players.forEach((player, sessionId) => entries.push({ sessionId, player }));
  return entries;
}
function readyCount(state = room?.state) {
  return getPlayerEntries(state).filter(({ player }) => player.ready).length;
}
function playerForThisClient(state = room?.state) {
  if (!room || !state?.players) return null;
  return state.players.get(room.sessionId) || null;
}
function safeTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(total / 60).toString().padStart(2, '0');
  const secs = (total % 60).toFixed(1).padStart(4, '0');
  return `${mins}:${secs}`;
}
function formatRoomCode(code) { return code || '--------'; }

async function connectToRoom(mode) {
  if (room) await leaveCurrentRoom(false);
  setLoading(true, mode === 'join' ? 'MASUK KE ROOM' : 'MENGHUBUNGKAN', 'Menghubungkan browser ke server multiplayer...');
  ui.menuStatus.textContent = 'Sedang menghubungkan ke server...';
  leavingIntentionally = false;
  try {
    client = new Client(getServerUrl());
    const options = getPlayerOptions();
    if (mode === 'quick') room = await client.joinOrCreate('arena', options);
    else if (mode === 'create') room = await client.create('private_arena', options);
    else {
      const roomId = String(ui.roomCode.value || '').trim();
      if (!roomId) throw new Error('Masukkan kode room teman.');
      room = await client.joinById(roomId, options);
    }
    stateSnapshot = room.state;
    room.onStateChange((state) => {
      stateSnapshot = state;
      handleStateChange(state);
    });
    room.onMessage('respawn', (data) => showToast(`Jatuh! Respawn checkpoint. Penalti +${Number(data?.penalty || 2.5).toFixed(1)} detik.`));
    room.onMessage('notice', (data) => { if (data?.text) showToast(data.text); });
    room.onLeave((code) => {
      const oldRoom = room;
      room = null;
      stateSnapshot = null;
      roomPlayers.clear();
      localPrediction = null;
      localAuth = null;
      if (!leavingIntentionally) {
        setConnection('offline', 'KONEKSI TERPUTUS');
        showScreen('menu');
        ui.menuStatus.textContent = `Koneksi room berakhir (kode ${code}). Silakan coba masuk kembali.`;
        if (oldRoom) showToast('Koneksi room berakhir.');
      }
    });
    setConnection('online', 'TERHUBUNG');
    ui.lobbyCode.textContent = formatRoomCode(room.roomId);
    handleStateChange(room.state);
    setLoading(false);
    ui.menuStatus.textContent = 'Terhubung ke server multiplayer.';
  } catch (error) {
    setLoading(false);
    room = null;
    stateSnapshot = null;
    setConnection('offline', 'SERVER TIDAK TERSEDIA');
    const message = error?.message || 'Tidak dapat bergabung ke room.';
    ui.menuStatus.textContent = message;
    showToast(`Tidak dapat terhubung: ${message}`, 5000);
  }
}
async function leaveCurrentRoom(returnToMenu = true) {
  if (!room) { if (returnToMenu) showScreen('menu'); return; }
  leavingIntentionally = true;
  const old = room;
  room = null;
  stateSnapshot = null;
  roomPlayers.clear();
  localPrediction = null;
  localAuth = null;
  try { await old.leave(); } catch { /* room may already be closed */ }
  if (returnToMenu) {
    showScreen('menu');
    setConnection('idle', 'SIAP TERHUBUNG');
    ui.menuStatus.textContent = 'Kembali ke menu. Pilih mode untuk bermain lagi.';
  }
}
function handleStateChange(state) {
  if (!room || !state) return;
  ui.lobbyCode.textContent = formatRoomCode(room.roomId);
  const phase = state.status;
  if (phase === 'running' && previousPhase !== 'running') {
    // Start/restart at the server's spawn position rather than retaining stale prediction.
    localPrediction = null;
    localAuth = null;
  }
  if (phase === 'waiting' || phase === 'countdown') {
    showScreen('lobby');
    renderLobby(state);
  } else if (phase === 'running') {
    showScreen('game');
    if (previousPhase !== 'running') showToast('GO! Lewati rintangan dan capai finis.', 2200);
  } else if (phase === 'results') {
    showScreen('results');
    renderResults(state);
  }
  if (phase !== previousPhase && phase === 'waiting') ui.rematchMessage.textContent = '';
  previousPhase = phase;
}
function renderLobby(state) {
  const entries = getPlayerEntries(state);
  ui.playerCount.textContent = String(entries.length);
  ui.lobbyPhase.textContent = state.status === 'countdown' ? `MULAI DALAM ${state.countdown || 1}` : 'MENUNGGU PEMAIN';
  ui.readyButton.disabled = state.status === 'countdown';
  const own = playerForThisClient(state);
  ui.readyButton.innerHTML = state.status === 'countdown' ? `MULAI ${state.countdown || ''}...` : own?.ready ? 'BATAL SIAP <span>↶</span>' : 'SAYA SIAP <span>✓</span>';
  const ready = readyCount(state);
  if (state.status === 'countdown') ui.lobbyMessage.textContent = `Arena dimulai dalam ${state.countdown || 1} detik. Bersiaplah!`;
  else if (entries.length < 2) ui.lobbyMessage.textContent = 'Bagikan kode room. Minimal dua pemain harus bergabung dan menekan Siap.';
  else ui.lobbyMessage.textContent = `${ready} pemain siap. Tekan Siap untuk bergabung dalam start berikutnya.`;
  ui.playersGrid.replaceChildren();
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const entry = entries[i];
    const slot = document.createElement('div');
    slot.className = `player-slot${entry?.player.ready ? ' ready' : ''}${entry ? '' : ' empty'}`;
    const dot = document.createElement('span');
    dot.className = 'avatar-dot';
    if (entry) { dot.style.background = entry.player.color || COLORS[0]; dot.style.color = entry.player.color || COLORS[0]; }
    const name = document.createElement('span');
    name.className = 'slot-name';
    name.textContent = entry ? `${entry.player.name || 'Runner'}${entry.sessionId === room.sessionId ? ' (Anda)' : ''}` : 'Menunggu...';
    const status = document.createElement('span');
    status.className = 'slot-state';
    status.textContent = entry ? (entry.player.ready ? 'READY ✓' : 'NOT READY') : 'OPEN SLOT';
    slot.append(dot, name, status);
    ui.playersGrid.append(slot);
  }
}
function renderResults(state) {
  const entries = getPlayerEntries(state);
  const ranked = [...entries].sort((a, b) => {
    const af = a.player.finished ? 1 : 0, bf = b.player.finished ? 1 : 0;
    if (af !== bf) return bf - af;
    if (af && bf) return a.player.finishTime - b.player.finishTime;
    return b.player.progress - a.player.progress;
  });
  const own = playerForThisClient(state);
  ui.resultsTitle.textContent = own?.finished ? 'Kamu berhasil finis!' : 'Waktu habis!';
  ui.resultsSubtitle.textContent = `${entries.length} pemain · ${safeTime(state.elapsed || 0)} waktu pertandingan`;
  ui.resultsList.replaceChildren();
  ranked.forEach(({ sessionId, player }, index) => {
    const row = document.createElement('div'); row.className = 'result-row';
    const rank = document.createElement('span'); rank.className = 'result-rank'; rank.textContent = String(index + 1).padStart(2, '0');
    const color = document.createElement('span'); color.className = 'result-color'; color.style.background = player.color || COLORS[0]; color.style.color = player.color || COLORS[0];
    const name = document.createElement('span'); name.className = 'result-name'; name.textContent = `${player.name || 'Runner'}${sessionId === room.sessionId ? ' (Anda)' : ''}`;
    const time = document.createElement('span'); time.className = `result-time${player.finished ? '' : ' unfinished'}`; time.textContent = player.finished ? safeTime(player.finishTime) : `${Math.floor(player.progress || 0)}%`;
    row.append(rank, color, name, time); ui.resultsList.append(row);
  });
  const ownState = own;
  ui.rematchMessage.textContent = ownState?.ready ? 'Permintaan rematch terkirim. Menunggu pemain lain...' : 'Pilih Rematch untuk memulai voting pertandingan berikutnya.';
}

$('color-palette').addEventListener('click', (event) => {
  const button = event.target.closest('[data-color]');
  if (!button) return;
  selectedColor = button.dataset.color;
  document.querySelectorAll('.color-swatch').forEach((el) => el.classList.toggle('selected', el === button));
});
$('quick-match').addEventListener('click', () => connectToRoom('quick'));
$('create-room').addEventListener('click', () => connectToRoom('create'));
$('join-room').addEventListener('click', () => connectToRoom('join'));
ui.roomCode.addEventListener('keydown', (event) => { if (event.key === 'Enter') connectToRoom('join'); });
$('save-server').addEventListener('click', () => {
  try {
    selectedServerUrl = normalizeServerUrl(ui.serverUrl.value);
    localStorage.setItem('nexusArenaServerUrl', selectedServerUrl);
    ui.serverUrl.value = selectedServerUrl;
    ui.menuStatus.textContent = 'Alamat server disimpan di browser ini.';
    showToast('Alamat server disimpan.');
  } catch (error) { showToast(error.message); }
});
$('copy-room').addEventListener('click', async () => {
  if (!room) return;
  try { await navigator.clipboard.writeText(room.roomId); showToast('Kode room disalin. Kirim kepada teman.'); }
  catch { showToast(`Kode room: ${room.roomId}`, 6000); }
});
ui.readyButton.addEventListener('click', () => {
  if (!room || room.state.status !== 'waiting') return;
  const player = playerForThisClient();
  room.send('ready', { ready: !player?.ready });
});
$('leave-room').addEventListener('click', () => leaveCurrentRoom(true));
$('home-button').addEventListener('click', () => leaveCurrentRoom(true));
$('rematch-button').addEventListener('click', () => {
  if (!room || room.state.status !== 'results') return;
  room.send('rematch');
  ui.rematchMessage.textContent = 'Permintaan rematch terkirim. Menunggu pemain lain...';
});
$('quit-game').addEventListener('click', () => leaveCurrentRoom(true));

window.addEventListener('keydown', (event) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code) && document.body.classList.contains('playing')) event.preventDefault();
  if (event.code === 'Escape' && room && room.state.status === 'running') { leaveCurrentRoom(true); return; }
  keys.add(event.code);
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
function setTouchJump(value) { touchJumpHeld = value; }
function setTouchSprint(value) { touchSprintHeld = value; }
ui.touchJump.addEventListener('pointerdown', (e) => { e.preventDefault(); setTouchJump(true); ui.touchJump.setPointerCapture?.(e.pointerId); });
['pointerup', 'pointercancel', 'lostpointercapture'].forEach((eventName) => ui.touchJump.addEventListener(eventName, () => setTouchJump(false)));
ui.touchSprint.addEventListener('pointerdown', (e) => { e.preventDefault(); setTouchSprint(true); ui.touchSprint.setPointerCapture?.(e.pointerId); });
['pointerup', 'pointercancel', 'lostpointercapture'].forEach((eventName) => ui.touchSprint.addEventListener(eventName, () => setTouchSprint(false)));
let joystickPointer = null;
function updateJoystick(event) {
  const rect = ui.joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const max = rect.width * .34;
  let dx = event.clientX - cx, dy = event.clientY - cy;
  const length = Math.hypot(dx, dy);
  if (length > max) { dx = dx / length * max; dy = dy / length * max; }
  ui.joystickKnob.style.left = `calc(50% + ${dx}px)`;
  ui.joystickKnob.style.top = `calc(50% + ${dy}px)`;
  touchMove = { x: dx / max, z: dy / max };
}
ui.joystick.addEventListener('pointerdown', (event) => { event.preventDefault(); joystickPointer = event.pointerId; ui.joystick.setPointerCapture(event.pointerId); updateJoystick(event); });
ui.joystick.addEventListener('pointermove', (event) => { if (event.pointerId === joystickPointer) updateJoystick(event); });
function releaseJoystick() { joystickPointer = null; touchMove = { x: 0, z: 0 }; ui.joystickKnob.style.left = '50%'; ui.joystickKnob.style.top = '50%'; }
['pointerup', 'pointercancel', 'lostpointercapture'].forEach((eventName) => ui.joystick.addEventListener(eventName, releaseJoystick));

function currentInput() {
  if (!room || room.state.status !== 'running') return { x: 0, z: 0, jump: false, sprint: false };
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let z = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  x += touchMove.x; z += touchMove.z;
  const mag = Math.hypot(x, z); if (mag > 1) { x /= mag; z /= mag; }
  return { x, z, jump: keys.has('Space') || touchJumpHeld, sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') || touchSprintHeld };
}

// Three.js scene — all art is procedural so the project has no external paid asset dependency.
let renderer, scene, camera, clock;
const avatarObjects = new Map();
const materialCache = new Map();
let lastHudUpdate = 0;

function mat(color, roughness = .7, metalness = .1) {
  const key = `${color}-${roughness}-${metalness}`;
  if (!materialCache.has(key)) materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  return materialCache.get(key);
}
function addBox(parent, w, h, d, x, y, z, material, cast = true, receive = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = cast; mesh.receiveShadow = receive; parent.add(mesh); return mesh;
}
function addTrackPiece(centerZ, length) {
  const deck = addBox(scene, 15, .6, length, 0, -.32, centerZ, mat('#202c4c', .83, .2));
  const top = addBox(scene, 14.75, .08, length - .15, 0, -.015, centerZ, mat('#28395e', .78, .16), false, true);
  const leftRail = addBox(scene, .18, .24, length, -7.48, .12, centerZ, mat('#4fe6d1', .38, .5));
  const rightRail = addBox(scene, .18, .24, length, 7.48, .12, centerZ, mat('#a88bff', .38, .5));
  leftRail.castShadow = rightRail.castShadow = false;
  for (let z = centerZ - length / 2 + 3; z < centerZ + length / 2; z += 8) {
    addBox(scene, .08, .025, 1.1, -5.9, .04, z, mat('#4fe6d1', .5, .25), false, false);
    addBox(scene, .08, .025, 1.1, 5.9, .04, z, mat('#4fe6d1', .5, .25), false, false);
  }
  return deck;
}
function addObstacle(block, index) {
  const hue = index % 2 ? '#6657b8' : '#217f89';
  addBox(scene, block.width, block.height, block.depth, block.x, block.height / 2, block.z, mat(hue, .42, .3));
  addBox(scene, block.width, .08, block.depth + .08, block.x, block.height + .02, block.z, mat(index % 2 ? '#a88bff' : '#4fe6d1', .32, .45), false, false);
  // Small repeating light tiles provide readability without expensive particle effects.
  const tileCount = Math.min(3, Math.max(2, Math.floor(block.width / 3)));
  for (let i = 0; i < tileCount; i++) {
    const tx = block.x - block.width / 2 + (i + .5) * block.width / tileCount;
    addBox(scene, .08, .14, .08, tx, block.height * .68, block.z + block.depth / 2 + .045, mat('#d3fff7', .3, .15), false, false);
  }
}
function addCheckpoint(z, index) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, .12, 12, 42), new THREE.MeshStandardMaterial({ color: index ? '#a88bff' : '#4fe6d1', emissive: index ? '#4938a2' : '#147c78', emissiveIntensity: 1.3, metalness: .4, roughness: .3 }));
  ring.position.set(0, 2.4, z); ring.castShadow = false; scene.add(ring);
  const footMat = mat(index ? '#a88bff' : '#4fe6d1', .35, .45);
  addBox(scene, .24, 2.4, .24, -2.1, 1.2, z, footMat, false, false);
  addBox(scene, .24, 2.4, .24, 2.1, 1.2, z, footMat, false, false);
  const label = createTextSprite(`CHECKPOINT ${String(index + 1).padStart(2, '0')}`, index ? '#c2b3ff' : '#92fff0');
  label.position.set(0, 4.15, z); label.scale.set(3.8, .72, 1); scene.add(label);
}
function createTextSprite(text, color = '#ffffff') {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8,14,34,.78)';
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(12, 16, 488, 94, 22); ctx.fill(); } else ctx.fillRect(12,16,488,94);
  ctx.strokeStyle = color; ctx.globalAlpha = .8; ctx.lineWidth = 3; ctx.strokeRect(13,17,486,92); ctx.globalAlpha = 1;
  ctx.fillStyle = color; ctx.font = 'bold 38px Manrope, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text.slice(0, 20), 256, 65);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  return sprite;
}
function addFinishGate(z) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, .22, 14, 52), new THREE.MeshStandardMaterial({ color: '#ffe06b', emissive: '#b87918', emissiveIntensity: 1.35, metalness: .35, roughness: .28 }));
  ring.position.set(0, 3.05, z); scene.add(ring);
  addBox(scene, .48, 3.1, .55, -4.2, 1.55, z, mat('#ff7b54', .45, .35));
  addBox(scene, .48, 3.1, .55, 4.2, 1.55, z, mat('#ff7b54', .45, .35));
  const label = createTextSprite('FINISH', '#ffe06b'); label.position.set(0, 5.35, z); label.scale.set(3.1,.78,1); scene.add(label);
  for (let i = 0; i < 6; i++) {
    const x = -5 + i * 2;
    addBox(scene, .11, .12, .8, x, .07, z + 1.1, mat(i % 2 ? '#ffe06b' : '#ff7b54', .35, .2), false, false);
  }
}
function createArena() {
  scene = new THREE.Scene(); scene.background = new THREE.Color('#111832'); scene.fog = new THREE.FogExp2('#111832', .0084);
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, .1, 260);
  camera.position.set(0, 15, 27); camera.lookAt(0, 1, -23);
  const hemi = new THREE.HemisphereLight('#c7e9ff', '#1a173b', 2.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff2d2', 3.2); sun.position.set(-12, 24, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left = -20; sun.shadow.camera.right = 20; sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25; scene.add(sun);
  const fill = new THREE.DirectionalLight('#7a80ff', 1.4); fill.position.set(15, 10, -55); scene.add(fill);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: '#111e43', roughness: .35, metalness: .25, emissive: '#0b1844', emissiveIntensity: .5 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, -9, -48); water.receiveShadow = true; scene.add(water);
  // Three broad safe platform sections separated by two jumpable gaps.
  addTrackPiece(-12.5, 41);
  addTrackPiece(-54.5, 33);
  addTrackPiece(-91.5, 33);
  OBSTACLES.forEach(addObstacle);
  addCheckpoint(CHECKPOINT_Z[0], 0); addCheckpoint(CHECKPOINT_Z[1], 1); addFinishGate(FINISH_Z);
  // Side pylons guide the route and add depth, with no additional collision dependency.
  for (let z = 2; z >= -101; z -= 12) {
    for (const side of [-1, 1]) {
      const height = 1.4 + ((Math.abs(z) / 8) % 3) * .35;
      addBox(scene, .32, height, .32, side * 9.7, height / 2 - .05, z, mat(side < 0 ? '#345e85' : '#4f4387', .35, .42), false, false);
    }
  }
  // A subtle star field is a single BufferGeometry for performance.
  const starPositions = [];
  for (let i = 0; i < 260; i++) starPositions.push((Math.random() - .5) * 110, 7 + Math.random() * 35, -110 + Math.random() * 150);
  const starsGeometry = new THREE.BufferGeometry(); starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: '#c5d8ff', size: .16, transparent: true, opacity: .75 })); scene.add(stars);
}
function createAvatar(color, playerName) {
  const group = new THREE.Group();
  const accent = new THREE.Color(color || COLORS[0]);
  const bodyMat = new THREE.MeshStandardMaterial({ color: accent, roughness: .38, metalness: .18 });
  const darkMat = mat('#202742', .48, .12);
  const visorMat = new THREE.MeshStandardMaterial({ color: '#142743', emissive: accent, emissiveIntensity: .25, roughness: .2, metalness: .5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.34,.5,4,8), bodyMat); body.position.y = 1.02; body.castShadow = true; group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.34,16,12), new THREE.MeshStandardMaterial({ color: '#f7e8d6', roughness: .58 })); head.position.y = 1.77; head.castShadow = true; group.add(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(.255,16,12,0,Math.PI*2,0,Math.PI*.48), visorMat); visor.position.set(0,1.82,-.055); visor.rotation.x = -.08; group.add(visor);
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(.43,.48,.2), darkMat); backpack.position.set(0,1.02,.34); backpack.castShadow = true; group.add(backpack);
  const armGeo = new THREE.CapsuleGeometry(.105,.32,3,6);
  for (const side of [-1,1]) {
    const arm = new THREE.Mesh(armGeo, bodyMat); arm.position.set(side*.43,1.04,0); arm.rotation.z = side*-.24; arm.castShadow = true; group.add(arm);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.13,.31,3,6), darkMat); leg.position.set(side*.19,.36,0); leg.castShadow = true; group.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(.22,.12,.34), bodyMat); foot.position.set(side*.19,.12,-.06); foot.castShadow = true; group.add(foot);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.42,.035,7,24), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: .65, metalness: .25, roughness: .4 }));
  ring.rotation.x = Math.PI/2; ring.position.y = .03; group.add(ring);
  const label = createTextSprite((playerName || 'Runner').slice(0,16), color || '#ffffff'); label.position.set(0,2.65,0); label.scale.set(2.6,.65,1); group.add(label);
  scene.add(group);
  return { group, color: color || COLORS[0], name: playerName || 'Runner', target: new THREE.Vector3(), targetRot: 0, label };
}
function syncAvatarSet(state) {
  const keep = new Set();
  getPlayerEntries(state).forEach(({ sessionId, player }) => {
    keep.add(sessionId);
    let avatar = avatarObjects.get(sessionId);
    if (!avatar) { avatar = createAvatar(player.color, player.name); avatarObjects.set(sessionId, avatar); }
    avatar.name = player.name || 'Runner';
    avatar.target.set(player.x || 0, player.y || 0, player.z || 0);
    avatar.targetRot = player.rotY || 0;
    if (sessionId === room?.sessionId) {
      localAuth = { x: player.x || 0, y: player.y || 0, z: player.z || 0, rotY: player.rotY || 0, falling: !!player.falling, checkpoint: player.checkpoint || 0 };
      if (!localPrediction || previousPhase !== 'running') localPrediction = { ...localAuth, vy: 0, falling: !!player.falling };
      if (localPrediction && (Math.abs(localAuth.x-localPrediction.x)>4 || Math.abs(localAuth.z-localPrediction.z)>5 || Math.abs(localAuth.y-localPrediction.y)>6)) {
        localPrediction = { ...localAuth, vy: 0, falling: !!player.falling };
      }
    }
  });
  for (const [sessionId, avatar] of avatarObjects) {
    if (!keep.has(sessionId)) { scene.remove(avatar.group); avatar.group.traverse((obj) => { if (obj.geometry && !obj.geometry.userData.shared) obj.geometry.dispose?.(); }); avatarObjects.delete(sessionId); }
  }
}
function isGap(z) { return GAPS.some((gap) => z < gap.end && z > gap.start); }
function localCollides(x,z,y) {
  if (y > 2.0) return false;
  return OBSTACLES.some((o) => y < o.height - .03 && Math.abs(x-o.x) < o.width/2+.42 && Math.abs(z-o.z) < o.depth/2+.45);
}
function predictLocal(dt, input) {
  if (!localPrediction || !localAuth) return;
  const p = localPrediction;
  const speed = input.sprint ? 9.3 : 7.5;
  let mx = input.x, mz = input.z;
  const magnitude = Math.hypot(mx,mz); if (magnitude > 1) { mx/=magnitude; mz/=magnitude; }
  if (!p.falling) {
    const nx = THREE.MathUtils.clamp(p.x + mx * speed * dt, -6.85, 6.85);
    const nz = THREE.MathUtils.clamp(p.z + mz * speed * dt, -106, 7);
    if (!localCollides(nx, p.z, p.y)) p.x = nx;
    if (!localCollides(p.x, nz, p.y)) p.z = nz;
    if (input.jump && p.y <= .03 && !isGap(p.z)) p.vy = 11.0;
    if (isGap(p.z) && p.y <= .06 && p.vy <= 0) p.falling = true;
  }
  p.vy -= 24 * dt; p.y += p.vy * dt;
  if (!isGap(p.z) && p.y <= 0 && !p.falling) { p.y=0; p.vy=0; }
  if (p.y < -5.5 || (localAuth && Math.abs(localAuth.z-p.z)>7)) {
    p.x = localAuth.x; p.y = localAuth.y; p.z = localAuth.z; p.vy=0; p.falling=localAuth.falling;
  }
  // Gentle server reconciliation keeps local controls responsive while server remains authoritative.
  const correction = Math.min(.22, dt * 4.2);
  p.x += (localAuth.x-p.x)*correction;
  p.z += (localAuth.z-p.z)*correction;
  p.y += (localAuth.y-p.y)*correction;
  if (Math.abs(localAuth.x-p.x)<.08 && Math.abs(localAuth.z-p.z)<.08) p.falling=localAuth.falling;
  if (Math.hypot(mx,mz)>.1) p.rotY = Math.atan2(mx, -mz);
  else p.rotY = localAuth.rotY;
}
function updateHud(now) {
  if (!room || !stateSnapshot || stateSnapshot.status !== 'running' || now-lastHudUpdate < 100) return;
  lastHudUpdate = now;
  const entries = getPlayerEntries(stateSnapshot);
  const own = playerForThisClient(stateSnapshot);
  ui.timer.textContent = safeTime(stateSnapshot.elapsed || 0);
  const ranked = [...entries].sort((a,b) => {
    if (a.player.finished !== b.player.finished) return a.player.finished ? -1 : 1;
    if (a.player.finished && b.player.finished) return a.player.finishTime-b.player.finishTime;
    return b.player.progress-a.player.progress;
  });
  const rank = ranked.findIndex((entry) => entry.sessionId === room.sessionId) + 1;
  ui.position.innerHTML = `${Math.max(1,rank)} <small>/ ${entries.length}</small>`;
  ui.progress.style.width = `${Math.max(0, Math.min(100, own?.progress || 0))}%`;
  ui.checkpoint.textContent = `CHECKPOINT ${String((own?.checkpoint || 0)+1).padStart(2,'0')}`;
  ui.raceStatus.textContent = own?.finished ? 'FINISHED!' : own?.falling ? 'FALLING' : 'RUN!';
}
function animate() {
  requestAnimationFrame(animate);
  if (!renderer || !scene || !camera) return;
  const dt = Math.min(clock.getDelta(), .05);
  const now = performance.now();
  if (room && room.state) {
    stateSnapshot = room.state;
    syncAvatarSet(room.state);
  }
  const inGame = room && room.state?.status === 'running';
  if (inGame) predictLocal(dt, currentInput());
  const meId = room?.sessionId;
  let myAvatar = null;
  for (const [sessionId, avatar] of avatarObjects) {
    if (sessionId === meId) {
      myAvatar = avatar;
      if (inGame && localPrediction) {
        avatar.group.position.set(localPrediction.x, localPrediction.y, localPrediction.z);
        avatar.group.rotation.y = localPrediction.rotY || 0;
      } else {
        avatar.group.position.lerp(avatar.target, .25);
        avatar.group.rotation.y += (avatar.targetRot-avatar.group.rotation.y)*.18;
      }
    } else {
      avatar.group.position.lerp(avatar.target, .22);
      let angle = avatar.targetRot-avatar.group.rotation.y;
      while (angle > Math.PI) angle -= Math.PI*2;
      while (angle < -Math.PI) angle += Math.PI*2;
      avatar.group.rotation.y += angle*.18;
    }
  }
  if (inGame && myAvatar) {
    const target = new THREE.Vector3(myAvatar.group.position.x, myAvatar.group.position.y+1.0, myAvatar.group.position.z-2.6);
    const desired = new THREE.Vector3(myAvatar.group.position.x, myAvatar.group.position.y+4.8, myAvatar.group.position.z+8.5);
    camera.position.lerp(desired, 1-Math.exp(-dt*4.4));
    const look = camera.userData.lookTarget || new THREE.Vector3();
    look.lerp(target, 1-Math.exp(-dt*5)); camera.userData.lookTarget = look; camera.lookAt(look);
  } else {
    camera.position.x = Math.sin(now*.00016)*1.9;
    camera.position.y = 14.5 + Math.sin(now*.00021)*.5;
    camera.position.z = 25;
    camera.lookAt(0,1,-27);
  }
  updateHud(now);
  renderer.render(scene,camera);
}
function initThree() {
  const canvas = $('game-canvas');
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (error) {
    console.error(error); showToast('Perangkat/browser ini tidak menyediakan WebGL yang diperlukan untuk game 3D.', 8000); return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  clock = new THREE.Clock();
  createArena();
  window.addEventListener('resize', () => {
    if (!renderer || !camera) return;
    camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6)); renderer.setSize(window.innerWidth,window.innerHeight,false);
  });
  animate();
}
setInterval(() => {
  if (room) {
    try { room.send('heartbeat', { ts: Date.now() }); } catch { /* connection may be closing */ }
  }
}, 25000);

setInterval(() => {
  if (!room || room.state?.status !== 'running') return;
  const input = currentInput();
  inputSeq += 1;
  try { room.send('input', { ...input, seq: inputSeq }); } catch (error) { console.warn('Input send failed', error); }
  lastInputSent = performance.now();
}, 100);

initThree();
setConnection('idle', 'SIAP TERHUBUNG');
