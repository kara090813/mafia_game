import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/src/types/events';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

interface TimerState {
  timeout: NodeJS.Timeout;
  tick: NodeJS.Timeout;
  remaining: number;
  onExpire: () => void;
  io: IO;
  roomCode: string;
  phase: string;
}

export class TimerManager {
  private timers = new Map<string, TimerState>();

  start(roomCode: string, seconds: number, phase: string, io: IO, onExpire: () => void): void {
    this.clear(roomCode);

    io.to(roomCode).emit('timer:start', seconds, phase);

    const state: TimerState = {
      timeout: null as unknown as NodeJS.Timeout,
      tick: null as unknown as NodeJS.Timeout,
      remaining: seconds,
      onExpire, io, roomCode, phase,
    };

    state.tick = setInterval(() => {
      state.remaining--;
      io.to(roomCode).emit('timer:tick', state.remaining);
      if (state.remaining <= 0) clearInterval(state.tick);
    }, 1000);

    state.timeout = setTimeout(() => {
      this.clear(roomCode);
      io.to(roomCode).emit('timer:end');
      onExpire();
    }, seconds * 1000);

    this.timers.set(roomCode, state);
  }

  reduce(roomCode: string, seconds: number, io: IO): void {
    const state = this.timers.get(roomCode);
    if (!state) return;

    state.remaining = Math.max(0, state.remaining - seconds);
    io.to(roomCode).emit('timer:tick', state.remaining);

    // 타이머 재설정
    clearTimeout(state.timeout);
    if (state.remaining <= 0) {
      this.clear(roomCode);
      io.to(roomCode).emit('timer:end');
      state.onExpire();
    } else {
      state.timeout = setTimeout(() => {
        this.clear(roomCode);
        io.to(roomCode).emit('timer:end');
        state.onExpire();
      }, state.remaining * 1000);
    }
  }

  add(roomCode: string, seconds: number, io: IO): void {
    const state = this.timers.get(roomCode);
    if (!state) return;

    state.remaining += seconds;
    io.to(roomCode).emit('timer:tick', state.remaining);

    clearTimeout(state.timeout);
    state.timeout = setTimeout(() => {
      this.clear(roomCode);
      io.to(roomCode).emit('timer:end');
      state.onExpire();
    }, state.remaining * 1000);
  }

  clear(roomCode: string): void {
    const state = this.timers.get(roomCode);
    if (!state) return;
    clearTimeout(state.timeout);
    clearInterval(state.tick);
    this.timers.delete(roomCode);
  }
}
