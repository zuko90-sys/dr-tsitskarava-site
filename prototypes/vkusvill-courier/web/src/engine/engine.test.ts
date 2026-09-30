import { describe, expect, it } from 'vitest';
import { evaluate } from './engine';
import { RULES } from './rules';
import type { CourierEvent, EvaluateContext } from './types';
import { SCENARIOS, scenarioById } from '../state/scenarios';

const CTX: EvaluateContext = { dayNumber: 200, shiftsBefore: 0, weeksBelow: 0, courierName: 'Ты' };
const ctx = (over: Partial<EvaluateContext> = {}): EvaluateContext => ({ ...CTX, ...over });
const run = (events: CourierEvent[], over: Partial<EvaluateContext> = {}) =>
  evaluate(events, RULES, ctx(over));

describe('баллы', () => {
  it('складываются по таблице правил', () => {
    const s = run([
      { type: 'shift_closed', at: 'Пн', clean: true },  // +12
      { type: 'slot_attended', at: 'Пн' },              // +5
      { type: 'rating', at: 'Пн', stars: 5 },           // +3
      { type: 'tare_returned', at: 'Пн', all: true },   // +4
    ]);
    expect(s.weekPoints).toBe(24);
    expect(s.buckets).toEqual({ slots: 17, ratings: 3, tare: 4, help: 0 });
  });

  it('итог всегда равен сумме строк разбора', () => {
    for (const sc of SCENARIOS) {
      const s = evaluate(sc.events, RULES, sc.ctx);
      const sum = Object.values(s.buckets).reduce((a, b) => a + b, 0);
      expect(sum, `сценарий «${sc.label}»`).toBe(s.weekPoints);
    }
  });

  it('строка не уходит в минус', () => {
    const s = run([
      { type: 'rating', at: 'Пн', stars: 1 },
      { type: 'rating', at: 'Пн', stars: 1 },
      { type: 'complaint', at: 'Пн', kind: 'damage' },
    ]);
    expect(s.buckets.ratings).toBe(0);
    expect(s.weekPoints).toBe(0);
  });

  it('пропуск слота с предупреждением не штрафуется, без предупреждения — да', () => {
    const warned = run([{ type: 'slot_missed', at: 'Вт', warnedAhead: true }]);
    const silent = run([
      { type: 'slot_attended', at: 'Пн' }, { type: 'slot_attended', at: 'Пн' },
      { type: 'slot_missed', at: 'Вт', warnedAhead: false },
    ]);
    expect(warned.weekPoints).toBe(0);
    expect(silent.buckets.slots).toBe(2); // 5 + 5 − 8
  });

  it('инцидент не отнимает баллов — иначе о падениях перестанут сообщать', () => {
    const before = run([{ type: 'shift_closed', at: 'Пн', clean: true }]);
    const after = run([
      { type: 'shift_closed', at: 'Пн', clean: true },
      { type: 'incident', at: 'Пн' },
    ]);
    expect(after.weekPoints).toBe(before.weekPoints);
  });
});

describe('уровни', () => {
  it('идут по зачётным сменам и учитывают накопленное до журнала', () => {
    const s = run([{ type: 'shift_closed', at: 'Пн', clean: true }], { shiftsBefore: 67 });
    expect(s.level.current.name).toBe('Знаток района');
    expect(s.level.done).toBe(68);
    expect(s.level.need).toBe(90);
  });

  it('смена с замечаниями не добавляет шага', () => {
    const s = run([{ type: 'shift_closed', at: 'Пн', clean: false }], { shiftsBefore: 20 });
    expect(s.level.done).toBe(20);
  });

  it('прогресс не откатывается ни от жалоб, ни от инцидентов, ни от пропусков', () => {
    const base = [{ type: 'shift_closed', at: 'Пн', clean: true }] as CourierEvent[];
    const damaged: CourierEvent[] = [
      ...base,
      { type: 'complaint', at: 'Вт', kind: 'damage' },
      { type: 'incident', at: 'Ср' },
      { type: 'slot_missed', at: 'Чт', warnedAhead: false },
    ];
    expect(run(damaged, { shiftsBefore: 67 }).level.done)
      .toBe(run(base, { shiftsBefore: 67 }).level.done);
  });

  it('новичок с нуля стоит на первом уровне, а не проваливается ниже', () => {
    const s = run([], { dayNumber: 1 });
    expect(s.level.current.name).toBe('Новичок');
    expect(s.level.done).toBe(0);
    expect(s.level.pct).toBe(0);
  });
});

