import { RULES } from '../engine/rules';
import type { Snapshot } from '../engine/types';
import type { AppState } from '../state/store';
import * as C from './components';
import { plural } from './components';

export const SCREENS = ['shift', 'feed', 'progress', 'league', 'team', 'slots'] as const;
export type ScreenId = (typeof SCREENS)[number];

export const TABS: { id: ScreenId; label: string; icon: string }[] = [
  { id: 'shift', label: 'Смена', icon: 'home' },
  { id: 'feed', label: 'Лента', icon: 'bell' },
  { id: 'progress', label: 'Прогресс', icon: 'trophy' },
  { id: 'league', label: 'Лига', icon: 'chart' },
  { id: 'team', label: 'Команда', icon: 'team' },
  { id: 'slots', label: 'Слоты', icon: 'calendar' },
];

const WEEK_SLOTS = [
  { d1: 'Пн', d2: '1 сент', time: '09:00 — 15:00' },
  { d1: 'Вт', d2: '2 сент', time: '14:00 — 20:00' },
  { d1: 'Ср', d2: '3 сент', time: '09:00 — 15:00' },
  { d1: 'Чт', d2: '4 сент', time: '14:00 — 20:00', taken: true },
  { d1: 'Пт', d2: '5 сент', time: '09:00 — 15:00' },
];

const ROOKIE_CHECKLIST = [
  { done: true, text: 'Собрать заказ по списку и сверить состав' },
  { done: true, text: 'Проверить сроки годности при сборке' },
  { done: true, text: 'Оформить возврат прямо у двери' },
  { done: true, text: 'Найти подъезд по коду домофона' },
  { done: false, text: 'Что делать, если клиента нет дома' },
  { done: false, text: 'Как сдать тару в конце смены' },
  { done: false, text: 'Холодовая цепь в жару: что нельзя везти дольше 20 минут' },
  { done: false, text: 'Если сломался велосипед посреди маршрута' },
  { done: false, text: 'Если заказ повредился в дороге' },
];

/** Просевшая ли неделя. Решает движок, а не сценарий. */
const isDip = (s: Snapshot): boolean => s.fixes.length > 0;

export function headOf(state: AppState, screen: ScreenId): [string, string] {
  const { snapshot: s, profile } = state;
  switch (screen) {
    case 'feed': return ['Лента', s.feed.length === 0 ? 'Пока пусто' : `${s.feed.length} ${plural(s.feed.length, 'запись', 'записи', 'записей')} за неделю`];
    case 'progress': return ['Твой прогресс', `${s.level.current.name} · ${s.level.done} из ${s.level.need} смен`];
    case 'league': return ['Лига', s.isRookie ? `Откроется на ${RULES.rookieDays + 1}-й день` : `Юго-Запад · ${s.league.size} курьера`];
    case 'team': return ['Команда точки', 'Профсоюзная, 43 · 19 курьеров'];
    case 'slots': return ['Слоты', s.access.title];
    default: return [`Привет, ${profile.name}`, profile.sub];
  }
}

/* ─────────────────────────── СМЕНА ─────────────────────────── */

