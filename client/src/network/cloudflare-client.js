function decodeState(raw) {
  const state = { ...raw };
  const source = raw?.players || {};
  state.players = new Map(Array.isArray(source) ? source : Object.entries(source));
  return state;
}

class CloudflareRoom {
  constructor(webSocket, roomId) {
    this.connection = webSocket;
    this.roomId = roomId;
    this.sessionId = '';
    this.state = null;
    this._stateHandlers = new Set();
    this._messageHandlers = new Map();
    this._leaveHandlers = new Set();
    this._connected = false;
    this._intentionalLeave = false;
  }
  onStateChange(handler) {
    this._stateHandlers.add(handler);
    if (this.state) handler(this.state);
    return () => this._stateHandlers.delete(handler);
  }
  onMessage(name, handler) {
    if (!this._messageHandlers.has(name)) this._messageHandlers.set(name, new Set());
    this._messageHandlers.get(name).add(handler);
    return () => this._messageHandlers.get(name)?.delete(handler);
  }
  onLeave(handler) { this._leaveHandlers.add(handler); return () => this._leaveHandlers.delete(handler); }
  send(name, data = {}) {
    if (this.connection.readyState !== WebSocket.OPEN) throw new Error('Koneksi multiplayer belum siap.');
    this.connection.send(JSON.stringify({ type: 'message', name, data }));
  }
  leave() {
    this._intentionalLeave = true;
    return new Promise((resolve) => {
      if (this.connection.readyState === WebSocket.CLOSED) return resolve();
      const timer = setTimeout(resolve, 500);
      this.connection.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
      try { this.connection.close(1000, 'player left'); } catch { clearTimeout(timer); resolve(); }
    });
  }
  _receive(packet) {
    if (packet?.type === 'welcome') {
      this.sessionId = packet.sessionId;
      this.roomId = packet.roomId || this.roomId;
      this._connected = true;
      return;
    }
    if (packet?.type === 'state' && packet.state) {
      this.state = decodeState(packet.state);
      for (const handler of this._stateHandlers) { try { handler(this.state); } catch (error) { console.error(error); } }
      return;
    }
    if (packet?.type === 'message' && packet.name) {
      for (const handler of this._messageHandlers.get(packet.name) || []) { try { handler(packet.data); } catch (error) { console.error(error); } }
    }
  }
}

export class Client {
  constructor(serverUrl) {
    this.baseUrl = new URL(serverUrl);
    this.baseUrl.pathname = '/';
    this.baseUrl.search = '';
    this.baseUrl.hash = '';
  }
  joinOrCreate(_roomName, options = {}) { return this._join('quick', options); }
  create(_roomName, options = {}) { return this._join('create', options); }
  joinById(roomId, options = {}) { return this._join('join', options, roomId); }
  async _join(mode, options, roomCode = '') {
    const resolveUrl = new URL('/api/resolve', this.baseUrl);
    resolveUrl.searchParams.set('mode', mode);
    if (roomCode) resolveUrl.searchParams.set('code', String(roomCode).trim().toUpperCase());
    let response;
    try { response = await fetch(resolveUrl, { headers: { accept: 'application/json' } }); }
    catch { throw new Error('Tidak dapat menghubungi layanan multiplayer Cloudflare.'); }
    let result = {};
    try { result = await response.json(); } catch { /* invalid response */ }
    if (!response.ok || !result.roomId) throw new Error(result.error || `Gagal mendapatkan room (HTTP ${response.status}).`);

    const connectUrl = new URL('/api/connect', this.baseUrl);
    connectUrl.protocol = connectUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    connectUrl.searchParams.set('code', result.roomId);
    connectUrl.searchParams.set('name', String(options.name || 'Runner').slice(0, 16));
    connectUrl.searchParams.set('color', String(options.color || '#4fe6d1'));
    const socket = new WebSocket(connectUrl);
    const room = new CloudflareRoom(socket, result.roomId);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { socket.close(); } catch { /* ignore */ }
          reject(new Error('Server belum merespons. Tunggu sebentar lalu coba lagi.'));
        }
      }, 15000);
      socket.addEventListener('message', (event) => {
        let packet;
        try { packet = JSON.parse(event.data); } catch { return; }
        room._receive(packet);
        if (!settled && room.sessionId && room.state) {
          settled = true;
          clearTimeout(timeout);
          resolve(room);
        }
      });
      socket.addEventListener('error', () => {
        if (!settled) {
          settled = true; clearTimeout(timeout);
          reject(new Error('WebSocket gagal terhubung. Periksa deployment Cloudflare Worker.'));
        }
      });
      socket.addEventListener('close', () => {
        if (!settled) {
          settled = true; clearTimeout(timeout);
          reject(new Error('Server menutup koneksi sebelum room siap.'));
          return;
        }
        if (!room._intentionalLeave) for (const handler of room._leaveHandlers) { try { handler(1000); } catch (error) { console.error(error); } }
      });
    });
  }
}
