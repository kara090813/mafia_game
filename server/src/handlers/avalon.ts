import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/src/types/events';
import type { RoomManager } from '../room-manager';
import type { TimerManager } from '../timer-manager';
import { AvalonGame } from '../games/avalon';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const PHASE_TIMERS: Record<string, number> = {
  role_reveal: 15,
  team_building: 60,
  team_discussion: 30,
  team_vote: 30,
  quest: 20,
  quest_result: 6,
  assassination: 60,
};

export function registerAvalonHandlers(
  io: IO,
  socket: ClientSocket,
  roomManager: RoomManager,
  timerManager: TimerManager,
) {
  function startPhaseTimer(roomCode: string) {
    const state = roomManager.getGameState(roomCode);
    if (!state || state.phase === 'game_over') return;

    const seconds = PHASE_TIMERS[state.phase];
    if (!seconds) return;

    timerManager.start(roomCode, seconds, state.phase, io, () => {
      const game = AvalonGame.fromState(roomManager.getGameState(roomCode)!);
      const phase = game.getState().phase;

      if (phase === 'role_reveal') {
        game.advanceFromRoleReveal();
      } else if (phase === 'quest_result') {
        game.advanceFromQuestResult();
      } else if (phase === 'team_building') {
        // 시간 초과 → 다음 원정대장
        const s = game.getState();
        s.consecutiveRejects++;
        if (s.consecutiveRejects >= 5) {
          s.winner = 'demon';
          s.winReason = '원정대 투표가 연속 5번 부결되었습니다.';
          s.phase = 'game_over';
        } else {
          s.currentLeaderIndex = (s.currentLeaderIndex + 1) % s.playerOrder.length;
          s.proposedTeam = [];
          s.teamVotes = [];
        }
      } else if (phase === 'team_discussion' || phase === 'team_vote') {
        // 찬반 투표 시간 종료 → 현재까지의 표로 확정 (무한 대기 방지)
        game.finalizeTeamVote();
      } else if (phase === 'quest') {
        // 원정 수행 시간 종료 → 미투표는 성공 처리 후 확정
        game.finalizeQuest();
      }

      roomManager.setGameState(roomCode, game.getState());

      if (game.getState().winner) {
        roomManager.endGame(roomCode);
      }

      const room = roomManager.getRoom(roomCode);
      if (room) {
        broadcastState(io, room.players, game);
        if (game.getState().phase !== 'game_over') {
          startPhaseTimer(roomCode);
        }
      }
    });
  }

  socket.on('room:start-game', () => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id || room.gameType !== 'avalon') return;
    if (room.players.length < room.minPlayers) {
      socket.emit('room:error', `최소 ${room.minPlayers}명이 필요합니다.`);
      return;
    }

    const game = new AvalonGame(room.players);
    roomManager.startGame(room.code);
    roomManager.setGameState(room.code, game.getState());

    broadcastState(io, room.players, game);
    startPhaseTimer(room.code);
  });

  socket.on('avalon:propose-team', (memberIds) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const game = AvalonGame.fromState(roomManager.getGameState(room.code)!);
    const result = game.proposeTeam(socket.id, memberIds);
    if (!result.success) {
      socket.emit('room:error', result.error!);
      return;
    }

    roomManager.setGameState(room.code, game.getState());
    timerManager.clear(room.code);
    broadcastState(io, room.players, game);
    startPhaseTimer(room.code);
  });

  socket.on('avalon:vote-team', (approve) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const game = AvalonGame.fromState(roomManager.getGameState(room.code)!);
    const prevPhase = game.getState().phase;
    const result = game.voteTeam(socket.id, approve);
    if (!result.success) return;

    roomManager.setGameState(room.code, game.getState());

    const newPhase = game.getState().phase;
    if (prevPhase !== newPhase) {
      timerManager.clear(room.code);
    }

    broadcastState(io, room.players, game);

    if (prevPhase !== newPhase && newPhase !== 'game_over') {
      startPhaseTimer(room.code);
    }
  });

  socket.on('avalon:quest-vote', (success) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const game = AvalonGame.fromState(roomManager.getGameState(room.code)!);
    const prevPhase = game.getState().phase;
    const result = game.questVote(socket.id, success);
    if (!result.success) return;

    roomManager.setGameState(room.code, game.getState());

    const newPhase = game.getState().phase;
    if (prevPhase !== newPhase) {
      timerManager.clear(room.code);
    }

    broadcastState(io, room.players, game);

    if (prevPhase !== newPhase && newPhase !== 'game_over') {
      startPhaseTimer(room.code);
    }
  });

  socket.on('avalon:skip-time', (delta) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const state = roomManager.getGameState(room.code);
    if (!state || !('currentQuest' in state)) return;

    const game = AvalonGame.fromState(state);
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

  socket.on('avalon:assassinate', (targetId) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const game = AvalonGame.fromState(roomManager.getGameState(room.code)!);
    const result = game.assassinate(socket.id, targetId);
    if (!result.success) return;

    timerManager.clear(room.code);
    roomManager.setGameState(room.code, game.getState());
    if (game.getState().winner) {
      roomManager.endGame(room.code);
    }
    broadcastState(io, room.players, game);
  });
}

function broadcastState(io: IO, players: { id: string }[], game: AvalonGame) {
  for (const player of players) {
    io.to(player.id).emit('avalon:state', game.getClientState(player.id));
  }
}