describe('знаки', () => {
  it('набираются подряд и обнуляются сбрасывающим событием', () => {
    const s = run([
      ...Array.from({ length: 40 }, () => ({ type: 'delivery', at: 'Пн', clean: true }) as CourierEvent),
      { type: 'complaint', at: 'Вт', kind: 'damage' },
      ...Array.from({ length: 7 }, () => ({ type: 'delivery', at: 'Ср', clean: true }) as CourierEvent),
    ]);
    const care = s.badges.find((b) => b.id === 'care')!;
    expect(care.done).toBe(7);
    expect(care.wasReset).toBe(true);
    expect(care.earned).toBe(false);
  });

  it('обнуление знака не трогает баллы', () => {
    const withReset = run([
      ...Array.from({ length: 5 }, () => ({ type: 'delivery', at: 'Пн', clean: true }) as CourierEvent),
      { type: 'incident', at: 'Вт' },
    ]);
    expect(withReset.weekPoints).toBe(0);
    expect(withReset.badges.find((b) => b.id === 'zero')!.done).toBe(0);
  });

  it('учитывает прогресс, накопленный до начала журнала', () => {
    const events = Array.from({ length: 64 }, () => ({ type: 'delivery', at: 'Пн', clean: true }) as CourierEvent);
    expect(run(events).badges.find((b) => b.id === 'care')!.earned).toBe(false);
    expect(run(events, { badgesBefore: { care: 36 } }).badges.find((b) => b.id === 'care')!.earned).toBe(true);
  });

  it('сброс обнуляет и накопленное раньше — иначе «подряд» перестаёт значить подряд', () => {
    const s = run(
      [{ type: 'complaint', at: 'Пн', kind: 'damage' }, { type: 'delivery', at: 'Вт', clean: true }],
      { badgesBefore: { care: 99 } },
    );
    const care = s.badges.find((b) => b.id === 'care')!;
    expect(care.done).toBe(1);
    expect(care.wasReset).toBe(true);
  });

  it('выдаётся, когда счётчик дошёл до порога', () => {
    const s = run(Array.from({ length: 3 }, () => ({ type: 'mentored', at: 'Пн' }) as CourierEvent));
    expect(s.badges.find((b) => b.id === 'mentor')!.earned).toBe(true);
  });

  it('в первые две недели действует отдельный набор', () => {
    const rookie = run([{ type: 'delivery', at: 'Пн', clean: true }], { dayNumber: 4 });
    const veteran = run([{ type: 'delivery', at: 'Пн', clean: true }], { dayNumber: 40 });
    expect(rookie.isRookie).toBe(true);
    expect(rookie.badges.map((b) => b.id)).toContain('first_delivery');
    expect(veteran.isRookie).toBe(false);
    expect(veteran.badges.map((b) => b.id)).not.toContain('first_delivery');
  });
});

