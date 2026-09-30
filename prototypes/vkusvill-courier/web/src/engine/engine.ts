import { adjacent } from './days';
import { summarize } from './summary';
import type {
  AccessState, BadgeRule, BadgeState, BucketId, CounterId, CourierEvent,
  EvaluateContext, FeedEntry, LeagueRow, LevelState, LoadState, Match, Nudge,
  PointRule, Praise, RulesConfig, Snapshot,
} from './types';

/* ─────────────────────────── ХЕЛПЕРЫ ─────────────────────────── */

/** Совпадает ли событие с образцом. Пустой образец совпадает со всем. */
export function matches(event: CourierEvent, on: string, match?: Match): boolean {
  if (event.type !== on) return false;
  if (!match) return true;
  const bag = event as unknown as Record<string, unknown>;
  return Object.keys(match).every((k) => bag[k] === match[k]);
}

/** Строка таблицы баллов, по которой считается событие. */
export function pointRuleFor(event: CourierEvent, rules: RulesConfig): PointRule | undefined {
  return rules.points.find((r) => matches(event, r.on, r.match));
}

/**
 * Помечено «не по моей вине». Такое событие остаётся в журнале — его видно
 * и в ленте, и в шторке обжалования, — но нигде не считается.
 */
export function isExcused(event: CourierEvent): boolean {
  return (event as { excused?: string }).excused !== undefined;
}

function clampPct(done: number, need: number): number {
  if (need <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((done / need) * 100)));
}

/* ─────────────────────────── СЧЁТЧИКИ ─────────────────────────── */

function countAll(events: CourierEvent[], rules: RulesConfig, ctx: EvaluateContext): Record<CounterId, number> {
  const c: Record<CounterId, number> = {
    missedSlots: 0, attendedSlots: 0, damageComplaints: 0, incidents: 0,
    lowRatings: 0, deliveries: 0, cleanDeliveries: 0, shifts: 0, cleanShifts: 0, qualifyingShifts: 0,
    hours: 0, excused: 0, kudos: 0,
  };
  for (const e of events) {
    if (isExcused(e)) { c.excused++; continue; }
    switch (e.type) {
      case 'slot_missed': if (!e.warnedAhead) c.missedSlots++; break;
      case 'slot_attended': c.attendedSlots++; break;
      case 'complaint': if (e.kind === 'damage') c.damageComplaints++; break;
      case 'incident': c.incidents++; break;
      case 'rating': if (e.stars < 4) c.lowRatings++; break;
      case 'delivery': c.deliveries++; if (e.clean) c.cleanDeliveries++; break;
      case 'shift_closed': c.shifts++; if (e.clean) c.cleanShifts++; c.hours += e.hours ?? rules.load.shiftHours; break;
      case 'kudos': c.kudos++; break;
    }
  }
  // qualifyingShifts — весь накопленный путь, cleanShifts — только текущий журнал
  c.qualifyingShifts = c.cleanShifts + ctx.shiftsBefore;
  return c;
}

/* ─────────────────────────── БАЛЛЫ ─────────────────────────── */

function scorePoints(events: CourierEvent[], rules: RulesConfig) {
  const buckets: Record<BucketId, number> = { ratings: 0, slots: 0, tare: 0, help: 0 };

  for (const e of events) {
    if (isExcused(e)) continue;
    const rule = pointRuleFor(e, rules);
    if (!rule) continue;
    buckets[rule.bucket] += rule.add;
  }

  // Строка баллов не может уйти в минус: отрицательная «оценка клиентов»
  // читается как долг перед компанией, а это не то, чем является плохая неделя.
  // Общий балл считается уже по обрезанным строкам, иначе разбор «из чего
  // баллы» не сойдётся с итогом, и первый же курьер это заметит.
  (Object.keys(buckets) as BucketId[]).forEach((k) => { buckets[k] = Math.max(0, buckets[k]); });
  const total = (Object.keys(buckets) as BucketId[]).reduce((s, k) => s + buckets[k], 0);

  return { total, buckets };
}

/* ─────────────────────────── УРОВЕНЬ ─────────────────────────── */

