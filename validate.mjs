#!/usr/bin/env node
// 公開前の点検。使い方: node validate.mjs dist/<社名フォルダ>
// エラー（必ず直す）と警告（確認する）を分けて表示する。エラーがあれば終了コード1。
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'dist/sample');
if (!fs.existsSync(root)) { console.error('フォルダがありません: ' + root); process.exit(1); }

const errors = [];
const warns = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warns.push(`${f}: ${m}`);

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(root);
const htmls = files.filter((f) => f.endsWith('.html'));
const rel = (f) => path.relative(root, f);

const titles = new Map();
const descs = new Map();
const indexable = [];

for (const f of htmls) {
  const html = fs.readFileSync(f, 'utf8');
  const name = rel(f);
  const noindex = /<meta name="robots" content="[^"]*noindex/i.test(html);
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  const canon = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];

  if (!title) err(name, 'タイトルがありません');
  else {
    if (title.length > 60) warn(name, `タイトルが長めです（${title.length}文字）。検索結果で省略されることがあります`);
    if (titles.has(title) && !noindex) err(name, `タイトルが ${titles.get(title)} と重複しています`);
    titles.set(title, name);
  }
  if (!desc) err(name, '説明文（meta description）がありません');
  else {
    if (desc.length < 30 && !noindex) warn(name, `説明文が短めです（${desc.length}文字）`);
    if (descs.has(desc) && !noindex) err(name, `説明文が ${descs.get(desc)} と重複しています`);
    descs.set(desc, name);
  }
  if (!canon) err(name, 'canonical（正規URL）がありません');
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) err(name, `h1見出しが${h1}個です（1個にしてください）`);
  if (!/<html lang="ja">/.test(html)) err(name, 'lang="ja" がありません');
  if (!/<meta name="viewport"/.test(html)) err(name, 'viewport（スマホ表示）の指定がありません');

  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = m[0];
    if (!/\balt="/.test(tag)) err(name, '代替テキスト（alt）のない画像があります: ' + tag.slice(0, 80));
    else if (/\balt=""/.test(tag)) warn(name, '代替テキストが空の画像があります');
    if (!/\bwidth="/.test(tag) || !/\bheight="/.test(tag)) warn(name, '画像に width/height がありません（表示のずれの原因）');
  }

  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { err(name, '構造化データ(JSON-LD)が壊れています: ' + e.message); }
  }

  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const u = m[1];
    if (/^(https?:|mailto:|tel:|#|data:)/.test(u)) continue;
    const clean = u.split('#')[0].split('?')[0];
    if (!clean) continue;
    let target = path.join(root, clean.startsWith('/') ? clean : path.join(path.dirname(name), clean));
    if (clean.endsWith('/')) target = path.join(target, 'index.html');
    if (!fs.existsSync(target)) err(name, `リンク切れ: ${u}`);
  }

  if (/TODO|〇〇|XXX|ダミー|lorem/i.test(html)) warn(name, '仮の文字（TODO・〇〇など）が残っています');
  if (/（見本）|見本の/.test(html)) warn(name, '見本の文章が残っています（本番前に差し替えてください）');
  const text = html.replace(/<details class="seo-tag">[\s\S]*?<\/details>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ');
  const risky = text.match(/完治|絶対に?(治|安全|痩)|必ず(治|痩|改善)|日本一|最安値|No\.?\s?1|NO\.?\s?1|奇跡/gi);
  if (risky && !name.startsWith('_seo-plan')) warn(name, `根拠を示しにくい強い表現があります（${[...new Set(risky)].join('、')}）。裏付けがあるか、公開前に確認してください`);
  if (!noindex) {
    const mainHtml = (html.match(/<main id="main">([\s\S]*?)<\/main>/) || [])[1] || '';
    const bodyText = mainHtml.replace(/<details class="seo-tag">[\s\S]*?<\/details>|<p class="seo-chip">[\s\S]*?<\/p>|<script[\s\S]*?<\/script>|<[^>]+>/g, '').replace(/\s+/g, '');
    const inLinks = new Set([...mainHtml.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]));
    const isForm = /reserve\/index\.html$/.test(name) || /policy\/index\.html$/.test(name);
    if (!isForm && bodyText.length < 250) warn(name, `本文が短めです（約${bodyText.length}文字）。検索する人の疑問に答える内容を足してください`);
    if (!isForm && inLinks.size < 2) warn(name, `本文中のリンクが少なめです（${inLinks.size}か所）。関連するページへのリンクを入れてください`);
    indexable.push({ name, canon });
  }
}

// サイトマップとrobots
const smPath = path.join(root, 'sitemap.xml');
if (!fs.existsSync(smPath)) err('sitemap.xml', 'ありません');
else {
  const sm = fs.readFileSync(smPath, 'utf8');
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const p of indexable) if (p.canon && !locs.includes(p.canon)) err(p.name, 'サイトマップに載っていません: ' + p.canon);
}
if (!fs.existsSync(path.join(root, 'robots.txt'))) err('robots.txt', 'ありません');
const robots = fs.existsSync(path.join(root, 'robots.txt')) ? fs.readFileSync(path.join(root, 'robots.txt'), 'utf8') : '';
const blocksAll = /Disallow:\s*\/\s*$/m.test(robots);
if (blocksAll) warn('robots.txt', '全ページの検索表示を止める設定です（見本サイトならOK。本番なら isSample を false に）');

console.log(`点検したページ: ${htmls.length} / 検索に出るページ: ${indexable.length}`);
if (warns.length) console.log('\n【警告】' + warns.length + '件\n' + warns.map((w) => ' - ' + w).join('\n'));
if (errors.length) { console.log('\n【エラー】' + errors.length + '件\n' + errors.map((e) => ' - ' + e).join('\n')); process.exit(1); }
console.log('\nエラーなし');
