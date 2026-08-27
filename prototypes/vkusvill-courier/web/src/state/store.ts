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
  /** Сколько записей ленты добавилось с тех пор, как её открывали. */
  unreadFeed: number;
}

type Listener = (state: AppState) => void;

const KEY = 'vv-courier-prototype-v1';

function build(scenarioId: string, events: CourierEvent[], screen: string, seen: number): AppState {
  const scenario: Scenario = scenarioById(scenarioId);
  const snapshot = evaluate(events, RULES, scenario.ctx);
  return {
    scenarioId,
    events,
    screen,
    snapshot,
    profile: PROFILE[scenarioId] ?? PROFILE.steady,
    // Открытая лента считается просмотренной сразу: показывать точку на
    // вкладке, которую человек прямо сейчас читает, бессмысленно.
    unreadFeed: screen === 'feed' ? 0 : Math.max(0, snapshot.feed.length - seen),
  };
}

/** Сколько записей ленты было на момент последнего просмотра. */
let seenFeed = 0;

function restore(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as {
        scenarioId?: string; events?: CourierEvent[]; screen?: string; seenFeed?: number;
      };
      if (saved.scenarioId && Array.isArray(saved.events)) {
        seenFeed = saved.seenFeed ?? 0;
        return build(saved.scenarioId, saved.events, saved.screen ?? 'shift', seenFeed);
      }
    }
  } catch {
    // Приватное окно, отключённые куки, переполненное хранилище —
    // всё это нормально: просто начинаем со сценария по умолчанию.
  }
  const s = scenarioById('steady');
  return build(s.id, s.events, 'shift', 0);
}

let state: AppState = restore();
const listeners = new Set<Listener>();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      scenarioId: state.scenarioId, events: state.events, screen: state.screen, seenFeed,
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
  // Смена сценария — это другой курьер, счётчик непрочитанного к нему не относится
  seenFeed = 0;
  commit(build(s.id, s.events, state.screen, seenFeed));
}

export function setScreen(screen: string): void {
  if (screen === state.screen) return;
  if (screen === 'feed') seenFeed = state.snapshot.feed.length;
  commit(build(state.scenarioId, state.events, screen, seenFeed));
}

/** Добавить событие руками — так проверяется, что движок реально считает. */
export function pushEvent(event: CourierEvent): void {
  const next = build(state.scenarioId, [...state.events, event], state.screen, seenFeed);
  // Если лента открыта, новая запись считается прочитанной сразу — она на экране
  if (state.screen === 'feed') seenFeed = next.snapshot.feed.length;
  commit(next);
}

/** Откатить последнее добавленное событие. */
export function undoEvent(): void {
  if (state.events.length === 0) return;
  const next = build(state.scenarioId, state.events.slice(0, -1), state.screen, seenFeed);
  seenFeed = Math.min(seenFeed, next.snapshot.feed.length);
  commit(next);
}

/** Вернуть сценарий к исходному журналу. */
export function resetScenario(): void {
  const s = scenarioById(state.scenarioId);
  seenFeed = 0;
  commit(build(s.id, s.events, state.screen, seenFeed));
}
