// 마피아 게임

export type MafiaTeam = 'citizen' | 'mafia';

export type MafiaRole =
  | 'mafia' | 'spy'
  | 'police' | 'doctor' | 'soldier' | 'politician'
  | 'vigilante' | 'reporter' | 'magician' | 'citizen' | 'psychopath';

export type PsychoDisguise = Exclude<MafiaRole, 'citizen' | 'psychopath' | 'mafia' | 'spy'>;

export type MafiaPhase =
  | 'role_reveal' | 'night' | 'night_result'
  | 'day_discussion' | 'day_vote' | 'day_vote_runoff' | 'day_final_vote'
  | 'game_over';

export interface MafiaPlayer {
  id: string;
  nickname: string;
  role: MafiaRole;
  team: MafiaTeam;
  isAlive: boolean;
  disguiseRole: PsychoDisguise | null;
  soldierUsed: boolean;
  vigilanteUsed: boolean;
  doctorSelfHealCount: number; // 자힐 사용 횟수 (최대 2)
  magicianTricksLeft: number;
  magicianTarget: string | null;
  spyConnected: boolean;
}

export interface NightAction {
  playerId: string;
  role: MafiaRole;
  targetId: string;
}

export interface MafiaVote {
  voterId: string;
  targetId: string;
}

export interface FinalVote {
  voterId: string;
  approve: boolean;
}

export interface MafiaGameState {
  phase: MafiaPhase;
  players: MafiaPlayer[];
  dayNumber: number;
  isFirstNight: boolean;
  nightActions: NightAction[];
  dayVotes: MafiaVote[];
  finalVotes: FinalVote[];
  executionTarget: string | null;
  nightDeaths: string[];
  dayMessages: string[];
  timerSeconds: number;
  timerPhase: string;
  // 연결 끊긴 플레이어
  disconnectedIds: string[];
  // 시간 단축
  skipVoters: string[];
  winner: MafiaTeam | null;
  winReason: string | null;
}

export const MAFIA_TEAM_COMPOSITION: Record<number, { mafia: number; spy: number }> = {
  7: { mafia: 1, spy: 1 }, 8: { mafia: 1, spy: 1 }, 9: { mafia: 1, spy: 1 },
  10: { mafia: 1, spy: 1 }, 11: { mafia: 1, spy: 1 }, 12: { mafia: 2, spy: 1 },
};

export const EXTRA_CITIZEN_ROLES: MafiaRole[] = [
  'soldier', 'politician', 'vigilante', 'reporter', 'magician', 'citizen', 'psychopath',
];

export const PSYCHO_DISGUISE_ROLES: PsychoDisguise[] = [
  'police', 'doctor', 'soldier', 'politician', 'vigilante', 'reporter', 'magician',
];
