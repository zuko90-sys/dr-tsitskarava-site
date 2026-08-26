// Собирает artifact.html из index.html.
// index.html — источник правды (открывается локально двойным кликом).
// artifact.html — та же страница без обёртки html/head/body: Claude Artifacts
// добавляет скелет и meta charset сами. Запуск: node build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

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

let html = readFileSync(join(dir, "index.html"), "utf8");
for (const re of STRIP) html = html.replace(re, "");

if (!/^<title>/m.test(html)) {
  throw new Error("В artifact.html не осталось <title> — проверьте index.html");
}

writeFileSync(join(dir, "artifact.html"), html.trimStart(), "utf8");
console.log("artifact.html собран,", html.trim().length, "байт");
