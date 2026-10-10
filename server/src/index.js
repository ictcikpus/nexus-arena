import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'colyseus';
import { ArenaRoom } from './rooms/ArenaRoom.js';

const app = express();
app.disable('x-powered-by');
// Colyseus matchmaking HTTP endpoints are cross-origin when the client is hosted separately.
app.use(cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '16kb' }));
app.get('/', (_req, res) => res.status(200).json({
  service: 'nexus-arena-server',
  ok: true,
  message: 'NEXUS ARENA multiplayer server is running.',
  health: '/health'
}));
app.get('/health', (_req, res) => res.status(200).json({ ok: true, service: 'nexus-arena-server' }));
app.get('/favicon.ico', (_req, res) => res.status(204).end());

const httpServer = createServer(app);
const gameServer = new Server({ server: httpServer });
gameServer.define('arena', ArenaRoom).enableRealtimeListing();
gameServer.define('private_arena', ArenaRoom);

const port = Number(process.env.PORT || 2567);
try {
  await gameServer.listen(port);
  console.log(`NEXUS ARENA server listening on 0.0.0.0:${port}`);
} catch (error) {
  console.error('Failed to start NEXUS ARENA server:', error);
  process.exit(1);
}

