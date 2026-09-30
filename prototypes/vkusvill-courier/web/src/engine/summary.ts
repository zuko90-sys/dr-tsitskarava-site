import type { Core } from './engine';
import { cap, count, fmtRating, low } from './text';
import type { FeedEntry, Nudge, RulesConfig } from './types';

/**
 * Неделя словами. Три-пять предложений, собранных из того же снимка, что
 * и экраны: цифры здесь не могут разойтись с кольцом и лентой.
 *
 * Никакого ИИ: шаблон. Если когда-нибудь текст будет переформулировать
 * языковая модель, на вход ей пойдёт ровно этот абзац, а не сырые данные —
 * чтобы она не смогла сказать ничего, чего нет в журнале.
 */
export function summarize(core: Core, feed: FeedEntry[], nudges: Nudge[], rules: RulesConfig): string {
  const c = core.counters;
  const parts: string[] = [];

  if (c.shifts === 0 && c.deliveries === 0) {
    parts.push('Смен на этой неделе ещё не было.');
  } else {
    const rating = core.rating === null ? 'оценок пока нет' : `средняя оценка ${fmtRating(core.rating)}`;
    parts.push(`${cap(count(c.shifts, 'смена', 'смены', 'смен'))}, ${count(c.deliveries, 'доставка', 'доставки', 'доставок')}, ${rating}.`);
  }

  const issues: string[] = [];
  if (c.missedSlots > 0) issues.push(`${count(c.missedSlots, 'пропуск', 'пропуска', 'пропусков')} без предупреждения`);
  if (c.damageComplaints > 0) issues.push(`${count(c.damageComplaints, 'жалоба', 'жалобы', 'жалоб')} на упаковку`);
  if (c.lowRatings >= 2) issues.push(`${count(c.lowRatings, 'оценка', 'оценки', 'оценок')} ниже четырёх`);

  const accessPhrase = core.isRookie
    ? 'первые две недели тебя ни с кем не сравнивают'
    : core.access.state === 'open'
      ? 'ранний выбор слотов открыт'
      : core.access.state === 'warn'
        ? 'ранний выбор слотов пока сохранён'
        : core.access.reasons.length > 0
          ? 'ранний выбор слотов приостановлен'
          : `ранний выбор откроется с уровня «${rules.levels[rules.levels.findIndex((l) => l.id === rules.access.fromLevel)].name}»`;

  parts.push(issues.length > 0
    ? `${cap(issues.join(', '))} — балл недели ${core.weekPoints}, ${accessPhrase}.`
    : `Балл недели ${core.weekPoints}, ${accessPhrase}.`);

  if (c.excused > 0) {
    parts.push(`${cap(count(c.excused, 'событие не учтено', 'события не учтены', 'событий не учтены'))}: подтверждено, что не по твоей вине.`);
  }
  if (c.incidents > 0) parts.push('Инцидент баллов не отнял.');

  // Вехи — в хронологическом порядке, лента хранит их новыми сверху
  const wins = [...feed].reverse().flatMap((f) => {
    if (f.kind === 'badge') return [low(f.text)];
    if (f.kind === 'level') return [low(f.text)];
    if (f.kind === 'goal') return ['цель недели'];
    return [];
  });
  if (wins.length > 0) parts.push(`Закрыто за неделю: ${wins.join(', ')}.`);

  // «Ближе всего» — буквально: порог с наибольшей долей пройденного
  const next = [...nudges].sort((a, b) => b.pct - a.pct)[0];
  if (next) {
    const what = next.text === core.goal.title ? 'цель недели' : low(next.text);
    parts.push(`Ближе всего — ${what}: ${low(next.detail)}.`);
  }

  if (core.load.rest) {
    parts.push(`${count(core.load.daysInRow, 'день', 'дня', 'дней')} подряд — возьми выходной, балл за это не снижается.`);
  }

  return parts.join(' ');
}
