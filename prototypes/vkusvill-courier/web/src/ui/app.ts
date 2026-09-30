import type { ExcuseId } from '../engine/types';
import { disputable } from '../state/appeals';
import { SCENARIOS } from '../state/scenarios';
import {
  ackIncident, closeSheet, contest, getState, openSheet, pickDispute, resolveAppeal,
  setScenario, setScreen, subscribe, takeRest, toggleCheck, toggleSlot,
  type AppState, type SheetId,
} from '../state/store';
import { appealSheet, rulesSheet } from './components';
import { icon } from './icons';
import { headOf, renderScreen, SCREENS, TABS, type ScreenId } from './screens';
import { bindSimulator, renderSimulator } from './simulator';

/** Chrome отдаёт это событие, когда страницу можно поставить на экран «Домой». */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

let mount: HTMLElement;
let lastScreen: ScreenId = 'shift';
let lastSheet: SheetId | null = null;
let installPrompt: InstallPrompt | null = null;

const isIos = (): boolean =>
  /iP(hone|ad|od)/.test(navigator.userAgent) && !(navigator as { standalone?: boolean }).standalone;

function shell(state: AppState): string {
  const screen = state.screen as ScreenId;
  const [title, sub] = headOf(state, screen);

  return '<div class="deck">'
    + '<p class="stamp">Концепт · не официальный продукт ВкусВилл'
    + '<span class="stamp__more"> · данные вымышлены</span></p>'
    + '<div class="deck__row">'
    + '<div class="profiles" role="group" aria-label="Сценарий недели">'
    + SCENARIOS.map((s) => `<button class="profile" type="button" data-scenario="${s.id}" `
      + `aria-pressed="${s.id === state.scenarioId}">${s.label}</button>`).join('')
    + '</div>'
    + (installPrompt ? `<button class="install" type="button" data-install>${icon('download', 2)}Установить</button>` : '')
    + '</div></div>'

    + '<div class="stage">'
    + '<div class="phone"><div class="app">'
    + '<div class="status" aria-hidden="true"><span class="num">9:41</span>'
    + '<span class="status__icons"><i></i><i></i><i></i></span></div>'
    + '<div class="appbar"><div>'
    + `<div class="appbar__title">${title}</div>`
    + `<div class="appbar__sub">${sub}</div></div>`
    + `<div class="avatar" aria-hidden="true">${state.profile.initial}</div></div>`
    + `<div class="viewport" id="viewport"><section class="screen" id="panel" role="tabpanel" `
    + `aria-labelledby="t-${screen}">${renderScreen(state, screen)}</section></div>`
    + '<p class="sr" role="status" aria-live="polite" id="announce"></p>'
    + '<nav class="tabbar" role="tablist" aria-label="Разделы приложения">'
    + TABS.map((t) => {
      const dot = t.id === 'feed' && state.unreadFeed > 0
        ? `<span class="tab__dot num" aria-label="новых событий: ${state.unreadFeed}">${Math.min(99, state.unreadFeed)}</span>`
        : '';
      return `<button class="tab" type="button" role="tab" id="t-${t.id}" `
        + `aria-selected="${t.id === screen}" aria-controls="panel" data-screen="${t.id}"`
        + `${t.id === screen ? '' : ' tabindex="-1"'}>${icon(t.icon, 1.7)}`
        + `<span>${t.label}</span>${dot}</button>`;
    }).join('')
    + '</nav>'
    + (state.sheet === 'appeal'
      ? appealSheet(disputable(state.events), state.appeals, state.picked)
      : state.sheet === 'rules' ? rulesSheet() : '')
    + '</div></div>'

    + renderSimulator()
    + '</div>'

    + '<p class="hint">Слева — приложение, справа — симулятор событий. '
    + 'Всё, что вы видите на экране, посчитано движком правил из журнала: '
    + 'нажмите любое событие и цифры пересчитаются. Знаки в «Прогрессе» нажимаются.'
    + (isIos() ? ' На iPhone страницу можно поставить на экран «Домой»: Поделиться → «На экран „Домой“».' : '')
    + '</p>';
}

