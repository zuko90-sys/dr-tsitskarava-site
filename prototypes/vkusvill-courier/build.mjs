// Собирает артефактные версии страниц.
// *.html — источники правды, открываются локально двойным кликом.
// *.artifact.html — та же страница без обёртки html/head/body: Claude Artifacts
// добавляет скелет и meta charset сами. Запуск: node build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const PAGES = [
  ["index.html", "artifact.html"], // разбор концепта: телефон + обоснования
  ["app.html", "app.artifact.html"], // только экран приложения
];

const STRIP = [
  /^<!doctype html>\n/i,
  /^<html lang="ru">\n/im,
  /^<head>\n/im,
  /^<\/head>\n/im,
  /^<body>\n/im,
  /^<\/body>\n/im,
  /^<\/html>\n?/im,
  /^<meta charset="utf-8">\n/im,
  /^<meta name="viewport"[^>]*>\n/im,
  /^<meta name="robots"[^>]*>\n/im,
];

for (const [src, out] of PAGES) {
  let html = readFileSync(join(dir, src), "utf8");
  for (const re of STRIP) html = html.replace(re, "");
  html = html.trimStart();

  if (!html.startsWith("<title>")) {
    throw new Error(`${out}: <title> должен остаться первой строкой — проверьте ${src}`);
  }
  if (/<!doctype|<html|<head>|<body>/i.test(html)) {
    throw new Error(`${out}: обёртка снята не полностью`);
  }

  writeFileSync(join(dir, out), html, "utf8");
  console.log(`${out} собран, ${html.length} байт`);
}
