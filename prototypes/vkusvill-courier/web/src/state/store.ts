import { nextDay } from '../engine/days';
import { evaluate, isExcused } from '../engine/engine';
import { RULES } from '../engine/rules';
import type { CourierEvent, ExcuseId, Snapshot } from '../engine/types';
import { disputable, shiftAppeals, type Appeal } from './appeals';
import { PROFILE, scenarioById, type Scenario } from './scenarios';

export type SheetId = 'appeal' | 'rules';

export interface AppState {
  scenarioId: string;
  /** Журнал сценария плюс всё, что добавили руками в симуляторе. */
  events: CourierEvent[];
  screen: string;
  snapshot: Snapshot;
  profile: { name: string; initial: string; sub: string; weather: string };
  /** Сколько записей ленты добавилось с тех пор, как её открывали. */
  unreadFeed: number;
  /** Поданные обжалования, ждущие решения управляющего. */
  appeals: Appeal[];
  /** Дни, на которые курьер взял слот на следующую неделю. */
  mySlots: string[];
  /** Отмеченные пункты чек-листа новичка (индексы). */
  checklist: number[];
  /** Курьер отметил «я в порядке» после инцидента. */
  incidentAck: boolean;
  /** Открытая шторка. Не сохраняется: после перезагрузки шторок нет. */
  sheet: SheetId | null;
  /** Спорное событие, у которого раскрыт список причин. Тоже не сохраняется. */
  picked: number | null;
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
  appeals: Appeal[];
  mySlots: string[];
  checklist: number[];
  incidentAck: boolean;
  sheet: SheetId | null;
  picked: number | null;
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
    incidentAck: d.incidentAck,
    sheet: d.sheet,
    picked: d.picked,
  };
}

/** Черновик из текущего состояния — чтобы менять одно поле, не перечисляя все. */
function draft(): Draft {
  return {
    scenarioId: state.scenarioId, events: state.events, screen: state.screen,
    seen: seenFeed, appeals: state.appeals, mySlots: state.mySlots,
    checklist: state.checklist, incidentAck: state.incidentAck,
    sheet: state.sheet, picked: state.picked,
  };
}

/** Заявки старого формата — просто индексы — превращаются в заявки «другое». */
function readAppeals(raw: unknown, size: number): Appeal[] {
  if (!Array.isArray(raw)) return [];
  const out: Appeal[] = [];
  for (const item of raw) {
    const a: Appeal | null = typeof item === 'number'
      ? { index: item, reason: 'other' }
      : item && typeof item === 'object' && typeof (item as Appeal).index === 'number'
        ? { index: (item as Appeal).index, reason: (item as Appeal).reason ?? 'other' }
        : null;
    if (a && Number.isInteger(a.index) && a.index >= 0 && a.index < size) out.push(a);
  }
  return out;
}

function restore(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as {
        scenarioId?: string; events?: CourierEvent[]; screen?: string;
        seenFeed?: number; appeals?: unknown; mySlots?: string[]; checklist?: number[];
        incidentAck?: boolean;
      };
      if (saved.scenarioId && Array.isArray(saved.events)) {
        seenFeed = saved.seenFeed ?? 0;
        return build({
          scenarioId: saved.scenarioId, events: saved.events, screen: saved.screen ?? 'shift',
          seen: seenFeed, appeals: readAppeals(saved.appeals, saved.events.length),
          mySlots: Array.isArray(saved.mySlots) ? saved.mySlots : [],
          checklist: Array.isArray(saved.checklist) ? saved.checklist : CHECKLIST_START,
          incidentAck: saved.incidentAck === true,
          sheet: null, picked: null,
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
    seen: 0, appeals: [], mySlots: [], checklist: CHECKLIST_START,
    incidentAck: false, sheet: null, picked: null,
  });
}

let state: AppState = restore();
const listeners = new Set<Listener>();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      scenarioId: state.scenarioId, events: state.events, screen: state.screen,
      seenFeed, appeals: state.appeals, mySlots: state.mySlots, checklist: state.checklist,
      incidentAck: state.incidentAck,
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

/** Всё, что относится к одному курьеру и одной неделе, — заново. */
function fresh(s: Scenario): Draft {
  return {
    ...draft(), scenarioId: s.id, events: s.events, seen: 0,
    appeals: [], mySlots: [], checklist: CHECKLIST_START,
    incidentAck: false, sheet: null, picked: null,
  };
}

export function setScenario(id: string): void {
  // Смена сценария — это другой курьер: ни счётчик непрочитанного,
  // ни заявки, ни взятые слоты к нему не относятся.
  seenFeed = 0;
  commit(build(fresh(scenarioById(id))));
}

export function setScreen(screen: string): void {
  if (screen === state.screen) return;
  if (screen === 'feed') seenFeed = state.snapshot.feed.length;
  commit(build({ ...draft(), screen, seen: seenFeed }));
}

/**
 * День для нового события. Закрытая смена завершает день: всё, что подано
 * после неё, относится уже к следующему. Иначе один и тот же день появлялся
 * бы в ленте дважды, а «дни подряд» нельзя было бы набрать вообще.
 */
export function today(events: CourierEvent[] = state.events): string {
  if (events.length === 0) return 'Пн';
  const last = events[events.length - 1];
  return last.type === 'shift_closed' ? nextDay(last.at) : last.at;
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
    picked: state.picked === lastIndex ? null : state.picked,
  });
  seenFeed = Math.min(seenFeed, next.snapshot.feed.length);
  commit(next);
}

