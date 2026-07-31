import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { useGameStore } from '../stores/game-store';
import { useRoomStore } from '../stores/room-store';
import { Chat } from '../components/Chat';
import { Avatar } from '../components/Avatar';
import { RuleButton } from '../components/RuleModal';

const ROLE_NAMES: Record<string, string> = {
  mafia: '마피아', spy: '스파이', police: '경찰', doctor: '의사',
  soldier: '군인', politician: '정치인', vigilante: '자경단',
  reporter: '기자', magician: '마술사', citizen: '일반시민', psychopath: '정신병자',
  unknown: '알수없음',
};
const ALL_GUESS_ROLES = ['unknown','mafia','spy','police','doctor','soldier','politician','vigilante','reporter','magician','citizen','psychopath'];
const MAFIA_ROLES = ['mafia', 'spy'];

interface RoleInfo { team: string; ability: string[]; limit?: string[]; note?: string; }
const ROLE_INFO: Record<string, RoleInfo> = {
  mafia: { team: '마피아팀', ability: ['밤마다 생존한 플레이어 한 명을 처형합니다.','마피아끼리는 밤에 전용 채팅을 사용합니다.'], note: '마피아가 2명인 경우 마지막 확정 선택 적용.' },
  spy: { team: '마피아팀', ability: ['매일 밤 접선을 시도합니다.','접선 성공 시 서로 정체 확인 + 팀 채팅 참여.','첫날 밤 사망자 직업 확인.'], limit: ['시작 시 마피아 모름.','접선 실패 시 정보 없음.'] },
  police: { team: '시민팀', ability: ['매일 밤 1명 조사 (시민팀/마피아팀).'], limit: ['직업 불명.','자기 조사 불가.'] },
  doctor: { team: '시민팀', ability: ['매일 밤 자신 포함 1명 치료.','마피아 공격 방어.'], limit: ['자기 치료는 게임당 2회까지.','자경단/투표/트릭 치료 불가.'] },
  soldier: { team: '시민팀', ability: ['마피아 공격 1회 자동 방어.'], limit: ['자경단/투표/트릭 방어 불가.'] },
  politician: { team: '시민팀', ability: ['모든 투표 2표.','투표 처형 면역.'], limit: ['마피아/자경단 방어 불가.'] },
  vigilante: { team: '시민팀', ability: ['게임당 1회, 낮/밤 즉시 1명 살해.'], limit: ['투표 중 불가. 취소 불가.'] },
  reporter: { team: '시민팀', ability: ['밤에 1명 직업 취재. 다음 날 공개.'], limit: ['첫날 밤 불가.'] },
  magician: { team: '시민팀', ability: ['밤에 트릭 설정 (최대 3회).','마피아 공격 시 트릭 대상이 대신 사망.'], limit: ['낮 투표/자경단 발동 안 됨.'] },
  citizen: { team: '시민팀', ability: ['특별한 능력 없음.'] },
};

const PHASE_LABELS: Record<string, string> = {
  role_reveal: '역할 확인', night: '밤', night_result: '아침',
  day_discussion: '낮 토론', day_vote: '처형 투표', day_vote_runoff: '재투표',
  day_final_vote: '최종 투표', game_over: '게임 종료',
};
const NIGHT_LABELS: Record<string, string> = {
  mafia: '처형할 대상', spy: '접선할 대상', spy_connected: '처형할 대상',
  police: '조사할 대상', doctor: '치료할 대상', magician: '트릭 대상', reporter: '취재할 대상',
};

interface LogEntry { day: number; phase: string; messages: { text: string; type: 'public' | 'private' }[]; }

