import { beforeEach, describe, expect, it } from 'vitest';
import { disputable, shiftAppeals } from './appeals';
import { scenarioById } from './scenarios';
import {
  fileAppeal, getState, pushEvent, resetScenario, resolveAppeal, setScenario,
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

  it('в просевшей неделе есть что оспорить: 3 жалобы и 2 пропуска', () => {
    const found = disputable(scenarioById('dip').events);
    expect(found.filter((d) => d.label.includes('Жалоба'))).toHaveLength(3);
    expect(found.filter((d) => d.label.includes('пропущен'))).toHaveLength(2);
  });

  it('сдвигает индексы заявок после удаления события', () => {
    expect(shiftAppeals([2, 5, 9], 5)).toEqual([2, 8]);
    expect(shiftAppeals([2, 5, 9], 0)).toEqual([1, 4, 8]);
    expect(shiftAppeals([2], 7)).toEqual([2]);
  });
});

describe('хранилище: обжалование', () => {
  beforeEach(() => {
    setScenario('dip');
    resetScenario();
  });

  it('заявка не меняет балл — влияет только решение', () => {
    const before = getState().snapshot.weekPoints;
    const target = disputable(getState().events)[0];
    fileAppeal(target.index);
    expect(getState().appeals).toEqual([target.index]);
    expect(getState().snapshot.weekPoints).toBe(before);
  });

  it('повторная заявка на то же событие не дублируется', () => {
    const target = disputable(getState().events)[0];
    fileAppeal(target.index);
    fileAppeal(target.index);
    expect(getState().appeals).toHaveLength(1);
  });

  it('решение удаляет событие из журнала, и балл пересчитывается сам', () => {
    const before = getState().snapshot.weekPoints;
    const complaint = disputable(getState().events).find((d) => d.label.includes('Жалоба'))!;
    fileAppeal(complaint.index);
    resolveAppeal(complaint.index);
    const after = getState();
    expect(after.events).toHaveLength(scenarioById('dip').events.length - 1);
    expect(after.appeals).toEqual([]);
    // Жалоба стоила −5 в строке оценок; строка не в нуле, значит балл вырос ровно на 5
    expect(after.snapshot.weekPoints).toBe(before + 5);
  });

  it('решение по пропуску слота может вернуть ранний доступ', () => {
    // В просевшей неделе доступ в предупреждении из-за двух пропусков
    expect(getState().snapshot.access.state).toBe('warn');
    const misses = disputable(getState().events).filter((d) => d.label.includes('пропущен'));
    for (const m of [...misses].reverse()) {
      fileAppeal(m.index);
      resolveAppeal(m.index);
    }
    // Пропусков не осталось — но балл всё ещё ниже порога, причина остаётся честной
    const access = getState().snapshot.access;
    expect(getState().snapshot.counters.missedSlots).toBe(0);
    expect(access.reasons.every((r) => !r.includes('пропущено'))).toBe(true);
  });

  it('заявки на события, добавленные симулятором, тоже работают', () => {
    pushEvent({ type: 'complaint', at: 'Пт', kind: 'damage' });
    const added = getState().events.length - 1;
    fileAppeal(added);
    const before = getState().snapshot.weekPoints;
    resolveAppeal(added);
    expect(getState().snapshot.weekPoints).toBe(before + 5);
  });

  it('сброс сценария очищает заявки', () => {
    fileAppeal(disputable(getState().events)[0].index);
    resetScenario();
    expect(getState().appeals).toEqual([]);
  });
});
