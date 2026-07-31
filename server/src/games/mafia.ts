import type { Player } from '../../../shared/src/types/common';
import type {
  MafiaGameState, MafiaPlayer, MafiaRole, MafiaTeam,
  NightAction, PsychoDisguise,
} from '../../../shared/src/types/mafia';
import {
  MAFIA_TEAM_COMPOSITION, EXTRA_CITIZEN_ROLES, PSYCHO_DISGUISE_ROLES,
} from '../../../shared/src/types/mafia';
import type { MafiaClientState } from '../../../shared/src/types/events';

interface ActionResult { success: boolean; error?: string; }

export class MafiaGame {
  private state: MafiaGameState;
  private personalMessages = new Map<string, string[]>();

  constructor(players: Player[]) {
    const count = players.length;
    const comp = MAFIA_TEAM_COMPOSITION[count];
    if (!comp) throw new Error(`지원하지 않는 인원수: ${count}`);

    const roles = this.assignRoles(count, comp);
    const shuffled = this.shuffle([...players]);

    const mafiaPlayers: MafiaPlayer[] = shuffled.map((p, i) => {
      const role = roles[i];
      const team: MafiaTeam = (role === 'mafia' || role === 'spy') ? 'mafia' : 'citizen';
      let disguiseRole: PsychoDisguise | null = null;
      if (role === 'psychopath') {
        disguiseRole = PSYCHO_DISGUISE_ROLES[Math.floor(Math.random() * PSYCHO_DISGUISE_ROLES.length)];
      }
      return {
        id: p.id, nickname: p.nickname, role, team, isAlive: true, disguiseRole,
        soldierUsed: false, vigilanteUsed: false, doctorSelfHealCount: 0,
        magicianTricksLeft: role === 'magician' ? 3 : 0,
        magicianTarget: null, spyConnected: false,
      };
    });

    this.state = {
      phase: 'role_reveal', players: mafiaPlayers, dayNumber: 1, isFirstNight: true,
      nightActions: [], dayVotes: [], finalVotes: [], executionTarget: null,
      nightDeaths: [], dayMessages: [], timerSeconds: 15, timerPhase: 'role_reveal',
      disconnectedIds: [], skipVoters: [], winner: null, winReason: null,
    };
  }

  static fromState(state: MafiaGameState): MafiaGame {
    const game = Object.create(MafiaGame.prototype);
    game.state = state;
    game.personalMessages = new Map();
    return game;
  }

  private assignRoles(count: number, comp: { mafia: number; spy: number }): MafiaRole[] {
    const roles: MafiaRole[] = [];
    for (let i = 0; i < comp.mafia; i++) roles.push('mafia');
    for (let i = 0; i < comp.spy; i++) roles.push('spy');
    roles.push('police', 'doctor');
    const citizenCount = count - roles.length;
    if (count >= 11) {
      roles.push(...EXTRA_CITIZEN_ROLES);
    } else {
      const pool = this.shuffle([...EXTRA_CITIZEN_ROLES]);
      roles.push(...pool.slice(0, citizenCount));
    }
    return this.shuffle(roles);
  }

  // ===== 페이즈 전환 =====

  advanceFromRoleReveal(): void {
    if (this.state.phase !== 'role_reveal') return;
    this.state.phase = 'night';
    this.state.timerSeconds = 30;
    this.state.timerPhase = 'night';
  }

  advanceFromNightResult(): void {
    if (this.state.phase !== 'night_result') return;
    const aliveCount = this.state.players.filter(p => p.isAlive).length;
    this.state.phase = 'day_discussion';
    this.state.timerSeconds = aliveCount * 10;
    this.state.timerPhase = 'day_discussion';
    this.state.skipVoters = [];
  }

  advanceFromDayDiscussion(): void {
    if (this.state.phase !== 'day_discussion') return;
    this.state.phase = 'day_vote';
    this.state.timerSeconds = 30;
    this.state.timerPhase = 'day_vote';
    this.state.dayVotes = [];
  }

