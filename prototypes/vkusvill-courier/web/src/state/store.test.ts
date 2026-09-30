import { beforeEach, describe, expect, it } from 'vitest';
import { isExcused } from '../engine/engine';
import { disputable, shiftAppeals } from './appeals';
import { scenarioById } from './scenarios';
import {
  ackIncident, contest, getState, pickDispute, pushEvent, resetScenario, resolveAppeal,
  setScenario, takeRest, today, toggleCheck, toggleSlot,
} from './store';

/* В node нет localStorage — store переживает это через try/catch,
   поэтому здесь тестируется сама логика, без браузера. */

describe('спорные события', () => {
  it('находит жалобы, низкие оценки и пропуски без предупреждения', () => {
    const found = disputable([
      { type: 'complaint', at: 'Ср', kind: 'damage' },
      { type: 'rating', at: 'Ср', stars: 2 },
      { type: 'rating', at: 'Ср', stars: 4 },
      { type: 'slot_missed', at: 'Чт', warnedAhead: false },
      { type: 'slot_missed', at: 'Пт', warnedAhead: true },
      { type: 'shift_closed', at: 'Пт', clean: true },
    ]);
    expect(found.map((d) => d.index)).toEqual([0, 1, 3]);
    // Подпись и вес берутся из тех же правил, по которым считался балл
    expect(found[0].label).toBe('Жалоба на повреждение');
    expect(found[0].delta).toBe(-5);
  });

  it('уже неучтённые события остаются в списке — с причиной', () => {
    const found = disputable([{ type: 'complaint', at: 'Ср', kind: 'damage', excused: 'weather' }]);
    expect(found).toHaveLength(1);
    expect(found[0].excused).toBe('weather');
  });

  it('в просевшей неделе есть что оспорить: 3 жалобы и 2 пропуска', () => {
    const found = disputable(scenarioById('dip').events);
    expect(found.filter((d) => d.label.includes('Жалоба'))).toHaveLength(3);
    expect(found.filter((d) => d.label.includes('пропущен'))).toHaveLength(2);
  });

  it('сдвигает индексы заявок после удаления события', () => {
    const a = (index: number) => ({ index, reason: 'other' as const });
    expect(shiftAppeals([a(2), a(5), a(9)], 5)).toEqual([a(2), a(8)]);
    expect(shiftAppeals([a(2), a(5), a(9)], 0)).toEqual([a(1), a(4), a(8)]);
    expect(shiftAppeals([a(2)], 7)).toEqual([a(2)]);
  });
});

describe('хранилище: не по моей вине', () => {
  beforeEach(() => {
    setScenario('dip');
    resetScenario();
  });

  it('причина, которую подтверждает система, применяется сразу: событие остаётся, балл растёт', () => {
    const before = getState().snapshot.weekPoints;
    const size = getState().events.length;
    const complaint = disputable(getState().events).find((d) => d.label.includes('Жалоба'))!;
    contest(complaint.index, 'store_delay');
    const s = getState();
    expect(s.events).toHaveLength(size);
    expect(isExcused(s.events[complaint.index])).toBe(true);
    expect(s.appeals).toEqual([]);
    // Жалоба стоила −5 в строке оценок; строка не в нуле, значит балл вырос ровно на 5
    expect(s.snapshot.weekPoints).toBe(before + 5);
  });

  it('причина для управляющего — заявка, и до решения балл не меняется', () => {
    const before = getState().snapshot.weekPoints;
    const target = disputable(getState().events)[0];
    contest(target.index, 'customer');
    expect(getState().appeals).toEqual([{ index: target.index, reason: 'customer' }]);
    expect(getState().snapshot.weekPoints).toBe(before);
    expect(isExcused(getState().events[target.index])).toBe(false);
  });

  it('решение управляющего ставит пометку, и всё пересчитывается само', () => {
    const before = getState().snapshot.weekPoints;
    const complaint = disputable(getState().events).find((d) => d.label.includes('Жалоба'))!;
    contest(complaint.index, 'other');
    resolveAppeal(complaint.index);
    const after = getState();
    expect(after.appeals).toEqual([]);
    expect(isExcused(after.events[complaint.index])).toBe(true);
    expect(after.snapshot.weekPoints).toBe(before + 5);
    expect(after.snapshot.feed.some((f) => f.kind === 'excused')).toBe(true);
  });

  it('повторная заявка на то же событие не дублируется, неучтённое не оспаривается снова', () => {
    const target = disputable(getState().events)[0];
    contest(target.index, 'health');
    contest(target.index, 'health');
    expect(getState().appeals).toHaveLength(1);
    resolveAppeal(target.index);
    contest(target.index, 'health');
    expect(getState().appeals).toHaveLength(0);
  });

  it('неизвестная причина игнорируется', () => {
    const target = disputable(getState().events)[0];
    contest(target.index, 'unknown' as never);
    expect(getState().appeals).toEqual([]);
    expect(isExcused(getState().events[target.index])).toBe(false);
  });

  it('снятые пропуски слота возвращают причину доступа, а неучтённая жалоба — знак', () => {
    // В просевшей неделе доступ в предупреждении из-за двух пропусков
    expect(getState().snapshot.access.state).toBe('warn');
    for (const m of disputable(getState().events).filter((d) => d.label.includes('пропущен'))) {
      contest(m.index, 'weather');
    }
    const access = getState().snapshot.access;
    expect(getState().snapshot.counters.missedSlots).toBe(0);
    expect(access.reasons.every((r) => !r.includes('пропущено'))).toBe(true);
  });

  it('заявки на события, добавленные симулятором, тоже работают', () => {
    pushEvent({ type: 'complaint', at: 'Пт', kind: 'damage' });
    const added = getState().events.length - 1;
    contest(added, 'other');
    const before = getState().snapshot.weekPoints;
    resolveAppeal(added);
    expect(getState().snapshot.weekPoints).toBe(before + 5);
  });

  it('раскрытие причин переключается', () => {
    const target = disputable(getState().events)[0];
    pickDispute(target.index);
    expect(getState().picked).toBe(target.index);
    pickDispute(target.index);
    expect(getState().picked).toBeNull();
  });

  it('сброс сценария очищает заявки и пометки', () => {
    const items = disputable(getState().events);
    contest(items[0].index, 'other');
    contest(items[1].index, 'weather');
    resetScenario();
    expect(getState().appeals).toEqual([]);
    expect(getState().events.some(isExcused)).toBe(false);
  });
});