function levelOf(qualifyingShifts: number, rules: RulesConfig): LevelState {
  const levels = rules.levels;
  // Текущий уровень — последний, порог которого уже пройден.
  // Пока не пройден ни один, курьер находится на первом.
  let idx = 0;
  for (let i = 0; i < levels.length; i++) {
    if (qualifyingShifts >= levels[i].shifts) idx = Math.min(i + 1, levels.length - 1);
  }
  const current = levels[idx];
  const next = idx + 1 < levels.length ? levels[idx + 1] : null;
  const need = current.shifts;
  return { current, next, done: qualifyingShifts, need, pct: clampPct(qualifyingShifts, need) };
}

function levelIndex(id: string, rules: RulesConfig): number {
  return rules.levels.findIndex((l) => l.id === id);
}

/* ─────────────────────────── ЗНАКИ ─────────────────────────── */

/**
 * Счётчик знака идёт подряд: сбрасывающее событие обнуляет его,
 * но не трогает ни баллы, ни прогресс уровня. Ничего не «сгорает»
 * навсегда — знак просто набирается заново.
 */
function badgeState(rule: BadgeRule, events: CourierEvent[], before = 0): BadgeState {
  let done = before;
  let earned = before >= rule.need;
  let wasReset = false;

  for (const e of events) {
    // Неучтённая жалоба и знак не сбрасывает: раз не по вине курьера — значит, не по вине
    if (isExcused(e)) continue;
    const resets = rule.resets?.some((r) => matches(e, r.on, r.match));
    if (resets) {
      if (done > 0 || earned) wasReset = true;
      done = 0;
      earned = false;
      continue;
    }
    if (matches(e, rule.counts.on, rule.counts.match)) {
      done++;
      if (done >= rule.need) earned = true;
    }
  }

  return {
    id: rule.id, name: rule.name, icon: rule.icon, how: rule.how,
    done: Math.min(done, rule.need), need: rule.need, earned, wasReset,
  };
}

/* ─────────────────────────── ЛИГА ─────────────────────────── */

function league(weekPoints: number, rules: RulesConfig, me: string) {
  const rows: LeagueRow[] = rules.league.cohort
    .map((c) => ({ pos: 0, who: c.name, points: c.points, me: false, cut: false }))
    .concat([{ pos: 0, who: me, points: weekPoints, me: true, cut: false }])
    .sort((a, b) => b.points - a.points || (a.me ? 1 : -1));

  rows.forEach((r, i) => {
    r.pos = i + 1;
    r.cut = r.pos === rules.league.promote;
  });

  const rank = rows.find((r) => r.me)!.pos;
  return { name: rules.league.name, size: rows.length, rank, rows, promote: rules.league.promote };
}

/* ─────────────────────────── ДОСТУП К СЛОТАМ ─────────────────────────── */

function access(
  weekPoints: number, counters: Record<CounterId, number>,
  level: LevelState, rules: RulesConfig, ctx: EvaluateContext,
): AccessState {
  const a = rules.access;
  const reasons: string[] = [];

  if (levelIndex(level.current.id, rules) < levelIndex(a.fromLevel, rules)) {
    const from = rules.levels[levelIndex(a.fromLevel, rules)];
    return {
      state: 'off',
      title: 'Ранний выбор пока недоступен',
      sub: `Открывается с уровня «${from.name}» — это ${from.shifts} смен.`,
      reasons: [],
    };
  }

  if (weekPoints < a.minWeekPoints) reasons.push(`баллов за неделю ${weekPoints} из ${a.minWeekPoints}`);
  if (counters.missedSlots > a.maxMissedSlots) reasons.push(`пропущено слотов ${counters.missedSlots}, допустимо ${a.maxMissedSlots}`);

  if (reasons.length === 0) {
    return {
      state: 'open',
      title: 'Ранний выбор открыт',
      sub: 'Ты выбираешь слоты с четверга 18:00. Остальные — с пятницы 12:00.',
      reasons: [],
    };
  }

  // Порог не пройден — но доступ снимается не сразу.
  // Внезапное понижение читается как обман, поэтому сначала предупреждение.
  if (ctx.weeksBelow < a.graceWeeks) {
    return {
      state: 'warn',
      title: 'Ранний выбор пока сохранён',
      sub: 'На этой неделе ты выбираешь с четверга 18:00, как обычно.',
      reasons,
    };
  }

  return {
    state: 'off',
    title: 'Ранний выбор приостановлен',
    sub: 'Выбор слотов с пятницы 12:00, как у всех. Заказы и оплата не меняются.',
    reasons,
  };
}

