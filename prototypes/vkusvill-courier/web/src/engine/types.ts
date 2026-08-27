/**
 * Типы движка мотивации.
 *
 * Главный принцип: движок — чистая функция от журнала событий.
 * Состояние курьера нигде не хранится и не мутируется, оно каждый раз
 * пересчитывается из событий. Это значит, что правила можно менять
 * задним числом и сразу видеть, что получилось бы, а спор «почему у меня
 * такой балл» всегда разрешается предъявлением журнала.
 */

/* ─────────────────────────── СОБЫТИЯ ─────────────────────────── */

/** Всё, что система уже умеет фиксировать по ходу смены. */
export type CourierEvent =
  | { type: 'shift_closed'; at: string; clean: boolean }
  | { type: 'delivery'; at: string; clean: boolean }
  | { type: 'rating'; at: string; stars: 1 | 2 | 3 | 4 | 5 }
  | { type: 'tare_returned'; at: string; all: boolean }
  | { type: 'slot_attended'; at: string }
  | { type: 'slot_missed'; at: string; warnedAhead: boolean }
  | { type: 'complaint'; at: string; kind: 'damage' | 'late' | 'other' }
  | { type: 'incident'; at: string }
  | { type: 'mentored'; at: string }
  | { type: 'helped'; at: string };

export type EventType = CourierEvent['type'];

/** Частичное совпадение по полям события. Пусто — совпадает всё. */
export type Match = Record<string, string | number | boolean>;

/* ─────────────────────────── ПРАВИЛА ─────────────────────────── */

/** Строки, из которых складывается недельный балл. */
export type BucketId = 'ratings' | 'slots' | 'tare' | 'help';

export interface PointRule {
  on: EventType;
  match?: Match;
  /** Может быть отрицательным — но только за то, что курьер контролирует. */
  add: number;
  bucket: BucketId;
  label: string;
}

export interface LevelRule {
  id: string;
  name: string;
  /** Сколько зачётных смен нужно накопить, чтобы дойти до уровня. */
  shifts: number;
}

export interface BadgeRule {
  id: string;
  name: string;
  icon: string;
  how: string;
  need: number;
  counts: { on: EventType; match?: Match };
  /** Событие, которое обнуляет счётчик знака. Прогресс уровня не трогает. */
  resets?: { on: EventType; match?: Match }[];
}

export interface GoalRule {
  id: string;
  title: string;
  target: number;
  counts: { on: EventType; match?: Match };
  reward: string;
}

/** Счётчики, на которые опираются подсказки «что подтянуть». */
export type CounterId =
  | 'missedSlots'
  | 'attendedSlots'
  | 'damageComplaints'
  | 'incidents'
  | 'lowRatings'
  | 'deliveries'
  | 'cleanDeliveries'
  | 'shifts'
  | 'cleanShifts'
  | 'qualifyingShifts';

export interface FixRule {
  id: string;
  when: { counter: CounterId; gte: number };
  title: string;
  /** {n} подставляется значением счётчика. */
  text: string;
}

/**
 * Ранний выбор слотов — единственное, чем управляет результат недели.
 * Поток заказов и ставка не зависят от уровня ни при каких условиях:
 * как только статус начинает влиять на доход, это перестаёт быть игрой
 * и становится системой оплаты труда со всеми последствиями.
 */
export interface AccessRule {
  minWeekPoints: number;
  maxMissedSlots: number;
  /** Раньше этого уровня ранний доступ не открывается вообще. */
  fromLevel: string;
  /** Сколько недель подряд можно не дотягивать до приостановки. */
  graceWeeks: number;
}

export interface LeagueRule {
  name: string;
  /** Соседи по лиге: тот же район, тот же транспорт, сопоставимый стаж. */
  cohort: { name: string; points: number }[];
  /** Сколько человек уходит вверх. Вниз не уходит никто. */
  promote: number;
}

export interface RulesConfig {
  version: string;
  /** Сколько дней новичок не сравнивается ни с кем. */
  rookieDays: number;
  points: PointRule[];
  levels: LevelRule[];
  badges: BadgeRule[];
  rookieBadges: BadgeRule[];
  goal: GoalRule;
  fixes: FixRule[];
  access: AccessRule;
  league: LeagueRule;
}

/* ─────────────────────────── РЕЗУЛЬТАТ ─────────────────────────── */

export interface BadgeState {
  id: string;
  name: string;
  icon: string;
  how: string;
  done: number;
  need: number;
  earned: boolean;
  /** Знак был получен и обнулился — это видно и объясняется. */
  wasReset: boolean;
}

export interface LevelState {
  current: LevelRule;
  next: LevelRule | null;
  done: number;
  need: number;
  pct: number;
}

export interface LeagueRow {
  pos: number;
  who: string;
  points: number;
  me: boolean;
  cut: boolean;
}

export interface AccessState {
  state: 'open' | 'warn' | 'off';
  title: string;
  sub: string;
  reasons: string[];
}

export interface FeedItem {
  at: string;
  text: string;
  delta: number;
  bucket: BucketId | null;
}

export interface Snapshot {
  dayNumber: number;
  isRookie: boolean;
  weekPoints: number;
  buckets: Record<BucketId, number>;
  counters: Record<CounterId, number>;
  level: LevelState;
  badges: BadgeState[];
  goal: { title: string; done: number; target: number; pct: number; reward: string };
  league: { name: string; size: number; rank: number; rows: LeagueRow[]; promote: number };
  access: AccessState;
  fixes: { title: string; text: string }[];
  feed: FeedItem[];
  /** Средняя оценка за неделю, null — если оценок ещё не было. */
  rating: number | null;
}

export interface EvaluateContext {
  /** Номер дня работы курьера. Передаётся явно, чтобы расчёт был воспроизводим. */
  dayNumber: number;
  /** Зачётные смены, накопленные до начала журнала. */
  shiftsBefore: number;
  /**
   * Прогресс знаков, накопленный до начала журнала: id знака → счётчик.
   * Журнал здесь охватывает неделю, а знаки набираются месяцами.
   * Сбрасывающее событие обнуляет и накопленное раньше — это честно:
   * иначе «100 заказов подряд» перестало бы означать подряд.
   */
  badgesBefore?: Record<string, number>;
  /** Сколько недель подряд курьер уже не дотягивает до порога. */
  weeksBelow: number;
  courierName: string;
}