function paint(state: AppState): void {
  const screen = state.screen as ScreenId;
  const dir = SCREENS.indexOf(screen) >= SCREENS.indexOf(lastScreen) ? '14px' : '-14px';
  lastScreen = screen;

  mount.innerHTML = shell(state);
  const panel = mount.querySelector<HTMLElement>('#panel');
  panel?.style.setProperty('--from', dir);

  // Кольца и полосы анимируются только после вставки в документ
  requestAnimationFrame(() => requestAnimationFrame(() => {
    mount.querySelectorAll('.ring, .bar').forEach((el) => el.classList.add('is-drawn'));
  }));

  const announce = mount.querySelector('#announce');
  if (announce) announce.textContent = TABS.find((t) => t.id === screen)?.label ?? '';

  // Фокус идёт за шторкой: открылась — внутрь, закрылась — обратно на кнопку,
  // которая её открыла. Иначе с клавиатуры и из скринридера шторки нет.
  if (state.sheet && state.sheet !== lastSheet) {
    mount.querySelector<HTMLElement>('.sheet')?.focus();
  } else if (!state.sheet && lastSheet) {
    const back = mount.querySelector<HTMLElement>(`[data-sheet-open="${lastSheet}"]`)
      ?? mount.querySelector<HTMLElement>('.tab[aria-selected="true"]');
    back?.focus();
  }
  lastSheet = state.sheet;
}

/** Короткое сообщение поверх телефона — для действий, которых в демо нет. */
function toast(msg: string): void {
  const app = mount.querySelector('.app');
  if (!app) return;
  app.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  app.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function step(delta: number): void {
  const i = SCREENS.indexOf(getState().screen as ScreenId) + delta;
  if (i < 0 || i >= SCREENS.length) return;
  setScreen(SCREENS[i]);
}

export function start(root: HTMLElement): void {
  mount = root;

  // Все обработчики делегированы: разметка полностью пересобирается на каждый рендер
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target?.closest) return;

    const sheetOpen = target.closest<HTMLElement>('[data-sheet-open]');
    if (sheetOpen?.dataset.sheetOpen) { openSheet(sheetOpen.dataset.sheetOpen as SheetId); return; }
    if (target.closest('[data-sheet-close]')) { closeSheet(); return; }

    const pick = target.closest<HTMLElement>('[data-pick]');
    if (pick) { pickDispute(Number(pick.dataset.pick)); return; }
    const reason = target.closest<HTMLElement>('[data-reason]');
    if (reason?.dataset.reason) { contest(Number(reason.dataset.index), reason.dataset.reason as ExcuseId); return; }
    const resolve = target.closest<HTMLElement>('[data-appeal-resolve]');
    if (resolve) { resolveAppeal(Number(resolve.dataset.appealResolve)); return; }

    if (target.closest('[data-rest]')) { takeRest(); toast('Завтрашний слот освобождён заранее. 0 баллов — это не пропуск.'); return; }
    if (target.closest('[data-ack]')) { ackIncident(); return; }
    if (target.closest('[data-install]')) { void install(); return; }

    const slot = target.closest<HTMLElement>('[data-slot]');
    if (slot?.dataset.slot) { toggleSlot(slot.dataset.slot); return; }
    const check = target.closest<HTMLElement>('[data-check]');
    if (check) { toggleCheck(Number(check.dataset.check)); return; }
    if (target.closest('[data-call]')) {
      toast('В демо звонки отключены. В настоящем приложении здесь набирается наставник.');
      return;
    }

    const tab = target.closest<HTMLElement>('.tab');
    if (tab?.dataset.screen) { setScreen(tab.dataset.screen); return; }

    const scenario = target.closest<HTMLElement>('[data-scenario]');
    if (scenario?.dataset.scenario) { setScenario(scenario.dataset.scenario); return; }

    const badge = target.closest<HTMLElement>('.badge');
    if (badge) {
      const box = root.querySelector<HTMLElement>('[data-how-box]');
      const wasOpen = badge.getAttribute('aria-expanded') === 'true';
      root.querySelectorAll('.badge').forEach((b) => b.setAttribute('aria-expanded', 'false'));
      if (!box) return;
      if (wasOpen) { box.hidden = true; box.innerHTML = ''; return; }
      badge.setAttribute('aria-expanded', 'true');
      box.innerHTML = badge.dataset.how ?? '';
      box.hidden = false;
    }
  });

  bindSimulator(root);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSheet(); return; }
    // Пока открыта шторка, стрелки не листают экраны под ней
    if (getState().sheet !== null) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });

  // Свайп по области экрана
  let x0: number | null = null;
  let y0 = 0;
  root.addEventListener('touchstart', (e) => {
    if (!(e.target as HTMLElement)?.closest?.('#viewport') || e.touches.length !== 1) { x0 = null; return; }
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0;
    const dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  // Установка на экран «Домой»: кнопка появляется, только когда браузер готов
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e as InstallPrompt;
    paint(getState());
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    paint(getState());
  });

  subscribe(paint);
  paint(getState());
}

async function install(): Promise<void> {
  const p = installPrompt;
  if (!p) return;
  installPrompt = null;
  paint(getState());
  try { await p.prompt(); } catch { /* пользователь передумал — это нормально */ }
}
