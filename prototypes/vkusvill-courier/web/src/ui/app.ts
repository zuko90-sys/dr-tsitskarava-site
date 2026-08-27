import { SCENARIOS } from '../state/scenarios';
import { getState, setScenario, setScreen, subscribe, type AppState } from '../state/store';
import { icon } from './icons';
import { headOf, renderScreen, SCREENS, TABS, type ScreenId } from './screens';
import { bindSimulator, renderSimulator } from './simulator';

let mount: HTMLElement;
let lastScreen: ScreenId = 'shift';

function shell(state: AppState): string {
  const screen = state.screen as ScreenId;
  const [title, sub] = headOf(state, screen);

  return '<div class="deck">'
    + '<p class="stamp">Концепт · не официальный продукт ВкусВилл'
    + '<span class="stamp__more"> · данные вымышлены</span></p>'
    + '<div class="profiles" role="group" aria-label="Сценарий недели">'
    + SCENARIOS.map((s) => `<button class="profile" type="button" data-scenario="${s.id}" `
      + `aria-pressed="${s.id === state.scenarioId}">${s.label}</button>`).join('')
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
    + TABS.map((t) => `<button class="tab" type="button" role="tab" id="t-${t.id}" `
      + `aria-selected="${t.id === screen}" aria-controls="panel" data-screen="${t.id}"`
      + `${t.id === screen ? '' : ' tabindex="-1"'}>${icon(t.icon, 1.7)}<span>${t.label}</span></button>`).join('')
    + '</nav></div></div>'

    + renderSimulator()
    + '</div>'

    + '<p class="hint">Слева — приложение, справа — симулятор событий. '
    + 'Всё, что вы видите на экране, посчитано движком правил из журнала: '
    + 'нажмите любое событие и цифры пересчитаются. Знаки в «Прогрессе» нажимаются.</p>';
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

  subscribe(paint);
  paint(getState());
}