describe('лига', () => {
  it('место пересчитывается от набранных баллов', () => {
    const strong = run(Array.from({ length: 40 }, () => ({ type: 'mentored', at: 'Пн' }) as CourierEvent));
    const weak = run([]);
    expect(strong.league.rank).toBeLessThan(weak.league.rank);
    expect(weak.league.rank).toBe(weak.league.size);
  });

  it('в лиге всегда 24 человека, включая самого курьера', () => {
    expect(run([]).league.size).toBe(RULES.league.cohort.length + 1);
  });

  it('соседи заданы в той же шкале, что считает движок', () => {
    // Иначе место в лиге бессмысленно: свои баллы из одной системы, чужие из другой.
    const steady = evaluate(scenarioById('steady').events, RULES, scenarioById('steady').ctx);
    const dip = evaluate(scenarioById('dip').events, RULES, scenarioById('dip').ctx);
    expect(steady.league.rank).toBe(7);
    expect(dip.league.rank).toBe(19);
    const spread = RULES.league.cohort.map((c) => c.points);
    expect(Math.max(...spread)).toBeLessThan(steady.weekPoints * 2);
  });

  it('линия перехода стоит на шестом месте', () => {
    const rows = run([]).league.rows;
    expect(rows.filter((r) => r.cut)).toHaveLength(1);
    expect(rows.find((r) => r.cut)!.pos).toBe(RULES.league.promote);
  });
});

describe('ранний доступ к слотам', () => {
  const good = (): CourierEvent[] => [
    ...Array.from({ length: 5 }, (_, i) => ({ type: 'shift_closed', at: String(i), clean: true }) as CourierEvent),
    ...Array.from({ length: 5 }, (_, i) => ({ type: 'slot_attended', at: String(i) }) as CourierEvent),
    ...Array.from({ length: 5 }, (_, i) => ({ type: 'tare_returned', at: String(i), all: true }) as CourierEvent),
  ];

  it('открыт при хорошей неделе', () => {
    expect(run(good(), { shiftsBefore: 67 }).access.state).toBe('open');
  });

  it('закрыт до уровня «Свой человек», сколько бы баллов ни было', () => {
    const s = run(good(), { shiftsBefore: 0 });
    expect(s.access.state).toBe('off');
    expect(s.access.title).toContain('пока недоступен');
  });

  it('первая просевшая неделя даёт предупреждение, а не отключение', () => {
    const s = run([
      { type: 'shift_closed', at: 'Пн', clean: true },
      { type: 'slot_missed', at: 'Вт', warnedAhead: false },
      { type: 'slot_missed', at: 'Чт', warnedAhead: false },
    ], { shiftsBefore: 67, weeksBelow: 0 });
    expect(s.access.state).toBe('warn');
    expect(s.access.reasons.length).toBeGreaterThan(0);
  });

  it('вторая подряд — отключение, и оно объяснено', () => {
    const s = run([
      { type: 'shift_closed', at: 'Пн', clean: true },
      { type: 'slot_missed', at: 'Вт', warnedAhead: false },
      { type: 'slot_missed', at: 'Чт', warnedAhead: false },
    ], { shiftsBefore: 67, weeksBelow: 1 });
    expect(s.access.state).toBe('off');
    expect(s.access.sub).toContain('оплата не меняются');
  });
});

describe('что подтянуть', () => {
  it('появляется только при реальных поводах', () => {
    expect(run([{ type: 'shift_closed', at: 'Пн', clean: true }]).fixes).toHaveLength(0);
  });

  it('подставляет настоящее число в заголовок', () => {
    const s = run([
      { type: 'slot_missed', at: 'Вт', warnedAhead: false },
      { type: 'slot_missed', at: 'Чт', warnedAhead: false },
    ]);
    expect(s.fixes[0].title).toBe('Пропущенных слотов: 2');
  });
});

describe('чистота и воспроизводимость', () => {
  it('одинаковый вход всегда даёт одинаковый выход', () => {
    const sc = scenarioById('dip');
    expect(evaluate(sc.events, RULES, sc.ctx)).toEqual(evaluate(sc.events, RULES, sc.ctx));
  });

  it('журнал событий не мутируется', () => {
    const sc = scenarioById('steady');
    const copy = JSON.parse(JSON.stringify(sc.events));
    evaluate(sc.events, RULES, sc.ctx);
    expect(sc.events).toEqual(copy);
  });

  it('порядок событий влияет на знаки, но не на баллы', () => {
    const a: CourierEvent[] = [
      { type: 'delivery', at: 'Пн', clean: true },
      { type: 'complaint', at: 'Вт', kind: 'damage' },
    ];
    const b: CourierEvent[] = [a[1], a[0]];
    expect(run(a).weekPoints).toBe(run(b).weekPoints);
    expect(run(a).badges.find((x) => x.id === 'care')!.done).toBe(0);
    expect(run(b).badges.find((x) => x.id === 'care')!.done).toBe(1);
  });
});

