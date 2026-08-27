import { evaluate } from '../engine/engine';
import { RULES } from '../engine/rules';
import type { CourierEvent, Snapshot } from '../engine/types';
import { PROFILE, scenarioById, type Scenario } from './scenarios';

export interface AppState {
  scenarioId: string;
  /** Журнал сценария плюс всё, что добавили руками в симуляторе. */
  events: CourierEvent[];
  screen: string;
  snapshot: Snapshot;
  profile: { name: string; initial: string; sub: string };
}

type Listener = (state: AppState) => void;

const KEY = 'vv-courier-prototype-v1';

function build(scenarioId: string, events: CourierEvent[], screen: string): AppState {
  const scenario: Scenario = scenarioById(scenarioId);
  return {
    scenarioId,
    events,
    screen,
    snapshot: evaluate(events, RULES, scenario.ctx),
    profile: PROFILE[scenarioId] ?? PROFILE.steady,
  };
}

function restore(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { scenarioId?: string; events?: CourierEvent[]; screen?: string };
      if (saved.scenarioId && Array.isArray(saved.events)) {
        return build(saved.scenarioId, saved.events, saved.screen ?? 'shift');
      }
    }
  } catch {
    // Приватное окно, отключённые куки, переполненное хранилище —
    // всё это нормально: просто начинаем со сценария по умолчанию.
  }
  const s = scenarioById('steady');
  return build(s.id, s.events, 'shift');
}

let state: AppState = restore();
const listeners = new Set<Listener>();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      scenarioId: state.scenarioId, events: state.events, screen: state.screen,
    }));
  } catch {
    // Сохранение — удобство, а не требование. Молча живём дальше.
  }
}

function commit(next: AppState): void {
  state = next;
  persist();
  listeners.forEach((fn) => fn(state));
}

export function getState(): AppState {
  return state;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setScenario(id: string): void {
  const s = scenarioById(id);
  commit(build(s.id, s.events, state.screen));
}

export function setScreen(screen: string): void {
  if (screen === state.screen) return;
  commit({ ...state, screen });
}

/** Добавить событие руками — так проверяется, что движок реально считает. */
export function pushEvent(event: CourierEvent): void {
  commit(build(state.scenarioId, [...state.events, event], state.screen));
}

/** Откатить последнее добавленное событие. */
export function undoEvent(): void {
  if (state.events.length === 0) return;
  commit(build(state.scenarioId, state.events.slice(0, -1), state.screen));
}

/** Вернуть сценарий к исходному журналу. */
export function resetScenario(): void {
  const s = scenarioById(state.scenarioId);
  commit(build(s.id, s.events, state.screen));
}
