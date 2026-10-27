// Code.gs の動作確認。Googleの部品(スプレッドシート・メール等)を模した偽物の上で動かす。
// 使い方: node tests/gas-test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const code = fs.readFileSync(path.join(here, '../backend/gas/Code.gs'), 'utf8');

const rows = []; const mails = []; const props = { ADMIN_KEY: 'secretkey1234567', NOTIFY_TO: 'owner@example.com' }; const cache = {};
const range = (r, c, n, m) => ({
  getValues: () => rows.slice(r - 1, r - 1 + n).map((x) => x.slice(c - 1, c - 1 + m)),
  setValue: (v) => { rows[r - 1][c - 1] = v; },
});
const sheet = {
  getName: () => '受付', getLastRow: () => rows.length, appendRow: (a) => rows.push(a), setFrozenRows() {}, getRange: range,
};
const ctx = {
  console, Date, JSON, String, Number, Object, Math, Error, RegExp,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => (rows.length ? sheet : null), insertSheet: () => sheet }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { getUuid: () => '12345678-1234-1234-1234-123456789012', formatDate: (d, tz, f) => new Date(d).toISOString().slice(0, 10).replace(/-/g, '').slice(f === 'yyMMdd' ? 2 : 0, 8) + (f.includes('HH') ? ' 00:00' : '') },
  MailApp: { sendEmail: (m) => mails.push(m) },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://script.example/exec' }) },
  ContentService: { createTextOutput: (s) => ({ text: s }) },
  HtmlService: { createHtmlOutput: (h) => ({ html: h, setTitle() { return this; }, addMetaTag() { return this; } }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
};
vm.createContext(ctx); vm.runInContext(code, ctx);
rows.push(['受付日時', '受付番号', '状態', '送信元サイト', 'お名前', 'メール', '電話', '内容', 'メモ']); // 受付シートを用意済みにする

let fail = 0; const t = (name, cond) => { console.log((cond ? 'OK  ' : 'NG  ') + name); if (!cond) fail++; };
const post = (p) => ctx.doPost({ parameter: p }).text;
const run = (s) => vm.runInContext(s, ctx);

t('正しい送信は ok', post({ name: '山田 太郎', email: 'a@example.com', tel: '', date: '2026-11-01', note: 'テスト', _site: '見本店' }) === 'ok');
t('1行保存された', rows.length === 2 && rows[1][4] === '山田 太郎' && rows[1][2] === '新規');
t('内容に日本語の項目名が入る', rows[1][7].includes('希望日：2026-11-01') && rows[1][7].includes('備考・詳細：テスト'));
t('通知メールが1通', mails.length === 1 && mails[0].to === 'owner@example.com' && mails[0].body.includes('?page=admin'));
t('受付番号が付く', /^R\d{6}-\d{4}$/.test(rows[1][1]));
t('迷惑送信の隠し欄が埋まっていたら保存しない', post({ name: 'x', email: 'a@b.c', website: 'spam' }) === 'ok' && rows.length === 2);
t('名前なしは invalid', post({ email: 'a@b.c' }) === 'invalid' && rows.length === 2);
t('連絡先なしは invalid', post({ name: 'x' }) === 'invalid' && rows.length === 2);
post({ name: '=HYPERLINK("http://evil","x")', email: 'a@b.c', note: '+1+1' });
t('計算式は文字として保存される', rows[2][4].startsWith("'=") && rows[2][7].includes('+1+1'));
post({ name: 'a'.repeat(5000), email: 'a@b.c' });
t('長すぎる入力は切り詰める', rows[3][4].length <= 2001);
t('項目が多すぎる送信は invalid', post(Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['k' + i, 'v']))) === 'invalid');

let thrown = ''; try { ctx.adminList('wrong'); } catch (e) { thrown = e.message; }
t('合言葉が違うと一覧を返さない', thrown === '合言葉が違います');
const list = ctx.adminList('secretkey1234567');
t('正しい合言葉で新しい順の一覧', list.length === 3 && list[0].row === 4);
t('状態を更新できる(受付番号で特定)', ctx.adminUpdate('secretkey1234567', rows[1][1], '対応中', '電話した') === true && rows[1][2] === '対応中' && rows[1][8] === '電話した');
thrown = ''; try { ctx.adminUpdate('secretkey1234567', rows[1][1], '勝手な状態', ''); } catch (e) { thrown = e.message; }
t('知らない状態は拒否', thrown.includes('状態'));
thrown = ''; try { ctx.adminUpdate('secretkey1234567', 'R000000-9999', '完了', ''); } catch (e) { thrown = e.message; }
t('存在しない受付番号は拒否', thrown.includes('見つかりません'));
Object.keys(cache).forEach((k) => delete cache[k]);
for (let i = 0; i < 5; i++) { try { ctx.adminList('bad'); } catch (e) {} }
thrown = ''; try { ctx.adminList('secretkey1234567'); } catch (e) { thrown = e.message; }
t('間違い5回でロックされ、正しい合言葉でも入れない', thrown.includes('しばらく'));
Object.keys(cache).forEach((k) => delete cache[k]);
for (let i = 0; i < 25; i++) post({ name: 'n' + i, email: 'a@b.c' });
t('1分に20件を超えると busy', post({ name: 'z', email: 'a@b.c' }) === 'busy');
t('管理画面のHTMLが返る', ctx.doGet({ parameter: { page: 'admin' } }).html.includes('問い合わせ管理'));
t('管理画面以外のGETは ok だけ', ctx.doGet({ parameter: {} }).text === 'ok');

// 管理画面の中のスクリプトに構文の誤りがないか
const html = ctx.doGet({ parameter: { page: 'admin' } }).html;
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
try { new Function(script); t('管理画面のスクリプトの構文', true); } catch (e) { t('管理画面のスクリプトの構文: ' + e.message, false); }
fs.writeFileSync(path.join(here, 'admin-preview.html'), html);
console.log(fail ? `\n失敗 ${fail} 件` : '\nすべて成功'); process.exit(fail ? 1 : 0);
