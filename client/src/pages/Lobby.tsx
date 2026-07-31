import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { useRoomStore } from '../stores/room-store';
import { useGameStore } from '../stores/game-store';
import { Avatar } from '../components/Avatar';
import type { GameType } from '../../../shared/src/types/common';

export function Lobby() {
  const navigate = useNavigate();
  const { room, nickname } = useRoomStore();
  const { avalonState, mafiaState } = useGameStore();

  if (avalonState) { navigate('/avalon'); return null; }
  if (mafiaState) { navigate('/mafia'); return null; }
  if (!room) {
    return (
      <div className="app"><div className="page-center">
        <p className="text-center text-dim text-sm">로딩 중...</p>
      </div></div>
    );
  }

  const isHost = room.players.find(p => p.nickname === nickname)?.isHost;
  const canStart = room.gameType && room.players.length >= room.minPlayers;

  const handleSelectGame = (gameType: GameType) => socket.emit('room:select-game', gameType);
  const handleStart = () => socket.emit('room:start-game');
  const handleLeave = () => {
    socket.emit('room:leave');
    sessionStorage.removeItem('roomCode');
    navigate('/');
  };

  return (
    <>
      <div className="header">
        <h2>대기실</h2>
        <button className="btn-ghost btn-sm" style={{ width: 'auto' }} onClick={handleLeave}>
          나가기
        </button>
      </div>

      <div className="page">
        <div className="stack stack-16">
          {/* 방 코드 */}
          <div className="card text-center">
            <p className="text-dim text-xs" style={{ marginBottom: 4 }}>방 코드</p>
            <p className="room-code">{room.code}</p>
          </div>

          {/* 게임 선택 */}
          {isHost && (
            <div>
              <p className="text-dim text-sm" style={{ marginBottom: 8 }}>게임 선택</p>
              <div className="game-pick">
                <button
                  className={room.gameType === 'avalon' ? 'picked' : ''}
                  onClick={() => handleSelectGame('avalon')}
                >
                  <div className="pick-name">천사와 악마</div>
                  <div className="pick-sub">5~10명</div>
                </button>
                <button
                  className={room.gameType === 'mafia' ? 'picked' : ''}
                  onClick={() => handleSelectGame('mafia')}
                >
                  <div className="pick-name">마피아</div>
                  <div className="pick-sub">7~12명</div>
                </button>
              </div>
            </div>
          )}

          {!isHost && room.gameType && (
            <div className="phase-bar">
              {room.gameType === 'avalon' ? '천사와 악마' : '마피아'}
            </div>
          )}

          {/* 플레이어 목록 */}
          <div>
            <div className="row row-between" style={{ marginBottom: 8 }}>
              <p className="text-dim text-sm">플레이어</p>
              <span className="tag tag-blue">{room.players.length}/{room.maxPlayers}</span>
            </div>
            <div className="list">
              {room.players.map((p) => (
                <div key={p.id} className="list-item">
                  <Avatar name={p.nickname} size={28} />
                  <span>{p.nickname}</span>
                  {p.isHost && <span className="item-right"><span className="tag tag-orange">방장</span></span>}
                </div>
              ))}
            </div>
            {room.players.length < room.minPlayers && (
              <p className="text-dim text-xs" style={{ marginTop: 8 }}>
                {room.minPlayers - room.players.length}명 더 필요
              </p>
            )}
          </div>

          {/* 시작 */}
          {isHost ? (
            <button className="btn-primary" disabled={!canStart} onClick={handleStart}>
              게임 시작
            </button>
          ) : (
            <p className="text-center text-dim text-sm">대기 중...</p>
          )}
        </div>
      </div>
    </>
  );
}
