const MAX_PLAYERS = 8;
const MATCH_DURATION_SECONDS = 180;
const MOVE_SPEED = 7.5;
const SPRINT_SPEED = 9.3;
const JUMP_VELOCITY = 11;
const GRAVITY = 24;
const TRACK_MIN_X = -6.85;
const TRACK_MAX_X = 6.85;
const TRACK_MIN_Z = -106;
const TRACK_MAX_Z = 7;
const FINISH_Z = -103;
const CHECKPOINTS = [
  { z: -42, respawnZ: -42.5 },
  { z: -79, respawnZ: -79.5 }
];
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
const VALID_COLORS = new Set(['#4fe6d1', '#ff7b54', '#a88bff', '#ffe06b', '#77a8ff', '#ff7ecb']);
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const freshState = () => ({
  status: 'waiting', countdown: 0, elapsed: 0, duration: MATCH_DURATION_SECONDS,
  maxPlayers: MAX_PLAYERS, message: 'Menunggu minimal dua pemain siap', players: {}
});
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}
function inGap(z) { return GAPS.some((gap) => z < gap.end && z > gap.start); }
function collidesWithObstacle(x, z, y) {
  return OBSTACLES.some((o) => y < o.height - 0.03 && Math.abs(x - o.x) < o.width / 2 + 0.42 && Math.abs(z - o.z) < o.depth / 2 + 0.45);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'nexus-arena-cloudflare', multiplayer: 'durable-objects' });
    if (url.pathname === '/api/resolve') {
      const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName('global-directory'));
      return directory.fetch(request);
    }
    if (url.pathname === '/api/connect') {
      const code = String(url.searchParams.get('code') || '').toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) return json({ error: 'Kode room tidak valid.' }, 400);
      const id = env.ARENA_ROOMS.idFromName(code);
      const room = env.ARENA_ROOMS.get(id);
      url.searchParams.set('room', code);
      return room.fetch(new Request(url.toString(), request));
    }
    return env.ASSETS.fetch(request);
  }
};

export class RoomDirectory {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/resolve' && url.pathname !== '/resolve') return json({ error: 'Unknown directory route.' }, 404);
    const mode = url.searchParams.get('mode') || 'quick';
    if (mode === 'join') {
      const code = String(url.searchParams.get('code') || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code) || !(await this.ctx.storage.get(`room:${code}`))) return json({ error: 'Kode room tidak ditemukan.' }, 404);
      const status = await this.readRoomStatus(code);
      if (!status || status.status !== 'waiting') return json({ error: 'Room sudah dimulai atau tidak tersedia.' }, 409);
      if (status.playerCount >= MAX_PLAYERS) return json({ error: 'Room sudah penuh.' }, 409);
      return json({ roomId: code });
    }
    if (mode === 'create') {
      const code = await this.makeRoomCode();
      await this.ctx.storage.put(`room:${code}`, true);
      return json({ roomId: code });
    }
    if (mode !== 'quick') return json({ error: 'Mode room tidak dikenal.' }, 400);

    const current = await this.ctx.storage.get('quick-room');
    if (current) {
      const status = await this.readRoomStatus(current);
      if (status && status.status === 'waiting' && status.playerCount < MAX_PLAYERS) return json({ roomId: current });
    }
    const code = await this.makeRoomCode();
    await this.ctx.storage.put(`room:${code}`, true);
    await this.ctx.storage.put('quick-room', code);
    return json({ roomId: code });
  }
  async makeRoomCode() {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const code = randomCode();
      if (!(await this.ctx.storage.get(`room:${code}`))) return code;
    }
    throw new Error('Tidak dapat membuat kode room. Coba kembali.');
  }
  async readRoomStatus(code) {
    try {
      const stub = this.env.ARENA_ROOMS.get(this.env.ARENA_ROOMS.idFromName(code));
      const response = await stub.fetch('https://room.internal/status');
      if (!response.ok) return null;
      return await response.json();
    } catch { return null; }
  }
}

