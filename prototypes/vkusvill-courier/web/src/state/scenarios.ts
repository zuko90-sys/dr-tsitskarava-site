import type { CourierEvent, EvaluateContext } from '../engine/types';

export interface Scenario {
  id: string;
  label: string;
  ctx: EvaluateContext;
  events: CourierEvent[];
}

/** Генератор повторяющихся событий — журналы получаются длинные. */
function rep<T extends CourierEvent>(n: number, make: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => make(i));
}

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const day = (i: number) => DAYS[i % 7];

/* ─────────────────── Первая неделя ─────────────────── */
/* Айгуль, четвёртый день. Смен мало, лига ещё закрыта. */
const rookie: CourierEvent[] = [
  ...rep(4, (i) => ({ type: 'shift_closed', at: day(i), clean: true } as CourierEvent)),
  ...rep(4, (i) => ({ type: 'slot_attended', at: day(i) } as CourierEvent)),
  ...rep(27, (i) => ({ type: 'delivery', at: day(i % 3), clean: true } as CourierEvent)),
  ...rep(9, (i) => ({ type: 'rating', at: day(i % 3), stars: 5 } as CourierEvent)),
  ...rep(2, (i) => ({ type: 'rating', at: day(i % 3), stars: 4 } as CourierEvent)),
  ...rep(4, (i) => ({ type: 'tare_returned', at: day(i), all: true } as CourierEvent)),
];

/* ─────────────────── Ровная неделя ─────────────────── */
/* Ислам, пять смен из пяти, ни одного пропуска. */
const steady: CourierEvent[] = [
  ...rep(5, (i) => ({ type: 'shift_closed', at: day(i), clean: true } as CourierEvent)),
  ...rep(5, (i) => ({ type: 'slot_attended', at: day(i) } as CourierEvent)),
  ...rep(64, (i) => ({ type: 'delivery', at: day(i % 5), clean: true } as CourierEvent)),
  ...rep(32, (i) => ({ type: 'rating', at: day(i % 5), stars: 5 } as CourierEvent)),
  ...rep(1, (i) => ({ type: 'rating', at: day(i % 5), stars: 4 } as CourierEvent)),
  ...rep(5, (i) => ({ type: 'tare_returned', at: day(i), all: true } as CourierEvent)),
  ...rep(2, (i) => ({ type: 'helped', at: day(i + 2) } as CourierEvent)),
];

/* ─────────────────── Просевшая неделя ─────────────────── */
/* Тот же Ислам: три смены из пяти, падение, три жалобы на упаковку. */
const dip: CourierEvent[] = [
  { type: 'shift_closed', at: 'Пн', clean: true },
  { type: 'slot_attended', at: 'Пн' },
  ...rep(18, () => ({ type: 'delivery', at: 'Пн', clean: true } as CourierEvent)),
  ...rep(12, () => ({ type: 'rating', at: 'Пн', stars: 5 } as CourierEvent)),
  { type: 'tare_returned', at: 'Пн', all: true },

  { type: 'slot_missed', at: 'Вт', warnedAhead: false },

  { type: 'shift_closed', at: 'Ср', clean: false },
  { type: 'slot_attended', at: 'Ср' },
  ...rep(16, () => ({ type: 'delivery', at: 'Ср', clean: true } as CourierEvent)),
  { type: 'complaint', at: 'Ср', kind: 'damage' },
  { type: 'delivery', at: 'Ср', clean: false },
  ...rep(6, () => ({ type: 'rating', at: 'Ср', stars: 5 } as CourierEvent)),
  ...rep(2, () => ({ type: 'rating', at: 'Ср', stars: 3 } as CourierEvent)),
  { type: 'tare_returned', at: 'Ср', all: false },

  { type: 'slot_missed', at: 'Чт', warnedAhead: false },

  { type: 'incident', at: 'Пт' },
  { type: 'shift_closed', at: 'Пт', clean: false },
  { type: 'slot_attended', at: 'Пт' },
  ...rep(14, () => ({ type: 'delivery', at: 'Пт', clean: true } as CourierEvent)),
  { type: 'complaint', at: 'Пт', kind: 'damage' },
  { type: 'delivery', at: 'Пт', clean: false },
  { type: 'complaint', at: 'Пт', kind: 'damage' },
  ...rep(5, () => ({ type: 'rating', at: 'Пт', stars: 5 } as CourierEvent)),
  ...rep(3, () => ({ type: 'rating', at: 'Пт', stars: 3 } as CourierEvent)),
  { type: 'tare_returned', at: 'Пт', all: true },
];

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