describe('сценарии сходятся на заявленных цифрах', () => {
  it('ровная неделя — пять смен из пяти, доступ открыт', () => {
    const sc = scenarioById('steady');
    const s = evaluate(sc.events, RULES, sc.ctx);
    expect(s.counters.qualifyingShifts).toBe(68);
    expect(s.level.current.name).toBe('Знаток района');
    expect(s.counters.missedSlots).toBe(0);
    expect(s.access.state).toBe('open');
    expect(s.rating).toBe(4.97);
    expect(s.goal.done).toBe(s.goal.target);
    expect(s.badges.filter((b) => b.earned).map((b) => b.id)).toEqual(['care', 'zero', 'tare', 'local']);
  });

  it('просевшая неделя — пропуски, жалобы, предупреждение вместо отключения', () => {
    const sc = scenarioById('dip');
    const s = evaluate(sc.events, RULES, sc.ctx);
    expect(s.counters.missedSlots).toBe(2);
    expect(s.counters.damageComplaints).toBe(3);
    expect(s.counters.incidents).toBe(1);
    expect(s.access.state).toBe('warn');
    expect(s.fixes.length).toBeGreaterThanOrEqual(3);
    // Главное: уровень остался тот же, знаки ушли на перезапуск, а не пропали
    expect(s.level.current.name).toBe('Знаток района');
    expect(s.badges.filter((b) => b.wasReset).map((b) => b.id)).toEqual(['care', 'zero', 'tare']);
    // 136 накоплено раньше + 51 доставка за неделю (каждая жалоба идёт парой
    // с повреждённой доставкой — иначе жаловаться было бы не на что)
    expect(s.badges.find((b) => b.id === 'local')!.done).toBe(187);
  });

  it('первая неделя — режим новичка, лига ещё не в счёт', () => {
    const sc = scenarioById('rookie');
    const s = evaluate(sc.events, RULES, sc.ctx);
    expect(s.isRookie).toBe(true);
    expect(s.level.current.name).toBe('Новичок');
    expect(s.level.done).toBe(4);
    expect(s.badges.find((b) => b.id === 'first_delivery')!.earned).toBe(true);
    // Достижимая цель: четыре смены из пяти, а не 4 из 20
    expect(s.goal.target).toBe(5);
  });
});