/* ─────────────────────────── НАГРУЗКА ─────────────────────────── */

/**
 * Рабочие дни подряд к концу журнала. Рабочий день — тот, в котором была
 * смена, доставка или выход на слот; день с одним «слот освобождён заранее»
 * серию прерывает. Пропуск в календаре тоже прерывает: «Пн, Ср, Пт» — это
 * не три дня подряд.
 */
function load(events: CourierEvent[], counters: Record<CounterId, number>, rules: RulesConfig, ctx: EvaluateContext): LoadState {
  const days: string[] = [];
  const worked = new Set<string>();
  for (const e of events) {
    if (!days.includes(e.at)) days.push(e.at);
    if (e.type === 'shift_closed' || e.type === 'delivery' || e.type === 'slot_attended') worked.add(e.at);
  }

  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (!worked.has(days[i])) break;
    if (i < days.length - 1 && !adjacent(days[i], days[i + 1])) break;
    streak++;
  }
  // Серия тянется через весь журнал — значит, продолжает ту, что была до него
  if (streak > 0 && streak === days.length) streak += ctx.workedInRowBefore ?? 0;

  return {
    hours: counters.hours,
    maxHours: rules.load.maxWeekHours,
    daysInRow: streak,
    restAfterDays: rules.load.restAfterDays,
    rest: streak >= rules.load.restAfterDays,
  };
}

/* ─────────────────────────── ТЁПЛЫЕ СЛОВА ─────────────────────────── */

function praise(events: CourierEvent[], rules: RulesConfig): Praise[] {
  const counts = new Map<string, number>();
  const inc = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const e of events) {
    if (e.type === 'rating' && e.compliment && !isExcused(e)) inc(e.compliment);
    if (e.type === 'kudos') inc('kudos');
  }
  return [
    ...rules.compliments.map((c) => ({ id: c.id, label: c.label, count: counts.get(c.id) ?? 0 })),
    { id: 'kudos', label: 'Спасибо с точки', count: counts.get('kudos') ?? 0 },
  ]
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count);
}

/* ─────────────────────────── ГЛАВНОЕ ─────────────────────────── */

/** Всё состояние курьера, кроме ленты. Лента строится поверх, отдельным проходом. */
export type Core = Omit<Snapshot, 'feed' | 'nudges' | 'summary'>;

function evaluateCore(events: CourierEvent[], rules: RulesConfig, ctx: EvaluateContext): Core {
  const counters = countAll(events, rules, ctx);
  const { total, buckets } = scorePoints(events, rules);
  const level = levelOf(counters.qualifyingShifts, rules);
  const isRookie = ctx.dayNumber <= rules.rookieDays;

  const badgeRules = isRookie ? rules.rookieBadges : rules.badges;
  const badges = badgeRules.map((r) => badgeState(r, events, ctx.badgesBefore?.[r.id] ?? 0));

  const goalDone = events.filter((e) => matches(e, rules.goal.counts.on, rules.goal.counts.match)).length;

  // Неучтённые оценки в среднее не входят — иначе «не по твоей вине» было бы словами
  const stars = events.filter((e): e is Extract<CourierEvent, { type: 'rating' }> => e.type === 'rating' && !isExcused(e));
  const rating = stars.length
    ? Math.round((stars.reduce((s, e) => s + e.stars, 0) / stars.length) * 100) / 100
    : null;

  const fixes = rules.fixes
    .filter((f) => counters[f.when.counter] >= f.when.gte)
    .map((f) => ({
      title: f.title.replace('{n}', String(counters[f.when.counter])),
      text: f.text,
    }));

  return {
    dayNumber: ctx.dayNumber,
    isRookie,
    weekPoints: total,
    buckets,
    counters,
    level,
    badges,
    goal: {
      title: rules.goal.title,
      done: Math.min(goalDone, rules.goal.target),
      target: rules.goal.target,
      pct: clampPct(goalDone, rules.goal.target),
      reward: rules.goal.reward,
    },
    league: league(total, rules, ctx.courierName),
    access: access(total, counters, level, rules, ctx),
    load: load(events, counters, rules, ctx),
    praise: praise(events, rules),
    fixes,
    rating,
  };
}

