import { Room } from 'colyseus';
import { ArenaState, PlayerState } from './ArenaState.js';
import {
  MAX_PLAYERS, MATCH_DURATION_SECONDS, MOVE_SPEED, SPRINT_SPEED, JUMP_VELOCITY,
  GRAVITY, TRACK_MIN_X, TRACK_MAX_X, TRACK_MIN_Z, TRACK_MAX_Z, FINISH_Z,
  CHECKPOINTS, inGap, collidesWithObstacle
} from '../game/level-config.js';

const VALID_COLORS = new Set(['#4fe6d1', '#ff7b54', '#a88bff', '#ffe06b', '#77a8ff', '#ff7ecb']);
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

export class ArenaRoom extends Room {
  onCreate(options = {}) {
    this.maxClients = MAX_PLAYERS;
    this.mode = options.mode === 'private' || this.roomName === 'private_arena' ? 'private' : 'public';
    this.setState(new ArenaState());
    this.state.maxPlayers = MAX_PLAYERS;
    this.state.duration = MATCH_DURATION_SECONDS;
    this.inputs = new Map();
    this.verticalVelocity = new Map();
    this.countdownEndsAt = 0;
    this.lastUpdateAt = Date.now();
    this.setMetadata({ mode: this.mode });
    this.setSimulationInterval((deltaTime) => this.update(deltaTime), 1000 / 30);

    this.onMessage('ready', (client, data) => this.handleReady(client, data));
    this.onMessage('input', (client, data) => this.handleInput(client, data));
    this.onMessage('rematch', (client) => this.handleRematch(client));
    this.onMessage('heartbeat', (client) => {
      // A lightweight inbound message lets free hosts recognize active lobby connections.
      if (!this.state.players.has(client.sessionId)) return;
    });
  }

  onJoin(client, options = {}) {
    if (this.state.status !== 'waiting') {
      client.send('notice', { text: 'Pertandingan sudah dimulai. Coba room lain.' });
      client.leave();
      return;
    }
    const index = this.state.players.size;
    const player = new PlayerState();
    player.name = this.cleanName(options.name);
    player.color = VALID_COLORS.has(options.color) ? options.color : '#4fe6d1';
    player.x = ((index % 4) - 1.5) * 2.7;
    player.z = 3 + Math.floor(index / 4) * 2.0;
    player.y = 0;
    player.rotY = 0;
    this.state.players.set(client.sessionId, player);
    this.inputs.set(client.sessionId, { x: 0, z: 0, jump: false, jumpWasDown: false, sprint: false, seq: -1, lastAt: 0 });
    this.verticalVelocity.set(client.sessionId, 0);
    this.state.message = `${this.state.players.size} pemain bergabung`;
    this.broadcast('notice', { text: `${player.name} bergabung ke arena.` });
  }

  onLeave(client) {
    const player = this.state.players.get(client.sessionId);
    const name = player?.name || 'Pemain';
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.verticalVelocity.delete(client.sessionId);
    this.state.message = `${name} keluar`;
    if (this.state.status === 'countdown' && this.readyPlayers() < 2) {
      this.state.status = 'waiting';
      this.state.countdown = 0;
      this.state.message = 'Menunggu minimal dua pemain siap';
      this.countdownEndsAt = 0;
      this.unlock();
      this.state.players.forEach((p) => { p.ready = false; });
    }
  }

  onDispose() {
    this.inputs.clear();
  }

  cleanName(value) {
    const name = String(value ?? 'Runner').replace(/[<>\u0000-\u001F]/g, '').trim().slice(0, 16);
    return name || 'Runner';
  }

  readyPlayers() {
    let count = 0;
    this.state.players.forEach((player) => { if (player.ready) count += 1; });
    return count;
  }

  handleReady(client, data) {
    if (this.state.status !== 'waiting') return;
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.ready = Boolean(data?.ready);
    const ready = this.readyPlayers();
    if (this.state.players.size >= 2 && ready >= 2) this.startCountdown();
    else this.state.message = `Menunggu ${Math.max(0, 2 - ready)} pemain siap lagi`;
  }

  startCountdown() {
    if (this.state.status !== 'waiting' || this.readyPlayers() < 2) return;
    this.state.status = 'countdown';
    this.state.countdown = 3;
    this.state.message = 'Bersiap!';
    this.countdownEndsAt = Date.now() + 3000;
    this.lock();
  }

  startMatch() {
    this.state.status = 'running';
    this.state.elapsed = 0;
    this.state.countdown = 0;
    this.state.message = 'RUN!';
    this.state.players.forEach((player) => {
      player.ready = false;
      player.finished = false;
      player.finishTime = 0;
      player.progress = 0;
      player.checkpoint = 0;
      player.falls = 0;
      player.penalty = 0;
      player.falling = false;
      player.y = 0;
      player.rotY = 0;
      const sessionId = this.findSessionForPlayer(player);
      this.verticalVelocity.set(sessionId, 0);
      const input = this.inputs.get(sessionId);
      if (input) { input.x = 0; input.z = 0; input.jump = false; input.jumpWasDown = false; input.sprint = false; }
    });
  }

  findSessionForPlayer(playerRef) {
    let id = null;
    this.state.players.forEach((player, sessionId) => { if (player === playerRef) id = sessionId; });
    return id;
  }

