import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

export class PlayerState extends Schema {
  constructor() {
    super();
    this.name = 'Runner';
    this.color = '#4fe6d1';
    this.x = 0;
    this.y = 0;
    this.z = 3;
    this.rotY = 0;
    this.ready = false;
    this.finished = false;
    this.finishTime = 0;
    this.progress = 0;
    this.checkpoint = 0;
    this.falls = 0;
    this.penalty = 0;
    this.connected = true;
    this.falling = false;
  }
}
defineTypes(PlayerState, {
  name: 'string', color: 'string', x: 'number', y: 'number', z: 'number', rotY: 'number',
  ready: 'boolean', finished: 'boolean', finishTime: 'number', progress: 'number',
  checkpoint: 'number', falls: 'number', penalty: 'number', connected: 'boolean', falling: 'boolean'
});

export class ArenaState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.status = 'waiting';
    this.countdown = 0;
    this.elapsed = 0;
    this.maxPlayers = 8;
    this.duration = 180;
    this.message = 'Menunggu pemain';
  }
}
defineTypes(ArenaState, {
  players: { map: PlayerState }, status: 'string', countdown: 'number', elapsed: 'number',
  maxPlayers: 'number', duration: 'number', message: 'string'
});
