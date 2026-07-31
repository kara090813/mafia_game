export type GameType = 'avalon' | 'mafia';

export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
  isConnected: boolean;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  players: Player[];
  gameType: GameType | null;
  status: 'waiting' | 'playing' | 'finished';
  maxPlayers: number;
  minPlayers: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  content: string;
  timestamp: number;
  channel: 'public' | 'mafia' | 'system';
}
