import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { useRoomStore } from '../stores/room-store';
import { useGameStore } from '../stores/game-store';
import { Chat } from '../components/Chat';
import { Avatar } from '../components/Avatar';
import { RuleButton } from '../components/RuleModal';
import { QUEST_SIZES } from '../../../shared/src/types/avalon';

const ROLE_NAMES: Record<string, string> = {
  angel: '천사', archangel: '대천사', demon: '악마', archdemon: '대악마',
};

const ROLE_DESC: Record<string, string> = {
  angel: '다른 플레이어의 정체를 알 수 없습니다. 원정에 참여하면 반드시 성공을 선택해야 합니다.',
  archangel: '게임 시작 시 모든 악마 진영을 확인합니다. 반드시 성공을 선택해야 합니다. 정체가 들키지 않도록 주의하세요.',
  demon: '다른 악마 진영을 확인합니다. 원정에서 성공 또는 실패를 자유롭게 선택할 수 있습니다.',
  archdemon: '다른 악마 진영을 확인합니다. 천사가 원정 3개 성공 시 대천사를 지목합니다. 맞히면 악마 승리!',
};

const PHASE_NAMES: Record<string, string> = {
  role_reveal: '역할 확인', team_building: '원정대 구성', team_discussion: '토론',
  team_vote: '원정대 투표', quest: '원정 수행', quest_result: '원정 결과',
  assassination: '대천사 지목', game_over: '게임 종료',
};