  // 시간 증가/감소 (마피아42 스타일) delta: +10 or -10
  skipTime(playerId: string, _delta: number): { success: boolean; delta: number } {
    if (this.state.phase !== 'day_discussion') return { success: false, delta: 0 };
    if (this.state.skipVoters.includes(playerId)) return { success: false, delta: 0 };

    const player = this.state.players.find(p => p.id === playerId);
    if (!player || !player.isAlive) return { success: false, delta: 0 };

    const delta = _delta > 0 ? 10 : -10;
    this.state.skipVoters.push(playerId);
    return { success: true, delta };
  }

  onTimerExpire(timerPhase: string): void {
    // 타이머가 시작된 페이즈와 현재 페이즈가 다르면 무시
    // (중간에 유저 행동으로 페이즈가 이미 전환된 경우)
    if (this.state.phase !== timerPhase) {
      console.log(`[타이머 무시] timer=${timerPhase} current=${this.state.phase}`);
      return;
    }

    switch (this.state.phase) {
      case 'role_reveal':
        this.advanceFromRoleReveal();
        break;
      case 'night':
        this.resolveNight();
        break;
      case 'night_result':
        this.advanceFromNightResult();
        break;
      case 'day_discussion':
        this.advanceFromDayDiscussion();
        break;
      case 'day_vote':
      case 'day_vote_runoff':
        if (this.state.dayVotes.length > 0) {
          this.resolveDayVote();
        } else {
          this.goToNight();
        }
        break;
      case 'day_final_vote':
        this.autoCompleteFinalVote();
        break;
    }
  }

  private autoCompleteFinalVote(): void {
    const aliveIds = this.state.players.filter(p => p.isAlive).map(p => p.id);
    const voted = new Set(this.state.finalVotes.map(v => v.voterId));
    for (const id of aliveIds) {
      if (!voted.has(id)) {
        this.state.finalVotes.push({ voterId: id, approve: true });
      }
    }
    this.resolveFinalVote();
  }

  // ===== 밤 행동 =====

  nightAction(playerId: string, targetId: string): ActionResult {
    if (this.state.phase !== 'night') return { success: false, error: '밤이 아닙니다.' };

    const player = this.state.players.find(p => p.id === playerId);
    if (!player || !player.isAlive) return { success: false, error: '행동할 수 없습니다.' };

    const target = this.state.players.find(p => p.id === targetId);
    if (!target || !target.isAlive) return { success: false, error: '유효하지 않은 대상입니다.' };

    const actualRole = player.role;
    const displayRole = actualRole === 'psychopath' && player.disguiseRole
      ? player.disguiseRole : actualRole;

    // 첫날 밤 기자 사용 불가
    if (this.state.isFirstNight && (actualRole === 'reporter' ||
        (actualRole === 'psychopath' && player.disguiseRole === 'reporter'))) {
      return { success: false, error: '첫날 밤에는 사용할 수 없습니다.' };
    }

    // 자기 자신 제한 (경찰, 기자, 마술사)
    if (['police', 'reporter', 'magician'].includes(displayRole) && targetId === playerId) {
      return { success: false, error: '자기 자신은 선택할 수 없습니다.' };
    }

    // 의사 자힐 2회 제한
    if (actualRole === 'doctor' && targetId === playerId && player.doctorSelfHealCount >= 2) {
      return { success: false, error: '자기 치료는 게임당 2회까지 가능합니다.' };
    }

    // 덮어쓰기 허용
    this.state.nightActions = this.state.nightActions.filter(a => a.playerId !== playerId);

    const actionRole = actualRole === 'psychopath' && player.disguiseRole
      ? player.disguiseRole : actualRole;

    this.state.nightActions.push({ playerId, role: actionRole, targetId });
    return { success: true };
  }

