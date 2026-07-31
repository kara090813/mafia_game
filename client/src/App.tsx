import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { socket } from './socket';
import { useRoomStore } from './stores/room-store';
import { useGameStore } from './stores/game-store';
import { Home } from './pages/Home';
import { Lobby } from './pages/Lobby';
import { AvalonGame } from './pages/AvalonGame';
import { MafiaGame } from './pages/MafiaGame';
import './App.css';

function AppInner() {
  const navigate = useNavigate();
  const { setRoom, addMessage, updatePlayer, removePlayer } = useRoomStore();
  const { setAvalonState, setMafiaState, addPersonalMessage, setPendingModal, setTimer, setTimerPhase, clearGame } = useGameStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    socket.on('room:updated', (room) => {
      console.log('[room:updated]', room.code, room.status);
      setRoom(room);
      if (room.status === 'waiting') {
        console.log('[room:updated] waiting -> clearGame + lobby');
        clearGame();
        // setTimeout으로 state 업데이트 후 navigate
        setTimeout(() => navigate('/lobby'), 0);
      }
    });
    socket.on('room:player-joined', updatePlayer);
    socket.on('room:player-left', removePlayer);
    socket.on('chat:message', addMessage);
    socket.on('avalon:state', (state) => { setAvalonState(state); navigate('/avalon'); });
    socket.on('mafia:state', (state) => { setMafiaState(state); navigate('/mafia'); });
    socket.on('mafia:personal-message', (data) => {
      addPersonalMessage(data);
      setPendingModal(data.text);
    });
    socket.on('timer:start', (seconds, phase) => { setTimer(seconds); setTimerPhase(phase); });
    socket.on('timer:tick', setTimer);
    socket.on('timer:end', () => setTimer(0));

    const onConnect = () => {
      const savedCode = sessionStorage.getItem('roomCode');
      const savedNick = sessionStorage.getItem('nickname');

      if (!savedCode || !savedNick) {
        setReady(true);
        return;
      }

      socket.emit('room:rejoin', savedCode, savedNick, (result) => {
        if (!result) {
          sessionStorage.removeItem('roomCode');
          setReady(true);
          navigate('/');
          return;
        }

        setRoom(result.room);

        if (result.gameState) {
          const gs = result.gameState as { type: string; state: unknown };
          if (gs.type === 'mafia') {
            setMafiaState(gs.state as Parameters<typeof setMafiaState>[0]);
            setReady(true);
            navigate('/mafia');
          } else if (gs.type === 'avalon') {
            setAvalonState(gs.state as Parameters<typeof setAvalonState>[0]);
            setReady(true);
            navigate('/avalon');
          }
        } else {
          setReady(true);
          navigate('/lobby');
        }
      });
    };

    socket.on('connect', onConnect);
    socket.connect();
    if (socket.connected) onConnect();

    // 3초 안에 연결 안 되면 강제로 ready
    const timeout = setTimeout(() => setReady(true), 3000);

    return () => {
      clearTimeout(timeout);
      socket.off('room:updated');
      socket.off('room:player-joined');
      socket.off('room:player-left');
      socket.off('chat:message');
      socket.off('avalon:state');
      socket.off('mafia:state');
      socket.off('mafia:personal-message');
      socket.off('timer:start');
      socket.off('timer:tick');
      socket.off('timer:end');
      socket.off('connect', onConnect);
      socket.disconnect();
    };
  }, []);

  // 재접속 완료 전 로딩
  if (!ready) {
    return (
      <div className="app">
        <div className="page-center">
          <p className="text-center text-dim text-sm">연결 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/avalon" element={<AvalonGame />} />
        <Route path="/mafia" element={<MafiaGame />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
