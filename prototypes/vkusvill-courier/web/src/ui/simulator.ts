import type { CourierEvent } from '../engine/types';
import { getState, pushEvent, resetScenario, undoEvent } from '../state/store';

interface Button {
  label: string;
  hint: string;
  make: () => CourierEvent;
  minus?: boolean;
}

/**
 * День для нового события — тот же, что у последнего в журнале.
 * Журнал хронологический, и лента группируется по дням: если раскладывать
 * новые события по кругу, один и тот же день появится в ленте дважды.
 */
function today(): string {
  const events = getState().events;
  return events.length > 0 ? events[events.length - 1].at : 'Пн';
}

const GROUPS: { label: string; items: Button[] }[] = [
  {
    label: 'Смена',
    items: [
      { label: 'Закрыл смену', hint: '+12', make: () => ({ type: 'shift_closed', at: today(), clean: true }) },
      { label: 'Смена с замечанием', hint: '+6', make: () => ({ type: 'shift_closed', at: today(), clean: false }) },
      { label: 'Вышел на слот', hint: '+5', make: () => ({ type: 'slot_attended', at: today() }) },
      { label: 'Предупредил и не вышел', hint: '0', make: () => ({ type: 'slot_missed', at: today(), warnedAhead: true }) },
      { label: 'Пропустил слот', hint: '−8', minus: true, make: () => ({ type: 'slot_missed', at: today(), warnedAhead: false }) },
    ],
  },
  {
    label: 'Доставки',
    items: [
      { label: 'Доставка без жалоб', hint: '', make: () => ({ type: 'delivery', at: today(), clean: true }) },
      { label: 'Оценка 5', hint: '+3', make: () => ({ type: 'rating', at: today(), stars: 5 }) },
      { label: 'Оценка 3', hint: '0', make: () => ({ type: 'rating', at: today(), stars: 3 }) },
      { label: 'Оценка 1', hint: '−6', minus: true, make: () => ({ type: 'rating', at: today(), stars: 1 }) },
      { label: 'Жалоба на упаковку', hint: '−5', minus: true, make: () => ({ type: 'complaint', at: today(), kind: 'damage' }) },
    ],
  },
  {
    label: 'Тара, помощь, инциденты',
    items: [
      { label: 'Вся тара сдана', hint: '+4', make: () => ({ type: 'tare_returned', at: today(), all: true }) },
      { label: 'Тара сдана не вся', hint: '0', minus: true, make: () => ({ type: 'tare_returned', at: today(), all: false }) },
      { label: 'Выручил коллегу', hint: '+6', make: () => ({ type: 'helped', at: today() }) },
      { label: 'Провёл новичка', hint: '+10', make: () => ({ type: 'mentored', at: today() }) },
      { label: 'Падение или ДТП', hint: '0', minus: true, make: () => ({ type: 'incident', at: today() }) },
    ],
  },
];

export function renderSimulator(): string {
  const s = getState();
  const base = s.events.length;

  return '<aside class="sim">'
    + '<h2>Подать событие</h2>'
    + '<p class="sim__lead">Всё на экране пересчитывается из журнала событий. '
    + 'Нажмите любую кнопку и посмотрите, что изменится: балл, знаки, место в лиге, доступ к слотам.</p>'
    + GROUPS.map((g, gi) => `<div class="sim__group"><p class="sim__label">${g.label}</p><div class="sim__row">`
      + g.items.map((b, bi) => `<button class="ev${b.minus ? ' ev--minus' : ''}" type="button" `
        + `data-ev="${gi}:${bi}">${b.label}${b.hint ? ` <b>${b.hint}</b>` : ''}</button>`).join('')
      + '</div></div>').join('')
    + '<div class="sim__stat"><span>Событий в журнале</span>'
    + `<b class="num">${base}</b></div>`
    + '<div class="sim__stat"><span>Балл недели</span>'
    + `<b class="num">${s.snapshot.weekPoints}</b></div>`
    + '<div class="sim__stat"><span>Место в лиге</span>'
    + `<b class="num">${s.snapshot.isRookie ? '—' : `${s.snapshot.league.rank} из ${s.snapshot.league.size}`}</b></div>`
    + '<div class="sim__foot">'
    + '<button class="ev ev--ghost" type="button" data-sim="undo">Отменить последнее</button>'
    + '<button class="ev ev--ghost" type="button" data-sim="reset">Сбросить сценарий</button>'
    + '</div></aside>';
}

/** Один делегированный обработчик: разметка симулятора пересобирается на каждый рендер. */
export function bindSimulator(root: HTMLElement): void {
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest<HTMLElement>('[data-ev], [data-sim]');
    if (!btn) return;

    const sim = btn.dataset.sim;
    if (sim === 'undo') { undoEvent(); return; }
    if (sim === 'reset') { resetScenario(); return; }

    const ref = btn.dataset.ev;
    if (!ref) return;
    const [gi, bi] = ref.split(':').map(Number);
    const item = GROUPS[gi]?.items[bi];
    if (item) pushEvent(item.make());
  });
}
