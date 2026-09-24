/** Bundles the promo into self-contained pages: promo/dist/index.html (+ assets/) and the cover, promo/dist/cover.html. */
import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('./', import.meta.url));
const OUT = `${HERE}dist/`;
// The soundtrack is not part of the repository; it is expected at promo/assets/bgm.mp3.
if (!existsSync(`${HERE}assets/bgm.mp3`)) throw new Error('promo/assets/bgm.mp3 is missing: put the soundtrack there');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const bundle = async (entry) => (await esbuild.build({ entryPoints: [`${HERE}src/${entry}`], bundle: true, format: 'iife', write: false, minify: true, target: 'es2022' })).outputFiles[0].text.replace(/<\/script/gi, '<\/script');
const js = await bundle('main.js');
const css = readFileSync(`${HERE}src/style.css`, 'utf8');
writeFileSync(`${OUT}index.html`, `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Coopanion 宣传片</title>
<style>${css}</style>
</head>
<body>
<div id="viewport"><div id="stage"></div></div>
<script>${js}</script>
</body>
</html>
`);
writeFileSync(`${OUT}cover.html`, `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Coopanion 封面</title>
<style>${css}</style>
</head>
<body>
<div id="viewport"><div id="stage"></div></div>
<script>${await bundle('cover.js')}</script>
</body>
</html>
`);
cpSync(`${HERE}assets`, `${OUT}assets`, { recursive: true });
console.log(`promo → ${OUT}index.html (${Math.round(js.length / 1024)} KB script)`);
