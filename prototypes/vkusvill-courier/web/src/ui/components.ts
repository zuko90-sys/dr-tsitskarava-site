import { DAY_NAMES } from '../engine/days';
import { RULES } from '../engine/rules';
import { count } from '../engine/text';
import type { BadgeState, BucketId, FeedEntry, LeagueRow, LoadState, Nudge, Praise } from '../engine/types';
import type { Appeal, Disputable } from '../state/appeals';
import { icon } from './icons';

export { plural } from '../engine/text';
import { plural } from '../engine/text';

/* Экранирование: в данные попадают имена и тексты правил, а не разметка.
   Исключение — поля how/name знаков, где <br> и <b> заданы намеренно. */
export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

export const num = (n: number): string => `<span class="num">${n}</span>`;

const dayName = (at: string): string => DAY_NAMES[at] ?? at;
const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

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

/** Неделя словами — абзац, собранный движком из тех же цифр, что и экраны. */
export function summary(text: string): string {
  return '<div class="card"><p class="card__label">Неделя словами</p>'
    + `<p class="summary">${esc(text)}</p></div>`;
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

/** Ссылка на правила: откуда цифры и что менялось. Открывает шторку. */
export function rulesLink(text = `Правила · версия ${RULES.version} · что изменилось ${RULES.since}`): string {
  return `<button class="rules-link" type="button" data-sheet-open="rules">${icon('book', 2)}<span>${esc(text)}</span></button>`;
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
      return `<button class="badge${locked ? ' locked' : ''}" type="button" aria-expanded="false" aria-controls="how-box" `
        + `data-how="${how.replace(/"/g, '&quot;')}">`
        + `<span class="badge__ic">${icon(b.icon)}</span>`
        + `<span class="badge__n">${b.name}${progress}</span></button>`;
    }).join('')
    + '</div><div class="badge__how" id="how-box" data-how-box hidden></div></div>';
}