  isNightComplete(): boolean {
    const dc = new Set(this.state.disconnectedIds);
    const alivePlayers = this.state.players.filter(p => p.isAlive && !dc.has(p.id));
    const expected: string[] = [];
    for (const p of alivePlayers) {
      const role = p.role === 'psychopath' ? p.disguiseRole : p.role;
      if (!role) continue;
      if (['mafia', 'spy', 'police', 'doctor', 'magician', 'reporter'].includes(role)) {
        if (this.state.isFirstNight && role === 'reporter') continue;
        expected.push(p.id);
      }
    }
    const acted = new Set(this.state.nightActions.map(a => a.playerId));
    return expected.every(id => acted.has(id));
  }

  setDisconnected(playerId: string): void {
    if (!this.state.disconnectedIds.includes(playerId)) {
      this.state.disconnectedIds.push(playerId);
    }
  }

  setReconnected(oldId: string, newId: string): void {
    this.state.disconnectedIds = this.state.disconnectedIds.filter(id => id !== oldId);
    // 플레이어 id 교체
    const player = this.state.players.find(p => p.id === oldId);
    if (player) player.id = newId;
    // nightActions의 id도 교체
    for (const a of this.state.nightActions) {
      if (a.playerId === oldId) a.playerId = newId;
    }
    // dayVotes의 id도 교체
    for (const v of this.state.dayVotes) {
      if (v.voterId === oldId) v.voterId = newId;
    }
    for (const v of this.state.finalVotes) {
      if (v.voterId === oldId) v.voterId = newId;
    }
  }