export class ArenaRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.state = freshState();
    this.inputs = {};
    this.verticalVelocity = {};
    this.countdownEndsAt = 0;
    this.lastUpdateAt = Date.now();
    this.lastPersistAt = 0;
    this.loopTimer = null;
    this.countdownTimer = null;
    this.persisting = false;
    this.initPromise = this.ctx.blockConcurrencyWhile(async () => {
      const [state, inputs, velocities, countdownEndsAt] = await Promise.all([
        this.ctx.storage.get('state'), this.ctx.storage.get('inputs'),
        this.ctx.storage.get('verticalVelocity'), this.ctx.storage.get('countdownEndsAt')
      ]);
      if (state) this.state = state;
      if (inputs) this.inputs = inputs;
      if (velocities) this.verticalVelocity = velocities;
      if (countdownEndsAt) this.countdownEndsAt = countdownEndsAt;
      if (this.state.status === 'running') this.startLoop();
      if (this.state.status === 'countdown') this.startCountdownTimer();
    });
  }

  async fetch(request) {
    await this.initPromise;
    const url = new URL(request.url);
    if (url.pathname === '/status') {
      return json({ status: this.state.status, playerCount: Object.keys(this.state.players).length, maxPlayers: MAX_PLAYERS });
    }
    if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'Expected WebSocket upgrade.' }, 426);
    if (this.state.status !== 'waiting') return json({ error: 'Pertandingan sudah dimulai. Coba room lain.' }, 409);
    if (Object.keys(this.state.players).length >= MAX_PLAYERS) return json({ error: 'Room sudah penuh.' }, 409);

    const name = this.cleanName(url.searchParams.get('name'));
    const requestedColor = url.searchParams.get('color');
    const color = VALID_COLORS.has(requestedColor) ? requestedColor : '#4fe6d1';
    const sessionId = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
    const index = Object.keys(this.state.players).length;
    this.state.players[sessionId] = {
      name, color, ready: false,
      x: ((index % 4) - 1.5) * 2.7, z: 3 + Math.floor(index / 4) * 2,
      y: 0, rotY: 0, finished: false, finishTime: 0, progress: 0,
      checkpoint: 0, falls: 0, penalty: 0, falling: false
    };
    this.inputs[sessionId] = { x: 0, z: 0, jump: false, jumpWasDown: false, sprint: false, seq: -1, lastAt: 0 };
    this.verticalVelocity[sessionId] = 0;
    this.state.message = `${Object.keys(this.state.players).length} pemain bergabung`;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ sessionId });
    server.send(JSON.stringify({ type: 'welcome', sessionId, roomId: url.searchParams.get('room') || 'ROOM' }));
    server.send(JSON.stringify({ type: 'state', state: this.state }));
    this.broadcastMessage('notice', { text: `${name} bergabung ke arena.` }, server);
    this.broadcastState();
    await this.persist();
    return new Response(null, { status: 101, webSocket: client });
  }

  cleanName(value) {
    const name = String(value ?? 'Runner').replace(/[<>\u0000-\u001F]/g, '').trim().slice(0, 16);
    return name || 'Runner';
  }
  get playerCount() { return Object.keys(this.state.players).length; }
  readyPlayers() { return Object.values(this.state.players).filter((p) => p.ready).length; }
  sockets() { return this.ctx.getWebSockets(); }
  send(ws, packet) { try { ws.send(JSON.stringify(packet)); } catch { /* closed socket */ } }
  broadcastState() { const packet = { type: 'state', state: this.state }; for (const ws of this.sockets()) this.send(ws, packet); }
  broadcastMessage(name, data, except = null) {
    const packet = { type: 'message', name, data };
    for (const ws of this.sockets()) if (ws !== except) this.send(ws, packet);
  }
  async persist() {
    if (this.persisting) return;
    this.persisting = true;
    try {
      await this.ctx.storage.put({
        state: this.state, inputs: this.inputs, verticalVelocity: this.verticalVelocity,
        countdownEndsAt: this.countdownEndsAt
      });
    } finally { this.persisting = false; }
  }

  async webSocketMessage(ws, message) {
    await this.initPromise;
    let packet;
    try { packet = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)); }
    catch { return; }
    if (packet?.type !== 'message' || typeof packet.name !== 'string') return;
    const attachment = ws.deserializeAttachment() || {};
    const sessionId = attachment.sessionId;
    if (!sessionId || !this.state.players[sessionId]) return;
    const data = packet.data || {};
    if (packet.name === 'ready') this.handleReady(sessionId, data);
    else if (packet.name === 'input') this.handleInput(sessionId, data);
    else if (packet.name === 'rematch') this.handleRematch(sessionId);
    else if (packet.name === 'heartbeat') { /* presence heartbeat only */ }
  }
  async webSocketClose(ws) { await this.removeSocket(ws); }
  async webSocketError(ws) { await this.removeSocket(ws); }
  async removeSocket(ws) {
    await this.initPromise;
    const attachment = ws.deserializeAttachment() || {};
    const id = attachment.sessionId;
    if (!id || !this.state.players[id]) return;
    const name = this.state.players[id].name || 'Pemain';
    delete this.state.players[id]; delete this.inputs[id]; delete this.verticalVelocity[id];
    this.state.message = `${name} keluar`;
    if (this.state.status === 'countdown' && this.readyPlayers() < 2) {
      this.state.status = 'waiting'; this.state.countdown = 0;
      this.state.message = 'Menunggu minimal dua pemain siap'; this.countdownEndsAt = 0;
      this.stopCountdownTimer();
      for (const player of Object.values(this.state.players)) player.ready = false;
    }
    await this.persist();
    this.broadcastState();
  }
  handleReady(sessionId, data) {
    if (this.state.status !== 'waiting') return;
    const player = this.state.players[sessionId];
    if (!player) return;
    player.ready = Boolean(data?.ready);
    const ready = this.readyPlayers();
    if (this.playerCount >= 2 && ready >= 2) this.startCountdown();
    else this.state.message = `Menunggu ${Math.max(0, 2 - ready)} pemain siap lagi`;
    this.broadcastState(); void this.persist();
  }
  startCountdown() {
    if (this.state.status !== 'waiting' || this.readyPlayers() < 2) return;
    this.state.status = 'countdown'; this.state.countdown = 3;
    this.state.message = 'Bersiap!'; this.countdownEndsAt = Date.now() + 3000;
    this.startCountdownTimer(); this.broadcastState(); void this.persist();
  }
  startCountdownTimer() {
    this.stopCountdownTimer();
    this.countdownTimer = setInterval(() => {
      if (this.state.status !== 'countdown') { this.stopCountdownTimer(); return; }
      const remaining = this.countdownEndsAt - Date.now();
      this.state.countdown = Math.max(0, Math.ceil(remaining / 1000));
      if (remaining <= 0) {
        this.stopCountdownTimer(); this.startMatch();
      } else this.broadcastState();
    }, 250);
  }
  stopCountdownTimer() { if (this.countdownTimer) clearInterval(this.countdownTimer); this.countdownTimer = null; }
  startMatch() {
    this.state.status = 'running'; this.state.elapsed = 0;
    this.state.countdown = 0; this.state.message = 'RUN!';
    for (const [sessionId, player] of Object.entries(this.state.players)) {
      player.ready = false; player.finished = false; player.finishTime = 0; player.progress = 0;
      player.checkpoint = 0; player.falls = 0; player.penalty = 0; player.falling = false;
      player.y = 0; player.rotY = 0;
      this.verticalVelocity[sessionId] = 0;
      const input = this.inputs[sessionId];
      if (input) Object.assign(input, { x: 0, z: 0, jump: false, jumpWasDown: false, sprint: false });
    }
    this.lastUpdateAt = Date.now(); this.lastPersistAt = this.lastUpdateAt;
    this.startLoop(); this.broadcastState(); void this.persist();
  }
  handleInput(sessionId, data) {
    if (this.state.status !== 'running') return;
    const input = this.inputs[sessionId];
    if (!this.state.players[sessionId] || !input || !data || typeof data !== 'object') return;
    const now = Date.now();
    if (now - input.lastAt < 12) return;
    input.lastAt = now;
    const seq = Number(data.seq);
    if (!Number.isFinite(seq) || seq <= input.seq) return;
    input.seq = seq;
    input.x = clamp(Number.isFinite(Number(data.x)) ? Number(data.x) : 0, -1, 1);
    input.z = clamp(Number.isFinite(Number(data.z)) ? Number(data.z) : 0, -1, 1);
    input.jump = data.jump === true; input.sprint = data.sprint === true;
  }
  handleRematch(sessionId) {
    if (this.state.status !== 'results' || !this.state.players[sessionId]) return;
    this.state.players[sessionId].ready = true;
    if (this.playerCount >= 2 && this.readyPlayers() >= 2) {
      this.state.status = 'waiting'; this.state.elapsed = 0; this.state.countdown = 0;
      this.state.message = 'Rematch siap — tekan Siap untuk memulai';
      for (const [id, player] of Object.entries(this.state.players)) {
        Object.assign(player, { ready: false, finished: false, finishTime: 0, progress: 0, checkpoint: 0, falls: 0, penalty: 0, falling: false, y: 0, rotY: 0 });
        const index = Object.keys(this.state.players).indexOf(id);
        player.x = ((index % 4) - 1.5) * 2.7; player.z = 3 + Math.floor(index / 4) * 2;
        this.verticalVelocity[id] = 0;
        const input = this.inputs[id];
        if (input) Object.assign(input, { x: 0, z: 0, jump: false, jumpWasDown: false, sprint: false, seq: -1 });
      }
    }
    this.broadcastState(); void this.persist();
  }
  startLoop() {
    if (this.loopTimer) return;
    this.lastUpdateAt = Date.now();
    this.loopTimer = setInterval(() => this.update(), 1000 / 30);
  }
  stopLoop() { if (this.loopTimer) clearInterval(this.loopTimer); this.loopTimer = null; }
  update() {
    if (this.state.status !== 'running') { this.stopLoop(); return; }
    const now = Date.now();
    const dt = clamp((now - this.lastUpdateAt) / 1000 || 0, 0, 0.05);
    this.lastUpdateAt = now;
    this.state.elapsed = Math.min(MATCH_DURATION_SECONDS, this.state.elapsed + dt);
    for (const [sessionId, player] of Object.entries(this.state.players)) {
      if (player.finished) continue;
      const input = this.inputs[sessionId] || { x: 0, z: 0, jump: false, jumpWasDown: false, sprint: false };
      if (!player.falling) {
        let mx = input.x, mz = input.z;
        const magnitude = Math.hypot(mx, mz);
        if (magnitude > 1) { mx /= magnitude; mz /= magnitude; }
        const speed = input.sprint ? SPRINT_SPEED : MOVE_SPEED;
        const nx = clamp(player.x + mx * speed * dt, TRACK_MIN_X, TRACK_MAX_X);
        const nz = clamp(player.z + mz * speed * dt, TRACK_MIN_Z, TRACK_MAX_Z);
        if (!collidesWithObstacle(nx, player.z, player.y)) player.x = nx;
        if (!collidesWithObstacle(player.x, nz, player.y)) player.z = nz;
        if (Math.hypot(mx, mz) > 0.1) player.rotY = Math.atan2(mx, -mz);
        let vy = this.verticalVelocity[sessionId] || 0;
        if (input.jump && !input.jumpWasDown && player.y <= 0.04 && !inGap(player.z)) vy = JUMP_VELOCITY;
        this.verticalVelocity[sessionId] = vy;
        if (inGap(player.z) && player.y <= 0.06 && vy <= 0) player.falling = true;
      }
      input.jumpWasDown = input.jump;
      let vy = this.verticalVelocity[sessionId] || 0;
      vy -= GRAVITY * dt; player.y += vy * dt;
      if (!inGap(player.z) && player.y <= 0 && !player.falling) { player.y = 0; vy = 0; }
      if (player.falling && player.y < -5.5) {
        player.falls += 1; player.penalty = Math.min(90, player.penalty + 2.5);
        const cp = CHECKPOINTS[player.checkpoint - 1];
        player.x = 0; player.y = 0; player.z = cp ? cp.respawnZ : 3;
        vy = 0; player.falling = false; player.rotY = 0;
        const socket = this.findSocket(sessionId);
        if (socket) this.send(socket, { type: 'message', name: 'respawn', data: { penalty: 2.5, checkpoint: player.checkpoint } });
      }
      if (!player.falling && player.y === 0) vy = 0;
      this.verticalVelocity[sessionId] = vy;
      if (player.checkpoint < CHECKPOINTS.length && player.z <= CHECKPOINTS[player.checkpoint].z) player.checkpoint += 1;
      player.progress = clamp((-player.z / Math.abs(FINISH_Z)) * 100, 0, 100);
      if (player.z <= FINISH_Z && !player.falling && player.y <= 0.3) {
        player.finished = true; player.finishTime = Number((this.state.elapsed + player.penalty).toFixed(2));
        player.progress = 100; player.falling = false; vy = 0; this.verticalVelocity[sessionId] = 0; player.y = 0;
      }
    }
    const players = Object.values(this.state.players);
    if (players.length && players.every((player) => player.finished)) this.finishMatch('Semua pemain finis!');
    else if (this.state.elapsed >= MATCH_DURATION_SECONDS) this.finishMatch('Waktu habis');
    this.broadcastState();
    if (now - this.lastPersistAt > 1000) { this.lastPersistAt = now; void this.persist(); }
  }
  findSocket(sessionId) { return this.sockets().find((socket) => socket.deserializeAttachment()?.sessionId === sessionId); }
  finishMatch(message) {
    this.stopLoop(); this.state.status = 'results'; this.state.message = message; this.state.countdown = 0;
    for (const player of Object.values(this.state.players)) player.ready = false;
    this.broadcastMessage('notice', { text: message }); this.broadcastState(); void this.persist();
  }
}
