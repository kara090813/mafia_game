import type { Player } from '../../../shared/src/types/common';
import type {
  AvalonGameState, AvalonPlayer, AvalonRole, AvalonTeam,
  QuestResult,
} from '../../../shared/src/types/avalon';
import { QUEST_SIZES, TEAM_COMPOSITION } from '../../../shared/src/types/avalon';
import type { AvalonClientState } from '../../../shared/src/types/events';

interface ActionResult {
  success: boolean;
  error?: string;
}

export class AvalonGame {
  private state: AvalonGameState;

  constructor(players: Player[]) {
    const count = players.length;
    const comp = TEAM_COMPOSITION[count];
    if (!comp) throw new Error(`지원하지 않는 인원수: ${count}`);

    const roles = this.assignRoles(count, comp);
    const shuffledPlayers = this.shuffle([...players]);

    const avalonPlayers: AvalonPlayer[] = shuffledPlayers.map((p, i) => ({
      id: p.id,
      nickname: p.nickname,
      role: roles[i],
      team: (roles[i] === 'angel' || roles[i] === 'archangel') ? 'angel' : 'demon',
    }));

    const playerOrder = avalonPlayers.map(p => p.id);
    const firstLeader = Math.floor(Math.random() * playerOrder.length);

    this.state = {
      phase: 'role_reveal',
      players: avalonPlayers,
      playerOrder,
      currentLeaderIndex: firstLeader,
      currentQuest: 1,
      questResults: [],
      consecutiveRejects: 0,
      proposedTeam: [],
      teamVotes: [],
      questVotes: new Map(),
      assassinationTarget: null,
      skipVoters: [],
      winner: null,
      winReason: null,
    };
  }

  static fromState(state: AvalonGameState): AvalonGame {
    const game = Object.create(AvalonGame.prototype);
    game.state = {
      ...state,
      questVotes: state.questVotes instanceof Map
        ? state.questVotes
        : new Map(Object.entries(state.questVotes || {})),
    };
    return game;
  }

  private assignRoles(count: number, comp: { angel: number; demon: number }): AvalonRole[] {
    const roles: AvalonRole[] = [];
    roles.push('archdemon');
    for (let i = 1; i < comp.demon; i++) roles.push('demon');
    roles.push('archangel');
    for (let i = 1; i < comp.angel; i++) roles.push('angel');
    return this.shuffle(roles);
  }

  // ===== 페이즈 전환 =====

  advanceFromRoleReveal(): void {
    if (this.state.phase !== 'role_reveal') return;
    this.state.phase = 'team_building';
    this.state.skipVoters = [];
  }

  skipTime(playerId: string, delta: number): { success: boolean; delta: number } {
    if (this.state.phase !== 'team_building' && this.state.phase !== 'team_discussion') return { success: false, delta: 0 };
    if (this.state.skipVoters.includes(playerId)) return { success: false, delta: 0 };
    this.state.skipVoters.push(playerId);
    return { success: true, delta: delta > 0 ? 10 : -10 };
  }

  // 원정대 찬반 투표 타이머 만료 → 현재까지의 표로 확정 (미투표는 미집계)
  finalizeTeamVote(): void {
    if (this.state.phase !== 'team_discussion' && this.state.phase !== 'team_vote') return;
    this.resolveTeamVote();
  }

  // 원정 수행 타이머 만료 → 미투표 원정대원은 성공으로 처리 후 확정
  finalizeQuest(): void {
    if (this.state.phase !== 'quest') return;
    for (const id of this.state.proposedTeam) {
      if (!this.state.questVotes.has(id)) this.state.questVotes.set(id, true);
    }
    this.resolveQuest();
  }

  advanceFromQuestResult(): void {
    if (this.state.phase !== 'quest_result') return;

    const angelWins = this.state.questResults.filter(r => r.success).length;
    const demonWins = this.state.questResults.filter(r => !r.success).length;

    if (demonWins >= 3) {
      this.state.winner = 'demon';
      this.state.winReason = '악마 진영이 원정 3개를 실패시켰습니다.';
      this.state.phase = 'game_over';
      return;
    }

    if (angelWins >= 3) {
      this.state.phase = 'assassination';
      return;
    }

    this.state.currentQuest++;
    this.state.currentLeaderIndex =
      (this.state.currentLeaderIndex + 1) % this.state.playerOrder.length;
    this.state.proposedTeam = [];
    this.state.teamVotes = [];
    this.state.questVotes = new Map();
    this.state.consecutiveRejects = 0;
    this.state.phase = 'team_building';
  }

  // ===== 게임 액션 =====

  proposeTeam(leaderId: string, memberIds: string[]): ActionResult {
    if (this.state.phase !== 'team_building') {
      return { success: false, error: '원정대 구성 단계가 아닙니다.' };
    }

    const currentLeaderId = this.state.playerOrder[this.state.currentLeaderIndex];
    if (leaderId !== currentLeaderId) {
      return { success: false, error: '원정대장만 구성할 수 있습니다.' };
    }

    const questSizes = QUEST_SIZES[this.state.players.length];
    const required = questSizes[this.state.currentQuest - 1];

    if (memberIds.length !== required) {
      return { success: false, error: `${required}명을 선택해야 합니다.` };
    }

    const validIds = new Set(this.state.playerOrder);
    if (!memberIds.every(id => validIds.has(id))) {
      return { success: false, error: '유효하지 않은 플레이어입니다.' };
    }

    this.state.proposedTeam = memberIds;
    this.state.teamVotes = [];
    this.state.phase = 'team_discussion';

    return { success: true };
  }