describe('лента', () => {
  it('складывает повторы в одну строку, а не показывает тридцать две', () => {
    const s = run(Array.from({ length: 32 }, () => ({ type: 'rating', at: 'Пн', stars: 5 }) as CourierEvent));
    const fives = s.feed.filter((f) => f.text === 'Оценка 5');
    expect(fives).toHaveLength(1);
    expect(fives[0].count).toBe(32);
    expect(fives[0].delta).toBe(96);
  });

  it('не сворачивает события разных дней', () => {
    const s = run([
      { type: 'rating', at: 'Пн', stars: 5 },
      { type: 'rating', at: 'Вт', stars: 5 },
    ]);
    expect(s.feed.filter((f) => f.text === 'Оценка 5')).toHaveLength(2);
  });

  it('новое сверху', () => {
    const s = run([
      { type: 'shift_closed', at: 'Пн', clean: true },
      { type: 'helped', at: 'Вт' },
    ]);
    expect(s.feed[0].text).toBe('Помог коллеге');
  });

  it('отмечает получение знака', () => {
    const s = run(Array.from({ length: 3 }, () => ({ type: 'mentored', at: 'Пн' }) as CourierEvent));
    const win = s.feed.find((f) => f.kind === 'badge');
    expect(win?.text).toContain('Наставник');
    expect(win?.detail).toBe('Получен');
  });

  it('отмечает обнуление знака и говорит, сколько было', () => {
    const s = run(
      [{ type: 'delivery', at: 'Пн', clean: true }, { type: 'complaint', at: 'Пн', kind: 'damage' }],
      { badgesBefore: { care: 40 } },
    );
    const reset = s.feed.find((f) => f.kind === 'badge_reset');
    expect(reset?.detail).toContain('41');
  });

  it('отмечает подъём уровня', () => {
    // Девятая смена + десятая: порог «Новичка» пройден, дальше «Свой человек»
    const s = run([{ type: 'shift_closed', at: 'Пн', clean: true }], { shiftsBefore: 9 });
    const up = s.feed.find((f) => f.kind === 'level');
    expect(up?.text).toContain('Свой человек');
    expect(up?.detail).toBe('10 зачётных смен');
  });

  it('отмечает изменение доступа к слотам', () => {
    const s = run([
      ...Array.from({ length: 5 }, (_, i) => ({ type: 'shift_closed', at: String(i), clean: true }) as CourierEvent),
      ...Array.from({ length: 5 }, (_, i) => ({ type: 'slot_attended', at: String(i) }) as CourierEvent),
      ...Array.from({ length: 5 }, (_, i) => ({ type: 'tare_returned', at: String(i), all: true }) as CourierEvent),
    ], { shiftsBefore: 67 });
    expect(s.feed.some((f) => f.kind === 'access')).toBe(true);
  });

  it('не может разойтись с экранами: веха «знак получен» есть ровно тогда, когда знак получен', () => {
    for (const sc of SCENARIOS) {
      const s = evaluate(sc.events, RULES, sc.ctx);
      const inFeed = new Set(s.feed.filter((f) => f.kind === 'badge')
        .map((f) => f.text.replace(/^Знак «|»$/g, '')));
      for (const name of inFeed) {
        const badge = s.badges.find((b) => b.name.replace(/<br>/g, ' ') === name);
        expect(badge?.earned, `${sc.label}: ${name}`).toBe(true);
      }
    }
  });

  it('место в лиге попадает в ленту только при пересечении линии перехода', () => {
    // Иначе каждая пятёрка двигала бы место и лента превратилась бы в шум
    const s = evaluate(scenarioById('steady').events, RULES, scenarioById('steady').ctx);
    expect(s.feed.filter((f) => f.kind === 'rank').length).toBeLessThanOrEqual(2);
  });
});

describe('ближайшие пороги', () => {
  it('их не больше трёх и они про недостигнутое', () => {
    for (const sc of SCENARIOS) {
      const s = evaluate(sc.events, RULES, sc.ctx);
      expect(s.nudges.length, sc.label).toBeLessThanOrEqual(3);
      s.nudges.forEach((n) => expect(n.pct).toBeLessThan(100));
    }
  });

  it('закрытая цель недели в подсказки не попадает', () => {
    const s = evaluate(scenarioById('steady').events, RULES, scenarioById('steady').ctx);
    expect(s.goal.done).toBe(s.goal.target);
    expect(s.nudges.some((n) => n.text === s.goal.title)).toBe(false);
  });
});

