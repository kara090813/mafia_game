import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/src/types/events';
import { RoomManager } from './room-manager';
import { TimerManager } from './timer-manager';
import { registerRoomHandlers } from './handlers/room';
import { registerAvalonHandlers } from './handlers/avalon';
import { registerMafiaHandlers } from './handlers/mafia';
import { registerChatHandlers } from './handlers/chat';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());

// 프로덕션: 클라이언트 빌드 파일 서빙
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? true
      : ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
  },
});

const roomManager = new RoomManager();
const timerManager = new TimerManager();

io.on('connection', (socket) => {
  console.log(`[연결] ${socket.id}`);

  registerRoomHandlers(io, socket, roomManager, timerManager);
  registerAvalonHandlers(io, socket, roomManager, timerManager);
  registerMafiaHandlers(io, socket, roomManager, timerManager);
  registerChatHandlers(io, socket, roomManager);

  socket.on('disconnect', () => {
    console.log(`[연결 해제] ${socket.id}`);
    // handleDisconnect는 room 핸들러에서 처리
  });
});

// SPA fallback — React Router 지원
app.get('{*path}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});

function shutdown() {
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// 처리되지 않은 예외로 서버 전체(모든 방)가 죽는 것을 방지 — 로그만 남기고 유지
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
