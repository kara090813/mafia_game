// 천사와 악마 (레지스탕스 아발론 변형)

export type AvalonRole = 'angel' | 'archangel' | 'demon' | 'archdemon';
export type AvalonTeam = 'angel' | 'demon';

export type AvalonPhase =
  | 'role_reveal'       // 역할 확인
  | 'team_building'     // 원정대 구성
  | 'team_discussion'   // 토론
  | 'team_vote'         // 원정대 찬반 투표
  | 'quest'             // 원정 수행
  | 'quest_result'      // 원정 결과
  | 'assassination'     // 대천사 지목
  | 'game_over';        // 게임 종료

export interface AvalonPlayer {
  id: string;
  nickname: string;
  role: AvalonRole;
  team: AvalonTeam;
}

export interface QuestResult {
  questNumber: number;
  requiredPlayers: number;
  teamMembers: string[];      // player ids
  success: boolean | null;
  successCount: number;
  failCount: number;
}

export interface TeamVote {
  playerId: string;
  approve: boolean;
}

export interface AvalonGameState {
  phase: AvalonPhase;
  players: AvalonPlayer[];
  playerOrder: string[];       // 플레이어 순서
  currentLeaderIndex: number;  // 현재 원정대장 인덱스
  currentQuest: number;        // 현재 원정 차수 (1-5)
  questResults: QuestResult[];
  consecutiveRejects: number;  // 연속 부결 횟수
  proposedTeam: string[];      // 제안된 원정대원 ids
  teamVotes: TeamVote[];
  questVotes: Map<string, boolean>; // 원정 성공/실패 투표
  assassinationTarget: string | null;
  skipVoters: string[];
  winner: AvalonTeam | null;
  winReason: string | null;
}

// 인원별 원정 참가 인원
export const QUEST_SIZES: Record<number, number[]> = {
  5:  [2, 3, 2, 3, 3],
  6:  [2, 3, 4, 3, 4],
  7:  [2, 3, 3, 4, 4],
  8:  [3, 4, 4, 5, 5],
  9:  [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

// 인원별 진영 구성
export const TEAM_COMPOSITION: Record<number, { angel: number; demon: number }> = {
  5:  { angel: 3, demon: 2 },
  6:  { angel: 4, demon: 2 },
  7:  { angel: 4, demon: 3 },
  8:  { angel: 5, demon: 3 },
  9:  { angel: 6, demon: 3 },
  10: { angel: 6, demon: 4 },
};