/** Вернуть сценарий к исходному журналу. */
export function resetScenario(): void {
  seenFeed = 0;
  commit(build(fresh(scenarioById(state.scenarioId))));
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

/* ─────────────────────────── НАГРУЗКА И ИНЦИДЕНТ ─────────────────────────── */

/**
 * Взять выходной: завтрашний слот освобождается заранее. Это обычное
 * событие журнала — «слот освобождён заранее», 0 баллов, — и серия дней
 * подряд на нём обрывается.
 */
export function takeRest(): void {
  pushEvent({ type: 'slot_missed', at: today(), warnedAhead: true });
}

/** «Я в порядке» после инцидента. Карточка с порядком действий сворачивается. */
export function ackIncident(): void {
  if (state.incidentAck) return;
  commit(build({ ...draft(), incidentAck: true }));
}

/* ─────────────────────────── ОБЖАЛОВАНИЕ ─────────────────────────── */

export function openSheet(sheet: SheetId): void {
  if (state.sheet === sheet) return;
  commit({ ...state, sheet, picked: null });
}

export function closeSheet(): void {
  if (state.sheet === null) return;
  commit({ ...state, sheet: null, picked: null });
}

/** Раскрыть или свернуть список причин у спорного события. */
export function pickDispute(index: number): void {
  commit({ ...state, picked: state.picked === index ? null : index });
}

/** Пометить событие «не по моей вине» с этой причиной. Журнал меняется, всё остальное — пересчёт. */
function excuse(events: CourierEvent[], index: number, reason: ExcuseId): CourierEvent[] {
  return events.map((e, i) => (i === index ? { ...e, excused: reason } as CourierEvent : e));
}

/**
 * Оспорить событие, назвав причину.
 * Причину, которую подтверждает система, движок применяет сразу — заявка
 * не нужна. Остальные уходят управляющему и до решения ничего не меняют.
 */
export function contest(index: number, reason: ExcuseId): void {
  const target = disputable(state.events).find((d) => d.index === index);
  if (!target || target.excused !== undefined) return;
  const rule = RULES.excuses.find((x) => x.id === reason);
  if (!rule) return;

  if (rule.auto) {
    commit(build({
      ...draft(), events: excuse(state.events, index, reason),
      appeals: state.appeals.filter((a) => a.index !== index), picked: null,
    }));
    return;
  }

  if (state.appeals.some((a) => a.index === index)) return;
  commit(build({ ...draft(), appeals: [...state.appeals, { index, reason }], picked: null }));
}

/**
 * Решение по заявке: событие получает пометку «не по моей вине» и остаётся
 * в журнале. Пересчёт всего остального — балла, знаков, лиги, доступа —
 * происходит сам, потому что движок считает из журнала. В этом и смысл.
 */
export function resolveAppeal(index: number): void {
  const appeal = state.appeals.find((a) => a.index === index);
  if (!appeal || isExcused(state.events[index])) return;
  const next = build({
    ...draft(), events: excuse(state.events, index, appeal.reason),
    appeals: state.appeals.filter((a) => a.index !== index),
  });
  seenFeed = Math.min(seenFeed, next.snapshot.feed.length);
  commit(next);
}
