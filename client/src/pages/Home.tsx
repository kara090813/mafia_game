import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { useRoomStore } from '../stores/room-store';

export function Home() {
  const navigate = useNavigate();
  const { setRoom, setNickname: storeNickname } = useRoomStore();
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [error, setError] = useState('');

  const handleCreate = () => {
    if (!nickname.trim()) { setError('닉네임을 입력하세요.'); return; }
    storeNickname(nickname.trim());
    socket.emit('room:create', nickname.trim(), (room) => {
      setRoom(room);
      navigate('/lobby');
    });
  };

  const handleJoin = () => {
    if (!nickname.trim()) { setError('닉네임을 입력하세요.'); return; }
    if (!roomCode.trim()) { setError('방 코드를 입력하세요.'); return; }
    storeNickname(nickname.trim());
    socket.emit('room:join', roomCode.trim(), nickname.trim(), (room, err) => {
      if (err || !room) { setError(err || '방에 참가할 수 없습니다.'); return; }
      setRoom(room);
      navigate('/lobby');
    });
  };

  return (
    <div className="page-center">
      <div style={{ marginBottom: 40 }}>
        <h1 className="home-title">Party Games</h1>
        <p className="home-sub">친구들과 함께하는 파티 게임</p>
      </div>

      {mode === 'menu' ? (
        <div className="stack stack-8">
          <button className="btn-primary" onClick={() => setMode('create')}>
            방 만들기
          </button>
          <button className="btn-ghost" onClick={() => setMode('join')}>
            방 참가하기
          </button>
        </div>
      ) : (
        <div className="stack stack-12">
          <input
            placeholder="닉네임"
            value={nickname}
            onChange={(e) => { setNickname(e.target.value); setError(''); }}
            maxLength={10}
            autoFocus
          />

          {mode === 'join' && (
            <input
              placeholder="방 코드"
              value={roomCode}
              onChange={(e) => { setRoomCode(e.target.value.toUpperCase()); setError(''); }}
              maxLength={6}
              style={{ textTransform: 'uppercase', letterSpacing: 6, textAlign: 'center', fontWeight: 700 }}
            />
          )}

          {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}

          <button
            className="btn-primary"
            onClick={mode === 'create' ? handleCreate : handleJoin}
          >
            {mode === 'create' ? '만들기' : '참가하기'}
          </button>

          <button className="btn-ghost" onClick={() => { setMode('menu'); setError(''); }}>
            뒤로
          </button>
        </div>
      )}
    </div>
  );
}