  resolveNight(): void {
    this.state.nightDeaths = [];
    this.state.dayMessages = [];
    this.personalMessages = new Map();

    const actions = this.state.nightActions;

    // 접선 처리 전에 스파이가 이미 접선 상태였는지 기록
    const spy = this.state.players.find(p => p.role === 'spy');
    const spyWasConnectedBefore = spy?.spyConnected ?? false;

    // 1. 스파이 접선
    const spyAction = actions.find(a => {
      const p = this.state.players.find(pl => pl.id === a.playerId);
      return p?.role === 'spy' && !p.spyConnected;
    });
    if (spyAction) {
      const target = this.state.players.find(p => p.id === spyAction.targetId);
      if (target?.role === 'mafia') {
        const spy = this.state.players.find(p => p.id === spyAction.playerId)!;
        spy.spyConnected = true;
        const mafias = this.state.players.filter(p => p.role === 'mafia');
        this.addMsg(spy.id, `접선 성공! 마피아: ${mafias.map(p => p.nickname).join(', ')}`);
        for (const m of mafias) this.addMsg(m.id, `스파이 ${spy.nickname}님이 접선했습니다.`);
      }
    }

    // 2. 마술사 트릭 설정
    const magAction = actions.find(a => {
      const p = this.state.players.find(pl => pl.id === a.playerId);
      return p?.role === 'magician' && p.magicianTricksLeft > 0;
    });
    if (magAction) {
      const mag = this.state.players.find(p => p.id === magAction.playerId)!;
      if (mag.magicianTarget !== magAction.targetId) mag.magicianTricksLeft--;
      mag.magicianTarget = magAction.targetId;
    }

    // 3. 경찰 조사
    const policeAction = actions.find(a => {
      const p = this.state.players.find(pl => pl.id === a.playerId);
      return p?.role === 'police';
    });
    if (policeAction) {
      const t = this.state.players.find(p => p.id === policeAction.targetId)!;
      this.addMsg(policeAction.playerId, `경찰 조사 결과: ${t.nickname}은(는) ${t.team === 'mafia' ? '마피아팀' : '시민팀'}입니다.`);
    }

    // 정신병자 경찰
    const psychoPolice = actions.find(a => {
      const p = this.state.players.find(pl => pl.id === a.playerId);
      return p?.role === 'psychopath' && p.disguiseRole === 'police';
    });
    if (psychoPolice) {
      const t = this.state.players.find(p => p.id === psychoPolice.targetId)!;
      this.addMsg(psychoPolice.playerId, `경찰 조사 결과: ${t.nickname}은(는) ${Math.random() < 0.7 ? '시민팀' : '마피아팀'}입니다.`);
    }

    // 4. 기자 취재 (개인 메시지)
    const reporterAction = actions.find(a => {
      const p = this.state.players.find(pl => pl.id === a.playerId);
      return p?.role === 'reporter';
    });
    if (reporterAction) {
      const t = this.state.players.find(p => p.id === reporterAction.targetId)!;
      this.addMsg(reporterAction.playerId, `${t.nickname}의 직업: ${this.getRoleName(t.role)}`);
    }

    // 5. 의사 치료 대상
    const doctorAction = actions.find(a => {
      const p = this.state.players.find(pl => pl.id === a.playerId);
      return p?.role === 'doctor';
    });
    const doctorTarget = doctorAction?.targetId || null;

    // 의사 자힐 카운트 증가
    if (doctorAction && doctorAction.targetId === doctorAction.playerId) {
      const doc = this.state.players.find(p => p.id === doctorAction.playerId);
      if (doc) doc.doctorSelfHealCount++;
    }

    // 6. 마피아 처형
    // 스파이는 이번 밤 이전에 이미 접선 완료된 경우에만 처형 참여
    // (이번 밤에 접선 성공했더라도 이번 밤 행동은 접선용이므로 제외)
    const killActions = actions.filter(a => {
      const p = this.state.players.find(pl => pl.id === a.playerId);
      if (p?.role === 'mafia') return true;
      if (p?.role === 'spy' && spyWasConnectedBefore) return true;
      return false;
    });
    const mafiaTarget = killActions.length > 0
      ? killActions[killActions.length - 1].targetId : null;

    // 7. 사망 처리
    if (mafiaTarget) {
      const target = this.state.players.find(p => p.id === mafiaTarget)!;

      // 의사 치료
      if (doctorTarget === mafiaTarget) {
        // 치료 성공 — 아무 메시지 없음 (의사에게도)
      }
      // 군인 방어
      else if (target.role === 'soldier' && !target.soldierUsed) {
        target.soldierUsed = true;
        this.addMsg(target.id, '마피아의 처형을 버텨냈습니다.');
      }
      // 마술사 트릭
      else if (target.role === 'magician' && target.magicianTarget) {
        const trick = this.state.players.find(p => p.id === target.magicianTarget);
        if (trick && trick.isAlive) {
          trick.isAlive = false;
          this.state.nightDeaths.push(trick.id);
          target.magicianTarget = null;
          this.state.dayMessages.push('마술사의 트릭이 발동했습니다.');
        } else {
          target.magicianTarget = null;
          target.isAlive = false;
          this.state.nightDeaths.push(mafiaTarget);
        }
      }
      // 일반 사망
      else {
        target.isAlive = false;
        this.state.nightDeaths.push(mafiaTarget);
      }
    }

    // 8. 자경단 밤 사용 처리 (nightAction에서 별도 vigilante-action 이벤트)
    // — vigilanteAction 메서드에서 즉시 처리되므로 여기서는 별도 로직 불필요

    // 9. 스파이 첫날 밤 직업 확인
    if (this.state.isFirstNight) {
      const spy = this.state.players.find(p => p.role === 'spy' && p.isAlive);
      if (spy && this.state.nightDeaths.length > 0) {
        const info = this.state.nightDeaths.map(id => {
          const d = this.state.players.find(p => p.id === id)!;
          return `${d.nickname}: ${this.getRoleName(d.role)}`;
        }).join(', ');
        this.addMsg(spy.id, `사망자 직업: ${info}`);
      }
    }

    // 10. 기자 기사 발행 (전체 공개)
    if (!this.state.isFirstNight) {
      if (reporterAction) {
        const t = this.state.players.find(p => p.id === reporterAction.targetId)!;
        this.state.dayMessages.push(`특종! ${t.nickname}의 직업은 ${this.getRoleName(t.role)}입니다.`);
      }
      // 정신병자 기자
      const psychoReporter = actions.find(a => {
        const p = this.state.players.find(pl => pl.id === a.playerId);
        return p?.role === 'psychopath' && p.disguiseRole === 'reporter';
      });
      if (psychoReporter) {
        const t = this.state.players.find(p => p.id === psychoReporter.targetId)!;
        const allRoles: MafiaRole[] = ['mafia','spy','police','doctor','soldier','politician','vigilante','reporter','magician','citizen','psychopath'];
        const fake = allRoles[Math.floor(Math.random() * allRoles.length)];
        this.state.dayMessages.push(`특종! ${t.nickname}의 직업은 ${this.getRoleName(fake)}입니다.`);
      }
    }

    // 아침 메시지
    if (this.state.nightDeaths.length === 0) {
      this.state.dayMessages.push('아무 일도 일어나지 않았습니다.');
    } else {
      for (const id of this.state.nightDeaths) {
        const d = this.state.players.find(p => p.id === id)!;
        this.state.dayMessages.push(`지난밤, ${d.nickname}님이 사망했습니다.`);
      }
    }

    if (this.checkWinCondition()) return;

    this.state.nightActions = [];
    this.state.isFirstNight = false;
    this.state.phase = 'night_result';
    this.state.timerSeconds = 8;
    this.state.timerPhase = 'night_result';
  }

