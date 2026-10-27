#!/usr/bin/env node
// 12見本を元ファイルから作り直し、保管してある完成品（samples-12/）と1文字ずつ同じか確かめる。
// 使い方: node tools/rebuild-samples.mjs
// 流れ: tools/make-samples.mjs で sites/<業種>-a,-b の site.json と仮画像を作る
//   → build.mjs で dist/ に組み立てる → tools/mkpreview.py でスマホ確認用（相対リンク）の preview/ に直す
//   → preview/ と samples-12/ を比べる。違いがあれば一覧を出して終了コード1。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
const names = ['activity', 'restaurant', 'salon', 'clinic', 'construction', 'office'].flatMap((g) => [`${g}-a`, `${g}-b`]);

run('node', ['tools/make-samples.mjs']);
for (const n of names) run('node', ['build.mjs', `sites/${n}`]);
run('python3', ['tools/mkpreview.py']);
for (const d of fs.readdirSync(path.join(root, 'preview'))) {
  if (!names.includes(d)) fs.rmSync(path.join(root, 'preview', d), { recursive: true, force: true });
}

const list = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
};

const diffs = [];
let same = 0;
for (const n of names) {
  const a = path.join(root, 'preview', n);
  const b = path.join(root, 'samples-12', n);
  const fa = list(a);
  const fb = list(b);
  for (const f of new Set([...fa, ...fb])) {
    if (!fa.includes(f)) diffs.push(`作り直しに無い: ${n}/${f}`);
    else if (!fb.includes(f)) diffs.push(`保管に無い: ${n}/${f}`);
    else if (!fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f)))) diffs.push(`中身が違う: ${n}/${f}`);
    else same++;
  }
}

console.log(`見本 ${names.length}件 / 同じファイル: ${same}件 / 違い: ${diffs.length}件`);
if (diffs.length) {
  console.log(diffs.slice(0, 50).join('\n'));
  process.exit(1);
}
console.log('保管してある12見本と完全に同じものを作り直せました。');
