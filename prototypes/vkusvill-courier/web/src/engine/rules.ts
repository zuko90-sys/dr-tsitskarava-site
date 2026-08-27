import type { RulesConfig } from './types';

/**
 * ПРАВИЛА. Это данные, а не код.
 *
 * Здесь нет ни одного `if` — только таблица «событие → последствие».
 * В боевой системе этот файл лежал бы в конфиге и правился без релиза
 * в сторах: иначе каждая правка механики стоит две недели раскатки,
 * а править придётся постоянно.
 *
 * Чего здесь намеренно нет и не будет:
 *  · скорости доставки и времени в пути в любом виде;
 *  · серий без выходных, которые обнуляются;
 *  · влияния уровня на поток заказов и на ставку.
 */
export const RULES: RulesConfig = {
  version: '1.0',
  rookieDays: 14,

  /* ─── Баллы качества за неделю ─────────────────────────────────── */
  points: [
    { on: 'shift_closed', match: { clean: true }, add: 12, bucket: 'slots', label: 'Смена без замечаний' },
    { on: 'shift_closed', match: { clean: false }, add: 6, bucket: 'slots', label: 'Смена закрыта' },

    { on: 'slot_attended', add: 5, bucket: 'slots', label: 'Вышел на слот' },
    // Пропуск, о котором предупредили заранее, не штрафуется: цель правила —
    // чтобы человек предупреждал, а не чтобы выходил больным.
    { on: 'slot_missed', match: { warnedAhead: true }, add: 0, bucket: 'slots', label: 'Слот освобождён заранее' },
    { on: 'slot_missed', match: { warnedAhead: false }, add: -8, bucket: 'slots', label: 'Слот пропущен без предупреждения' },

    { on: 'rating', match: { stars: 5 }, add: 3, bucket: 'ratings', label: 'Оценка 5' },
    { on: 'rating', match: { stars: 4 }, add: 1, bucket: 'ratings', label: 'Оценка 4' },
    { on: 'rating', match: { stars: 3 }, add: 0, bucket: 'ratings', label: 'Оценка 3' },
    { on: 'rating', match: { stars: 2 }, add: -3, bucket: 'ratings', label: 'Оценка 2' },
    { on: 'rating', match: { stars: 1 }, add: -6, bucket: 'ratings', label: 'Оценка 1' },

    { on: 'tare_returned', match: { all: true }, add: 4, bucket: 'tare', label: 'Вся тара вернулась' },
    { on: 'tare_returned', match: { all: false }, add: 0, bucket: 'tare', label: 'Тара вернулась частично' },

    { on: 'complaint', match: { kind: 'damage' }, add: -5, bucket: 'ratings', label: 'Жалоба на повреждение' },
    { on: 'complaint', match: { kind: 'late' }, add: -2, bucket: 'ratings', label: 'Жалоба на опоздание' },
    { on: 'complaint', match: { kind: 'other' }, add: -2, bucket: 'ratings', label: 'Жалоба' },

    { on: 'helped', add: 6, bucket: 'help', label: 'Помог коллеге' },
    { on: 'mentored', add: 10, bucket: 'help', label: 'Провёл смену с новичком' },

    // Инцидент баллов не отнимает. Штраф за ДТП заставляет их скрывать,
    // а нужно ровно обратное — чтобы о падении узнали сразу.
    { on: 'incident', add: 0, bucket: 'slots', label: 'Инцидент зафиксирован' },
  ],

  /* ─── Уровни: считаются зачётными сменами, а не очками ──────────── */
  levels: [
    { id: 'rookie', name: 'Новичок', shifts: 10 },
    { id: 'own', name: 'Свой человек', shifts: 30 },
    { id: 'local', name: 'Знаток района', shifts: 90 },
    { id: 'mentor', name: 'Наставник', shifts: 180 },
    { id: 'pillar', name: 'Опора точки', shifts: 360 },
  ],

  /* ─── Знаки: за то, что не измеряется деньгами ──────────────────── */
  badges: [
    {
      id: 'care', name: 'Бережная<br>доставка', icon: 'shield', need: 100,
      how: '<b>Бережная доставка.</b> 100 заказов подряд без повреждений и жалоб на состояние продуктов.',
      counts: { on: 'delivery', match: { clean: true } },
      resets: [{ on: 'complaint', match: { kind: 'damage' } }],
    },
    {
      id: 'zero', name: 'Ноль<br>инцидентов', icon: 'alert', need: 30,
      how: '<b>Ноль инцидентов.</b> 30 смен подряд без ДТП, падений и обращений в травмпункт.',
      counts: { on: 'shift_closed' },
      resets: [{ on: 'incident' }],
    },
    {
      id: 'tare', name: 'Тара<br>на месте', icon: 'bag', need: 15,
      how: '<b>Тара на месте.</b> 15 смен подряд, в которые все термосумки вернулись на точку.',
      counts: { on: 'tare_returned', match: { all: true } },
      resets: [{ on: 'tare_returned', match: { all: false } }],
    },
    {
      id: 'local', name: 'Знаток<br>района', icon: 'pin', need: 200,
      how: '<b>Знаток района.</b> 200 доставок в одном районе. Ты знаешь домофоны, дворы и где не проехать.',
      counts: { on: 'delivery' },
    },
    {
      id: 'mentor', name: 'Наставник', icon: 'users', need: 3,
      how: '<b>Наставник.</b> Провести трёх новичков через первую неделю.',
      counts: { on: 'mentored' },
    },
    {
      id: 'helper', name: 'Своё<br>плечо', icon: 'hand', need: 10,
      how: '<b>Своё плечо.</b> Десять раз выручить коллегу на точке — подменить, забрать заказ, довезти забытое.',
      counts: { on: 'helped' },
    },
  ],

  /**
   * Первые две недели — отдельный набор.
   * Пустая сетка серых знаков в первый день демотивирует сильнее,
   * чем отсутствие наград вообще.
   */
  rookieBadges: [
    {
      id: 'first_delivery', name: 'Первый<br>заказ', icon: 'flag', need: 1,
      how: '<b>Первый заказ.</b> Взят и доставлен. Дальше будет проще.',
      counts: { on: 'delivery' },
    },
    {
      id: 'first_shift', name: 'Первая<br>смена', icon: 'clock', need: 1,
      how: '<b>Первая смена.</b> Отработана целиком, от начала до конца.',
      counts: { on: 'shift_closed' },
    },
    {
      id: 'first_five', name: 'Первые<br>пять звёзд', icon: 'star', need: 1,
      how: '<b>Первые пять звёзд.</b> Клиент поставил высшую оценку.',
      counts: { on: 'rating', match: { stars: 5 } },
    },
    {
      id: 'ten', name: 'Десять<br>заказов', icon: 'box', need: 10,
      how: '<b>Десять заказов.</b> Обычно набирается за две смены.',
      counts: { on: 'delivery' },
    },
    {
      id: 'tare_week', name: 'Тара<br>на месте', icon: 'bag', need: 5,
      how: '<b>Тара на месте.</b> Пять смен подряд, в которые вся тара вернулась.',
      counts: { on: 'tare_returned', match: { all: true } },
      resets: [{ on: 'tare_returned', match: { all: false } }],
    },
    {
      id: 'local_start', name: 'Знаток<br>района', icon: 'pin', need: 200,
      how: '<b>Знаток района.</b> 200 доставок в одном районе. Это надолго — и это нормально.',
      counts: { on: 'delivery' },
    },
  ],

  /* ─── Цель недели: одна, а не пять ──────────────────────────────── */
  goal: {
    id: 'tare',
    title: 'Все термосумки вернулись на точку',
    // Цель считается сменами недели, а не абстрактным числом:
    // недостижимая цель хуже, чем отсутствие цели.
    target: 5,
    counts: { on: 'tare_returned', match: { all: true } },
    reward: 'Выполнишь — слоты на следующую неделю откроются тебе в четверг, а не в пятницу',
  },

  /* ─── Что подтянуть ─────────────────────────────────────────────── */
  fixes: [
    {
      id: 'slots',
      when: { counter: 'missedSlots', gte: 1 },
      title: 'Пропущенных слотов: {n}',
      text: 'Если не получается выйти — отметь в приложении накануне. Слот уйдёт другому и не будет засчитан как пропуск.',
    },
    {
      id: 'damage',
      when: { counter: 'damageComplaints', gte: 1 },
      title: 'Жалоб на повреждения: {n}',
      text: 'Обычно это крепление термосумки на багажнике. Тимур с точки показывает за пять минут.',
    },
    {
      id: 'ratings',
      when: { counter: 'lowRatings', gte: 2 },
      title: 'Оценок ниже четырёх: {n}',
      text: 'Чаще всего дело в том, что клиента не предупредили о замене позиции. Сообщение в чат заказа занимает десять секунд.',
    },
    {
      id: 'incident',
      when: { counter: 'incidents', gte: 1 },
      title: 'Зафиксирован инцидент',
      text: 'Баллы за это не снимаются. Но знак «Ноль инцидентов» начинает набираться заново — и это единственное последствие.',
    },
  ],

  /* ─── Ранний выбор слотов ───────────────────────────────────────── */
  access: {
    minWeekPoints: 75,
    maxMissedSlots: 1,
    fromLevel: 'own',
    graceWeeks: 1,
  },

  /* ─── Лига: 24 человека похожего профиля ────────────────────────── */
  league: {
    name: 'Лига Юго-Запада',
    promote: 6,
    // Баллы соседей заданы в той же шкале, которую считает движок
    // (ровная неделя ≈ 214, просевшая ≈ 85). Иначе место в лиге
    // получается бессмысленным: свои баллы из одной системы, чужие из другой.
    cohort: [
      { name: 'Оля Д.', points: 271 }, { name: 'Пётр Ж.', points: 259 },
      { name: 'Ильдар Х.', points: 248 }, { name: 'Марина К.', points: 239 },
      { name: 'Тимур А.', points: 231 }, { name: 'Женя Л.', points: 222 },
      { name: 'Артём В.', points: 208 }, { name: 'Настя Ш.', points: 199 },
      { name: 'Данила Р.', points: 191 }, { name: 'Вера П.', points: 184 },
      { name: 'Марат З.', points: 176 }, { name: 'Юля Е.', points: 168 },
      { name: 'Гриша О.', points: 159 }, { name: 'Алиса К.', points: 148 },
      { name: 'Кирилл С.', points: 137 }, { name: 'Лена Б.', points: 124 },
      { name: 'Саша Н.', points: 110 }, { name: 'Рома Ф.', points: 96 },
      { name: 'Гуля М.', points: 79 }, { name: 'Влад Т.', points: 68 },
      { name: 'Тоня И.', points: 54 }, { name: 'Слава Ю.', points: 41 },
      { name: 'Эдик Л.', points: 27 },
    ],
  },
};
