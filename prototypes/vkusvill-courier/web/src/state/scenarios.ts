import type { CourierEvent, EvaluateContext } from '../engine/types';

export interface Scenario {
  id: string;
  label: string;
  ctx: EvaluateContext;
  events: CourierEvent[];
}

interface Day {
  /** Инцидент идёт первым: знак «Ноль инцидентов» должен обнулиться до закрытия смены. */
  incident?: boolean;
  slot?: 'ok' | 'missed' | 'warned';
  deliveries?: number;
  /** Жалоба и повреждённая доставка идут после чистых — так знак и обнуляется. */
  damaged?: number;
  fives?: number;
  fours?: number;
  threes?: number;
  tare?: 'all' | 'partial';
  helped?: number;
  mentored?: number;
  shift?: 'clean' | 'noted';
}

/**
 * Один день журнала. Порядок внутри дня не случайный: он определяет,
 * где именно обнулятся счётчики знаков, а значит и то, что попадёт в ленту.
 */
function day(at: string, d: Day): CourierEvent[] {
  const out: CourierEvent[] = [];
  const rep = (n: number, make: () => CourierEvent) => {
    for (let i = 0; i < n; i++) out.push(make());
  };

  if (d.incident) out.push({ type: 'incident', at });
  if (d.slot === 'ok') out.push({ type: 'slot_attended', at });
  if (d.slot === 'missed') out.push({ type: 'slot_missed', at, warnedAhead: false });
  if (d.slot === 'warned') out.push({ type: 'slot_missed', at, warnedAhead: true });

  rep(d.deliveries ?? 0, () => ({ type: 'delivery', at, clean: true }));
  for (let i = 0; i < (d.damaged ?? 0); i++) {
    out.push({ type: 'complaint', at, kind: 'damage' });
    out.push({ type: 'delivery', at, clean: false });
  }

  rep(d.fives ?? 0, () => ({ type: 'rating', at, stars: 5 }));
  rep(d.fours ?? 0, () => ({ type: 'rating', at, stars: 4 }));
  rep(d.threes ?? 0, () => ({ type: 'rating', at, stars: 3 }));

  rep(d.helped ?? 0, () => ({ type: 'helped', at }));
  rep(d.mentored ?? 0, () => ({ type: 'mentored', at }));

  if (d.tare) out.push({ type: 'tare_returned', at, all: d.tare === 'all' });
  if (d.shift) out.push({ type: 'shift_closed', at, clean: d.shift === 'clean' });

  return out;
}

const week = (days: [string, Day][]): CourierEvent[] => days.flatMap(([at, d]) => day(at, d));

/* ─────────────────── Первая неделя ─────────────────── */
/* Айгуль, четвёртый день. Смен мало, лига ещё закрыта. */
const rookie = week([
  ['Пн', { slot: 'ok', deliveries: 7, fives: 3, tare: 'all', shift: 'clean' }],
  ['Вт', { slot: 'ok', deliveries: 7, fives: 2, fours: 1, tare: 'all', shift: 'clean' }],
  ['Ср', { slot: 'ok', deliveries: 7, fives: 2, tare: 'all', shift: 'clean' }],
  ['Чт', { slot: 'ok', deliveries: 6, fives: 2, fours: 1, tare: 'all', shift: 'clean' }],
]);

/* ─────────────────── Ровная неделя ─────────────────── */
/* Ислам, пять смен из пяти, ни одного пропуска. */
const steady = week([
  ['Пн', { slot: 'ok', deliveries: 13, fives: 7, tare: 'all', shift: 'clean' }],
  ['Вт', { slot: 'ok', deliveries: 13, fives: 6, tare: 'all', helped: 1, shift: 'clean' }],
  ['Ср', { slot: 'ok', deliveries: 13, fives: 7, tare: 'all', shift: 'clean' }],
  ['Чт', { slot: 'ok', deliveries: 12, fives: 6, fours: 1, tare: 'all', helped: 1, shift: 'clean' }],
  ['Пт', { slot: 'ok', deliveries: 13, fives: 6, tare: 'all', shift: 'clean' }],
]);

/* ─────────────────── Просевшая неделя ─────────────────── */
/* Тот же Ислам: три смены из пяти, падение, три жалобы на упаковку. */
const dip = week([
  ['Пн', { slot: 'ok', deliveries: 18, fives: 12, tare: 'all', shift: 'clean' }],
  ['Вт', { slot: 'missed' }],
  ['Ср', { slot: 'ok', deliveries: 16, damaged: 1, fives: 6, threes: 2, tare: 'partial', shift: 'noted' }],
  ['Чт', { slot: 'missed' }],
  ['Пт', { incident: true, slot: 'ok', deliveries: 14, damaged: 2, fives: 5, threes: 3, tare: 'all', shift: 'noted' }],
]);

export const SCENARIOS: Scenario[] = [
  {
    id: 'rookie',
    label: 'Первая неделя',
    ctx: { dayNumber: 4, shiftsBefore: 0, weeksBelow: 0, courierName: 'Ты' },
    events: rookie,
  },
  {
    id: 'steady',
    label: 'Ровная неделя',
    ctx: {
      dayNumber: 214, shiftsBefore: 63, weeksBelow: 0, courierName: 'Ты',
      badgesBefore: { care: 36, zero: 25, tare: 10, local: 136, mentor: 1, helper: 3 },
    },
    events: steady,
  },
  {
    id: 'dip',
    label: 'Просевшая неделя',
    ctx: {
      dayNumber: 214, shiftsBefore: 65, weeksBelow: 0, courierName: 'Ты',
      badgesBefore: { care: 36, zero: 25, tare: 10, local: 136, mentor: 1, helper: 3 },
    },
    events: dip,
  },
];

export const PROFILE: Record<string, { name: string; initial: string; sub: string }> = {
  rookie: { name: 'Айгуль', initial: 'А', sub: 'Профсоюзная, 43 · 4-й день' },
  steady: { name: 'Ислам', initial: 'И', sub: 'Профсоюзная, 43 · велосипед' },
  dip: { name: 'Ислам', initial: 'И', sub: 'Профсоюзная, 43 · велосипед' },
};

export function scenarioById(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[1];
}