  handleInput(client, data) {
    if (this.state.status !== 'running') return;
    const player = this.state.players.get(client.sessionId);
    const input = this.inputs.get(client.sessionId);
    if (!player || !input || !data || typeof data !== 'object') return;
    const now = Date.now();
    if (now - input.lastAt < 12) return;
    input.lastAt = now;
    const seq = Number(data.seq);
    if (!Number.isFinite(seq) || seq <= input.seq) return;
    input.seq = seq;
    input.x = clamp(Number.isFinite(Number(data.x)) ? Number(data.x) : 0, -1, 1);
    input.z = clamp(Number.isFinite(Number(data.z)) ? Number(data.z) : 0, -1, 1);
    input.jump = data.jump === true;
    input.sprint = data.sprint === true;
  }

  handleRematch(client) {
    if (this.state.status !== 'results') return;
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.ready = true;
    if (this.state.players.size >= 2 && this.readyPlayers() >= 2) {
      this.state.status = 'waiting';
      this.state.elapsed = 0;
      this.state.countdown = 0;
      this.state.message = 'Rematch siap — tekan Siap untuk memulai';
      this.state.players.forEach((p, sessionId) => {
        p.ready = false; p.finished = false; p.finishTime = 0; p.progress = 0;
        p.checkpoint = 0; p.falls = 0; p.penalty = 0; p.falling = false; p.y = 0; p.rotY = 0;
        this.verticalVelocity.set(sessionId, 0);
        const index = [...this.state.players.keys()].indexOf(sessionId);
        p.x = ((index % 4) - 1.5) * 2.7;
        p.z = 3 + Math.floor(index / 4) * 2;
        const input = this.inputs.get(sessionId);
        if (input) { input.x=0;input.z=0;input.jump=false;input.jumpWasDown=false;input.sprint=false;input.seq=-1; }
      });
      this.unlock();
    }
  }

  update(deltaTime) {
    if (!this.state) return;
    const dt = clamp(Number(deltaTime) / 1000 || 0, 0, 0.05);
    if (this.state.status === 'countdown') {
      const remaining = this.countdownEndsAt - Date.now();
      this.state.countdown = Math.max(0, Math.ceil(remaining / 1000));
      if (remaining <= 0) this.startMatch();
      return;
    }
    if (this.state.status !== 'running') return;

    this.state.elapsed = Math.min(MATCH_DURATION_SECONDS, this.state.elapsed + dt);
    this.state.players.forEach((player, sessionId) => {
      if (player.finished) return;
      const input = this.inputs.get(sessionId) || { x:0,z:0,jump:false,jumpWasDown:false,sprint:false };
      if (!player.falling) {
        let mx = input.x, mz = input.z;
        const magnitude = Math.hypot(mx, mz);
        if (magnitude > 1) { mx /= magnitude; mz /= magnitude; }
        const speed = input.sprint ? SPRINT_SPEED : MOVE_SPEED;
        const nx = clamp(player.x + mx * speed * dt, TRACK_MIN_X, TRACK_MAX_X);
        const nz = clamp(player.z + mz * speed * dt, TRACK_MIN_Z, TRACK_MAX_Z);
        if (!collidesWithObstacle(nx, player.z, player.y)) player.x = nx;
        if (!collidesWithObstacle(player.x, nz, player.y)) player.z = nz;
        if (Math.hypot(mx, mz) > .1) player.rotY = Math.atan2(mx, -mz);
        let vy = this.verticalVelocity.get(sessionId) || 0;
        if (input.jump && !input.jumpWasDown && player.y <= 0.04 && !inGap(player.z)) vy = JUMP_VELOCITY;
        this.verticalVelocity.set(sessionId, vy);
        if (inGap(player.z) && player.y <= 0.06 && vy <= 0) player.falling = true;
      }
      input.jumpWasDown = input.jump;
      let verticalVelocity = this.verticalVelocity.get(sessionId) || 0;
      verticalVelocity -= GRAVITY * dt;
      player.y += verticalVelocity * dt;
      if (!inGap(player.z) && player.y <= 0 && !player.falling) { player.y = 0; verticalVelocity = 0; }
      if (player.falling && player.y < -5.5) {
        player.falls += 1;
        player.penalty = Math.min(90, player.penalty + 2.5);
        const cp = CHECKPOINTS[player.checkpoint - 1];
        player.x = 0; player.y = 0; player.z = cp ? cp.respawnZ : 3;
        verticalVelocity = 0; player.falling = false; player.rotY = 0;
        const clientForPlayer = this.clients.find((c) => c.sessionId === sessionId);
        clientForPlayer?.send('respawn', { penalty: 2.5, checkpoint: player.checkpoint });
      }
      if (!player.falling && player.y === 0) verticalVelocity = 0;
      this.verticalVelocity.set(sessionId, verticalVelocity);
      if (player.checkpoint < CHECKPOINTS.length && player.z <= CHECKPOINTS[player.checkpoint].z) player.checkpoint += 1;
      player.progress = clamp((-player.z / Math.abs(FINISH_Z)) * 100, 0, 100);
      if (player.z <= FINISH_Z && !player.falling && player.y <= .3) {
        player.finished = true;
        player.finishTime = Number((this.state.elapsed + player.penalty).toFixed(2));
        player.progress = 100;
        player.falling = false;
        verticalVelocity = 0;
        this.verticalVelocity.set(sessionId, verticalVelocity);
        player.y = 0;
      }
    });

    const players = [...this.state.players.values()];
    if (players.length && players.every((player) => player.finished)) this.finishMatch('Semua pemain finis!');
    else if (this.state.elapsed >= MATCH_DURATION_SECONDS) this.finishMatch('Waktu habis');
  }

  finishMatch(message) {
    this.state.status = 'results';
    this.state.message = message;
    this.state.countdown = 0;
    this.state.players.forEach((player) => { player.ready = false; });
    // The room remains locked until existing participants vote for a rematch.
    this.broadcast('notice', { text: message });
  }
}