export function MafiaGame() {
  const navigate = useNavigate();
  const { mafiaState, personalMessages, timer, clearGame, pendingModal, setPendingModal } = useGameStore();
  const { room } = useRoomStore();
  const [guesses, setGuesses] = useState<Record<string, string>>({});
  const [eventLog, setEventLog] = useState<LogEntry[]>([]);
  const [activeDay, setActiveDay] = useState(1);
  const [tab, setTab] = useState<'main' | 'chat'>('main');
  const [memoOpen, setMemoOpen] = useState(false);
  const [dragRole, setDragRole] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const [waitingRedirect, setWaitingRedirect] = useState(false);
  useEffect(() => {
    if (!mafiaState) {
      // 2초 대기 후에도 복구 안 되면 리다이렉트
      const t = setTimeout(() => setWaitingRedirect(true), 2000);
      return () => clearTimeout(t);
    }
    setWaitingRedirect(false);
  }, [mafiaState]);

  useEffect(() => {
    if (waitingRedirect && !mafiaState) {
      navigate(room ? '/lobby' : '/');
    }
  }, [waitingRedirect, mafiaState, room]);

  if (!mafiaState) {
    return <div className="app"><div className="page-center"><p className="text-center text-dim text-sm">게임 상태 로딩 중...</p></div></div>;
  }

  const s = mafiaState;
  const myId = socket.id!;
  const alive = s.players.filter(p => p.isAlive);
  const dead = s.players.filter(p => !p.isAlive);
  const role = s.myRole;
  const isMafiaTeam = s.myTeam === 'mafia';
  const teamClass = isMafiaTeam ? 'mafia' : 'citizen';
  const amIDead = !s.players.find(p => p.id === myId)?.isAlive;
  const isHost = room?.hostId === myId || room?.players.some(p => p.id === myId && p.isHost);

  const nightActionRoles = ['mafia', 'spy', 'police', 'doctor', 'magician', 'reporter'];
  const hasNightAction = !amIDead && nightActionRoles.includes(role);
  const canVigilante = !amIDead && (role === 'vigilante') && !s.vigilanteUsed && (s.phase === 'day_discussion' || s.phase === 'night');

  const isNight = s.phase === 'night' || s.phase === 'role_reveal';
  const timerPct = s.timerSeconds > 0 ? (timer / s.timerSeconds) * 100 : 0;
  const timerColor = timer <= 5 ? 'var(--red)' : timer <= 10 ? 'var(--orange)' : 'var(--blue)';
  const alreadySkipped = s.skipVoters.includes(myId);

  // 이벤트 로그 축적
  useEffect(() => {
    if (s.phase === 'role_reveal') return;
    const msgs: LogEntry['messages'] = [];
    if (s.dayMessages.length > 0) msgs.push(...s.dayMessages.map(t => ({ text: t, type: 'public' as const })));
    if (personalMessages.length > 0) msgs.push(...personalMessages.map(t => ({ text: t.text, type: 'private' as const })));
    if (msgs.length === 0) return;
    setEventLog(prev => {
      const key = `${s.dayNumber}-${s.phase}`;
      const last = prev[prev.length - 1];
      if (last && `${last.day}-${last.phase}` === key) return prev;
      return [...prev, { day: s.dayNumber, phase: s.phase, messages: msgs }];
    });
    setActiveDay(s.dayNumber);
  }, [s.dayMessages, s.dayNumber, s.phase, personalMessages]);

  // 개인 알림 모달 3초 후 자동 닫기
  useEffect(() => {
    if (!pendingModal) return;
    const t = setTimeout(() => setPendingModal(null), 4000);
    return () => clearTimeout(t);
  }, [pendingModal]);

  // 처형/사망 결과 모달 (이미 보여준 메시지는 스킵)
  const [resultModal, setResultModal] = useState<string | null>(null);
  const [shownResults, setShownResults] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (s.phase === 'game_over') return;
    const execMsg = s.dayMessages.find(m =>
      !shownResults.has(m) && (
        m.includes('처형되었습니다') || m.includes('투표로 처형되지 않습니다') ||
        m.includes('살해했습니다') || m.includes('트릭이 발동했습니다')
      )
    );
    if (execMsg) {
      setShownResults(prev => new Set(prev).add(execMsg));
      setResultModal(execMsg);
      const t = setTimeout(() => setResultModal(null), 3000);
      return () => clearTimeout(t);
    }
  }, [s.dayMessages, s.phase]);

  // 메모 팝업 뒤로가기
  useEffect(() => {
    if (!memoOpen) return;
    history.pushState({ memo: true }, '');
    const handler = () => setMemoOpen(false);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [memoOpen]);

  const closeMemo = useCallback(() => { setMemoOpen(false); if (history.state?.memo) history.back(); }, []);
  const goToLobby = () => { clearGame(); navigate('/lobby'); };
  const endGame = () => { if (confirm('게임을 종료하시겠습니까?')) { socket.emit('room:end-game'); clearGame(); navigate('/lobby'); } };
  const doNight = (id: string) => socket.emit('mafia:night-action', id);
  const doVote = (id: string) => socket.emit('mafia:day-vote', id);

  const getActionMode = (): 'night' | 'vote' | 'vigilante' | null => {
    if (amIDead) return null;
    if (s.phase === 'night' && hasNightAction) return 'night';
    if (s.phase === 'day_vote' || s.phase === 'day_vote_runoff') return 'vote';
    if (canVigilante) return 'vigilante';
    return null;
  };
  const actionMode = getActionMode();
  const nightLabel = (role === 'spy' && s.spyConnected) ? NIGHT_LABELS['spy_connected'] : (NIGHT_LABELS[role] || '대상 선택');

  const handleCellClick = (pid: string) => {
    if (actionMode === 'night') doNight(pid);
    else if (actionMode === 'vote') doVote(pid);
    else if (actionMode === 'vigilante') {
      const p = s.players.find(pl => pl.id === pid);
      if (p && confirm(`${p.nickname}을(를) 살해하시겠습니까?`)) socket.emit('mafia:vigilante-action', pid);
    }
  };

  const canSelect = (pid: string) => {
    if (!actionMode) return false;
    const p = s.players.find(pl => pl.id === pid);
    if (!p?.isAlive) return false;
    if (actionMode === 'night' && ['police','reporter','magician'].includes(role) && pid === myId) return false;
    if (actionMode === 'vigilante' && pid === myId) return false;
    return true;
  };

  // 드래그앤드롭
  const handleDragStart = (r: string) => setDragRole(r);
  const handleDragEnd = () => { setDragRole(null); setDropTarget(null); };
  const handleDrop = (pid: string) => {
    if (dragRole) {
      setGuesses(prev => ({ ...prev, [pid]: dragRole }));
      setDragRole(null);
      setDropTarget(null);
    }
  };

  // 터치 드래그
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRole) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = el?.closest('[data-player-id]');
    setDropTarget(cell?.getAttribute('data-player-id') || null);
  }, [dragRole]);

  const handleTouchEnd = useCallback(() => {
    if (dragRole && dropTarget) {
      setGuesses(prev => ({ ...prev, [dropTarget]: dragRole }));
    }
    setDragRole(null);
    setDropTarget(null);
  }, [dragRole, dropTarget]);

  const days = [...new Set(eventLog.map(e => e.day))].sort((a,b) => a - b);

  return (
    <>
      {/* 헤더 */}
      <div className="header" style={{ background: isNight ? '#0d0d1a' : undefined }}>
        <div className="row gap-8">
          <Avatar name={s.players.find(p => p.id === myId)?.nickname || ''} size={24} dead={amIDead} />
          <span className={`role-value ${teamClass}`} style={{ fontSize: 14, fontWeight: 700, opacity: amIDead ? 0.5 : 1 }}>{ROLE_NAMES[role]}</span>
          {amIDead && <span className="tag tag-red">사망</span>}
        </div>
        <div className="row gap-8">
          {timer > 0 && <span style={{ fontSize: 14, fontWeight: 700, color: timerColor, fontVariantNumeric: 'tabular-nums' }}>{timer}s</span>}
          <span className="tag tag-blue">{s.dayNumber}일</span>
          <RuleButton game="mafia" />
          {isHost && s.phase !== 'game_over' && (
            <button className="btn-ghost btn-sm" style={{ width: 'auto', padding: '4px 8px', fontSize: 10, color: 'var(--red)' }} onClick={endGame}>종료</button>
          )}
        </div>
      </div>

      {timer > 0 && <div className="timer-bar"><div className="timer-bar-fill" style={{ width: `${timerPct}%`, background: timerColor }} /></div>}

      {/* 페이즈 바 */}
      <div style={{
        textAlign: 'center', padding: '6px 16px', fontSize: 12, fontWeight: 700,
        background: isNight ? '#0d0d1a' : 'var(--bg-card)',
        color: isNight ? 'var(--purple)' : 'var(--text-dim)',
        borderBottom: '1px solid var(--border)',
      }}>
        {PHASE_LABELS[s.phase]}
        {actionMode === 'night' && <span style={{ marginLeft: 8, color: 'var(--purple)' }}>- {nightLabel}</span>}
        {actionMode === 'vote' && <span style={{ marginLeft: 8, color: 'var(--green)' }}>- {s.voteCount}/{s.aliveCount}</span>}
        {actionMode === 'vigilante' && <span style={{ marginLeft: 8, color: 'var(--orange)' }}>- 자경단 대상 선택</span>}
      </div>

      {/* 메인/채팅 탭 */}
      {s.phase !== 'role_reveal' && (
        <div className="main-tabs">
          <button className={`main-tab ${tab === 'main' ? 'active' : ''}`} onClick={() => setTab('main')}>메인</button>
          <button className={`main-tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>채팅 / 기록</button>
        </div>
      )}

      {/* ===== 메인 탭 ===== */}
      {(tab === 'main' || s.phase === 'role_reveal') && (
        <div className="page" style={{ background: isNight ? '#0a0a15' : undefined }}>
          <div className="stack stack-12">

            {/* 사망 배너 */}
            {amIDead && s.phase !== 'role_reveal' && s.phase !== 'game_over' && (
              <div style={{ padding: '10px 14px', background: 'rgba(232,93,93,0.06)', borderLeft: '3px solid var(--red)', borderRadius: 8, fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>사망 - 관전 모드</div>
            )}

            {/* 역할 공개 */}
            {s.phase === 'role_reveal' && (() => {
              const info = ROLE_INFO[role]; if (!info) return null;
              const tc = isMafiaTeam ? 'var(--red)' : 'var(--green)';
              const tb = isMafiaTeam ? 'rgba(232,93,93,0.08)' : 'rgba(92,184,122,0.08)';
              return (
                <div className="fade-in stack stack-16">
                  <div className="text-center stack stack-8" style={{ paddingTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}><Avatar name={s.players.find(p => p.id === myId)?.nickname || ''} size={72} /></div>
                    <p className={`role-value ${teamClass}`} style={{ fontSize: 26, fontWeight: 800 }}>{ROLE_NAMES[role]}</p>
                  </div>
                  <div style={{ padding: '10px 14px', borderRadius: 8, background: tb, borderLeft: `3px solid ${tc}` }}>
                    <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>소속</p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: tc }}>{info.team}</p>
                  </div>
                  <div className="card stack stack-8">
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)' }}>능력</p>
                    {info.ability.map((a, i) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.6 }}><span style={{ color: 'var(--blue)', flexShrink: 0 }}>-</span><span>{a}</span></div>)}
                  </div>
                  {info.limit && <div className="card stack stack-8">
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>제한</p>
                    {info.limit.map((l, i) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.6, color: 'var(--text-dim)' }}><span style={{ color: 'var(--orange)', flexShrink: 0 }}>-</span><span>{l}</span></div>)}
                  </div>}
                  {info.note && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(155,114,207,0.08)', borderLeft: '3px solid var(--purple)', fontSize: 12, color: 'var(--text-dim)' }}>{info.note}</div>}
                </div>);
            })()}

            {/* 현재 메시지 */}
            {s.phase !== 'role_reveal' && (s.dayMessages.length > 0 || personalMessages.length > 0) && (
              <div className="fade-in stack stack-4">
                {s.dayMessages.map((m, i) => <div key={`s${i}`} className="sys-msg"><span className="log-label public">전체</span>{m}</div>)}
                {personalMessages.map((m, i) => (
                  <div key={`p${i}`} className="sys-msg private">
                    <span className="log-label private">개인</span>
                    {m.text}
                    <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 6 }}>({m.day}일차 {PHASE_LABELS[m.phase] || m.phase})</span>
                  </div>
                ))}
              </div>
            )}

            {/* 시간 조절 */}
            {s.phase === 'day_discussion' && !amIDead && (
              <div className="row row-between" style={{ padding: '4px 0' }}>
                <div className="time-controls">
                  <button className={`time-btn ${alreadySkipped ? 'used' : ''}`} onClick={() => { if (!alreadySkipped) socket.emit('mafia:skip-time', -10); }}>-10초</button>
                  <button className={`time-btn ${alreadySkipped ? 'used' : ''}`} onClick={() => { if (!alreadySkipped) socket.emit('mafia:skip-time', 10); }}>+10초</button>
                  <span className="text-xs text-dim">{s.skipVoters.length}/{alive.length}</span>
                </div>
                {canVigilante && <span className="tag tag-orange" style={{ fontSize: 10 }}>자경단 선택 가능</span>}
              </div>
            )}

            {/* 최종 투표 */}
            {s.phase === 'day_final_vote' && s.executionTarget && !amIDead && (
              <div className="action-card vote fade-in">
                <div className="action-title"><span>최종 처형 투표</span><span className="tag tag-red">{s.voteCount}/{s.aliveCount}</span></div>
                <div className="text-center" style={{ padding: '8px 0' }}>
                  <Avatar name={s.players.find(p => p.id === s.executionTarget)?.nickname || ''} size={44} />
                  <p style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{s.players.find(p => p.id === s.executionTarget)?.nickname}</p>
                </div>
                <div className="vote-row">
                  <button className={s.myFinalVote === true ? 'btn-success' : 'btn-ghost'}
                    style={{ border: `2px solid ${s.myFinalVote === true ? 'var(--green)' : 'transparent'}` }}
                    onClick={() => socket.emit('mafia:final-vote', true)}>찬성{s.myFinalVote === true ? ' *' : ''}</button>
                  <button className={s.myFinalVote === false ? 'btn-danger' : 'btn-ghost'}
                    style={{ border: `2px solid ${s.myFinalVote === false ? 'var(--red)' : 'transparent'}` }}
                    onClick={() => socket.emit('mafia:final-vote', false)}>반대{s.myFinalVote === false ? ' *' : ''}</button>
                </div>
              </div>
            )}

            {/* 밤 대기 */}
            {s.phase === 'night' && !hasNightAction && !canVigilante && !amIDead && (
              <p className="text-center text-dim text-sm pulse" style={{ padding: 16 }}>밤이 지나가는 중...</p>
            )}

            {/* 플레이어 그리드 (선택 + 현황) */}
            {s.phase !== 'role_reveal' && (
              <div>
                <p className="text-dim text-xs" style={{ marginBottom: 6 }}>
                  {actionMode ? (
                    <span style={{ color: actionMode === 'night' ? 'var(--purple)' : actionMode === 'vigilante' ? 'var(--orange)' : 'var(--green)', fontWeight: 700 }}>
                      {actionMode === 'night' ? nightLabel : actionMode === 'vote' ? '투표 대상 선택' : '살해 대상 선택'}
                    </span>
                  ) : `플레이어 (${alive.length} 생존${dead.length > 0 ? ` / ${dead.length} 사망` : ''})`}
                </p>
                <div className="player-grid">
                  {s.players.map(p => {
                    const rev = s.revealedRoles?.[p.id];
                    const sel = canSelect(p.id);
                    const isSelected = (actionMode === 'night' && s.myNightTarget === p.id) || (actionMode === 'vote' && s.myDayVoteTarget === p.id);
                    const cls = isSelected ? (actionMode === 'night' ? 'selected-night' : 'selected') : (sel ? 'selectable' : '');
                    return (
                      <div key={p.id} className={`player-cell ${!p.isAlive ? 'dead' : ''} ${cls}`}
                        onClick={() => sel && handleCellClick(p.id)}
                        style={{ opacity: actionMode && !sel && p.isAlive ? 0.3 : undefined }}>
                        <Avatar name={p.nickname} size={32} dead={!p.isAlive} />
                        <span className="cell-name">{p.nickname}</span>
                        {p.id === myId && <span style={{ fontSize: 7, color: 'var(--blue)' }}>나</span>}
                        {rev ? <span style={{ fontSize: 8, color: 'var(--text-dim)', fontWeight: 600 }}>{rev}</span>
                          : guesses[p.id] ? <span className="cell-guess">{ROLE_NAMES[guesses[p.id]]}</span>
                          : !p.isAlive ? <span style={{ fontSize: 7, color: 'var(--red)' }}>사망</span> : null}
                        {isSelected && <span style={{ fontSize: 7, color: actionMode === 'night' ? 'var(--purple)' : 'var(--green)', fontWeight: 700 }}>{actionMode === 'vote' ? '투표' : '선택'}</span>}
                      </div>
                    );
                  })}
                </div>
                {actionMode && <p className="text-xs text-dim" style={{ marginTop: 6, textAlign: 'center' }}>탭하여 선택 (변경 가능)</p>}
              </div>
            )}

            {/* 유저 메모 */}
            {s.phase !== 'role_reveal' && (() => {
              // 4열 고정 테이블
              const padded = [...s.players];
              while (padded.length % 4 !== 0) padded.push(null as unknown as typeof s.players[0]);
              const rows: (typeof s.players[0] | null)[][] = [];
              for (let i = 0; i < padded.length; i += 4) rows.push(padded.slice(i, i + 4).map(p => p?.id ? p : null));
              return (
                <div onClick={() => setMemoOpen(true)} style={{ cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none' }}>
                  <p className="text-dim text-xs" style={{ marginBottom: 4 }}>유저 메모</p>
                  <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                      <tbody>
                        {rows.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((p, ci) => {
                              if (!p) return <td key={`e${ci}`} style={{ background: 'var(--bg-card)', borderLeft: ci > 0 ? '1px solid var(--border)' : 'none', borderTop: ri > 0 ? '1px solid var(--border)' : 'none' }} />;
                              const rev = s.revealedRoles?.[p.id];
                              const guess = guesses[p.id];
                              const roleText = rev || (guess ? ROLE_NAMES[guess] : null);
                              const isDead = !p.isAlive;
                              return (
                                <td key={p.id} style={{
                                  padding: '6px 4px', verticalAlign: 'top',
                                  background: isDead ? 'rgba(232,93,93,0.05)' : ri % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-input)',
                                  borderLeft: ci > 0 ? '1px solid var(--border)' : 'none',
                                  borderTop: ri > 0 ? '1px solid var(--border)' : 'none',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                    <Avatar name={p.nickname} size={16} dead={isDead} />
                                    <span style={{
                                      fontSize: 10, fontWeight: 600, lineHeight: 1,
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                      color: isDead ? 'var(--text-dim)' : 'var(--text)',
                                    }}>
                                      {p.nickname}{p.id === myId ? '*' : ''}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 9, fontWeight: 600, lineHeight: 1, paddingLeft: 20 }}>
                                    {isDead && <span style={{ color: 'var(--red)' }}>사망/</span>}
                                    <span style={{ color: rev ? 'var(--text-dim)' : guess ? 'var(--orange)' : 'var(--text-dim)' }}>
                                      {roleText || '-'}
                                    </span>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ===== 채팅/기록 탭 ===== */}
      {tab === 'chat' && s.phase !== 'role_reveal' && (
        <div className="tab-content" style={{ background: isNight ? '#0a0a15' : undefined }}>
          <div className="tab-scroll">
            <div className="stack stack-12">
              {/* 일차 기록 */}
              {days.length > 0 && (
                <div>
                  <div className="day-tabs">
                    {days.map(d => (
                      <button key={d} className={`day-tab ${activeDay === d ? 'active' : ''}`} onClick={() => setActiveDay(d)}>{d}일차</button>
                    ))}
                  </div>
                  <div className="day-tab-content">
                    {eventLog.filter(e => e.day === activeDay).length === 0 && <p className="text-dim text-xs">기록 없음</p>}
                    {eventLog.filter(e => e.day === activeDay).map((entry, i) => (
                      <div key={i} style={{ marginBottom: 8 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4 }}>{PHASE_LABELS[entry.phase] || entry.phase}</p>
                        {entry.messages.map((m, j) => (
                          <p key={j} style={{ fontSize: 12, color: m.type === 'private' ? 'var(--purple)' : 'var(--text-dim)', lineHeight: 1.6, marginBottom: 2 }}>
                            <span className={`log-label ${m.type}`}>{m.type === 'private' ? '개인' : '전체'}</span>{m.text}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 채팅 */}
              <Chat isMafiaChatMember={!amIDead && s.isMafiaChatMember} isNight={s.phase === 'night'} />
            </div>
          </div>
        </div>
      )}

      {/* ===== 메모 팝업 ===== */}
      {memoOpen && (
        <div className="memo-popup" onClick={closeMemo}>
          <div className="memo-popup-card" onClick={e => e.stopPropagation()}
            onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
            style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
            <div className="row row-between" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>유저 메모</span>
              <div className="row gap-8">
                {/* 드래그 중 표시 */}
                {dragRole && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: MAFIA_ROLES.includes(dragRole) ? 'var(--red)' : 'var(--green)', background: 'var(--bg-input)', padding: '4px 12px', borderRadius: 12 }}>
                    {ROLE_NAMES[dragRole]} 배치 중
                  </span>
                )}
                <button className="btn-ghost btn-sm" style={{ width: 'auto' }} onClick={closeMemo}>닫기</button>
              </div>
            </div>
            <div className="memo-popup-body">
              {/* 유저 그리드 (드롭 / 탭 영역) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                {s.players.map(p => {
                  const isDead = !p.isAlive;
                  const rev = s.revealedRoles?.[p.id];
                  const guess = guesses[p.id];
                  const isTarget = dropTarget === p.id;
                  return (
                    <div key={p.id}
                      data-player-id={p.id}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                        padding: '10px 4px', minHeight: 80,
                        background: isTarget ? 'rgba(91,155,247,0.12)' : isDead ? 'rgba(232,93,93,0.05)' : 'var(--bg-input)',
                        borderRadius: 10, border: `2px solid ${isTarget ? 'var(--blue)' : 'transparent'}`,
                        opacity: isDead ? 0.6 : 1, transition: 'border-color 0.1s, background 0.1s',
                      }}
                      onClick={() => {
                        // 탭으로도 배치 가능 (드래그 중이면)
                        if (dragRole) { handleDrop(p.id); return; }
                      }}
                      onDragOver={e => { e.preventDefault(); setDropTarget(p.id); }}
                      onDragLeave={() => setDropTarget(null)}
                      onDrop={e => { e.preventDefault(); handleDrop(p.id); }}>
                      <Avatar name={p.nickname} size={30} dead={isDead} />
                      <span style={{ fontSize: 10, fontWeight: 600, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{p.nickname}</span>
                      {isDead && <span style={{ fontSize: 8, color: 'var(--red)', fontWeight: 700 }}>사망</span>}
                      {rev
                        ? <span style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 600 }}>{rev}</span>
                        : guess
                          ? <span style={{ fontSize: 9, color: 'var(--orange)', fontWeight: 600 }}>{ROLE_NAMES[guess]}</span>
                          : <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>-</span>}
                      {guess && !rev && (
                        <span style={{ fontSize: 8, color: 'var(--text-dim)', cursor: 'pointer', padding: '2px 6px', background: 'var(--bg-card)', borderRadius: 4 }}
                          onClick={(e) => { e.stopPropagation(); setGuesses(prev => { const n = { ...prev }; delete n[p.id]; return n; }); }}>초기화</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 직업 칩 (드래그/탭 소스) */}
              <p className="text-dim text-xs" style={{ marginBottom: 8 }}>직업을 길게 눌러 유저에게 놓거나, 탭 후 유저를 탭하세요</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ALL_GUESS_ROLES.map(r => {
                  const isActive = dragRole === r;
                  const isMafia = MAFIA_ROLES.includes(r);
                  return (
                    <button key={r}
                      style={{
                        padding: '10px 14px', fontSize: 13, fontWeight: 700, borderRadius: 20,
                        background: isActive ? (isMafia ? 'var(--red)' : r === 'unknown' ? 'var(--text-dim)' : 'var(--green)') : 'var(--bg-input)',
                        color: isActive ? '#fff' : isMafia ? 'var(--red)' : r === 'unknown' ? 'var(--text-dim)' : 'var(--green)',
                        border: `1.5px solid ${isMafia ? 'var(--red)' : r === 'unknown' ? 'var(--border)' : 'var(--green)'}`,
                        width: 'auto', cursor: 'grab', touchAction: 'none', userSelect: 'none',
                        WebkitUserSelect: 'none', transition: 'background 0.1s, color 0.1s',
                      }}
                      draggable
                      onDragStart={() => handleDragStart(r)}
                      onDragEnd={handleDragEnd}
                      onTouchStart={() => handleDragStart(r)}
                      onClick={() => {
                        // 탭으로 선택/해제 토글
                        if (dragRole === r) { setDragRole(null); } else { setDragRole(r); }
                      }}>
                      {ROLE_NAMES[r]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 개인 알림 모달 ===== */}
      {pendingModal && (
        <div style={{
          position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-card)', border: '1px solid var(--purple)', borderRadius: 12,
          padding: '14px 20px', zIndex: 80, maxWidth: 360, width: '90%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', animation: 'fadeIn 0.2s ease-out',
        }}>
          <div className="row row-between" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple)' }}>개인 알림</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', cursor: 'pointer' }} onClick={() => setPendingModal(null)}>닫기</span>
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>{pendingModal}</p>
        </div>
      )}

      {/* ===== 처형/이벤트 결과 모달 ===== */}
      {resultModal && !s.winner && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 70, padding: 24,
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 16, padding: '28px 24px',
            textAlign: 'center', maxWidth: 320, width: '100%',
            border: '1px solid var(--border)', animation: 'fadeIn 0.2s ease-out',
          }}>
            <p style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.6 }}>{resultModal}</p>
            <p className="text-dim text-xs" style={{ marginTop: 8 }}>잠시 후 진행됩니다...</p>
          </div>
        </div>
      )}

      {/* ===== 게임 종료 ===== */}
      {s.phase === 'game_over' && s.winner && (
        <div className="overlay">
          <div className="overlay-card fade-in">
            <h1 style={{ color: s.winner === 'citizen' ? 'var(--green)' : 'var(--red)' }}>
              {s.winner === 'citizen' ? '시민팀 승리' : '마피아팀 승리'}
            </h1>
            <p>{s.winReason}</p>
            <button className="btn-primary" onClick={goToLobby}>로비로</button>
          </div>
        </div>
      )}
    </>
  );
}