describe('хранилище: дни, отдых, инцидент', () => {
  beforeEach(() => {
    setScenario('steady');
    resetScenario();
  });

  it('закрытая смена завершает день: следующее событие — на следующий', () => {
    expect(today()).toBe('Сб');
    pushEvent({ type: 'delivery', at: today(), clean: true });
    expect(today()).toBe('Сб');
    pushEvent({ type: 'shift_closed', at: today(), clean: true });
    expect(today()).toBe('Вс');
  });

  it('шестая смена подряд включает подсказку про выходной, освобождённый слот её снимает', () => {
    expect(getState().snapshot.load.daysInRow).toBe(5);
    expect(getState().snapshot.load.rest).toBe(false);
    pushEvent({ type: 'shift_closed', at: today(), clean: true });
    expect(getState().snapshot.load.daysInRow).toBe(6);
    expect(getState().snapshot.load.rest).toBe(true);
    expect(getState().snapshot.feed[0].kind).toBe('rest');

    const points = getState().snapshot.weekPoints;
    takeRest();
    const last = getState().events[getState().events.length - 1];
    expect(last).toEqual({ type: 'slot_missed', at: 'Вс', warnedAhead: true });
    expect(getState().snapshot.load.rest).toBe(false);
    // Выходной ничего не стоит
    expect(getState().snapshot.weekPoints).toBe(points);
  });

  it('отметка «я в порядке» ставится один раз и сбрасывается со сценарием', () => {
    expect(getState().incidentAck).toBe(false);
    ackIncident();
    expect(getState().incidentAck).toBe(true);
    resetScenario();
    expect(getState().incidentAck).toBe(false);
  });
});

describe('хранилище: слоты и чек-лист', () => {
  beforeEach(() => {
    setScenario('steady');
    resetScenario();
  });

  it('слот берётся и отпускается повторным нажатием', () => {
    toggleSlot('Пн');
    expect(getState().mySlots).toEqual(['Пн']);
    toggleSlot('Ср');
    expect(getState().mySlots).toEqual(['Пн', 'Ср']);
    toggleSlot('Пн');
    expect(getState().mySlots).toEqual(['Ср']);
  });

  it('пункт чек-листа отмечается и снимается', () => {
    expect(getState().checklist).toEqual([0, 1, 2, 3]);
    toggleCheck(4);
    expect(getState().checklist).toContain(4);
    toggleCheck(0);
    expect(getState().checklist).not.toContain(0);
  });

  it('сброс сценария возвращает слоты и чек-лист к исходным', () => {
    toggleSlot('Пт');
    toggleCheck(7);
    resetScenario();
    expect(getState().mySlots).toEqual([]);
    expect(getState().checklist).toEqual([0, 1, 2, 3]);
  });
});
