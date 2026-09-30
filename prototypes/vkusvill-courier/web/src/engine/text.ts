/** Русское склонение при числительном: 1 балл, 2 балла, 5 баллов. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/** «5 смен», «1 смена», «3 смены» — число вместе со словом. */
export const count = (n: number, one: string, few: string, many: string): string =>
  `${n} ${plural(n, one, few, many)}`;

export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
export const low = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** Оценка по-русски: 4,97, а не 4.97. */
export const fmtRating = (r: number): string => r.toFixed(2).replace('.', ',');