describe('не по моей вине', () => {
  // Три пятёрки, чтобы строка оценок не упёрлась в ноль и минус был виден
  const base: CourierEvent[] = [
    { type: 'shift_closed', at: 'Пн', clean: true },
    { type: 'rating', at: 'Пн', stars: 5 },
    { type: 'rating', at: 'Пн', stars: 5 },
    { type: 'rating', at: 'Пн', stars: 5 },
  ];

  it('неучтённая оценка не входит ни в балл, ни в среднее, ни в счётчик низких', () => {
    const counted = run([...base, { type: 'rating', at: 'Пн', stars: 1 }]);
    const excused = run([...base, { type: 'rating', at: 'Пн', stars: 1, excused: 'store_delay' }]);
    expect(counted.weekPoints).toBe(12 + 9 - 6);
    expect(excused.weekPoints).toBe(12 + 9);
    expect(counted.rating).toBe(4);
    expect(excused.rating).toBe(5);
    expect(counted.counters.lowRatings).toBe(1);
    expect(excused.counters.lowRatings).toBe(0);
    expect(excused.counters.excused).toBe(1);
  });

  it('неучтённая жалоба не сбрасывает знак и не считается жалобой', () => {
    const events: CourierEvent[] = [
      ...Array.from({ length: 5 }, () => ({ type: 'delivery', at: 'Пн', clean: true }) as CourierEvent),
      { type: 'complaint', at: 'Пн', kind: 'damage', excused: 'incident' },
    ];
    const s = run(events, { badgesBefore: { care: 40 } });
    expect(s.badges.find((b) => b.id === 'care')!.done).toBe(45);
    expect(s.badges.find((b) => b.id === 'care')!.wasReset).toBe(false);
    expect(s.counters.damageComplaints).toBe(0);
    expect(s.fixes).toHaveLength(0);
  });

  it('неучтённый пропуск слота не считается пропуском — и доступ остаётся открытым', () => {
    const good: CourierEvent[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ type: 'shift_closed', at: String(i), clean: true }) as CourierEvent),
      ...Array.from({ length: 5 }, (_, i) => ({ type: 'slot_attended', at: String(i) }) as CourierEvent),
      { type: 'slot_missed', at: '5', warnedAhead: false, excused: 'weather' },
      { type: 'slot_missed', at: '6', warnedAhead: false, excused: 'weather' },
    ];
    const s = run(good, { shiftsBefore: 67 });
    expect(s.counters.missedSlots).toBe(0);
    expect(s.access.state).toBe('open');
  });

  it('в ленте событие остаётся — с причиной и зачёркнутой ценой', () => {
    const s = run([...base, { type: 'complaint', at: 'Пн', kind: 'damage', excused: 'weather' }]);
    const row = s.feed.find((f) => f.kind === 'excused')!;
    expect(row.text).toBe('Жалоба на повреждение');
    expect(row.detail).toContain('Не учтено');
    expect(row.detail).toContain('погода');
    expect(row.delta).toBe(-5);
  });

  it('у каждой причины есть подпись и способ подтверждения', () => {
    for (const x of RULES.excuses) {
      expect(x.label.length).toBeGreaterThan(3);
      expect(x.proof.length).toBeGreaterThan(3);
    }
    expect(RULES.excuses.some((x) => x.auto)).toBe(true);
    expect(RULES.excuses.some((x) => !x.auto)).toBe(true);
  });
});

describe('спасибо и комплименты', () => {
  it('спасибо не стоит баллов, но идёт в знак и в ленту с именем', () => {
    const s = run([{ type: 'kudos', at: 'Вт', from: 'Марина К.', text: 'Выручил с тарой' }]);
    expect(s.weekPoints).toBe(0);
    expect(s.counters.kudos).toBe(1);
    expect(s.badges.find((b) => b.id === 'thanks')!.done).toBe(1);
    const row = s.feed.find((f) => f.kind === 'kudos')!;
    expect(row.text).toBe('Спасибо от Марина К.');
    expect(row.detail).toBe('«Выручил с тарой»');
  });

  it('комплимент — отдельная строка ленты рядом с оценкой, и он считается в тёплых словах', () => {
    const s = run([
      { type: 'rating', at: 'Пн', stars: 5, compliment: 'careful' },
      { type: 'rating', at: 'Пн', stars: 5 },
    ]);
    expect(s.weekPoints).toBe(6);
    expect(s.feed.filter((f) => f.kind === 'kudos')).toHaveLength(1);
    expect(s.praise).toEqual([{ id: 'careful', label: 'Аккуратно с продуктами', count: 1 }]);
  });

  it('среди комплиментов нет «быстро»', () => {
    expect(RULES.compliments.some((c) => /быстр/i.test(c.label))).toBe(false);
  });

  it('неучтённая оценка комплимент тоже не даёт', () => {
    const s = run([{ type: 'rating', at: 'Пн', stars: 5, compliment: 'polite', excused: 'other' }]);
    expect(s.praise).toEqual([]);
  });
});

