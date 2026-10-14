// Colyseus + Express server. Serves client/dist in production, /health, /lobbies (open custom lobbies).
//   node server/src/index.js            (PORT env overrides shared/protocol.js PORT)
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server, WebSocketTransport, matchMaker } from 'colyseus';
import { PORT, ROOM, PHASE } from '../../shared/protocol.js';
import { MatchRoom } from './room/MatchRoom.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, '../../client/dist');

/** Boot the game server. port 0 = random free port. Returns { server, port, close() }. */
export async function startServer({ port = Number(process.env.PORT) || PORT, host } = {}) {
  const httpServer = http.createServer();
  const transport = new WebSocketTransport({ server: httpServer, pingInterval: 3000, pingMaxRetries: 3 });
  const startedAt = Date.now();
  const server = new Server({
    transport,
    greet: false,
    express: (app) => {
      app.disable('x-powered-by');
      app.use((req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); next(); });
      app.get('/health', (req, res) => res.json({ ok: true, uptime: Math.round((Date.now() - startedAt) / 1000) }));
      app.get('/lobbies', async (req, res) => {
        try {
          const rooms = await matchMaker.query({ name: ROOM });
          res.json(rooms
            .filter((r) => !r.locked && !r.private && (!r.metadata || r.metadata.phase === PHASE.LOBBY))
            .map((r) => ({ code: r.roomId, players: r.clients, max: r.maxClients, host: r.metadata?.host || '', bots: r.metadata?.bots || 0 })));
        } catch (e) { res.status(500).json({ error: String(e && e.message || e) }); }
      });
      if (fs.existsSync(DIST)) {
        app.use(express.static(DIST));
        app.get('/', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
      }
    },
  });
  server.define(ROOM, MatchRoom);
  await server.listen(port, host);
  const addr = httpServer.address();
  const real = addr && typeof addr === 'object' ? addr.port : port;
  return {
    server, port: real,
    async close() { try { await server.gracefullyShutdown(false); } catch { /* already down */ } },
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const s = await startServer();
  console.log(`[p2d] server on http://localhost:${s.port}  (ws same port)${fs.existsSync(DIST) ? '  serving client/dist' : ''}`);
}