  // ===== 낮 투표 =====

  dayVote(voterId: string, targetId: string): ActionResult {
    if (!['day_discussion', 'day_vote', 'day_vote_runoff'].includes(this.state.phase)) {
      return { success: false, error: '투표 단계가 아닙니다.' };
    }

    const voter = this.state.players.find(p => p.id === voterId);
    if (!voter || !voter.isAlive) return { success: false, error: '투표할 수 없습니다.' };

    const target = this.state.players.find(p => p.id === targetId);
    if (!target || !target.isAlive) return { success: false, error: '유효하지 않은 대상입니다.' };

    this.state.dayVotes = this.state.dayVotes.filter(v => v.voterId !== voterId);
    this.state.dayVotes.push({ voterId, targetId });

    if (this.state.phase === 'day_discussion') {
      this.state.phase = 'day_vote';
      this.state.timerSeconds = 30;
      this.state.timerPhase = 'day_vote';
    }

    const dc = new Set(this.state.disconnectedIds);
    const activeAlive = this.state.players.filter(p => p.isAlive && !dc.has(p.id)).length;
    if (this.state.dayVotes.length >= activeAlive) {
      this.resolveDayVote();
    }

    return { success: true };
  }

  private resolveDayVote(): void {
    const counts = new Map<string, number>();
    for (const v of this.state.dayVotes) {
      const voter = this.state.players.find(p => p.id === v.voterId)!;
      const w = voter.role === 'politician' ? 2 : 1;
      counts.set(v.targetId, (counts.get(v.targetId) || 0) + w);
    }

    let max = 0;
    const candidates: string[] = [];
    for (const [id, c] of counts) {
      if (c > max) { max = c; candidates.length = 0; candidates.push(id); }
      else if (c === max) candidates.push(id);
    }

    if (candidates.length === 1) {
      this.state.executionTarget = candidates[0];
      this.state.finalVotes = [];
      this.state.phase = 'day_final_vote';
      this.state.timerSeconds = 15;
      this.state.timerPhase = 'day_final_vote';
    } else if (this.state.phase === 'day_vote_runoff') {
      this.goToNight();
    } else {
      this.state.dayVotes = [];
      this.state.phase = 'day_vote_runoff';
      this.state.timerSeconds = 20;
      this.state.timerPhase = 'day_vote_runoff';
    }
  }

  finalVote(voterId: string, approve: boolean): ActionResult {
    if (this.state.phase !== 'day_final_vote') return { success: false, error: '최종 투표 단계가 아닙니다.' };

    const voter = this.state.players.find(p => p.id === voterId);
    if (!voter || !voter.isAlive) return { success: false, error: '투표할 수 없습니다.' };

    this.state.finalVotes = this.state.finalVotes.filter(v => v.voterId !== voterId);
    this.state.finalVotes.push({ voterId, approve });

    const dc2 = new Set(this.state.disconnectedIds);
    const activeAlive2 = this.state.players.filter(p => p.isAlive && !dc2.has(p.id)).length;
    if (this.state.finalVotes.length >= activeAlive2) this.resolveFinalVote();

    return { success: true };
  }

