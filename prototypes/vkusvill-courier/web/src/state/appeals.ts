import { isExcused, pointRuleFor } from '../engine/engine';
import { RULES } from '../engine/rules';
import type { CourierEvent, ExcuseId, ExcuseRule } from '../engine/types';

/**
 * Обжалование.
 *
 * Принципиально: заявка НЕ влияет на баллы. Влияет решение по ней — и оно
 * приходит как правка журнала: спорное событие получает пометку «не по моей
 * вине» и перестаёт считаться. Само событие остаётся на виду — с причиной.
 * Движок пересчитывает всё, что от него зависело: балл, знаки, место в лиге,
 * доступ к слотам. Никакой ручной коррекции цифр не существует в принципе —
 * поэтому не бывает и «забыли поправить рейтинг после удовлетворённой жалобы».
 *
 * Причин два рода (таблица excuses в правилах): те, что подтверждает сама
 * система — применяются сразу, без заявки; и те, что проверяет управляющий —
 * до его решения ничего не меняется.
 *
 * По 289-ФЗ (в силе с 1 октября 2026) право оспорить снижение рейтинга —
 * обязанность платформы, а не жест доброй воли.
 */

/** Поданная заявка: какое событие и по какой причине. */
export interface Appeal {
  index: number;
  reason: ExcuseId;
}

export interface Disputable {
  /** Позиция события в журнале — по ней заявка и решение находят событие. */
  index: number;
  at: string;
  label: string;
  delta: number;
  /** Уже не учтено — и почему. */
  excused?: ExcuseId;
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
    const rule = pointRuleFor(e, RULES);
    out.push({
      index, at: e.at, label: rule?.label ?? e.type, delta: rule?.add ?? 0,
      excused: isExcused(e) ? (e as { excused?: ExcuseId }).excused : undefined,
    });
  });
  return out;
}

export function excuseRule(id: ExcuseId): ExcuseRule | undefined {
  return RULES.excuses.find((x) => x.id === id);
}

/** Сдвиг индексов заявок после удаления события из журнала. */
export function shiftAppeals(appeals: Appeal[], removedIndex: number): Appeal[] {
  return appeals
    .filter((a) => a.index !== removedIndex)
    .map((a) => (a.index > removedIndex ? { ...a, index: a.index - 1 } : a));
}
