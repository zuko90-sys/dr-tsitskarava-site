/**
 * Дни недели в журнале — это короткие подписи «Пн»…«Вс».
 * Движок пользуется их порядком, чтобы понимать, идут ли дни подряд;
 * любые другие подписи (в тестах — «0», «1») считаются соседними.
 */
export const DAY_ORDER = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export const DAY_NAMES: Record<string, string> = {
  'Пн': 'Понедельник', 'Вт': 'Вторник', 'Ср': 'Среда',
  'Чт': 'Четверг', 'Пт': 'Пятница', 'Сб': 'Суббота', 'Вс': 'Воскресенье',
};

export function nextDay(at: string): string {
  const i = DAY_ORDER.indexOf(at);
  return i === -1 ? at : DAY_ORDER[(i + 1) % DAY_ORDER.length];
}

/** Идёт ли день b сразу за днём a. Неизвестные подписи считаются соседними. */
export function adjacent(a: string, b: string): boolean {
  const ia = DAY_ORDER.indexOf(a);
  const ib = DAY_ORDER.indexOf(b);
  if (ia === -1 || ib === -1) return true;
  return (ib - ia + DAY_ORDER.length) % DAY_ORDER.length === 1;
}