  private resolveFinalVote(): void {
    let yes = 0, no = 0;
    for (const v of this.state.finalVotes) {
      const voter = this.state.players.find(p => p.id === v.voterId)!;
      const w = voter.role === 'politician' ? 2 : 1;
      if (v.approve) yes += w; else no += w;
    }

    if (yes <= no) { this.goToNight(); return; }

    const target = this.state.players.find(p => p.id === this.state.executionTarget)!;

    // 정치인 면역
    if (target.role === 'politician') {
      this.state.dayMessages.push('정치인은 투표로 처형되지 않습니다.');
      this.goToNight();
      return;
    }

    // 낮 투표 처형에는 마술사 트릭 발동 안 됨 — 그냥 사망
    target.isAlive = false;
    this.state.dayMessages.push(`${target.nickname}님이 처형되었습니다.`);
    if (this.checkWinCondition()) return;
    this.goToNight();
  }

  // ===== 자경단 =====

  vigilanteAction(playerId: string, targetId: string): ActionResult {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || !player.isAlive) return { success: false, error: '행동할 수 없습니다.' };

    if (player.role === 'vigilante') {
      if (player.vigilanteUsed) return { success: false, error: '이미 능력을 사용했습니다.' };
      if (!['day_discussion', 'night'].includes(this.state.phase))
        return { success: false, error: '지금은 사용할 수 없습니다.' };

      const target = this.state.players.find(p => p.id === targetId);
      if (!target || !target.isAlive) return { success: false, error: '유효하지 않은 대상입니다.' };

      player.vigilanteUsed = true;

      // 자경단에는 마술사 트릭 발동 안 됨 — 그냥 사망
      target.isAlive = false;
      this.state.dayMessages.push(`자경단이 ${target.nickname}님을 살해했습니다.`);
      this.checkWinCondition();
      return { success: true };
    }

    // 정신병자 자경단
    if (player.role === 'psychopath' && player.disguiseRole === 'vigilante') {
      if (player.vigilanteUsed) return { success: false, error: '이미 능력을 사용했습니다.' };
      player.vigilanteUsed = true;
      this.addMsg(player.id, '총알이 없습니다.');
      return { success: true };
    }