function shift(s: Snapshot, rookie: boolean): string {
  const warn = isDip(s);
  const parts: string[] = [];

  parts.push(C.live({
    tone: warn ? 'warn' : 'green',
    text: 'Смена идёт',
    meta: rookie ? 'до 15:00' : 'до 18:00',
    note: rookie
      ? `${s.counters.deliveries} заказов за первые дни. Первая неделя короткая — спешить некуда, спрашивай что угодно.`
      : `${s.counters.deliveries} доставок за неделю. Идёшь ровно — торопиться не нужно.`,
  }));

  if (rookie) {
    parts.push(C.mentor({
      initial: 'Т', name: 'Тимур Ахмедов', role: 'Знаток района · 4 года на точке',
      note: 'Пишет и берёт трубку в любое время смены. За тебя ему идёт знак «Наставник».',
    }));
    parts.push(C.checklist({
      label: 'Первые две недели', title: 'Освоиться без спешки',
      right: 'до 10 сентября', items: ROOKIE_CHECKLIST,
    }));
    parts.push(C.note(
      `Лиги и рейтинги включатся на ${RULES.rookieDays + 1}-й день. Первые две недели тебя ни с кем не сравнивают.`,
      'shield',
    ));
    return parts.join('');
  }

  parts.push(C.ring({
    label: 'Неделя', tone: warn ? 'warn' : undefined,
    value: s.weekPoints, unit: 'баллов<br>качества',
    // Шкала кольца: 250 баллов — ровная неделя с запасом.
    pct: Math.min(100, Math.round((s.weekPoints / 250) * 100)),
    stats: [
      { k: 'Оценки клиентов', v: s.rating === null ? '—' : s.rating.toFixed(2).replace('.', ','), mood: s.rating !== null && s.rating >= 4.9 ? 'good' : s.rating !== null && s.rating < 4.8 ? 'warn' : undefined },
      { k: 'Вышел на слот', v: `${s.counters.attendedSlots} / ${s.counters.attendedSlots + s.counters.missedSlots}`, mood: s.counters.missedSlots > 0 ? 'warn' : undefined },
      { k: 'Смены без замечаний', v: `${s.counters.cleanShifts} / ${s.counters.shifts}`, mood: s.counters.cleanShifts < s.counters.shifts ? 'warn' : undefined },
      { k: 'Доставки без жалоб', v: `${s.counters.cleanDeliveries} / ${s.counters.deliveries}`, mood: s.counters.damageComplaints > 0 ? 'warn' : 'good' },
    ],
  }));

  if (warn) {
    parts.push(C.fixes(
      s.fixes,
      'Уровень и ранний доступ к слотам на этой неделе сохраняются. Пересмотр — в понедельник, не сегодня.',
      'Не согласен с оценкой',
    ));
  } else {
    parts.push(C.goal({
      tone: 'green', label: 'Цель недели', title: s.goal.title,
      pct: s.goal.pct, left: `${s.goal.done} из ${s.goal.target}`,
      right: s.goal.done >= s.goal.target ? 'выполнена' : 'осталось 2 дня',
      reward: s.goal.reward,
    }));
  }

  parts.push(C.myRank({
    label: 'Твоя лига', tone: warn ? 'warn' : undefined,
    pos: s.league.rank, who: `Ты · ${s.league.name}`, pts: s.weekPoints,
    note: warn
      ? 'Место в лиге не влияет ни на количество заказов, ни на оплату.'
      : rankNote(s),
  }));

  return parts.join('');
}

function rankNote(s: Snapshot): string {
  const above = s.league.rows.find((r) => r.pos === s.league.rank - 1);
  if (!above) return 'Первое место в лиге. Выше некуда.';
  const gap = above.points - s.weekPoints;
  return `До ${s.league.rank - 1}-го места — ${gap} ${plural(gap, 'балл', 'балла', 'баллов')}. Это ${Math.max(1, Math.ceil(gap / 12))} ${plural(Math.max(1, Math.ceil(gap / 12)), 'смена', 'смены', 'смен')} без замечаний.`;
}

/* ─────────────────────────── ПРОГРЕСС ─────────────────────────── */

function progress(s: Snapshot, rookie: boolean): string {
  const levelIdx = RULES.levels.findIndex((l) => l.id === s.level.current.id);
  const path = RULES.levels.map((l, i) => ({
    name: l.name, meta: `${l.shifts} смен`,
    state: (i < levelIdx ? 'done' : i === levelIdx ? 'now' : '') as '' | 'done' | 'now',
  }));

  const reset = s.badges.filter((b) => b.wasReset);
  const parts: string[] = [
    C.goal({
      tone: 'green', label: 'Сейчас', title: s.level.current.name, big: true,
      pct: s.level.pct, left: `${s.level.done} из ${s.level.need} зачётных смен`,
      right: s.level.next ? `дальше «${s.level.next.name}»` : 'последний уровень',
    }),
  ];

  if (reset.length > 0) {
    parts.push(C.note(
      'На этой неделе шагов не добавилось — но и не убавилось. Прогресс уровня не откатывается ни от жалоб, ни от инцидентов, ни от пропусков.',
      'shield',
    ));
  }

  parts.push(C.levels(path,
    'Зачётная — смена, отработанная полностью и без замечаний. Пропуск не обнуляет путь, просто не добавляет шаг.'));
  parts.push(C.badges(rookie ? 'Первые шаги' : 'Знаки', s.badges));

  if (rookie) {
    parts.push(C.note(
      'Шаги первой недели — маленькие и почти все достижимые. Пустой экран в первый день демотивирует сильнее, чем отсутствие наград вообще.',
    ));
  } else if (reset.length > 0) {
    const names = reset.map((b) => `«${b.name.replace(/<br>/g, ' ')}»`).join(', ');
    parts.push(C.note(
      `Ушли на перезапуск: ${names}. Счётчики набираются заново — ничего не потеряно навсегда.`,
      'info', 'warn',
    ));
  }

  return parts.join('');
}