/* ─────────────────────────── ЛЕНТА ─────────────────────────── */

const BUCKET_ICON: Record<BucketId, string> = {
  ratings: 'star', slots: 'clock', tare: 'bag', help: 'hand',
};

/** Название знака без разметки переноса. */
const plainName = (s: string): string => s.replace(/<br>/g, ' ');

const lowFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Строит ленту, сравнивая состояние до и после каждого события.
 *
 * Вехи не выписываются руками: «знак получен» здесь — это буквально то же
 * условие, по которому знак показан полученным на экране «Прогресс».
 * Разойтись они не могут.
 *
 * Цена — пересчёт на каждом префиксе журнала, O(n²). При недельном журнале
 * это сотня-другая событий и доли миллисекунды. Если журнал станет длиннее
 * месяца, здесь понадобится инкрементальный проход.
 */
function buildFeed(events: CourierEvent[], rules: RulesConfig, ctx: EvaluateContext): FeedEntry[] {
  const out: FeedEntry[] = [];
  let prev = evaluateCore([], rules, ctx);

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const next = evaluateCore(events.slice(0, i + 1), rules, ctx);

    const rule = pointRuleFor(e, rules);
    if (isExcused(e) && rule) {
      // Событие на месте, но не в счёт — и видно, почему
      const excuse = rules.excuses.find((x) => x.id === (e as { excused?: string }).excused);
      // delta здесь — то, что стоило бы событие: лента показывает его зачёркнутым
      out.push({
        at: e.at, kind: 'excused', text: rule.label,
        detail: `Не учтено — ${lowFirst(excuse?.label ?? 'не по твоей вине')}`,
        delta: rule.add, count: 1, icon: 'shield',
      });
    } else if (e.type === 'kudos') {
      out.push({
        at: e.at, kind: 'kudos', text: `Спасибо от ${e.from}`, detail: `«${e.text}»`,
        delta: 0, count: 1, icon: 'heart',
      });
    } else if (rule) {
      out.push({
        at: e.at, kind: 'points', text: rule.label, delta: rule.add,
        count: 1, icon: BUCKET_ICON[rule.bucket],
      });
      if (e.type === 'rating' && e.compliment) {
        const c = rules.compliments.find((x) => x.id === e.compliment);
        out.push({
          at: e.at, kind: 'kudos', text: `Комплимент: ${lowFirst(c?.label ?? e.compliment)}`,
          detail: `От клиента, к оценке ${e.stars}`, delta: 0, count: 1, icon: 'heart',
        });
      }
    }

    for (const badge of next.badges) {
      const was = prev.badges.find((b) => b.id === badge.id);
      if (!was) continue;
      if (!was.earned && badge.earned) {
        out.push({
          at: e.at, kind: 'badge', text: `Знак «${plainName(badge.name)}»`,
          detail: 'Получен', delta: 0, count: 1, icon: badge.icon,
        });
      } else if (was.done > 0 && badge.done === 0) {
        out.push({
          at: e.at, kind: 'badge_reset', text: `Знак «${plainName(badge.name)}»`,
          detail: `Счётчик пошёл заново, было ${was.done} из ${badge.need}`,
          delta: 0, count: 1, icon: badge.icon,
        });
      }
    }

    if (prev.level.current.id !== next.level.current.id) {
      out.push({
        at: e.at, kind: 'level', text: `Уровень «${next.level.current.name}»`,
        detail: `${next.level.done} зачётных смен`, delta: 0, count: 1, icon: 'trophy',
      });
    }

    if (prev.goal.done < next.goal.target && next.goal.done >= next.goal.target) {
      out.push({
        at: e.at, kind: 'goal', text: 'Цель недели закрыта',
        detail: next.goal.title, delta: 0, count: 1, icon: 'check',
      });
    }

    if (prev.access.state !== next.access.state) {
      out.push({
        at: e.at, kind: 'access', text: next.access.title,
        detail: next.access.sub, delta: 0, count: 1, icon: 'lock',
      });
    }

    // Место в лиге меняется почти от каждой оценки — в ленту попадает только
    // пересечение линии перехода, всё остальное было бы шумом.
    const wasIn = prev.league.rank <= rules.league.promote;
    const isIn = next.league.rank <= rules.league.promote;
    if (wasIn !== isIn && !next.isRookie) {
      out.push({
        at: e.at, kind: 'rank',
        text: isIn ? `Ты в шестёрке — ${next.league.rank}-е место` : `Вышел из шестёрки — ${next.league.rank}-е место`,
        detail: `Первые ${rules.league.promote} переходят в следующую лигу`,
        delta: 0, count: 1, icon: 'chart',
      });
    }

    // Единственная веха, которая просит работать меньше
    if (!prev.load.rest && next.load.rest) {
      out.push({
        at: e.at, kind: 'rest', text: `${next.load.daysInRow} дней подряд`,
        detail: 'Пора выходной. Балл за него не снижается, слот можно освободить заранее.',
        delta: 0, count: 1, icon: 'moon',
      });
    }

    prev = next;
  }

  return collapse(out).reverse();
}

