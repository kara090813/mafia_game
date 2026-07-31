import type { Room, Player, ChatMessage, GameType } from './common';
import type { AvalonGameState } from './avalon';
import type { MafiaGameState } from './mafia';

// 클라이언트 → 서버
export interface ClientToServerEvents {
  'room:create': (nickname: string, callback: (room: Room) => void) => void;
  'room:join': (code: string, nickname: string, callback: (room: Room | null, error?: string) => void) => void;
  'room:rejoin': (code: string, nickname: string, callback: (result: { room: Room; gameState?: unknown } | null) => void) => void;
  'room:leave': () => void;
  'room:select-game': (gameType: GameType) => void;
  'room:start-game': () => void;
  'room:end-game': () => void;

  'chat:send': (message: string, channel?: 'public' | 'mafia') => void;

  'avalon:propose-team': (memberIds: string[]) => void;
  'avalon:vote-team': (approve: boolean) => void;
  'avalon:quest-vote': (success: boolean) => void;
  'avalon:assassinate': (targetId: string) => void;
  'avalon:skip-time': (delta: number) => void;
  'avalon:ready': () => void;

  'mafia:night-action': (targetId: string) => void;
  'mafia:day-vote': (targetId: string) => void;
  'mafia:final-vote': (approve: boolean) => void;
  'mafia:vigilante-action': (targetId: string) => void;
  'mafia:skip-time': (delta: number) => void;
  'mafia:ready': () => void;
}

// 서버 → 클라이언트
export interface ServerToClientEvents {
  'room:updated': (room: Room) => void;
  'room:player-joined': (player: Player) => void;
  'room:player-left': (playerId: string) => void;
  'room:error': (message: string) => void;

  'chat:message': (message: ChatMessage) => void;

  'avalon:state': (state: AvalonClientState) => void;
  'avalon:phase-change': (phase: AvalonGameState['phase']) => void;

  'mafia:state': (state: MafiaClientState) => void;
  'mafia:phase-change': (phase: MafiaGameState['phase']) => void;
  'mafia:personal-message': (data: { text: string; day: number; phase: string }) => void;

  'timer:start': (seconds: number, phase: string) => void;
  'timer:tick': (seconds: number) => void;
  'timer:end': () => void;
}

export interface AvalonClientState {
  phase: AvalonGameState['phase'];
  playerOrder: string[];
  currentLeaderIndex: number;
  currentQuest: number;
  questResults: AvalonGameState['questResults'];
  consecutiveRejects: number;
  proposedTeam: string[];
  teamVotes: AvalonGameState['teamVotes'] | null;
  myRole: string;
  myTeam: string;
  knownEvil: string[];
  skipVoters: string[];
  winner: string | null;
  winReason: string | null;
}

export interface MafiaClientState {
  phase: MafiaGameState['phase'];
  dayNumber: number;
  players: {
    id: string;
    nickname: string;
    isAlive: boolean;
  }[];
  myRole: string;
  myTeam: string;
  myDisguiseRole: string | null;
  vigilanteUsed: boolean;
  isMafiaChatMember: boolean;
  myNightTarget: string | null;
  myDayVoteTarget: string | null;
  myFinalVote: boolean | null;
  voteCount: number;
  aliveCount: number;
  dayVotes: MafiaGameState['dayVotes'] | null;
  finalVotes: MafiaGameState['finalVotes'] | null;
  executionTarget: string | null;
  nightDeaths: string[];
  dayMessages: string[];
  knownMafia: string[];
  spyConnected: boolean;
  timerSeconds: number;
  timerPhase: string;
  skipVoters: string[];
  revealedRoles: Record<string, string> | null;
  winner: string | null;
  winReason: string | null;
}
