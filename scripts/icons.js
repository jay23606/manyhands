import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="108" fill="#102f3a"/><path d="m256 119 144 83v122l-144 83-144-83V202z" fill="#346958"/><path d="m112 202 144 83 144-83-144-83z" fill="#c6d8a6"/><path d="m256 285 144-83v122l-144 83z" fill="#5a9b79"/><path d="m256 170 57 33-57 33-57-33z" fill="#edf1c9"/><path d="m256 79 5 15 15 5-15 5-5 15-5-15-15-5 15-5z" fill="#eadba2"/></svg>`;
await mkdir("public/icons", { recursive: true });
await writeFile("public/icons/icon.svg", svg);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
for (const [size, name] of [
  [192, "icon-192.png"],
  [512, "icon-512.png"],
  [512, "icon-maskable-512.png"],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>body{margin:0}svg{width:100vw;height:100vh}</style>${svg}`,
  );
  await page.screenshot({ path: "public/icons/" + name });
}
await browser.close();
