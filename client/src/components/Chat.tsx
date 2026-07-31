import { useState, useRef, useEffect } from 'react';
import { socket } from '../socket';
import { useRoomStore } from '../stores/room-store';
import { Avatar } from './Avatar';

interface ChatProps {
  isMafiaChatMember?: boolean;
  isNight?: boolean;
}

export function Chat({ isMafiaChatMember, isNight }: ChatProps) {
  const { messages } = useRoomStore();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 밤에 시민은 채팅 불가
  const canChat = !isNight || isMafiaChatMember;

  const send = () => {
    if (!input.trim() || !canChat) return;
    socket.emit('chat:send', input.trim());
    setInput('');
  };

  return (
    <div>
      <div className="chat-box">
        {messages.length === 0 && (
          <span className="text-dim text-xs">메시지가 없습니다</span>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-line ${msg.channel === 'system' ? 'sys' : ''} ${msg.channel === 'mafia' ? 'mafia-chat' : ''}`}>
            {msg.channel !== 'system' && (
              <>
                <Avatar name={msg.nickname} size={18} />
                <span className="author">{msg.nickname}</span>
              </>
            )}
            <span>{msg.content}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat-bar">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
          }}
          placeholder={!canChat ? '밤에는 채팅할 수 없습니다' : (isNight ? '마피아 팀 채팅' : '메시지 입력')}
          maxLength={200}
          disabled={!canChat}
          style={isNight && canChat ? { borderColor: 'var(--red)', color: 'var(--red)' } : undefined}
        />
        <button
          className={isNight && canChat ? 'btn-danger' : 'btn-primary'}
          onClick={send}
          disabled={!canChat}
        >
          전송
        </button>
      </div>
    </div>
  );
}