    return { success: false, error: '자경단이 아닙니다.' };
  }

  // ===== 유틸 =====

  private goToNight(): void {
    this.state.dayNumber++;
    this.state.dayVotes = [];
    this.state.finalVotes = [];
    this.state.executionTarget = null;
    this.state.nightActions = [];
    this.state.nightDeaths = [];
    // dayMessages는 resolveNight 시작 시 초기화 (낮 메시지가 밤 전환 시 보여야 함)
    this.state.skipVoters = [];
    this.state.phase = 'night';
    this.state.timerSeconds = 30;
    this.state.timerPhase = 'night';
  }

  checkWinCondition(): boolean {
    const alive = this.state.players.filter(p => p.isAlive);
    const mafiaAlive = alive.filter(p => p.role === 'mafia').length;
    const spyAlive = alive.find(p => p.role === 'spy');
    const connectedSpyAlive = spyAlive?.spyConnected ? 1 : 0;

    const mafiaWithKillPower = mafiaAlive + connectedSpyAlive;
    const mafiaTeamAlive = alive.filter(p => p.team === 'mafia').length;
    const citizenAlive = alive.filter(p => p.team === 'citizen').length;

    if (mafiaWithKillPower === 0) {
      this.state.winner = 'citizen';
      this.state.winReason = '마피아팀이 모두 제거되었습니다. 시민팀이 승리했습니다.';
      this.state.phase = 'game_over';
      return true;
    }

    if (mafiaTeamAlive >= citizenAlive) {
      const politicianAlive = alive.some(p => p.role === 'politician');
      if (mafiaTeamAlive === citizenAlive && politicianAlive) {
        // 정치인 2표로 아직 처형 가능 — 게임 계속
      } else {
        this.state.winner = 'mafia';
        this.state.winReason = '마피아팀의 수가 시민팀과 같아졌습니다. 마피아팀이 승리했습니다.';
        this.state.phase = 'game_over';
        return true;
      }
    }

    return false;
  }

  getMafiaChatMembers(): string[] {
    return this.state.players
      .filter(p => p.isAlive && (p.role === 'mafia' || (p.role === 'spy' && p.spyConnected)))
      .map(p => p.id);
  }

  getState(): MafiaGameState { return this.state; }

  getPersonalMessages(playerId: string): string[] {
    return this.personalMessages.get(playerId) || [];
  }

  private addMsg(playerId: string, message: string): void {
    if (!this.personalMessages.has(playerId)) this.personalMessages.set(playerId, []);
    this.personalMessages.get(playerId)!.push(message);
  }

  getClientState(playerId: string): MafiaClientState {
    const player = this.state.players.find(p => p.id === playerId)!;
    const knownMafia: string[] = [];

    if (player.role === 'mafia') {
      knownMafia.push(...this.state.players.filter(p => p.role === 'mafia' && p.id !== playerId).map(p => p.id));
    }
    if (player.role === 'spy' && player.spyConnected) {
      knownMafia.push(...this.state.players.filter(p => p.role === 'mafia').map(p => p.id));
    }
    const spy = this.state.players.find(p => p.role === 'spy' && p.spyConnected);
    if (player.role === 'mafia' && spy) knownMafia.push(spy.id);

    const displayRole = player.role === 'psychopath' && player.disguiseRole
      ? player.disguiseRole : player.role;

    const isMafiaChatMember = this.getMafiaChatMembers().includes(playerId);

    return {
      phase: this.state.phase, dayNumber: this.state.dayNumber,
      players: this.state.players.map(p => ({ id: p.id, nickname: p.nickname, isAlive: p.isAlive })),
      myRole: displayRole, myTeam: player.team,
      myDisguiseRole: player.role === 'psychopath' ? player.disguiseRole : null,
      vigilanteUsed: player.vigilanteUsed,
      isMafiaChatMember,
      myNightTarget: this.state.nightActions.find(a => a.playerId === playerId)?.targetId || null,
      myDayVoteTarget: this.state.dayVotes.find(v => v.voterId === playerId)?.targetId || null,
      myFinalVote: this.state.finalVotes.find(v => v.voterId === playerId)?.approve ?? null,
      voteCount: this.state.phase === 'day_final_vote'
        ? this.state.finalVotes.length
        : this.state.dayVotes.length,
      aliveCount: this.state.players.filter(p => p.isAlive).length,
      dayVotes: ['day_vote', 'day_vote_runoff'].includes(this.state.phase) ? this.state.dayVotes : null,
      finalVotes: this.state.phase === 'day_final_vote' ? this.state.finalVotes : null,
      executionTarget: this.state.executionTarget,
      nightDeaths: this.state.nightDeaths, dayMessages: this.state.dayMessages,
      knownMafia,
      spyConnected: player.role === 'spy' ? player.spyConnected : (player.role === 'mafia' ? !!spy : false),
      timerSeconds: this.state.timerSeconds, timerPhase: this.state.timerPhase,
      skipVoters: this.state.skipVoters,
      // 게임 종료 또는 본인 사망 시 전체 직업 공개
      revealedRoles: (this.state.winner || !player.isAlive)
        ? Object.fromEntries(this.state.players.map(p => [p.id, this.getRoleName(p.role)]))
        : null,
      winner: this.state.winner, winReason: this.state.winReason,
    };
  }

  getRoleName(role: MafiaRole): string {
    const n: Record<MafiaRole, string> = {
      mafia: '마피아', spy: '스파이', police: '경찰', doctor: '의사',
      soldier: '군인', politician: '정치인', vigilante: '자경단',
      reporter: '기자', magician: '마술사', citizen: '일반시민', psychopath: '정신병자',
    };
    return n[role];
  }

  private shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