/* ─────────────────────────── ЛИГА ─────────────────────────── */

function league(s: Snapshot): string {
  if (s.isRookie) {
    return [
      C.unlock('off', 'Лига пока закрыта', `Откроется на ${RULES.rookieDays + 1}-й день работы.`),
      C.card({
        label: 'Почему так', title: 'Сначала научиться, потом соревноваться',
        note: 'В первые две недели скорость и точность растут сами. Если поставить новичка в таблицу рядом с людьми, у которых 300 смен, он увидит только своё последнее место — и уйдёт.',
      }),
      C.card({
        tone: 'flat', label: 'Когда откроется', title: s.league.name,
        note: `Курьеры на велосипеде, тот же район, сопоставимый стаж. ${s.league.size} человека, из них ${s.league.promote} идут вверх каждую неделю.`,
      }),
      C.note('Отток курьеров сосредоточен в первых двух неделях. Всё, что в этот период сравнивает человека с другими, работает против удержания.', 'shield'),
    ].join('');
  }

  const warn = isDip(s);
  // Показываем окрестность своего места, а не недосягаемый топ.
  const from = Math.max(0, s.league.rank - 4);
  const rows = s.league.rows.slice(from, from + 7);

  return [
    C.card({ tone: 'flat', label: s.league.name, title: '2 дня до итогов', note: `${s.league.size} курьера · велосипед · стаж от полугода` }),
    warn
      ? C.note('Ты в нижней части таблицы. Это не меняет ничего в работе: заказов приходит столько же, оплата не снижается, из лиги никто не вылетает.', 'shield', 'warn')
      : C.note('Ты сравниваешься с курьерами похожего профиля. Общего топа по компании нет — и не будет.'),
    C.board(rows, `↑ ${s.league.promote} мест переходят в следующую лигу`, warn ? 'warn' : undefined),
    C.stats('Из чего баллы', [
      { k: 'Оценки клиентов', v: String(s.buckets.ratings) },
      { k: 'Смены и слоты', v: String(s.buckets.slots) },
      { k: 'Возврат тары', v: String(s.buckets.tare) },
      { k: 'Помощь коллегам', v: String(s.buckets.help) },
    ],
      'Время в пути и скорость доставки в баллы не входят. Совсем.',
      `Сумма строк: <b>${s.buckets.ratings} + ${s.buckets.slots} + ${s.buckets.tare} + ${s.buckets.help} = ${s.weekPoints}</b>. `
      + 'Это и есть балл в кольце на «Смене» — цифры не разъезжаются, потому что считает один движок.'),
    warn
      ? C.card({ tone: 'green', label: 'Следующая неделя', title: 'Счёт обнуляется в понедельник', note: 'Лига считается за неделю, а не накопительно. Плохая неделя не тянется за тобой в следующую.' })
      : C.note('Низкое место в лиге не уменьшает количество заказов и не снижает оплату. Лига — только про призы и ранний выбор слотов.', 'shield'),
  ].join('');
}

/* ─────────────────────────── КОМАНДА ─────────────────────────── */

function team(s: Snapshot, rookie: boolean): string {
  // Вклад курьера в командный челлендж — его же чистые доставки,
  // у новичка с коэффициентом два.
  const mine = rookie ? s.counters.cleanDeliveries * 2 : s.counters.cleanDeliveries;
  const others = 144; // 38 + 35 + 33 + 38 — сумма по строкам ниже
  const total = mine + others;
  const target = 240;
  const pct = Math.min(100, Math.round((total / target) * 100));

  const rows = [
    { av: 'М', name: 'Марина К.', val: '38' },
    { av: 'Т', name: 'Тимур А.', val: '35' },
    { av: s.isRookie ? 'А' : 'И', name: rookie ? 'Ты (×2)' : 'Ты', val: String(mine), me: true },
    { av: 'Ж', name: 'Женя Л.', val: '33' },
    { av: '+15', name: 'остальные курьеры точки', val: '38' },
  ].sort((a, b) => Number(b.val) - Number(a.val));

  return [
    C.goal({
      tone: 'green', label: 'Челлендж недели', title: 'Неделя бережной доставки',
      note: 'Профсоюзная, 43 — вся точка целиком, 19 курьеров',
      pct, left: `${total} из ${target} заказов без замечаний`, right: `${pct} %`,
    }),
    rookie
      ? C.card({ tone: 'flat', label: 'Твой вклад', title: 'Считается за двоих', note: `Первые две недели каждый твой чистый заказ идёт в общий счёт с коэффициентом два: ${s.counters.cleanDeliveries} × 2 = ${mine}. Команде выгодно, чтобы ты втянулась, а не чтобы тебя обошли.` })
      : '',
    C.contrib('Кто как вложился', rows, 'Внутри точки места не показываются — важен только общий результат.'),
    pct >= 100
      ? C.card({ tone: 'green', label: 'Взяли', title: 'Завтрак на точке в понедельник', note: 'Его получает вся смена, включая тех, кто вложился меньше.' })
      : C.card({ tone: 'green', label: 'Если возьмём', title: `Не хватает ${target - total} чистых заказов`, note: 'Завтрак на точке в понедельник и ранний выбор слотов для всей смены — не только для тех, кто вложился больше всех.' }),
    C.note('Командный челлендж намеренно не показывает, кто «тянет вниз». Иначе плохая неделя одного человека превращается в конфликт на точке.', 'team'),
  ].join('');
}

