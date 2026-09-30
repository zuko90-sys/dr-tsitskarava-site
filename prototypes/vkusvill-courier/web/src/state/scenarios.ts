import type { ComplimentId, CourierEvent, EvaluateContext } from '../engine/types';

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
  /** Пятёрки с комплиментом. Идут после обычных, чтобы лента сворачивала пятёрки в одну строку. */
  compliments?: ComplimentId[];
  /** Спасибо от коллег — с именем и словами, как их написали. */
  kudos?: { from: string; text: string }[];
  tare?: 'all' | 'partial';
  helped?: number;
  mentored?: number;
  shift?: 'clean' | 'noted';
  hours?: number;
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
  for (const compliment of d.compliments ?? []) out.push({ type: 'rating', at, stars: 5, compliment });
  rep(d.fours ?? 0, () => ({ type: 'rating', at, stars: 4 }));
  rep(d.threes ?? 0, () => ({ type: 'rating', at, stars: 3 }));

  rep(d.helped ?? 0, () => ({ type: 'helped', at }));
  rep(d.mentored ?? 0, () => ({ type: 'mentored', at }));
  for (const k of d.kudos ?? []) out.push({ type: 'kudos', at, from: k.from, text: k.text });

  if (d.tare) out.push({ type: 'tare_returned', at, all: d.tare === 'all' });
  if (d.shift) out.push({ type: 'shift_closed', at, clean: d.shift === 'clean', hours: d.hours });

  return out;
}

const week = (days: [string, Day][]): CourierEvent[] => days.flatMap(([at, d]) => day(at, d));

/* ─────────────────── Первая неделя ─────────────────── */
/* Айгуль, четвёртый день. Смен мало, лига ещё закрыта. */
const rookie = week([
  ['Пн', { slot: 'ok', deliveries: 7, fives: 3, tare: 'all', shift: 'clean', hours: 6 }],
  ['Вт', { slot: 'ok', deliveries: 7, fives: 2, fours: 1, tare: 'all', shift: 'clean', hours: 6 }],
  ['Ср', { slot: 'ok', deliveries: 7, fives: 2, kudos: [{ from: 'Тимур А.', text: 'Для третьего дня очень ровно. Так и держи' }], tare: 'all', shift: 'clean', hours: 6 }],
  ['Чт', { slot: 'ok', deliveries: 6, fives: 1, compliments: ['polite'], fours: 1, tare: 'all', shift: 'clean', hours: 6 }],
]);

/* ─────────────────── Ровная неделя ─────────────────── */
/* Ислам, пять смен из пяти, ни одного пропуска. */
const steady = week([
  ['Пн', { slot: 'ok', deliveries: 13, fives: 6, compliments: ['polite'], tare: 'all', shift: 'clean', hours: 7 }],
  ['Вт', { slot: 'ok', deliveries: 13, fives: 6, tare: 'all', helped: 1, kudos: [{ from: 'Марина К.', text: 'Спасибо, что забрал мой заказ на Вернадского' }], shift: 'clean', hours: 7 }],
  ['Ср', { slot: 'ok', deliveries: 13, fives: 6, compliments: ['careful'], tare: 'all', shift: 'clean', hours: 7 }],
  ['Чт', { slot: 'ok', deliveries: 12, fives: 6, fours: 1, tare: 'all', helped: 1, kudos: [{ from: 'Тимур А.', text: 'Выручил с холодильником, я бы не успел' }], shift: 'clean', hours: 7 }],
  ['Пт', { slot: 'ok', deliveries: 13, fives: 5, compliments: ['tare'], tare: 'all', shift: 'clean', hours: 7 }],
]);

/* ─────────────────── Просевшая неделя ─────────────────── */
/* Тот же Ислам: три смены из пяти, падение, три жалобы на упаковку. */
const dip = week([
  ['Пн', { slot: 'ok', deliveries: 18, fives: 12, kudos: [{ from: 'Женя Л.', text: 'Спасибо за подмену в субботу' }], tare: 'all', shift: 'clean', hours: 10 }],
  ['Вт', { slot: 'missed' }],
  ['Ср', { slot: 'ok', deliveries: 16, damaged: 1, fives: 6, threes: 2, tare: 'partial', shift: 'noted', hours: 9 }],
  ['Чт', { slot: 'missed' }],
  ['Пт', { incident: true, slot: 'ok', deliveries: 14, damaged: 2, fives: 5, threes: 3, tare: 'all', shift: 'noted', hours: 9 }],
]);

export const SCENARIOS: Scenario[] = [
  {
    id: 'rookie',
    label: 'Первая неделя',
    ctx: { dayNumber: 4, shiftsBefore: 0, weeksBelow: 0, workedInRowBefore: 0, courierName: 'Ты' },
    events: rookie,
  },
  {
    id: 'steady',
    label: 'Ровная неделя',
    ctx: {
      dayNumber: 214, shiftsBefore: 63, weeksBelow: 0, workedInRowBefore: 0, courierName: 'Ты',
      badgesBefore: { care: 36, zero: 25, tare: 10, local: 136, mentor: 1, helper: 3, thanks: 7 },
    },
    events: steady,
  },
  {
    id: 'dip',
    label: 'Просевшая неделя',
    ctx: {
      dayNumber: 214, shiftsBefore: 65, weeksBelow: 0, workedInRowBefore: 0, courierName: 'Ты',
      badgesBefore: { care: 36, zero: 25, tare: 10, local: 136, mentor: 1, helper: 3, thanks: 7 },
    },
    events: dip,
  },
];

export const PROFILE: Record<string, { name: string; initial: string; sub: string; weather: string }> = {
  rookie: { name: 'Айгуль', initial: 'А', sub: 'Профсоюзная, 43 · 4-й день', weather: 'Ясно, +18°' },
  steady: { name: 'Ислам', initial: 'И', sub: 'Профсоюзная, 43 · велосипед', weather: 'Облачно, +14°' },
  dip: { name: 'Ислам', initial: 'И', sub: 'Профсоюзная, 43 · велосипед', weather: 'Дождь, +6°, скользко' },
};

export function scenarioById(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[1];
}
