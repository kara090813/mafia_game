import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/src/types/events';
import type { RoomManager } from '../room-manager';
import type { TimerManager } from '../timer-manager';
import type { MafiaGameState } from '../../../shared/src/types/mafia';
import { MafiaGame } from '../games/mafia';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerMafiaHandlers(
  io: IO, socket: ClientSocket, roomManager: RoomManager, timerManager: TimerManager,
) {
  function getGame(roomCode: string): MafiaGame | null {
    const state = roomManager.getGameState(roomCode);
    if (!state || !('dayNumber' in state)) return null;
    return MafiaGame.fromState(state as MafiaGameState);
  }

  function startPhaseTimer(roomCode: string) {
    const game = getGame(roomCode);
    if (!game) return;
    const state = game.getState();
    const seconds = state.timerSeconds;
    if (seconds <= 0) return;

    console.log(`[타이머] ${state.timerPhase} ${seconds}초 시작`);

    timerManager.start(roomCode, seconds, state.timerPhase, io, () => {
      const g = getGame(roomCode);
      if (!g) { console.log('[타이머] 게임 상태 없음, 무시'); return; }

      const beforePhase = g.getState().phase;
      g.onTimerExpire(state.timerPhase);
      const afterPhase = g.getState().phase;
      console.log(`[타이머 만료] timer=${state.timerPhase} ${beforePhase} -> ${afterPhase}`);

      roomManager.setGameState(roomCode, g.getState());
      if (g.getState().winner) roomManager.endGame(roomCode);

      const room = roomManager.getRoom(roomCode);
      if (room) {
        broadcastState(io, room.players, g);
        if (g.getState().phase !== 'game_over') {
          setTimeout(() => startPhaseTimer(roomCode), 50);
        }
      }
    });
  }

  socket.on('room:start-game', () => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id || room.gameType !== 'mafia') return;
    if (room.players.length < room.minPlayers) {
      socket.emit('room:error', `최소 ${room.minPlayers}명이 필요합니다.`);
      return;
    }

    const game = new MafiaGame(room.players);
    roomManager.startGame(room.code);
    roomManager.setGameState(room.code, game.getState());
    broadcastState(io, room.players, game);
    startPhaseTimer(room.code);
  });

  socket.on('mafia:night-action', (targetId) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const game = getGame(room.code);
    if (!game) return;

    const result = game.nightAction(socket.id, targetId);
    if (!result.success) { socket.emit('room:error', result.error!); return; }

    if (game.isNightComplete()) {
      timerManager.clear(room.code);
      game.resolveNight();
      roomManager.setGameState(room.code, game.getState());
      broadcastState(io, room.players, game);
      if (game.getState().phase !== 'game_over') startPhaseTimer(room.code);
      else roomManager.endGame(room.code);
    } else {
      roomManager.setGameState(room.code, game.getState());
      broadcastState(io, room.players, game);
    }
  });

  socket.on('mafia:day-vote', (targetId) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const game = getGame(room.code);
    if (!game) return;

    const prev = game.getState().phase;
    const result = game.dayVote(socket.id, targetId);
    if (!result.success) return;

    const next = game.getState().phase;
    roomManager.setGameState(room.code, game.getState());
    broadcastState(io, room.players, game);

    if (prev !== next) {
      timerManager.clear(room.code);
      if (next !== 'game_over') startPhaseTimer(room.code);
      else roomManager.endGame(room.code);
    }
  });

  socket.on('mafia:final-vote', (approve) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const game = getGame(room.code);
    if (!game) return;

    const result = game.finalVote(socket.id, approve);
    if (!result.success) return;

    roomManager.setGameState(room.code, game.getState());
    broadcastState(io, room.players, game);

    const phase = game.getState().phase;
    if (phase === 'game_over') {
      timerManager.clear(room.code);
      roomManager.endGame(room.code);
    } else if (phase === 'night') {
      timerManager.clear(room.code);
      startPhaseTimer(room.code);
    }
  });

  socket.on('mafia:vigilante-action', (targetId) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const game = getGame(room.code);
    if (!game) return;

    const result = game.vigilanteAction(socket.id, targetId);
    if (!result.success) { socket.emit('room:error', result.error!); return; }

    roomManager.setGameState(room.code, game.getState());
    broadcastState(io, room.players, game);

    if (game.getState().winner) {
      timerManager.clear(room.code);
      roomManager.endGame(room.code);
    }
  });

  // 시간 증가/감소
  socket.on('mafia:skip-time', (delta) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const game = getGame(room.code);
    if (!game) return;

    const result = game.skipTime(socket.id, delta);
    if (!result.success) return;

    roomManager.setGameState(room.code, game.getState());
    broadcastState(io, room.players, game);

    if (result.delta < 0) {
      timerManager.reduce(room.code, Math.abs(result.delta), io);
    } else {
      timerManager.add(room.code, result.delta, io);
    }
  });

  // 마피아 채팅은 chat.ts에서 통합 처리
}

function broadcastState(io: IO, players: { id: string }[], game: MafiaGame) {
  const state = game.getState();
  for (const player of players) {
    io.to(player.id).emit('mafia:state', game.getClientState(player.id));
    const msgs = game.getPersonalMessages(player.id);
    for (const msg of msgs) {
      io.to(player.id).emit('mafia:personal-message', {
        text: msg,
        day: state.dayNumber,
        phase: state.phase,
      });
    }
  }
}
