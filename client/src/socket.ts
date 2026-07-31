import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/src/types/events';

// 프로덕션: 같은 도메인 (서버가 클라이언트 서빙)
// 개발: localhost:3001
const SERVER_URL = import.meta.env.VITE_SERVER_URL || (
  import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin
);

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});
