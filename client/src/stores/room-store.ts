import { create } from 'zustand';
import type { Room, Player, ChatMessage } from '../../../shared/src/types/common';

interface RoomState {
  room: Room | null;
  nickname: string;
  messages: ChatMessage[];
  setRoom: (room: Room | null) => void;
  setNickname: (nickname: string) => void;
  addMessage: (message: ChatMessage) => void;
  updatePlayer: (player: Player) => void;
  removePlayer: (playerId: string) => void;
  clearMessages: () => void;
}

// sessionStorage에서 닉네임 복원
const savedNickname = sessionStorage.getItem('nickname') || '';

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  nickname: savedNickname,
  messages: [],

  setRoom: (room) => {
    if (room) {
      sessionStorage.setItem('roomCode', room.code);
    } else {
      sessionStorage.removeItem('roomCode');
    }
    set({ room });
  },

  setNickname: (nickname) => {
    sessionStorage.setItem('nickname', nickname);
    set({ nickname });
  },

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  updatePlayer: (player) =>
    set((state) => {
      if (!state.room) return state;
      const exists = state.room.players.some(p => p.id === player.id);
      const players = exists
        ? state.room.players.map(p => p.id === player.id ? player : p)
        : [...state.room.players, player];
      return { room: { ...state.room, players } };
    }),

  removePlayer: (playerId) =>
    set((state) => {
      if (!state.room) return state;
      return { room: { ...state.room, players: state.room.players.filter(p => p.id !== playerId) } };
    }),

  clearMessages: () => set({ messages: [] }),
}));