/* ─────────────────────────── СЛОТЫ ─────────────────────────── */

function slots(s: Snapshot): string {
  const parts: string[] = [C.unlock(s.access.state, s.access.title, s.access.sub)];

  if (s.access.reasons.length > 0) {
    parts.push(C.fixes(
      s.access.reasons.map((r) => ({
        title: r.charAt(0).toUpperCase() + r.slice(1),
        text: 'Порог считается по итогам недели, а не по одному дню.',
      })),
      `Если следующая неделя закроется так же, ранний доступ приостановится: выбор станет с пятницы 12:00, как у всех. Ни заказы, ни оплата при этом не меняются. Вернуть — две недели в пороге.`,
    ));
  }

  parts.push(C.slots('Следующая неделя', WEEK_SLOTS));

  if (s.isRookie) {
    parts.push(C.card({
      tone: 'green', label: 'Зато', title: 'Слоты первой недели закреплены за тобой',
      note: 'Пока идёт обучение, график согласован с наставником. Их никто не заберёт, даже если разберут всё остальное.',
    }));
  }

  parts.push(C.stats('Порог раннего доступа', [
    { k: 'Баллов за неделю', v: `${s.weekPoints} из ${RULES.access.minWeekPoints}` },
    { k: 'Пропущено слотов', v: `${s.counters.missedSlots}, допустимо ${RULES.access.maxMissedSlots}` },
    { k: 'Уровень', v: s.level.current.name },
  ],
    'Ранний доступ — единственное, чем управляет результат недели. Поток заказов и ставка от уровня не зависят никогда.',
    'Порог виден целиком и заранее. Внезапных понижений в системе нет: сначала неделя предупреждения, только потом изменение.'));

  return parts.join('');
}

/* ─────────────────────────── ЛЕНТА ─────────────────────────── */

function feedScreen(s: Snapshot, unread: number): string {
  const wins = s.feed.filter((f) => f.kind !== 'points').length;

  return [
    C.card({
      tone: unread > 0 ? 'green' : 'flat',
      label: 'За неделю',
      title: unread > 0
        ? `${unread} ${plural(unread, 'новое событие', 'новых события', 'новых событий')}`
        : 'Всё просмотрено',
      note: wins > 0
        ? `Среди них ${wins} ${plural(wins, 'веха', 'вехи', 'вех')}: знаки, уровень и доступ к слотам отмечены отдельно.`
        : 'Вех пока нет — они появятся, когда закроется знак, поднимется уровень или изменится доступ к слотам.',
    }),
    C.nudges(s.nudges),
    C.feed(s.feed, unread),
    C.note(
      'Лента — единственное место, где видно, что вообще произошло. Без неё геймификация невидима между открытиями приложения: знак закрылся, а человек об этом не узнал.',
    ),
  ].join('');
}

/* ─────────────────────────── СБОРКА ─────────────────────────── */

export function renderScreen(state: AppState, screen: ScreenId): string {
  const s = state.snapshot;
  const rookie = s.isRookie;
  switch (screen) {
    case 'feed': return feedScreen(s, state.unreadFeed);
    case 'progress': return progress(s, rookie);
    case 'league': return league(s);
    case 'team': return team(s, rookie);
    case 'slots': return slots(s);
    default: return shift(s, rookie);
  }
}