  voteTeam(playerId: string, approve: boolean): ActionResult {
    if (this.state.phase !== 'team_discussion' && this.state.phase !== 'team_vote') {
      return { success: false, error: '투표 단계가 아닙니다.' };
    }

    this.state.phase = 'team_vote';

    // 재투표 허용 — 기존 투표를 제거하고 최신 투표로 덮어씀 (변경 가능)
    this.state.teamVotes = this.state.teamVotes.filter(v => v.playerId !== playerId);
    this.state.teamVotes.push({ playerId, approve });

    // 모든 인원이 투표하면 시간과 무관하게 즉시 진행
    if (this.state.teamVotes.length === this.state.players.length) {
      this.resolveTeamVote();
    }

    return { success: true };
  }

  private resolveTeamVote(): void {
    const approveCount = this.state.teamVotes.filter(v => v.approve).length;
    const majority = Math.floor(this.state.players.length / 2) + 1;

    if (approveCount >= majority) {
      this.state.consecutiveRejects = 0;
      this.state.questVotes = new Map();
      this.state.phase = 'quest';
    } else {
      this.state.consecutiveRejects++;

      if (this.state.consecutiveRejects >= 5) {
        this.state.winner = 'demon';
        this.state.winReason = '원정대 투표가 연속 5번 부결되었습니다.';
        this.state.phase = 'game_over';
        return;
      }

      this.state.currentLeaderIndex =
        (this.state.currentLeaderIndex + 1) % this.state.playerOrder.length;
      this.state.proposedTeam = [];
      this.state.teamVotes = [];
      this.state.skipVoters = [];
      this.state.phase = 'team_building';
    }
  }

  questVote(playerId: string, success: boolean): ActionResult {
    if (this.state.phase !== 'quest') {
      return { success: false, error: '원정 수행 단계가 아닙니다.' };
    }

    if (!this.state.proposedTeam.includes(playerId)) {
      return { success: false, error: '원정대원만 투표할 수 있습니다.' };
    }

    const player = this.state.players.find(p => p.id === playerId)!;
    if ((player.team === 'angel') && !success) {
      return { success: false, error: '천사 진영은 반드시 성공을 선택해야 합니다.' };
    }

    // 재투표 허용 — Map.set이 기존 값을 덮어씀 (변경 가능)
    this.state.questVotes.set(playerId, success);

    // 원정대원이 모두 투표하면 시간과 무관하게 즉시 진행
    if (this.state.questVotes.size === this.state.proposedTeam.length) {
      this.resolveQuest();
    }

    return { success: true };
  }

  private resolveQuest(): void {
    const votes = Array.from(this.state.questVotes.values());
    const failCount = votes.filter(v => !v).length;
    const successCount = votes.filter(v => v).length;

    const playerCount = this.state.players.length;
    const questNum = this.state.currentQuest;
    const failThreshold = (playerCount >= 7 && questNum === 4) ? 2 : 1;

    const questSuccess = failCount < failThreshold;

    const result: QuestResult = {
      questNumber: this.state.currentQuest,
      requiredPlayers: this.state.proposedTeam.length,
      teamMembers: [...this.state.proposedTeam],
      success: questSuccess,
      successCount,
      failCount,
    };

    this.state.questResults.push(result);
    this.state.phase = 'quest_result';
    // quest_result에서 타이머 만료 후 advanceFromQuestResult() 호출
  }

  assassinate(archDemonId: string, targetId: string): ActionResult {
    if (this.state.phase !== 'assassination') {
      return { success: false, error: '대천사 지목 단계가 아닙니다.' };
    }

    const archDemon = this.state.players.find(p => p.id === archDemonId);
    if (!archDemon || archDemon.role !== 'archdemon') {
      return { success: false, error: '대악마만 지목할 수 있습니다.' };
    }

    this.state.assassinationTarget = targetId;
    const target = this.state.players.find(p => p.id === targetId)!;

    if (target.role === 'archangel') {
      this.state.winner = 'demon';
      this.state.winReason = '대악마가 대천사를 정확히 지목했습니다.';
    } else {
      this.state.winner = 'angel';
      this.state.winReason = '대악마가 대천사를 찾지 못했습니다. 천사 진영 승리!';
    }

    this.state.phase = 'game_over';
    return { success: true };
  }

  getState(): AvalonGameState {
    return this.state;
  }

  getClientState(playerId: string): AvalonClientState {
    const player = this.state.players.find(p => p.id === playerId)!;
    const knownEvil: string[] = [];

    if (player.role === 'archangel') {
      knownEvil.push(
        ...this.state.players.filter(p => p.team === 'demon').map(p => p.id)
      );
    }

    if (player.team === 'demon') {
      knownEvil.push(
        ...this.state.players.filter(p => p.team === 'demon' && p.id !== playerId).map(p => p.id)
      );
    }

    const allVoted = this.state.teamVotes.length === this.state.players.length;

    return {
      phase: this.state.phase,
      playerOrder: this.state.playerOrder,
      currentLeaderIndex: this.state.currentLeaderIndex,
      currentQuest: this.state.currentQuest,
      questResults: this.state.questResults,
      consecutiveRejects: this.state.consecutiveRejects,
      proposedTeam: this.state.proposedTeam,
      teamVotes: allVoted ? this.state.teamVotes : null,
      myRole: player.role,
      myTeam: player.team,
      knownEvil,
      skipVoters: this.state.skipVoters,
      winner: this.state.winner,
      winReason: this.state.winReason,
    };
  }

  private shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
