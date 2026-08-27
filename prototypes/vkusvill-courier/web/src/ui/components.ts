import { icon } from './icons';
import type { BadgeState, FeedItem, LeagueRow } from '../engine/types';

/* Экранирование: в данные попадают имена и тексты правил, а не разметка.
   Исключение — поля how/name знаков, где <br> и <b> заданы намеренно. */
export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

export const num = (n: number): string => `<span class="num">${n}</span>`;

/** Русское склонение при числительном: 1 балл, 2 балла, 5 баллов. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

type Tone = 'green' | 'warn' | 'flat' | undefined;
const toneClass = (t: Tone): string =>
  t === 'green' ? ' card--green' : t === 'warn' ? ' card--warn' : t === 'flat' ? ' card--flat' : '';

export function card(opts: {
  label?: string; title?: string; note?: string; tone?: Tone; big?: boolean; body?: string;
}): string {
  return `<div class="card${toneClass(opts.tone)}">`
    + (opts.label ? `<p class="card__label">${esc(opts.label)}</p>` : '')
    + (opts.title ? `<p class="card__title${opts.big ? ' card__title--lg' : ''}">${esc(opts.title)}</p>` : '')
    + (opts.body ?? '')
    + (opts.note ? `<p class="card__note">${opts.note}</p>` : '')
    + '</div>';
}

export function live(opts: { text: string; meta: string; note?: string; tone?: Tone }): string {
  return `<div class="card${toneClass(opts.tone)}">`
    + '<div class="live"><span class="live__dot"></span>'
    + `<span class="live__text">${esc(opts.text)}</span>`
    + `<span class="live__meta num">${esc(opts.meta)}</span></div>`
    + (opts.note ? `<p class="card__note">${esc(opts.note)}</p>` : '')
    + '</div>';
}

export function ring(opts: {
  label: string; value: number; unit: string; pct: number; tone?: Tone;
  stats: { k: string; v: string; mood?: 'good' | 'warn' }[];
}): string {
  const dash = Math.round(283 - (283 * Math.max(0, Math.min(100, opts.pct))) / 100);
  return `<div class="card"><p class="card__label">${esc(opts.label)}</p>`
    + `<div class="ring-row"><div class="ring${opts.tone === 'warn' ? ' ring--warn' : ''}" style="--dash:${dash}">`
    + '<svg viewBox="0 0 100 100" aria-hidden="true">'
    + '<circle class="ring__track" cx="50" cy="50" r="45"></circle>'
    + '<circle class="ring__fill" cx="50" cy="50" r="45"></circle></svg>'
    + `<div class="ring__center"><div class="ring__big num">${opts.value}</div>`
    + `<div class="ring__small">${opts.unit}</div></div></div>`
    + '<ul class="stat-list">'
    + opts.stats.map((s) => '<li class="stat">'
      + `<span class="stat__k">${esc(s.k)}</span><span class="stat__line"></span>`
      + `<span class="stat__v${s.mood ? ` stat__v--${s.mood}` : ''} num">${esc(s.v)}</span></li>`).join('')
    + '</ul></div></div>';
}

export function bar(pct: number, tone?: Tone): string {
  return `<div class="bar${tone === 'warn' ? ' bar--warn' : ''}" style="--pct:${pct}%">`
    + '<span class="bar__fill"></span></div>';
}

export function goal(opts: {
  label: string; title: string; pct: number; left: string; right: string;
  reward?: string; tone?: Tone; big?: boolean; note?: string;
}): string {
  return `<div class="card${toneClass(opts.tone)}">`
    + `<p class="card__label">${esc(opts.label)}</p>`
    + `<p class="card__title${opts.big ? ' card__title--lg' : ''}">${esc(opts.title)}</p>`
    + (opts.note ? `<p class="card__note">${esc(opts.note)}</p>` : '')
    + bar(opts.pct, opts.tone)
    + `<div class="bar-legend"><span class="num">${esc(opts.left)}</span><span>${esc(opts.right)}</span></div>`
    + (opts.reward ? `<p class="reward">${icon('spark', 2)}<span>${esc(opts.reward)}</span></p>` : '')
    + '</div>';
}

export function note(text: string, iconName = 'info', tone?: 'warn'): string {
  return `<p class="note-chip${tone === 'warn' ? ' note-chip--warn' : ''}">`
    + `${icon(iconName, 2)}<span>${text}</span></p>`;
}

export function levels(items: { name: string; meta: string; state: '' | 'done' | 'now' }[], noteText?: string): string {
  return '<div class="card"><p class="card__label">Путь</p><ul class="levels">'
    + items.map((l) => {
      const inner = l.state === 'done' ? icon('check', 3.5) : l.state === 'now' ? '<i></i>' : '';
      return `<li class="level ${l.state}"><span class="level__pip">${inner}</span>${esc(l.name)}`
        + `<span class="level__meta num">${esc(l.meta)}</span></li>`;
    }).join('')
    + '</ul>' + (noteText ? `<p class="card__note">${esc(noteText)}</p>` : '') + '</div>';
}

export function badges(label: string, items: BadgeState[]): string {
  return `<div class="card"><p class="card__label">${esc(label)}</p><div class="badges">`
    + items.map((b) => {
      const locked = !b.earned;
      // Прогресс показывается прямо на знаке: скрытое правило читается как обман.
      const progress = b.earned ? '' : `<br>${b.done} из ${b.need}`;
      const how = b.how + (b.wasReset
        ? ' <b>Счётчик пошёл заново</b> — предыдущий прогресс обнулился, но ничего не потеряно навсегда.'
        : '');
      return `<button class="badge${locked ? ' locked' : ''}" type="button" aria-expanded="false" `
        + `data-how="${how.replace(/"/g, '&quot;')}">`
        + `<span class="badge__ic">${icon(b.icon)}</span>`
        + `<span class="badge__n">${b.name}${progress}</span></button>`;
    }).join('')
    + '</div><div class="badge__how" data-how-box hidden></div></div>';
}

export function board(rows: LeagueRow[], cutLabel: string, tone?: Tone): string {
  return '<div class="card" style="padding:12px">'
    + rows.map((r) => {
      const cls = r.me ? ` me${tone === 'warn' ? ' me--warn' : ''}` : '';
      return `<div class="rank${cls}"><span class="rank__pos num">${r.pos}</span>`
        + `<span class="rank__who">${esc(r.who)}</span>`
        + `<span class="rank__pts num">${r.points}</span></div>`
        + (r.cut ? `<p class="promo-label">${esc(cutLabel)}</p>` : '');
    }).join('')
    + '</div>';
}

export function myRank(opts: { label: string; pos: number; who: string; pts: number; note?: string; tone?: Tone }): string {
  return `<div class="card card--flat"><p class="card__label">${esc(opts.label)}</p>`
    + `<div class="rank me${opts.tone === 'warn' ? ' me--warn' : ''}" style="margin-top:10px">`
    + `<span class="rank__pos num">${opts.pos}</span><span class="rank__who">${esc(opts.who)}</span>`
    + `<span class="rank__pts num">${opts.pts}</span></div>`
    + (opts.note ? `<p class="card__note">${esc(opts.note)}</p>` : '') + '</div>';
}

export function stats(label: string, items: { k: string; v: string }[], noteText?: string, trace?: string): string {
  return `<div class="card"><p class="card__label">${esc(label)}</p>`
    + '<ul class="stat-list" style="margin-top:12px">'
    + items.map((s) => `<li class="stat"><span class="stat__k">${esc(s.k)}</span>`
      + `<span class="stat__line"></span><span class="stat__v num">${esc(s.v)}</span></li>`).join('')
    + '</ul>'
    + (noteText ? `<p class="card__note">${esc(noteText)}</p>` : '')
    + (trace ? `<p class="trace">${trace}</p>` : '')
    + '</div>';
}

export function unlock(state: 'open' | 'warn' | 'off', title: string, sub: string): string {
  const mod = state === 'warn' ? ' unlock--warn' : state === 'off' ? ' unlock--off' : '';
  return `<div class="unlock${mod}"><span class="unlock__ic">${icon(state === 'off' ? 'locked' : 'lock', 2)}</span>`
    + `<div><p class="unlock__t">${esc(title)}</p><p class="unlock__s">${esc(sub)}</p></div></div>`;
}

export function slots(label: string, rows: { d1: string; d2: string; time: string; taken?: boolean }[]): string {
  return `<div class="card card--flat"><p class="card__label">${esc(label)}</p><div style="margin-top:12px">`
    + rows.map((s) => `<div class="slot${s.taken ? ' taken' : ''}">`
      + `<span class="slot__day"><span class="slot__d1">${esc(s.d1)}</span><br>`
      + `<span class="slot__d2">${esc(s.d2)}</span></span>`
      + `<span class="slot__time num">${esc(s.time)}</span>`
      + `<span class="slot__pill${s.taken ? ' slot__pill--muted' : ''}">${s.taken ? 'Занят' : 'Взять'}</span></div>`).join('')
    + '</div></div>';
}

export function fixes(items: { title: string; text: string }[], noteText: string, appeal?: string): string {
  return '<div class="card card--warn"><p class="card__label">Что подтянуть</p>'
    + `<p class="card__title">${items.length} ${plural(items.length, 'вещь', 'вещи', 'вещей')}, ${plural(items.length, 'поправимая', 'все поправимые', 'все поправимые')}</p>`
    + '<div class="fix">'
    + items.map((f, i) => `<div class="fix__i"><span class="fix__n num">${i + 1}</span>`
      + `<span><b>${esc(f.title)}.</b> ${esc(f.text)}</span></div>`).join('')
    + '</div>'
    + `<p class="card__note">${esc(noteText)}</p>`
    + (appeal ? `<button class="appeal" type="button">${icon('alert', 2)}${esc(appeal)}</button>` : '')
    + '</div>';
}

export function feed(label: string, items: FeedItem[], noteText?: string): string {
  if (items.length === 0) return card({ label, note: 'Пока пусто. Подайте событие в симуляторе слева.' });
  return `<div class="card"><p class="card__label">${esc(label)}</p><div class="feed">`
    + items.map((f) => {
      const cls = f.delta > 0 ? '' : f.delta < 0 ? ' feed__d--minus' : ' feed__d--zero';
      const val = f.delta === 0 ? '—' : `${f.delta > 0 ? '+' : ''}${f.delta}`;
      return `<div class="feed__i"><span class="feed__at">${esc(f.at)}</span>`
        + `<span class="feed__t">${esc(f.text)}</span>`
        + `<span class="feed__d${cls}">${val}</span></div>`;
    }).join('')
    + '</div>' + (noteText ? `<p class="card__note">${esc(noteText)}</p>` : '') + '</div>';
}

export function mentor(opts: { name: string; role: string; initial: string; note: string }): string {
  return '<div class="card"><p class="card__label">Твой наставник</p>'
    + `<div class="mentor"><span class="mentor__av">${esc(opts.initial)}</span>`
    + `<div><p class="mentor__n">${esc(opts.name)}</p><p class="mentor__r">${esc(opts.role)}</p></div>`
    + `<span class="mentor__btn">${icon('phone', 2)}</span></div>`
    + `<p class="card__note">${esc(opts.note)}</p></div>`;
}

export function checklist(opts: {
  label: string; title: string; right: string; items: { done: boolean; text: string }[];
}): string {
  const done = opts.items.filter((i) => i.done).length;
  return `<div class="card"><p class="card__label">${esc(opts.label)}</p>`
    + `<p class="card__title">${esc(opts.title)}</p>`
    + bar(Math.round((done / opts.items.length) * 100))
    + `<div class="bar-legend"><span class="num">${done} из ${opts.items.length}</span>`
    + `<span>${esc(opts.right)}</span></div><div class="check">`
    + opts.items.map((i) => `<div class="check__i${i.done ? ' done' : ''}">`
      + `<span class="check__box">${i.done ? icon('check', 3.5) : ''}</span>`
      + `<span>${esc(i.text)}</span></div>`).join('')
    + '</div></div>';
}

export function contrib(label: string, rows: { av: string; name: string; val: string; me?: boolean }[], noteText: string): string {
  return `<div class="card"><p class="card__label">${esc(label)}</p><div style="margin-top:8px">`
    + rows.map((r) => `<div class="team-row${r.me ? ' me' : ''}">`
      + `<span class="team-row__av">${esc(r.av)}</span>`
      + `<span class="team-row__n">${esc(r.name)}</span>`
      + `<span class="team-row__v num">${esc(r.val)}</span></div>`).join('')
    + `</div><p class="card__note">${esc(noteText)}</p></div>`;
}