/** Тёплые слова: комплименты клиентов и спасибо с точки. Баллов не стоят — потому им и верят. */
export function praise(items: Praise[]): string {
  if (items.length === 0) return '';
  return '<div class="card"><p class="card__label">Тёплые слова за неделю</p><div class="chips">'
    + items.map((p) => `<span class="chip">${icon('heart', 2)}${esc(p.label)}<b class="num">× ${p.count}</b></span>`).join('')
    + '</div><p class="card__note">Комплименты пишут клиенты, спасибо — коллеги. '
    + 'Ни то ни другое не стоит баллов, поэтому их не выпрашивают.</p></div>';
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

export type SlotState = 'free' | 'mine' | 'other';

/**
 * Слоты следующей недели. «Взять» и «Отпустить» — настоящие кнопки:
 * выбор хранится и переживает перезагрузку. «Занят» — слот другого
 * курьера, на него нажать нельзя.
 */
export function slots(label: string, rows: { d1: string; d2: string; time: string; state: SlotState }[]): string {
  return `<div class="card card--flat"><p class="card__label">${esc(label)}</p><div style="margin-top:12px">`
    + rows.map((r) => {
      const control = r.state === 'other'
        ? '<span class="slot__pill slot__pill--muted">Занят</span>'
        : r.state === 'mine'
          ? `<button class="slot__pill slot__pill--mine" type="button" data-slot="${esc(r.d1)}" aria-label="Отпустить слот ${esc(r.d1)}">${icon('check', 3)}Твой</button>`
          : `<button class="slot__pill" type="button" data-slot="${esc(r.d1)}" aria-label="Взять слот ${esc(r.d1)}">Взять</button>`;
      return `<div class="slot${r.state === 'other' ? ' taken' : ''}">`
        + `<span class="slot__day"><span class="slot__d1">${esc(r.d1)}</span><br>`
        + `<span class="slot__d2">${esc(r.d2)}</span></span>`
        + `<span class="slot__time num">${esc(r.time)}</span>` + control + '</div>';
    }).join('')
    + '</div></div>';
}

export function fixes(
  items: { title: string; text: string }[], noteText: string,
  appeal?: string, filed?: { label: string; at: string; reason: string }[],
): string {
  return '<div class="card card--warn"><p class="card__label">Что подтянуть</p>'
    + `<p class="card__title">${items.length} ${plural(items.length, 'вещь', 'вещи', 'вещей')}, ${plural(items.length, 'поправимая', 'все поправимые', 'все поправимые')}</p>`
    + '<div class="fix">'
    + items.map((f, i) => `<div class="fix__i"><span class="fix__n num">${i + 1}</span>`
      + `<span><b>${esc(f.title)}.</b> ${esc(f.text)}</span></div>`).join('')
    + '</div>'
    + `<p class="card__note">${esc(noteText)}</p>`
    + (filed && filed.length > 0
      ? filed.map((f) => `<p class="appeal-status">${icon('clock', 2)}`
        + `<span>«${esc(f.label)}» (${esc(f.at)}) — у управляющего: ${esc(f.reason.toLowerCase())}. Ответ до 48 часов</span></p>`).join('')
      : '')
    + (appeal ? `<button class="appeal" type="button" data-sheet-open="appeal">${icon('alert', 2)}${esc(appeal)}</button>` : '')
    + '</div>';
}

/* ─────────────────────────── НАГРУЗКА И ИНЦИДЕНТ ─────────────────────────── */

/** Единственная карточка в приложении, которая просит работать меньше. */
export function rest(load: LoadState): string {
  if (!load.rest) return '';
  return '<div class="card card--warn"><p class="card__label">Нагрузка</p>'
    + `<p class="card__title">${count(load.daysInRow, 'день', 'дня', 'дней')} подряд</p>`
    + `<p class="card__note">${load.hours} ${plural(load.hours, 'час', 'часа', 'часов')} за неделю из ${load.maxHours} допустимых. `
    + 'Возьми выходной: балл за него не снижается, ранний выбор слотов не теряется, место в лиге не зависит от количества смен.</p>'
    + `<button class="appeal" type="button" data-rest>${icon('moon', 2)}Освободить завтрашний слот</button>`
    + '</div>';
}

/**
 * Порядок действий после падения или ДТП. Показывается, пока курьер
 * не отметил, что в порядке. Инцидент не штрафуется — и это сказано здесь
 * прямо, чтобы о нём не было причин молчать.
 */
export function incident(at: string, acked: boolean): string {
  if (acked) {
    return '<div class="card card--flat"><p class="card__label">Инцидент</p>'
      + `<p class="card__title">${esc(dayName(at))}: отмечен, ты в порядке</p>`
      + '<p class="card__note">Баллы не снижены. Знак «Ноль инцидентов» пошёл заново — это единственное последствие. '
      + 'Жалобы и оценки за этот день можно отметить как «не по моей вине».</p></div>';
  }
  const steps = [
    ['Ты в порядке?', 'Если нет — сначала 112, потом всё остальное. Заказ подождёт.'],
    ['Позвони на точку', 'Заказ заберёт коллега. Клиенту напишет поддержка — не ты.'],
    ['Заказ повреждён?', 'Отметь в приложении. Жалобы по нему не считаются: причина «инцидент в этот день» подтверждается сама.'],
  ];
  return '<div class="card card--warn"><p class="card__label">После инцидента</p>'
    + `<p class="card__title">${esc(dayName(at))}: падение или ДТП</p>`
    + '<ol class="steps">'
    + steps.map(([t, d], i) => `<li class="steps__i"><span class="fix__n num">${i + 1}</span>`
      + `<span><b>${esc(t)}</b> ${esc(d)}</span></li>`).join('')
    + '</ol>'
    + '<p class="card__note">Баллы за инцидент не снимаются. Знак «Ноль инцидентов» начнёт набираться заново — и это всё.</p>'
    + `<button class="appeal appeal--ok" type="button" data-ack>${icon('check', 2.5)}Я в порядке</button>`
    + '</div>';
}

/* ─────────────────────────── ОБЖАЛОВАНИЕ ─────────────────────────── */

/**
 * Шторка «не по моей вине». Заявка не меняет баллы — меняет их решение,
 * и оно приходит как пометка в журнале. Причины, которые подтверждает
 * система, применяются сразу; остальные ждут управляющего. Демо-кнопка
 * «решение управляющего» показывает ровно это: пометка встаёт, и всё
 * пересчитывается само.
 */
export function appealSheet(items: Disputable[], appeals: Appeal[], picked: number | null): string {
  const reasonLabel = (id: string): string => RULES.excuses.find((x) => x.id === id)?.label ?? id;

  const rows = items.length === 0
    ? '<p class="card__note">За эту неделю нет ни жалоб, ни низких оценок, ни пропусков — оспаривать нечего.</p>'
    : items.map((d) => {
      const filed = appeals.find((a) => a.index === d.index);
      const head = `<span class="dispute__body"><span class="dispute__t">${esc(d.label)}</span>`
        + `<span class="dispute__m">${esc(d.at)}${d.delta !== 0 ? ` · ${signed(d.delta)} к баллу` : ''}</span></span>`;

      if (d.excused !== undefined) {
        const rule = RULES.excuses.find((x) => x.id === d.excused);
        return `<div class="dispute dispute--done">${head}`
          + `<span class="dispute__state dispute__state--ok">${icon('shield', 2)}Не учтено</span>`
          + `<span class="dispute__why">${esc(reasonLabel(d.excused))} · ${rule?.auto ? `подтверждено ${esc(rule.proof)}` : 'решение управляющего'}</span>`
          + '</div>';
      }
      if (filed) {
        return `<div class="dispute dispute--filed">${head}`
          + `<span class="dispute__state">${icon('clock', 2)}На рассмотрении</span>`
          + `<span class="dispute__why">${esc(reasonLabel(filed.reason))} · управляющий точки, ответ до 48 часов</span>`
          + `<button class="ev" type="button" data-appeal-resolve="${d.index}">Решение управляющего: не по вине (демо)</button>`
          + '</div>';
      }
      if (picked === d.index) {
        return `<div class="dispute dispute--open">${head}`
          + '<p class="dispute__ask">Что случилось?</p>'
          + '<div class="reasons">'
          + RULES.excuses.map((x) => `<button class="reason" type="button" data-reason="${x.id}" data-index="${d.index}">`
            + `<span class="reason__t">${esc(x.label)}</span>`
            + `<span class="reason__p">${x.auto ? `сразу, ${esc(x.proof)}` : esc(x.proof)}</span></button>`).join('')
          + '</div>'
          + `<button class="ev ev--ghost" type="button" data-pick="${d.index}">Отмена</button>`
          + '</div>';
      }
      return `<div class="dispute">${head}`
        + `<button class="ev" type="button" data-pick="${d.index}">Не по моей вине</button>`
        + '</div>';
    }).join('');

  return '<div class="sheet-back" data-sheet-close></div>'
    + '<section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">'
    + '<div class="sheet__grip" aria-hidden="true"></div>'
    + '<h2 class="sheet__title" id="sheet-title">Не по моей вине</h2>'
    + '<p class="sheet__lead">Выбери событие и назови причину. То, что система проверяет сама — сборку на точке, погоду, '
    + 'сбой приложения, инцидент, — она применяет сразу. Остальное уходит управляющему точки; пока идёт разбор, ничего не меняется.</p>'
    + `<div class="sheet__list">${rows}</div>`
    + '<p class="note-chip">' + icon('info', 2)
    + '<span>Событие остаётся в журнале с пометкой и причиной — и перестаёт считаться. Балл, знаки, место в лиге пересчитываются сами. '
    + 'Вручную никто ничего не правит, поэтому «забыли поправить рейтинг» здесь невозможно.</span></p>'
    + '<button class="ev sheet__close" type="button" data-sheet-close>Закрыть</button>'
    + '</section>';
}

/* ─────────────────────────── ПРАВИЛА ─────────────────────────── */

const BUCKET_NAME: Record<BucketId, string> = {
  ratings: 'Оценки клиентов', slots: 'Смены и слоты', tare: 'Возврат тары', help: 'Помощь коллегам',
};

/**
 * Правила целиком, с историей изменений. Это не справка, а обязательство:
 * всё, что считает движок, курьер может прочитать здесь до того, как это
 * повлияет на его неделю.
 */
export function rulesSheet(): string {
  const byBucket = (Object.keys(BUCKET_NAME) as BucketId[]).map((b) =>
    `<p class="rules__h">${esc(BUCKET_NAME[b])}</p>`
    + RULES.points.filter((p) => p.bucket === b).map((p) =>
      `<div class="rules__row"><span>${esc(p.label)}</span><b class="num${p.add < 0 ? ' minus' : ''}">${signed(p.add)}</b></div>`).join(''));

  return '<div class="sheet-back" data-sheet-close></div>'
    + '<section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">'
    + '<div class="sheet__grip" aria-hidden="true"></div>'
    + `<h2 class="sheet__title" id="sheet-title">Правила · версия ${esc(RULES.version)}</h2>`
    + `<p class="sheet__lead">Действуют с ${esc(RULES.since)}. Всё, что считает приложение, описано здесь; `
    + 'любое изменение появляется в этом списке с датой раньше, чем начинает действовать.</p>'

    + '<div class="rules"><p class="rules__h">Что изменилось</p>'
    + RULES.changes.map((c) => `<div class="rules__change"><span class="rules__date num">${esc(c.date)} · v${esc(c.version)}</span>`
      + `<span>${esc(c.text)}</span></div>`).join('')
    + '</div>'

    + `<div class="rules">${byBucket.join('')}`
    + '<p class="card__note">Строка не уходит в минус. Балл недели — сумма строк.</p></div>'

    + '<div class="rules"><p class="rules__h">Уровни — зачётными сменами</p>'
    + RULES.levels.map((l) => `<div class="rules__row"><span>${esc(l.name)}</span><b class="num">${l.shifts}</b></div>`).join('')
    + '<p class="card__note">Зачётная — смена без замечаний. Пропуск, жалоба и инцидент шаг не отнимают.</p></div>'

    + '<div class="rules"><p class="rules__h">Ранний выбор слотов</p>'
    + `<div class="rules__row"><span>Баллов за неделю от</span><b class="num">${RULES.access.minWeekPoints}</b></div>`
    + `<div class="rules__row"><span>Пропусков без предупреждения не больше</span><b class="num">${RULES.access.maxMissedSlots}</b></div>`
    + `<div class="rules__row"><span>С уровня</span><b>${esc(RULES.levels.find((l) => l.id === RULES.access.fromLevel)?.name ?? '')}</b></div>`
    + `<div class="rules__row"><span>Недель предупреждения до приостановки</span><b class="num">${RULES.access.graceWeeks}</b></div>`
    + '<p class="card__note">Единственное, чем управляет результат недели. Поток заказов и ставка от него не зависят никогда.</p></div>'

    + '<div class="rules"><p class="rules__h">Не по моей вине</p>'
    + RULES.excuses.map((x) => `<div class="rules__row"><span>${esc(x.label)}</span>`
      + `<b class="rules__who">${x.auto ? 'сразу' : 'управляющий'}</b></div>`).join('')
    + '<p class="card__note">Событие остаётся в журнале с причиной и не считается. «Сразу» — подтверждает система по своим данным; «управляющий» — решение человека, ответ до 48 часов.</p></div>'

    + '<div class="rules"><p class="rules__h">Нагрузка</p>'
    + `<div class="rules__row"><span>Часов в неделю, после которых счётчик красный</span><b class="num">${RULES.load.maxWeekHours}</b></div>`
    + `<div class="rules__row"><span>Дней подряд, после которых приложение предложит выходной</span><b class="num">${RULES.load.restAfterDays}</b></div>`
    + '</div>'

    + '<div class="rules"><p class="rules__h">Чего в правилах нет</p>'
    + '<div class="rules__none"><span>Скорости доставки и времени в пути — ни в баллах, ни в знаках, ни в комплиментах.</span>'
    + '<span>Серий без выходных, которые обнуляются.</span>'
    + '<span>Влияния уровня и места в лиге на количество заказов и оплату.</span>'
    + '<span>Штрафа за инцидент.</span></div></div>'

    + '<button class="ev sheet__close" type="button" data-sheet-close>Закрыть</button>'
    + '</section>';
}

/** Ближайшие пороги: ради чего имеет смысл следующая смена. */
export function nudges(items: Nudge[]): string {
  if (items.length === 0) return '';
  return '<div class="card"><p class="card__label">Скоро</p><div class="nudges">'
    + items.map((n) => '<div class="nudge">'
      + `<span class="nudge__ic">${icon(n.icon)}</span>`
      + `<div class="nudge__body"><p class="nudge__t">${esc(n.text)}</p>`
      + `<p class="nudge__d">${esc(n.detail)}</p>${bar(n.pct)}</div></div>`).join('')
    + '</div></div>';
}

const KIND_CLASS: Record<FeedEntry['kind'], string> = {
  points: '', excused: ' feed__i--void', kudos: ' feed__i--warm',
  badge: ' feed__i--win', badge_reset: ' feed__i--warn',
  level: ' feed__i--win', goal: ' feed__i--win', access: ' feed__i--warn', rank: ' feed__i--win',
  rest: ' feed__i--warn',
};

/**
 * Лента, сгруппированная по дням. Вехи — знак, уровень, доступ — выделены:
 * ради них лента и нужна, иначе всё меняется молча и курьер узнаёт об этом
 * случайно, открыв нужный экран.
 */
export function feed(items: FeedEntry[], unread: number): string {
  if (items.length === 0) {
    return card({ label: 'Лента', note: 'Пока пусто. Подайте событие в симуляторе — оно появится здесь.' });
  }

  const days: { at: string; rows: FeedEntry[] }[] = [];
  for (const e of items) {
    const last = days[days.length - 1];
    if (last && last.at === e.at) last.rows.push(e);
    else days.push({ at: e.at, rows: [e] });
  }

  return days.map((d) => '<div class="card"><p class="card__label">'
    + `${esc(dayName(d.at))}</p><div class="feed">`
    + d.rows.map((e, i) => {
      const isNew = unread > 0 && days[0] === d && i < unread;
      let val = '';
      if (e.kind === 'points') {
        const cls = e.delta > 0 ? '' : e.delta < 0 ? ' feed__d--minus' : ' feed__d--zero';
        val = `<span class="feed__d${cls}">${e.delta === 0 ? '—' : signed(e.delta)}</span>`;
      } else if (e.kind === 'excused' && e.delta !== 0) {
        // Сколько это стоило бы — зачёркнуто. Событие видно, но не в счёт
        val = `<span class="feed__d feed__d--void"><s>${signed(e.delta)}</s></span>`;
      }
      return `<div class="feed__i${KIND_CLASS[e.kind]}${isNew ? ' feed__i--new' : ''}">`
        + `<span class="feed__ic">${icon(e.icon)}</span>`
        + '<span class="feed__body">'
        + `<span class="feed__t">${esc(e.text)}${e.count > 1 ? ` <em>× ${e.count}</em>` : ''}</span>`
        + (e.detail ? `<span class="feed__sub">${esc(e.detail)}</span>` : '')
        + '</span>' + val + '</div>';
    }).join('')
    + '</div></div>').join('');
}

export function mentor(opts: { name: string; role: string; initial: string; note: string }): string {
  return '<div class="card"><p class="card__label">Твой наставник</p>'
    + `<div class="mentor"><span class="mentor__av">${esc(opts.initial)}</span>`
    + `<div><p class="mentor__n">${esc(opts.name)}</p><p class="mentor__r">${esc(opts.role)}</p></div>`
    + `<button class="mentor__btn" type="button" data-call aria-label="Позвонить наставнику">${icon('phone', 2)}</button></div>`
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
    + opts.items.map((i, idx) => `<button class="check__i${i.done ? ' done' : ''}" type="button" data-check="${idx}" aria-pressed="${i.done}">`
      + `<span class="check__box">${i.done ? icon('check', 3.5) : ''}</span>`
      + `<span>${esc(i.text)}</span></button>`).join('')
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
