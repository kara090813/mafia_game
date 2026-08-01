import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/src/types/events';
import type { RoomManager } from '../room-manager';
import type { TimerManager } from '../timer-manager';
import { MafiaGame } from '../games/mafia';
import { AvalonGame } from '../games/avalon';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerRoomHandlers(io: IO, socket: ClientSocket, roomManager: RoomManager, timerManager: TimerManager) {
  socket.on('room:create', (nickname, callback) => {
    const room = roomManager.createRoom(socket.id, nickname);
    socket.join(room.code);
    callback(room);
    console.log(`[방 생성] ${room.code} by ${nickname}`);
  });

  socket.on('room:join', (code, nickname, callback) => {
    const normalizedCode = code.toUpperCase().trim();
    const room = roomManager.joinRoom(normalizedCode, socket.id, nickname);

    if (!room) {
      callback(null, '방을 찾을 수 없거나 참가할 수 없습니다.');
      return;
    }

    socket.join(room.code);
    callback(room);

    const player = room.players.find(p => p.id === socket.id)!;
    socket.to(room.code).emit('room:player-joined', player);
    console.log(`[방 참가] ${room.code} - ${nickname}`);
  });

  socket.on('room:rejoin', (code, nickname, callback) => {
    const normalizedCode = code.toUpperCase().trim();
    const result = roomManager.rejoinRoom(normalizedCode, socket.id, nickname);

    if (!result) {
      callback(null);
      return;
    }

    const { room, oldId } = result;
    socket.join(room.code);

    let gameState: unknown = undefined;
    if (room.status === 'playing') {
      try {
        const state = roomManager.getGameState(room.code);
        if (state && 'dayNumber' in state) {
          const game = MafiaGame.fromState(state);
          if (oldId) game.setReconnected(oldId, socket.id);
          roomManager.setGameState(room.code, game.getState());
          gameState = { type: 'mafia', state: game.getClientState(socket.id) };
        } else if (state && 'currentQuest' in state) {
          const game = AvalonGame.fromState(state);
          if (oldId) game.setReconnected(oldId, socket.id);
          roomManager.setGameState(room.code, game.getState());
          gameState = { type: 'avalon', state: game.getClientState(socket.id) };
        }
      } catch (err) {
        // 재접속 중 게임 상태 복원 실패해도 서버 전체가 죽지 않도록 방어
        console.error(`[재접속 오류] ${room.code} - ${nickname}:`, err);
        gameState = undefined;
      }
    }

    callback({ room, gameState });
    io.to(room.code).emit('room:updated', room);
    console.log(`[재접속] ${room.code} - ${nickname} (${oldId} -> ${socket.id})`);
  });

  socket.on('room:leave', () => {
    const result = roomManager.leaveRoom(socket.id);
    if (!result) return;

    socket.leave(result.room.code);
    io.to(result.room.code).emit('room:player-left', socket.id);
    io.to(result.room.code).emit('room:updated', result.room);
    console.log(`[방 퇴장] ${result.room.code} - ${result.player.nickname}`);
  });

  socket.on('room:select-game', (gameType) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id) return;

    roomManager.selectGame(room.code, gameType);

    if (gameType === 'avalon') {
      room.minPlayers = 5;
      room.maxPlayers = 10;
    } else {
      room.minPlayers = 7;
      room.maxPlayers = 12;
    }

    io.to(room.code).emit('room:updated', room);
  });

  socket.on('room:end-game', () => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.status !== 'playing') return;

    timerManager.clear(room.code);
    roomManager.forceEndGame(room.code);
    console.log(`[게임 종료] ${room.code} by host, status=${room.status}, players=${room.players.map(p => p.nickname + ':' + p.isConnected).join(',')}`);
    io.to(room.code).emit('room:updated', room);
  });

  socket.on('disconnect', () => {
    const result = roomManager.handleDisconnect(socket.id);
    if (!result) return;

    if (result.allDisconnected) {
      timerManager.clear(result.room.code);
      console.log(`[타이머 정리] ${result.room.code} - 모두 끊김, 30초 대기`);
    }

    // 게임 중이면 게임 상태에 연결 끊김 반영
    if (result.room.status === 'playing' && !result.allDisconnected) {
      const state = roomManager.getGameState(result.room.code);
      if (state && 'dayNumber' in state) {
        const game = MafiaGame.fromState(state);
        game.setDisconnected(socket.id);
        roomManager.setGameState(result.room.code, game.getState());

        // 나머지 유저에게 게임 상태 브로드캐스트
        for (const p of result.room.players) {
          if (p.isConnected && p.id !== socket.id) {
            io.to(p.id).emit('mafia:state', game.getClientState(p.id));
          }
        }
      }
    }

    io.to(result.room.code).emit('room:updated', result.room);

    // 대기 중이면 10초 후 목록 갱신 (제거된 유저 반영)
    if (result.room.status === 'waiting') {
      const roomCode = result.room.code;
      setTimeout(() => {
        const r = roomManager.getRoom(roomCode);
        if (r) io.to(roomCode).emit('room:updated', r);
      }, 10500);
    }
  });
}