/** Тридцать две подряд «Оценка 5» — это одна строка, а не тридцать две. */
function collapse(entries: FeedEntry[]): FeedEntry[] {
  const out: FeedEntry[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && last.kind === 'points' && e.kind === 'points' && last.at === e.at && last.text === e.text) {
      last.count += 1;
      last.delta += e.delta;
      continue;
    }
    out.push({ ...e });
  }
  return out;
}

/* ─────────────────────────── БЛИЖАЙШИЕ ПОРОГИ ─────────────────────────── */

function buildNudges(core: Core, rules: RulesConfig): Nudge[] {
  const out: Nudge[] = [];

  if (core.goal.done < core.goal.target) {
    const left = core.goal.target - core.goal.done;
    out.push({
      text: core.goal.title,
      detail: `${left === 1 ? 'Осталась' : 'Осталось'} ${left} ${left === 1 ? 'смена' : left < 5 ? 'смены' : 'смен'} из ${core.goal.target}`,
      icon: 'bag', pct: core.goal.pct,
    });
  }

  const left = core.level.need - core.level.done;
  if (left > 0) {
    out.push({
      text: `Уровень «${core.level.current.name}»`,
      detail: `${left === 1 ? 'Осталась' : 'Осталось'} ${left} ${left === 1 ? 'зачётная смена' : left < 5 ? 'зачётные смены' : 'зачётных смен'}`,
      icon: 'trophy', pct: core.level.pct,
    });
  }

  // Ближайший неполученный знак — тот, до которого меньше всего осталось
  const closest = core.badges
    .filter((b) => !b.earned && b.done > 0)
    .sort((a, b) => (b.done / b.need) - (a.done / a.need))[0];
  if (closest) {
    const rest = closest.need - closest.done;
    out.push({
      text: `Знак «${plainName(closest.name)}»`,
      detail: `${rest === 1 ? 'Остался' : 'Осталось'} ${rest} из ${closest.need}`,
      icon: closest.icon, pct: Math.round((closest.done / closest.need) * 100),
    });
  }

  if (core.access.state !== 'open' && core.access.reasons.length > 0) {
    out.push({
      text: 'Ранний выбор слотов',
      detail: core.access.reasons.join(' · '),
      icon: 'lock',
      pct: Math.min(100, Math.round((core.weekPoints / rules.access.minWeekPoints) * 100)),
    });
  }

  return out.slice(0, 3);
}

/**
 * Пересчитывает состояние курьера из журнала событий.
 * Чистая функция: одинаковый вход всегда даёт одинаковый выход.
 */
export function evaluate(events: CourierEvent[], rules: RulesConfig, ctx: EvaluateContext): Snapshot {
  const core = evaluateCore(events, rules, ctx);
  const feed = buildFeed(events, rules, ctx);
  const nudges = buildNudges(core, rules);
  return { ...core, feed, nudges, summary: summarize(core, feed, nudges, rules) };
}
