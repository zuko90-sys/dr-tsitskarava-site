import { RULES } from '../engine/rules';
import type { CourierEvent } from '../engine/types';

/**
 * Обжалование.
 *
 * Принципиально: заявка НЕ влияет на баллы. Влияет решение по ней — и оно
 * приходит как правка журнала: спорное событие удаляется, и движок сам
 * пересчитывает всё, что от него зависело: балл, знаки, место в лиге,
 * доступ к слотам. Никакой ручной коррекции цифр не существует в принципе —
 * поэтому не бывает и «забыли поправить рейтинг после удовлетворённой жалобы».
 *
 * По 289-ФЗ (в силе с 1 октября 2026) право оспорить снижение рейтинга —
 * обязанность платформы, а не жест доброй воли.
 */

export interface Disputable {
  /** Позиция события в журнале — по ней заявка и решение находят событие. */
  index: number;
  at: string;
  label: string;
  delta: number;
}

/** Что курьер может оспорить: жалобы, низкие оценки, пропуски без предупреждения. */
export function disputable(events: CourierEvent[]): Disputable[] {
  const out: Disputable[] = [];
  events.forEach((e, index) => {
    const contested =
      e.type === 'complaint'
      || (e.type === 'rating' && e.stars <= 2)
      || (e.type === 'slot_missed' && !e.warnedAhead);
    if (!contested) return;
    const rule = RULES.points.find((r) => {
      if (e.type !== r.on) return false;
      if (!r.match) return true;
      const bag = e as unknown as Record<string, unknown>;
      return Object.keys(r.match).every((k) => bag[k] === r.match![k]);
    });
    out.push({ index, at: e.at, label: rule?.label ?? e.type, delta: rule?.add ?? 0 });
  });
  return out;
}

/** Сдвиг индексов заявок после удаления события из журнала. */
export function shiftAppeals(appeals: number[], removedIndex: number): number[] {
  return appeals
    .filter((i) => i !== removedIndex)
    .map((i) => (i > removedIndex ? i - 1 : i));
}