describe('нагрузка', () => {
  const shift = (at: string, hours?: number): CourierEvent => ({ type: 'shift_closed', at, clean: true, hours });

  it('часы складываются, а смена без указания часов берёт длину из правил', () => {
    const s = run([shift('Пн', 9), shift('Вт')]);
    expect(s.load.hours).toBe(9 + RULES.load.shiftHours);
    expect(s.load.maxHours).toBe(60);
  });

  it('дни подряд считаются по календарю: Пн, Ср, Пт — это не серия', () => {
    expect(run([shift('Пн'), shift('Вт'), shift('Ср')]).load.daysInRow).toBe(3);
    expect(run([shift('Пн'), shift('Ср'), shift('Пт')]).load.daysInRow).toBe(1);
  });

  it('день с одним «слот освобождён заранее» серию обрывает', () => {
    const s = run([shift('Пн'), shift('Вт'), { type: 'slot_missed', at: 'Ср', warnedAhead: true }]);
    expect(s.load.daysInRow).toBe(0);
  });

  it('серия через весь журнал продолжает накопленную до него', () => {
    const s = run([shift('Чт'), shift('Пт')], { workedInRowBefore: 4 });
    expect(s.load.daysInRow).toBe(6);
    expect(s.load.rest).toBe(true);
  });

  it('подсказка про выходной — веха ленты, и она появляется ровно один раз', () => {
    const s = run(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => shift(d)));
    const rest = s.feed.filter((f) => f.kind === 'rest');
    expect(rest).toHaveLength(1);
    expect(rest[0].at).toBe('Сб');
  });

  it('в сценариях подсказки нет: у всех была суббота', () => {
    for (const sc of SCENARIOS) {
      expect(evaluate(sc.events, RULES, sc.ctx).load.rest, sc.label).toBe(false);
    }
  });
});

describe('неделя словами', () => {
  it('называет смены, доставки и оценку', () => {
    const s = evaluate(scenarioById('steady').events, RULES, scenarioById('steady').ctx);
    expect(s.summary).toContain('5 смен, 64 доставки, средняя оценка 4,97');
    expect(s.summary).toContain('ранний выбор слотов открыт');
  });

  it('в просевшей неделе перечисляет, что не так, и говорит про инцидент', () => {
    const s = evaluate(scenarioById('dip').events, RULES, scenarioById('dip').ctx);
    expect(s.summary).toContain('2 пропуска без предупреждения');
    expect(s.summary).toContain('3 жалобы на упаковку');
    expect(s.summary).toContain('Инцидент баллов не отнял');
  });

  it('новичку напоминает, что его ни с кем не сравнивают', () => {
    const s = evaluate(scenarioById('rookie').events, RULES, scenarioById('rookie').ctx);
    expect(s.summary).toContain('ни с кем не сравнивают');
  });

  it('упоминает неучтённые события', () => {
    const s = run([{ type: 'shift_closed', at: 'Пн', clean: true }, { type: 'rating', at: 'Пн', stars: 1, excused: 'weather' }]);
    expect(s.summary).toContain('1 событие не учтено');
  });

  it('пустой журнал — честно пустой', () => {
    expect(run([]).summary).toContain('ещё не было');
  });
});

describe('правила как обязательство', () => {
  it('у текущей версии есть дата и запись в истории изменений', () => {
    expect(RULES.since.length).toBeGreaterThan(0);
    expect(RULES.changes[0].version).toBe(RULES.version);
    for (const c of RULES.changes) expect(c.date.length).toBeGreaterThan(0);
  });

  it('инцидент не попадает в «что подтянуть»', () => {
    expect(run([{ type: 'incident', at: 'Пн' }]).fixes).toHaveLength(0);
  });
});
