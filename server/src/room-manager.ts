import { customAlphabet } from 'nanoid';
import type { Room, Player, GameType } from '../../shared/src/types/common';
import type { AvalonGameState } from '../../shared/src/types/avalon';
import type { MafiaGameState } from '../../shared/src/types/mafia';

const generateCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

export class RoomManager {
  private rooms = new Map<string, Room>();
  private socketToRoom = new Map<string, string>();
  private gameStates = new Map<string, AvalonGameState | MafiaGameState>();

  createRoom(socketId: string, nickname: string): Room {
    const code = generateCode();
    const player: Player = {
      id: socketId,
      nickname,
      isHost: true,
      isConnected: true,
    };

    const room: Room = {
      id: code,
      code,
      hostId: socketId,
      players: [player],
      gameType: null,
      status: 'waiting',
      maxPlayers: 12,
      minPlayers: 5,
    };

    this.rooms.set(code, room);
    this.socketToRoom.set(socketId, code);
    return room;
  }

  joinRoom(code: string, socketId: string, nickname: string): Room | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    if (room.status !== 'waiting') return null;
    if (room.players.length >= room.maxPlayers) return null;
    if (room.players.some(p => p.nickname === nickname)) return null;

    const player: Player = {
      id: socketId,
      nickname,
      isHost: false,
      isConnected: true,
    };

    room.players.push(player);
    this.socketToRoom.set(socketId, code);
    return room;
  }

  leaveRoom(socketId: string): { room: Room; player: Player } | null {
    const code = this.socketToRoom.get(socketId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) return null;

    const playerIndex = room.players.findIndex(p => p.id === socketId);
    if (playerIndex === -1) return null;

    const player = room.players[playerIndex];
    room.players.splice(playerIndex, 1);
    this.socketToRoom.delete(socketId);

    if (room.players.length === 0) {
      this.rooms.delete(code);
      this.gameStates.delete(code);
      return { room, player };
    }

    // 호스트가 나가면 다음 사람이 호스트
    if (player.isHost && room.players.length > 0) {
      room.players[0].isHost = true;
      room.hostId = room.players[0].id;
    }

    return { room, player };
  }

  handleDisconnect(socketId: string): { room: Room; player: Player; allDisconnected: boolean; removed: boolean } | null {
    const code = this.socketToRoom.get(socketId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) return null;

    const player = room.players.find(p => p.id === socketId);
    if (!player) return null;

    player.isConnected = false;
    this.socketToRoom.delete(socketId);

    if (room.status === 'waiting') {
      // 대기 중: 10초 후 재접속 안 하면 방에서 제거
      const nickname = player.nickname;
      setTimeout(() => {
        const r = this.rooms.get(code);
        if (!r) return;
        const p = r.players.find(pl => pl.nickname === nickname);
        if (p && !p.isConnected) {
          r.players = r.players.filter(pl => pl.nickname !== nickname);
          console.log(`[퇴장] ${code} - ${nickname} (10초 미접속)`);
          if (r.players.length === 0) {
            this.rooms.delete(code);
            this.gameStates.delete(code);
            console.log(`[방 삭제] ${code} - 빈 방`);
          } else if (p.isHost) {
            r.players[0].isHost = true;
            r.hostId = r.players[0].id;
          }
        }
      }, 10000);
    }

    const allDisconnected = room.players.every(p => !p.isConnected);

    if (allDisconnected && room.status === 'playing') {
      // 게임 중 모두 끊김: 30초 후 삭제
      setTimeout(() => {
        const r = this.rooms.get(code);
        if (r && r.players.every(p => !p.isConnected)) {
          console.log(`[방 삭제] ${code} - 30초간 모든 플레이어 연결 끊김`);
          this.rooms.delete(code);
          this.gameStates.delete(code);
        }
      }, 30000);
    }

    return { room, player, allDisconnected, removed: false };
  }

  rejoinRoom(code: string, socketId: string, nickname: string): { room: Room; oldId: string | null } | null {
    const room = this.rooms.get(code);
    if (!room) return null;

    const player = room.players.find(p => p.nickname === nickname);
    if (!player) {
      if (room.status === 'waiting') {
        const joined = this.joinRoom(code, socketId, nickname);
        return joined ? { room: joined, oldId: null } : null;
      }
      return null;
    }

    const oldId = player.id;
    player.id = socketId;
    player.isConnected = true;

    if (player.isHost) room.hostId = socketId;

    this.socketToRoom.delete(oldId);
    this.socketToRoom.set(socketId, code);

    return { room, oldId };
  }

  getRoom(code: string): Room | null {
    return this.rooms.get(code) || null;
  }

  getRoomBySocket(socketId: string): Room | null {
    const code = this.socketToRoom.get(socketId);
    if (!code) return null;
    return this.rooms.get(code) || null;
  }

  getRoomCode(socketId: string): string | null {
    return this.socketToRoom.get(socketId) || null;
  }

  selectGame(code: string, gameType: GameType): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.gameType = gameType;
  }

  setGameState(code: string, state: AvalonGameState | MafiaGameState): void {
    this.gameStates.set(code, state);
  }

  getGameState<T extends AvalonGameState | MafiaGameState>(code: string): T | null {
    return (this.gameStates.get(code) as T) || null;
  }

  startGame(code: string): void {
    const room = this.rooms.get(code);
    if (room) room.status = 'playing';
  }

  // 정상 게임 종료 — waiting으로 복귀 (같은 방에서 재시작 가능)
  endGame(code: string): void {
    const room = this.rooms.get(code);
    if (room) room.status = 'waiting';
    this.gameStates.delete(code);
  }

  // 방장 강제 종료
  forceEndGame(code: string): void {
    const room = this.rooms.get(code);
    if (room) {
      room.status = 'waiting';
      room.gameType = null;
    }
    this.gameStates.delete(code);
  }
}
