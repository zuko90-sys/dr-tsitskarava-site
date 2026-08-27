import { evaluate } from '../engine/engine';
import { RULES } from '../engine/rules';
import type { CourierEvent, Snapshot } from '../engine/types';
import { shiftAppeals } from './appeals';
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
  /** Поданные обжалования — индексы спорных событий в журнале. */
  appeals: number[];
  /** Дни, на которые курьер взял слот на следующую неделю. */
  mySlots: string[];
  /** Отмеченные пункты чек-листа новичка (индексы). */
  checklist: number[];
  /** Открытая шторка. Не сохраняется: после перезагрузки шторок нет. */
  sheet: 'appeal' | null;
}

type Listener = (state: AppState) => void;

const KEY = 'vv-courier-prototype-v1';

/** Что новичок уже освоил к четвёртому дню сценария. */
const CHECKLIST_START = [0, 1, 2, 3];

/** Сколько записей ленты было на момент последнего просмотра. */
let seenFeed = 0;

interface Draft {
  scenarioId: string;
  events: CourierEvent[];
  screen: string;
  seen: number;
  appeals: number[];
  mySlots: string[];
  checklist: number[];
  sheet: 'appeal' | null;
}

function build(d: Draft): AppState {
  const scenario: Scenario = scenarioById(d.scenarioId);
  const snapshot = evaluate(d.events, RULES, scenario.ctx);
  return {
    scenarioId: d.scenarioId,
    events: d.events,
    screen: d.screen,
    snapshot,
    profile: PROFILE[d.scenarioId] ?? PROFILE.steady,
    // Открытая лента считается просмотренной сразу: показывать точку на
    // вкладке, которую человек прямо сейчас читает, бессмысленно.
    unreadFeed: d.screen === 'feed' ? 0 : Math.max(0, snapshot.feed.length - d.seen),
    appeals: d.appeals,
    mySlots: d.mySlots,
    checklist: d.checklist,
    sheet: d.sheet,
  };
}

/** Черновик из текущего состояния — чтобы менять одно поле, не перечисляя все. */
function draft(): Draft {
  return {
    scenarioId: state.scenarioId, events: state.events, screen: state.screen,
    seen: seenFeed, appeals: state.appeals, mySlots: state.mySlots,
    checklist: state.checklist, sheet: state.sheet,
  };
}

function restore(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as {
        scenarioId?: string; events?: CourierEvent[]; screen?: string;
        seenFeed?: number; appeals?: number[]; mySlots?: string[]; checklist?: number[];
      };
      if (saved.scenarioId && Array.isArray(saved.events)) {
        seenFeed = saved.seenFeed ?? 0;
        const appeals = (saved.appeals ?? []).filter(
          (i) => Number.isInteger(i) && i >= 0 && i < saved.events!.length,
        );
        return build({
          scenarioId: saved.scenarioId, events: saved.events, screen: saved.screen ?? 'shift',
          seen: seenFeed, appeals,
          mySlots: Array.isArray(saved.mySlots) ? saved.mySlots : [],
          checklist: Array.isArray(saved.checklist) ? saved.checklist : CHECKLIST_START,
          sheet: null,
        });
      }
    }
  } catch {
    // Приватное окно, отключённые куки, переполненное хранилище —
    // всё это нормально: просто начинаем со сценария по умолчанию.
  }
  const s = scenarioById('steady');
  return build({
    scenarioId: s.id, events: s.events, screen: 'shift',
    seen: 0, appeals: [], mySlots: [], checklist: CHECKLIST_START, sheet: null,
  });
}

let state: AppState = restore();
const listeners = new Set<Listener>();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      scenarioId: state.scenarioId, events: state.events, screen: state.screen,
      seenFeed, appeals: state.appeals, mySlots: state.mySlots, checklist: state.checklist,
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
  // Смена сценария — это другой курьер: ни счётчик непрочитанного,
  // ни заявки, ни взятые слоты к нему не относятся.
  seenFeed = 0;
  commit(build({
    ...draft(), scenarioId: s.id, events: s.events,
    appeals: [], mySlots: [], checklist: CHECKLIST_START, sheet: null, seen: 0,
  }));
}

export function setScreen(screen: string): void {
  if (screen === state.screen) return;
  if (screen === 'feed') seenFeed = state.snapshot.feed.length;
  commit(build({ ...draft(), screen, seen: seenFeed }));
}

/** Добавить событие руками — так проверяется, что движок реально считает. */
export function pushEvent(event: CourierEvent): void {
  const next = build({ ...draft(), events: [...state.events, event] });
  // Если лента открыта, новая запись считается прочитанной сразу — она на экране
  if (state.screen === 'feed') seenFeed = next.snapshot.feed.length;
  commit(next);
}

/** Откатить последнее добавленное событие. */
export function undoEvent(): void {
  if (state.events.length === 0) return;
  const lastIndex = state.events.length - 1;
  const next = build({
    ...draft(), events: state.events.slice(0, -1),
    appeals: shiftAppeals(state.appeals, lastIndex),
  });
  seenFeed = Math.min(seenFeed, next.snapshot.feed.length);
  commit(next);
}

/** Вернуть сценарий к исходному журналу. */
export function resetScenario(): void {
  const s = scenarioById(state.scenarioId);
  seenFeed = 0;
  commit(build({
    ...draft(), events: s.events,
    appeals: [], mySlots: [], checklist: CHECKLIST_START, sheet: null, seen: 0,
  }));
}

/* ─────────────────────────── СЛОТЫ И ЧЕК-ЛИСТ ─────────────────────────── */

/** Взять или отпустить слот на день следующей недели. */
export function toggleSlot(day: string): void {
  const mySlots = state.mySlots.includes(day)
    ? state.mySlots.filter((d) => d !== day)
    : [...state.mySlots, day];
  commit(build({ ...draft(), mySlots }));
}

/** Отметить или снять пункт чек-листа новичка. */
export function toggleCheck(index: number): void {
  const checklist = state.checklist.includes(index)
    ? state.checklist.filter((i) => i !== index)
    : [...state.checklist, index];
  commit(build({ ...draft(), checklist }));
}

/* ─────────────────────────── ОБЖАЛОВАНИЕ ─────────────────────────── */

export function openSheet(sheet: 'appeal'): void {
  if (state.sheet === sheet) return;
  commit({ ...state, sheet });
}

export function closeSheet(): void {
  if (state.sheet === null) return;
  commit({ ...state, sheet: null });
}

/** Подать заявку. Баллы не меняются — влияет только решение по ней. */
export function fileAppeal(eventIndex: number): void {
  if (eventIndex < 0 || eventIndex >= state.events.length) return;
  if (state.appeals.includes(eventIndex)) return;
  commit(build({ ...draft(), appeals: [...state.appeals, eventIndex] }));
}

/**
 * Решение по заявке: спорное событие удаляется из журнала.
 * Пересчёт всего остального — балла, знаков, лиги, доступа — происходит
 * сам, потому что движок считает из журнала. В этом и смысл.
 */
export function resolveAppeal(eventIndex: number): void {
  if (!state.appeals.includes(eventIndex)) return;
  const next = build({
    ...draft(), events: state.events.filter((_, i) => i !== eventIndex),
    appeals: shiftAppeals(state.appeals, eventIndex),
  });
  seenFeed = Math.min(seenFeed, next.snapshot.feed.length);
  commit(next);
}
