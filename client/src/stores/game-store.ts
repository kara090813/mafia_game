import { create } from 'zustand';
import type { AvalonClientState, MafiaClientState } from '../../../shared/src/types/events';

export interface PersonalMsg {
  text: string;
  day: number;
  phase: string;
}

interface GameState {
  avalonState: AvalonClientState | null;
  mafiaState: MafiaClientState | null;
  personalMessages: PersonalMsg[];
  pendingModal: string | null; // 모달로 보여줄 메시지
  timer: number;
  timerPhase: string;
  setAvalonState: (state: AvalonClientState) => void;
  setMafiaState: (state: MafiaClientState) => void;
  addPersonalMessage: (msg: PersonalMsg) => void;
  setPendingModal: (msg: string | null) => void;
  setTimer: (seconds: number) => void;
  setTimerPhase: (phase: string) => void;
  clearGame: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  avalonState: null,
  mafiaState: null,
  personalMessages: [],
  pendingModal: null,
  timer: 0,
  timerPhase: '',

  setAvalonState: (avalonState) => set({ avalonState }),
  setMafiaState: (mafiaState) => set({ mafiaState }),
  addPersonalMessage: (msg) =>
    set((state) => ({ personalMessages: [...state.personalMessages, msg] })),
  setPendingModal: (pendingModal) => set({ pendingModal }),
  setTimer: (timer) => set({ timer }),
  setTimerPhase: (timerPhase) => set({ timerPhase }),
  clearGame: () => set({ avalonState: null, mafiaState: null, personalMessages: [], pendingModal: null, timer: 0, timerPhase: '' }),
}));
