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

/**
 * Причина «не по моей вине». Событие с такой пометкой остаётся в журнале —
 * его видно, — но не считается: ни в балл, ни в счётчики, ни в сброс знаков.
 * Кто ставит пометку, решает таблица excuses в правилах: часть причин
 * подтверждает сама система, остальные проверяет управляющий точкой.
 */
export type ExcuseId = 'store_delay' | 'weather' | 'app_failure' | 'incident' | 'customer' | 'health' | 'other';

/** За что клиент похвалил. «Быстро» здесь нет намеренно: скорость не поощряется нигде. */
export type ComplimentId = 'polite' | 'careful' | 'helpful' | 'tare';

/** Всё, что система уже умеет фиксировать по ходу смены. */
export type CourierEvent =
  | { type: 'shift_closed'; at: string; clean: boolean; hours?: number }
  | { type: 'delivery'; at: string; clean: boolean }
  | { type: 'rating'; at: string; stars: 1 | 2 | 3 | 4 | 5; compliment?: ComplimentId; excused?: ExcuseId }
  | { type: 'tare_returned'; at: string; all: boolean }
  | { type: 'slot_attended'; at: string }
  | { type: 'slot_missed'; at: string; warnedAhead: boolean; excused?: ExcuseId }
  | { type: 'complaint'; at: string; kind: 'damage' | 'late' | 'other'; excused?: ExcuseId }
  | { type: 'incident'; at: string }
  | { type: 'mentored'; at: string }
  | { type: 'helped'; at: string }
  /** «Спасибо» от коллеги или сотрудника точки — с именем и словами. */
  | { type: 'kudos'; at: string; from: string; text: string };

export type EventType = CourierEvent['type'];

/** События, у которых бывает пометка «не по моей вине». */
export type Contestable = Extract<CourierEvent, { excused?: ExcuseId }>;

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
  | 'qualifyingShifts'
  | 'hours'
  | 'excused'
  | 'kudos';

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

export interface ExcuseRule {
  id: ExcuseId;
  label: string;
  /** true — подтверждает система, применяется сразу. false — проверяет управляющий. */
  auto: boolean;
  /** Чем подтверждается. Показывается курьеру, чтобы решение не было «чёрным ящиком». */
  proof: string;
}

/**
 * Нагрузка. Это единственные правила про время в системе — и они работают
 * в обратную сторону: не «больше», а «хватит».
 */
export interface LoadRule {
  /** Часов в неделю, после которых счётчик становится красным. */
  maxWeekHours: number;
  /** Сколько дней подряд можно работать до того, как приложение предложит выходной. */
  restAfterDays: number;
  /** Длина смены, если событие её не указало. */
  shiftHours: number;
}

export interface RuleChange {
  version: string;
  date: string;
  text: string;
}

export interface RulesConfig {
  version: string;
  /** С какого числа действует текущая версия. */
  since: string;
  /** Что менялось — новое сверху. Обязательная часть правил, а не примечание к релизу. */
  changes: RuleChange[];
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
  excuses: ExcuseRule[];
  compliments: { id: ComplimentId; label: string }[];
  load: LoadRule;
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

export interface LoadState {
  hours: number;
  maxHours: number;
  /** Рабочих дней подряд к концу журнала, с учётом накопленного до него. */
  daysInRow: number;
  restAfterDays: number;
  /** Пора выходной. Единственная подсказка в системе, которая просит работать меньше. */
  rest: boolean;
}

/** Тёплые слова за неделю: комплименты клиентов и спасибо с точки. */
export interface Praise {
  id: string;
  label: string;
  count: number;
}

/**
 * Лента: что произошло и во что это превратилось.
 *
 * Вехи (знак, уровень, доступ к слотам) вычисляются сравнением состояния
 * до и после каждого события, а не выписываются руками. Поэтому лента не
 * может разойтись с тем, что показано на экранах: и то и другое считает
 * один движок.
 */
export type FeedKind =
  | 'points'        // обычное начисление, повторы сворачиваются
  | 'excused'       // событие есть, но не учтено: не по вине курьера
  | 'kudos'         // спасибо от коллеги или комплимент клиента
  | 'badge'         // знак получен
  | 'badge_reset'   // счётчик знака пошёл заново
  | 'level'         // поднялся уровень
  | 'goal'          // закрыта цель недели
  | 'access'        // изменился доступ к слотам
  | 'rank'          // пересёк линию перехода в лиге
  | 'rest';         // слишком много дней подряд — пора выходной

export interface FeedEntry {
  at: string;
  kind: FeedKind;
  text: string;
  detail?: string;
  delta: number;
  /** Сколько одинаковых начислений свёрнуто в эту строку. */
  count: number;
  icon: string;
}

/** Ближайший достижимый порог — чтобы курьер знал, ради чего следующая смена. */
export interface Nudge {
  text: string;
  detail: string;
  icon: string;
  pct: number;
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
  load: LoadState;
  praise: Praise[];
  fixes: { title: string; text: string }[];
  feed: FeedEntry[];
  nudges: Nudge[];
  /** Средняя оценка за неделю без неучтённых, null — если оценок ещё не было. */
  rating: number | null;
  /** Неделя словами: три-четыре предложения, собранные из тех же цифр. */
  summary: string;
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
  /** Рабочих дней подряд к началу журнала: журнал недельный, а усталость — нет. */
  workedInRowBefore?: number;
  courierName: string;
}
