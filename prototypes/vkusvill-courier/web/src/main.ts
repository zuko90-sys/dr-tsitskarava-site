import './ui/styles.css';
import { start } from './ui/app';

/**
 * Манифест для установки на экран «Домой». Собирается на лету, потому что
 * страница — один файл без соседей: start_url должен быть абсолютным, а он
 * разный у копии на сайте, в артефакте и на диске.
 */
function installManifest(): void {
  try {
    // В iframe (артефакт, превью) установка невозможна — и не нужна
    if (window.top !== window) return;
    const leaf = 'data:image/svg+xml,' + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='#2DBE64'/>"
      + "<path d='M46 14c0 18-11 26-24 26M22 40c0-13 9-20 24-26M15 50c2-4 4-6 7-8' stroke='white' stroke-width='4.5' fill='none' stroke-linecap='round'/></svg>",
    );
    const manifest = {
      name: 'Экран курьера — концепт',
      short_name: 'Курьер',
      lang: 'ru',
      start_url: location.href,
      scope: location.href.replace(/[^/]*$/, ''),
      display: 'standalone',
      background_color: '#E7EEE6',
      theme_color: '#2DBE64',
      icons: [{ src: leaf, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = URL.createObjectURL(blob);
    document.head.appendChild(link);
  } catch {
    // Без манифеста страница работает так же — просто без кнопки «Установить»
  }
}

installManifest();

const root = document.getElementById('root');
if (root) start(root);