export function AvalonGame() {
  const navigate = useNavigate();
  const { room } = useRoomStore();
  const { avalonState, timer, clearGame } = useGameStore();
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [assassinTarget, setAssassinTarget] = useState<string | null>(null);
  const [tab, setTab] = useState<'main' | 'chat'>('main');
  const [guesses, setGuesses] = useState<Record<string, string>>({});
  const [memoOpen, setMemoOpen] = useState(false);
  const [resultModal, setResultModal] = useState<string | null>(null);
  const [shownResults, setShownResults] = useState<Set<string>>(new Set());
  const [myTeamVote, setMyTeamVote] = useState<boolean | null>(null);
  const [myQuestVote, setMyQuestVote] = useState<boolean | null>(null);

  // 페이즈 바뀌면 투표 상태 리셋
  const currentPhase = avalonState?.phase;
  useEffect(() => { setMyTeamVote(null); setMyQuestVote(null); }, [currentPhase]);

  // 게임 종료 시 로비로
  useEffect(() => {
    if (!avalonState && room && room.status === 'waiting') navigate('/lobby');
  }, [avalonState, room]);

  if (!avalonState || !room) {
    return <div className="app"><div className="page-center"><p className="text-center text-dim text-sm">게임 상태 로딩 중...</p></div></div>;
  }

  const s = avalonState;
  const myId = socket.id!;
  const playerCount = s.playerOrder.length;
  const questSizes = QUEST_SIZES[playerCount] || [2, 3, 2, 3, 3];
  const leaderId = s.playerOrder[s.currentLeaderIndex];
  const isLeader = myId === leaderId;
  const isArchDemon = s.myRole === 'archdemon';
  const teamClass = s.myTeam === 'angel' ? 'angel' : 'demon';
  const isHost = room.hostId === myId || room.players.some(p => p.id === myId && p.isHost);

  const nick = (id: string) => room.players.find(p => p.id === id)?.nickname || '?';
  const toggle = (id: string) =>
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const timerColor = timer <= 5 ? 'var(--red)' : timer <= 10 ? 'var(--orange)' : 'var(--blue)';

  // 현재 원정의 실패 필요 개수
  const failThreshold = (playerCount >= 7 && s.currentQuest === 4) ? 2 : 1;
  const failRuleText = failThreshold === 2 ? '실패 2개 이상이면 원정 실패' : '실패 1개라도 있으면 원정 실패';
  const goToLobby = () => { clearGame(); navigate('/lobby'); };
  const endGame = () => { if (confirm('게임을 종료하시겠습니까?')) { socket.emit('room:end-game'); clearGame(); navigate('/lobby'); } };

  // 원정 결과 모달
  useEffect(() => {
    if (s.phase === 'quest_result' && s.questResults.length > 0) {
      const r = s.questResults[s.questResults.length - 1];
      const key = `quest-${r.questNumber}`;
      if (!shownResults.has(key)) {
        setShownResults(prev => new Set(prev).add(key));
        setResultModal(`${r.questNumber}차 원정 ${r.success ? '성공' : '실패'} (성공 ${r.successCount} / 실패 ${r.failCount})`);
        setTimeout(() => setResultModal(null), 3000);
      }
    }
  }, [s.phase, s.questResults]);

  // 메모 팝업 뒤로가기
  useEffect(() => {
    if (!memoOpen) return;
    history.pushState({ memo: true }, '');
    const handler = () => setMemoOpen(false);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [memoOpen]);

  const closeMemo = useCallback(() => { setMemoOpen(false); if (history.state?.memo) history.back(); }, []);

  // 원정대 구성: 그리드로 선택
  const isTeamBuildingLeader = s.phase === 'team_building' && isLeader;
  const isVoting = s.phase === 'team_discussion' || s.phase === 'team_vote';
  const isAssassinating = s.phase === 'assassination' && isArchDemon;

  const handleGridClick = (id: string) => {
    if (isTeamBuildingLeader) {
      toggle(id);
    } else if (isAssassinating) {
      if (!s.knownEvil.includes(id) && id !== myId) setAssassinTarget(id);
    }
    // 투표, 원정 수행 등 다른 모드에서는 그리드 클릭 무시
    // 메모는 아래 유저 메모 영역에서만 열림
  };

  const getGridCellClass = (id: string) => {
    if (isTeamBuildingLeader && selectedMembers.includes(id)) return 'selected';
    if (isAssassinating && assassinTarget === id) return 'selected-danger';
    if (s.proposedTeam.includes(id) && (isVoting || s.phase === 'quest')) return 'selected';
    return '';
  };

  const AVALON_ROLES = ['angel', 'archangel', 'demon', 'archdemon', 'unknown'];
  const AVALON_ROLE_NAMES: Record<string, string> = { ...ROLE_NAMES, unknown: '알수없음' };

  return (
    <>
      {/* 헤더 */}
      <div className="header">
        <div className="row gap-8">
          <Avatar name={nick(myId)} size={24} />
          <span className={`role-value ${teamClass}`} style={{ fontSize: 14, fontWeight: 700 }}>{ROLE_NAMES[s.myRole]}</span>
          {s.knownEvil.length > 0 && <span className="text-xs" style={{ color: 'var(--red)' }}>[{s.knownEvil.map(nick).join(', ')}]</span>}
        </div>
        <div className="row gap-8">
          {timer > 0 && <span style={{ fontSize: 14, fontWeight: 700, color: timerColor, fontVariantNumeric: 'tabular-nums' }}>{timer}s</span>}
          <span className="tag tag-blue">{PHASE_NAMES[s.phase]}</span>
          <RuleButton game="avalon" />
          {isHost && s.phase !== 'game_over' && (
            <button className="btn-ghost btn-sm" style={{ width: 'auto', padding: '4px 8px', fontSize: 10, color: 'var(--red)' }} onClick={endGame}>종료</button>
          )}
        </div>
      </div>

      {timer > 0 && <div className="timer-bar"><div className="timer-bar-fill" style={{ width: `${(timer / 60) * 100}%`, background: timerColor }} /></div>}

      {/* 페이즈 바 */}
      <div style={{ textAlign: 'center', padding: '6px 16px', fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        {PHASE_NAMES[s.phase]}
        {isTeamBuildingLeader && <span style={{ marginLeft: 8, color: 'var(--blue)' }}>- 원정대원 {selectedMembers.length}/{questSizes[s.currentQuest - 1]}</span>}
        {isVoting && <span style={{ marginLeft: 8, color: 'var(--green)' }}>- 찬반 투표</span>}
        {isAssassinating && <span style={{ marginLeft: 8, color: 'var(--orange)' }}>- 대천사 지목</span>}
      </div>

      {/* 메인/채팅 탭 */}
      {s.phase !== 'role_reveal' && (
        <div className="main-tabs">
          <button className={`main-tab ${tab === 'main' ? 'active' : ''}`} onClick={() => setTab('main')}>메인</button>
          <button className={`main-tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>채팅</button>
        </div>
      )}

      {/* ===== 메인 탭 ===== */}
      {(tab === 'main' || s.phase === 'role_reveal') && (
        <div className="page">
          <div className="stack stack-12">

            {/* 역할 공개 */}
            {s.phase === 'role_reveal' && (
              <div className="fade-in stack stack-16">
                <div className="text-center stack stack-8" style={{ paddingTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}><Avatar name={nick(myId)} size={72} /></div>
                  <p className={`role-value ${teamClass}`} style={{ fontSize: 26, fontWeight: 800 }}>{ROLE_NAMES[s.myRole]}</p>
                </div>
                <div style={{ padding: '10px 14px', borderRadius: 8, background: s.myTeam === 'angel' ? 'rgba(91,155,247,0.08)' : 'rgba(232,93,93,0.08)', borderLeft: `3px solid ${s.myTeam === 'angel' ? 'var(--blue)' : 'var(--red)'}` }}>
                  <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>소속</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: s.myTeam === 'angel' ? 'var(--blue)' : 'var(--red)' }}>{s.myTeam === 'angel' ? '천사 진영' : '악마 진영'}</p>
                </div>
                <div className="card stack stack-8">
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)' }}>능력</p>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-dim)' }}>{ROLE_DESC[s.myRole]}</p>
                </div>
                {s.knownEvil.length > 0 && (
                  <div className="card stack stack-8">
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>악마 진영 목록</p>
                    <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
                      {s.knownEvil.map(id => (
                        <div key={id} className="row gap-8" style={{ background: 'var(--bg-input)', borderRadius: 20, padding: '4px 10px 4px 6px' }}>
                          <Avatar name={nick(id)} size={20} /><span style={{ fontSize: 13, color: 'var(--red)' }}>{nick(id)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 원정 트랙 + 실패 조건 */}
            {s.phase !== 'role_reveal' && (
              <div>
                <div className="quest-track">
                  {questSizes.map((size, i) => {
                    const r = s.questResults.find(q => q.questNumber === i + 1);
                    const isCurrent = i + 1 === s.currentQuest;
                    const need2 = playerCount >= 7 && i + 1 === 4;
                    let cls = 'quest-pip';
                    if (r?.success === true) cls += ' win';
                    else if (r?.success === false) cls += ' lose';
                    else if (isCurrent) cls += ' now';
                    return (
                      <div key={i} className={cls} style={{ position: 'relative' }}>
                        <span>{i + 1}</span>
                        <span className="pip-sub">{size}명</span>
                        {need2 && <span style={{ position: 'absolute', bottom: -12, fontSize: 7, color: 'var(--orange)', fontWeight: 700, whiteSpace: 'nowrap' }}>2개</span>}
                      </div>
                    );
                  })}
                </div>
                {/* 현재 원정 실패 조건 안내 */}
                <p className="text-xs text-dim" style={{ textAlign: 'center', marginTop: 14 }}>
                  {s.currentQuest}차 원정: {questSizes[s.currentQuest - 1]}명 참가 / {failRuleText}
                </p>
              </div>
            )}

            {/* 원정대장 정보 + 시간 조절 */}
            {s.phase === 'team_building' && (
              <div>
                <div className="phase-bar">
                  <div className="row row-center gap-8">
                    <Avatar name={nick(leaderId)} size={22} />
                    <span>대장 <strong>{nick(leaderId)}</strong></span>
                  </div>
                  <p className="text-xs text-dim" style={{ marginTop: 4 }}>부결 {s.consecutiveRejects}/5</p>
                </div>
                <div className="row row-center" style={{ gap: 8, marginTop: 6 }}>
                  <button className={`time-btn ${s.skipVoters.includes(myId) ? 'used' : ''}`}
                    onClick={() => { if (!s.skipVoters.includes(myId)) socket.emit('avalon:skip-time', -10); }}>-10초</button>
                  <button className={`time-btn ${s.skipVoters.includes(myId) ? 'used' : ''}`}
                    onClick={() => { if (!s.skipVoters.includes(myId)) socket.emit('avalon:skip-time', 10); }}>+10초</button>
                  <span className="text-xs text-dim">{s.skipVoters.length}/{playerCount}</span>
                </div>
              </div>
            )}

            {/* 투표 (찬반) — 선택 표시 + 변경 가능 */}
            {isVoting && (
              <div className="action-card vote fade-in">
                <div className="action-title"><span>원정대 찬반 투표</span><span className="tag tag-green">투표</span></div>
                <div className="vote-row">
                  <button
                    className={myTeamVote === true ? 'btn-success' : 'btn-ghost'}
                    style={{ border: `2px solid ${myTeamVote === true ? 'var(--green)' : 'transparent'}` }}
                    onClick={() => { setMyTeamVote(true); socket.emit('avalon:vote-team', true); }}>
                    찬성{myTeamVote === true ? ' *' : ''}
                  </button>
                  <button
                    className={myTeamVote === false ? 'btn-danger' : 'btn-ghost'}
                    style={{ border: `2px solid ${myTeamVote === false ? 'var(--red)' : 'transparent'}` }}
                    onClick={() => { setMyTeamVote(false); socket.emit('avalon:vote-team', false); }}>
                    반대{myTeamVote === false ? ' *' : ''}
                  </button>
                </div>
                <p className="text-xs text-dim" style={{ marginTop: 6, textAlign: 'center' }}>변경 가능 (타이머 종료 시 확정)</p>
              </div>
            )}

            {/* 투표 결과 */}
            {s.teamVotes && (
              <div className="card stack stack-4 fade-in">
                <p className="text-sm text-dim" style={{ marginBottom: 4 }}>투표 결과</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {s.teamVotes.map(v => (
                    <div key={v.playerId} style={{ textAlign: 'center', padding: 4, background: v.approve ? 'rgba(92,184,122,0.08)' : 'rgba(232,93,93,0.08)', borderRadius: 6 }}>
                      <Avatar name={nick(v.playerId)} size={20} />
                      <p style={{ fontSize: 9, fontWeight: 600, marginTop: 2 }}>{nick(v.playerId)}</p>
                      <p style={{ fontSize: 9, fontWeight: 700, color: v.approve ? 'var(--green)' : 'var(--red)' }}>{v.approve ? '찬성' : '반대'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 원정 수행 — 선택 표시 + 천사 실패 불가 + 실패 조건 */}
            {s.phase === 'quest' && s.proposedTeam.includes(myId) && (
              <div className="action-card night fade-in">
                <div className="action-title"><span>원정 수행</span><span className="tag tag-purple">원정</span></div>
                <p className="text-xs text-dim" style={{ marginBottom: 8 }}>{failRuleText}</p>
                <div className="vote-row">
                  <button
                    className={myQuestVote === true ? 'btn-success' : 'btn-ghost'}
                    style={{ border: `2px solid ${myQuestVote === true ? 'var(--green)' : 'transparent'}` }}
                    onClick={() => { setMyQuestVote(true); socket.emit('avalon:quest-vote', true); }}>
                    성공{myQuestVote === true ? ' *' : ''}
                  </button>
                  <button
                    className={myQuestVote === false ? 'btn-danger' : 'btn-ghost'}
                    style={{ border: `2px solid ${myQuestVote === false ? 'var(--red)' : 'transparent'}` }}
                    disabled={s.myTeam === 'angel'}
                    onClick={() => { if (s.myTeam !== 'angel') { setMyQuestVote(false); socket.emit('avalon:quest-vote', false); } }}>
                    실패{s.myTeam === 'angel' ? ' (불가)' : myQuestVote === false ? ' *' : ''}
                  </button>
                </div>
                <p className="text-xs text-dim" style={{ marginTop: 6, textAlign: 'center' }}>변경 가능 (타이머 종료 시 확정)</p>
              </div>
            )}
            {s.phase === 'quest' && !s.proposedTeam.includes(myId) && (
              <p className="text-center text-dim text-sm pulse">원정 수행 중...</p>
            )}

            {/* 원정 결과 (인라인) */}
            {s.phase === 'quest_result' && s.questResults.length > 0 && (() => {
              const r = s.questResults[s.questResults.length - 1];
              return (
                <div className="card text-center fade-in">
                  <p style={{ fontSize: 18, fontWeight: 700, color: r.success ? 'var(--green)' : 'var(--red)' }}>
                    {r.questNumber}차 원정 {r.success ? '성공' : '실패'}
                  </p>
                  <p className="text-xs text-dim" style={{ marginTop: 6 }}>성공 {r.successCount} / 실패 {r.failCount}</p>
                </div>
              );
            })()}

            {/* 대천사 지목: 그리드에서 선택 (아래 그리드) + 확정 버튼 */}
            {isAssassinating && (
              <div>
                <p className="text-sm" style={{ color: 'var(--orange)', fontWeight: 700, marginBottom: 6 }}>대천사를 지목하세요 (맞히면 악마 승리)</p>
                <button className="btn-danger" disabled={!assassinTarget}
                  onClick={() => { if (assassinTarget) socket.emit('avalon:assassinate', assassinTarget); }}
                  style={{ marginTop: 8 }}>
                  {assassinTarget ? `${nick(assassinTarget)} 지목 확정` : '위에서 대상 선택'}
                </button>
              </div>
            )}
            {s.phase === 'assassination' && !isArchDemon && (
              <p className="text-center text-dim text-sm pulse">대악마가 대천사를 지목하는 중...</p>
            )}

            {/* 플레이어 그리드 */}
            {s.phase !== 'role_reveal' && (
              <div>
                <p className="text-dim text-xs" style={{ marginBottom: 6 }}>
                  {isTeamBuildingLeader ? <span style={{ color: 'var(--blue)', fontWeight: 700 }}>원정대원 선택 ({selectedMembers.length}/{questSizes[s.currentQuest - 1]})</span>
                    : isAssassinating ? <span style={{ color: 'var(--orange)', fontWeight: 700 }}>대천사 지목 대상 선택</span>
                    : '플레이어'}
                </p>
                <div className="player-grid">
                  {s.playerOrder.map(id => {
                    const cls = getGridCellClass(id);
                    const isEvil = s.knownEvil.includes(id);
                    return (
                      <div key={id} className={`player-cell ${cls}`}
                        onClick={() => handleGridClick(id)}
                        style={{ opacity: isAssassinating && (s.knownEvil.includes(id) || id === myId) ? 0.3 : undefined }}>
                        <Avatar name={nick(id)} size={32} />
                        <span className="cell-name">{nick(id)}</span>
                        {id === myId && <span style={{ fontSize: 7, color: 'var(--blue)' }}>나</span>}
                        {isEvil && <span style={{ fontSize: 7, color: 'var(--red)' }}>악마</span>}
                        {guesses[id] && <span className="cell-guess">{AVALON_ROLE_NAMES[guesses[id]]}</span>}
                      </div>
                    );
                  })}
                </div>
                {isTeamBuildingLeader && (
                  <button className="btn-primary" disabled={selectedMembers.length !== questSizes[s.currentQuest - 1]}
                    onClick={() => { socket.emit('avalon:propose-team', selectedMembers); setSelectedMembers([]); }}
                    style={{ marginTop: 10 }}>제안</button>
                )}
              </div>
            )}

            {/* 유저 메모 (표) */}
            {s.phase !== 'role_reveal' && !isTeamBuildingLeader && !isAssassinating && (() => {
              const padded = [...s.playerOrder];
              while (padded.length % 4 !== 0) padded.push('');
              const rows: string[][] = [];
              for (let i = 0; i < padded.length; i += 4) rows.push(padded.slice(i, i + 4));
              return (
                <div onClick={() => setMemoOpen(true)} style={{ cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none' }}>
                  <p className="text-dim text-xs" style={{ marginBottom: 4 }}>유저 메모</p>
                  <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                      <tbody>
                        {rows.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((id, ci) => {
                              if (!id) return <td key={`e${ci}`} style={{ background: ri % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-input)', borderLeft: ci > 0 ? '1px solid var(--border)' : 'none', borderTop: ri > 0 ? '1px solid var(--border)' : 'none' }} />;
                              const guess = guesses[id];
                              return (
                                <td key={id} style={{ padding: '6px 4px', verticalAlign: 'top', background: ri % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-input)', borderLeft: ci > 0 ? '1px solid var(--border)' : 'none', borderTop: ri > 0 ? '1px solid var(--border)' : 'none' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                    <Avatar name={nick(id)} size={16} />
                                    <span style={{ fontSize: 10, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nick(id)}</span>
                                  </div>
                                  <div style={{ fontSize: 9, fontWeight: 600, paddingLeft: 20, color: guess ? 'var(--orange)' : 'var(--text-dim)' }}>
                                    {guess ? AVALON_ROLE_NAMES[guess] : '-'}
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

      {/* ===== 채팅 탭 ===== */}
      {tab === 'chat' && s.phase !== 'role_reveal' && (
        <div className="tab-content">
          <div className="tab-scroll">
            <Chat />
          </div>
        </div>
      )}

      {/* 메모 팝업 */}
      {memoOpen && (
        <div className="memo-popup" onClick={closeMemo}>
          <div className="memo-popup-card" onClick={e => e.stopPropagation()} style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
            <div className="row row-between" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>유저 메모</span>
              <button className="btn-ghost btn-sm" style={{ width: 'auto' }} onClick={closeMemo}>닫기</button>
            </div>
            <div className="memo-popup-body">
              <div className="memo-grid">
                {s.playerOrder.map(id => (
                  <div key={id} className="memo-cell"
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const r = e.dataTransfer.getData('role'); if (r) setGuesses(prev => ({ ...prev, [id]: r })); }}>
                    <Avatar name={nick(id)} size={26} />
                    <span className="memo-cell-name">{nick(id)}</span>
                    {guesses[id] ? <span className="memo-cell-role">{AVALON_ROLE_NAMES[guesses[id]]}</span> : <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>-</span>}
                    {guesses[id] && <span style={{ fontSize: 8, color: 'var(--text-dim)', cursor: 'pointer' }}
                      onClick={() => setGuesses(prev => { const n = { ...prev }; delete n[id]; return n; })}>초기화</span>}
                  </div>
                ))}
              </div>
              <p className="text-dim text-xs" style={{ marginBottom: 6 }}>직업을 끌어서 유저에게 놓으세요</p>
              <div className="role-chips">
                {AVALON_ROLES.map(r => (
                  <button key={r} className={`role-chip ${r === 'demon' || r === 'archdemon' ? 'chip-mafia' : r !== 'unknown' ? 'chip-citizen' : ''}`}
                    draggable onDragStart={e => e.dataTransfer.setData('role', r)}>
                    {AVALON_ROLE_NAMES[r]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 결과 모달 */}
      {resultModal && !s.winner && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 24 }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '28px 24px', textAlign: 'center', maxWidth: 320, width: '100%', border: '1px solid var(--border)', animation: 'fadeIn 0.2s ease-out' }}>
            <p style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.6 }}>{resultModal}</p>
          </div>
        </div>
      )}

      {/* 게임 종료 */}
      {s.phase === 'game_over' && s.winner && (
        <div className="overlay">
          <div className="overlay-card fade-in">
            <h1 style={{ color: s.winner === 'angel' ? 'var(--blue)' : 'var(--red)' }}>
              {s.winner === 'angel' ? '천사 진영 승리' : '악마 진영 승리'}
            </h1>
            <p>{s.winReason}</p>
            <button className="btn-primary" onClick={goToLobby}>로비로</button>
          </div>
        </div>
      )}
    </>
  );
}
