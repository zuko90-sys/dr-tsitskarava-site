import type {
  AccessState, BadgeRule, BadgeState, BucketId, CounterId, CourierEvent,
  EvaluateContext, FeedItem, LeagueRow, LevelState, Match, RulesConfig, Snapshot,
} from './types';

/* ─────────────────────────── ХЕЛПЕРЫ ─────────────────────────── */

/** Совпадает ли событие с образцом. Пустой образец совпадает со всем. */
function matches(event: CourierEvent, on: string, match?: Match): boolean {
  if (event.type !== on) return false;
  if (!match) return true;
  const bag = event as unknown as Record<string, unknown>;
  return Object.keys(match).every((k) => bag[k] === match[k]);
}

function clampPct(done: number, need: number): number {
  if (need <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((done / need) * 100)));
}

/* ─────────────────────────── СЧЁТЧИКИ ─────────────────────────── */

function countAll(events: CourierEvent[], ctx: EvaluateContext): Record<CounterId, number> {
  const c: Record<CounterId, number> = {
    missedSlots: 0, attendedSlots: 0, damageComplaints: 0, incidents: 0,
    lowRatings: 0, deliveries: 0, cleanDeliveries: 0, shifts: 0, cleanShifts: 0, qualifyingShifts: 0,
  };
  for (const e of events) {
    switch (e.type) {
      case 'slot_missed': if (!e.warnedAhead) c.missedSlots++; break;
      case 'slot_attended': c.attendedSlots++; break;
      case 'complaint': if (e.kind === 'damage') c.damageComplaints++; break;
      case 'incident': c.incidents++; break;
      case 'rating': if (e.stars < 4) c.lowRatings++; break;
      case 'delivery': c.deliveries++; if (e.clean) c.cleanDeliveries++; break;
      case 'shift_closed': c.shifts++; if (e.clean) c.cleanShifts++; break;
    }
  }
  // qualifyingShifts — весь накопленный путь, cleanShifts — только текущий журнал
  c.qualifyingShifts = c.cleanShifts + ctx.shiftsBefore;
  return c;
}

/* ─────────────────────────── БАЛЛЫ ─────────────────────────── */

function scorePoints(events: CourierEvent[], rules: RulesConfig) {
  const buckets: Record<BucketId, number> = { ratings: 0, slots: 0, tare: 0, help: 0 };
  const feed: FeedItem[] = [];

  for (const e of events) {
    const rule = rules.points.find((r) => matches(e, r.on, r.match));
    if (!rule) continue;
    buckets[rule.bucket] += rule.add;
    feed.push({ at: e.at, text: rule.label, delta: rule.add, bucket: rule.bucket });
  }

  // Строка баллов не может уйти в минус: отрицательная «оценка клиентов»
  // читается как долг перед компанией, а это не то, чем является плохая неделя.
  // Общий балл считается уже по обрезанным строкам, иначе разбор «из чего
  // баллы» не сойдётся с итогом, и первый же курьер это заметит.
  (Object.keys(buckets) as BucketId[]).forEach((k) => { buckets[k] = Math.max(0, buckets[k]); });
  const total = (Object.keys(buckets) as BucketId[]).reduce((s, k) => s + buckets[k], 0);

  return { total, buckets, feed: feed.reverse() };
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

/* ─────────────────────────── ГЛАВНОЕ ─────────────────────────── */

/**
 * Пересчитывает состояние курьера из журнала событий.
 * Чистая функция: одинаковый вход всегда даёт одинаковый выход.
 */
export function evaluate(events: CourierEvent[], rules: RulesConfig, ctx: EvaluateContext): Snapshot {
  const counters = countAll(events, ctx);
  const { total, buckets, feed } = scorePoints(events, rules);
  const level = levelOf(counters.qualifyingShifts, rules);
  const isRookie = ctx.dayNumber <= rules.rookieDays;

  const badgeRules = isRookie ? rules.rookieBadges : rules.badges;
  const badges = badgeRules.map((r) => badgeState(r, events, ctx.badgesBefore?.[r.id] ?? 0));

  const goalDone = events.filter((e) => matches(e, rules.goal.counts.on, rules.goal.counts.match)).length;

  const stars = events.filter((e): e is Extract<CourierEvent, { type: 'rating' }> => e.type === 'rating');
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
    fixes,
    feed,
    rating,
  };
}
