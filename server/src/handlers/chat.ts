import { randomUUID } from 'crypto';
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/src/types/events';
import type { ChatMessage } from '../../../shared/src/types/common';
import type { RoomManager } from '../room-manager';
import { MafiaGame } from '../games/mafia';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerChatHandlers(io: IO, socket: ClientSocket, roomManager: RoomManager) {
  socket.on('chat:send', (content, channel = 'public') => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    // 마피아 게임에서 밤일 때 특수 처리
    if (room.gameType === 'mafia' && room.status === 'playing') {
      const gameState = roomManager.getGameState(room.code);
      if (gameState && gameState.phase === 'night') {
        const game = MafiaGame.fromState(gameState);
        const mafiaIds = game.getMafiaChatMembers();

        // 마피아 팀원이 아니면 밤에 채팅 불가
        if (!mafiaIds.includes(socket.id)) return;

        // 마피아 팀원이면 자동으로 마피아 채팅
        const message: ChatMessage = {
          id: randomUUID(),
          playerId: socket.id,
          nickname: player.nickname,
          content,
          timestamp: Date.now(),
          channel: 'mafia',
        };

        for (const id of mafiaIds) {
          io.to(id).emit('chat:message', message);
        }
        return;
      }
    }

    // 일반 공개 채팅
    if (channel === 'public') {
      const message: ChatMessage = {
        id: randomUUID(),
        playerId: socket.id,
        nickname: player.nickname,
        content,
        timestamp: Date.now(),
        channel: 'public',
      };
      io.to(room.code).emit('chat:message', message);
    }
  });
}
