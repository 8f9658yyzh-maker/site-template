/**
 * ホームページのフォームの受け皿と管理画面（Googleの無料の仕組み Apps Script）
 * 1社＝1つのスプレッドシート＋このスクリプト。お客様（契約会社）のGoogleアカウントで作る。
 * 使い方は SETUP.md を参照。
 */
var SHEET_NAME = '受付';
var STATUSES = ['新規', '対応中', '完了', '見送り'];
var HEADERS = ['受付ID', '受付日時', '状態', 'お名前', 'メール', '電話', '種別', '希望日', '希望時間', '人数', '場所', '内容', 'サイト', 'メモ'];
var MAX_LEN = 2000;

// ---------- 最初に1回だけ手で実行する ----------
function setup() {
  var sh = getSheet_(true);
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_KEY')) props.setProperty('ADMIN_KEY', randomKey_());
  if (!props.getProperty('NOTIFY_EMAIL')) props.setProperty('NOTIFY_EMAIL', Session.getEffectiveUser().getEmail());
  Logger.log('管理画面の合言葉: ' + props.getProperty('ADMIN_KEY'));
  Logger.log('通知メールの宛先: ' + props.getProperty('NOTIFY_EMAIL'));
  return sh.getName();
}

// ---------- フォームからの受信 ----------
function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.website) return text_('ok'); // 人は入力しない欄。入っていたら迷惑送信なので何も記録しない
    var name = clean_(p.name, 100), email = clean_(p.email, 200), tel = clean_(p.tel, 50);
    if (!name || (!email && !tel)) return text_('ng');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return text_('ng');

    var cache = CacheService.getScriptCache();
    var dupKey = 'd' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, [name, email, tel, p.note, p.date, p.time].join('|')));
    if (cache.get(dupKey.slice(0, 200))) return text_('ok'); // 連打・二重送信は1件にまとめる
    cache.put(dupKey.slice(0, 200), '1', 120);

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return text_('busy');
    var id;
    try {
      var sh = getSheet_(true);
      id = 'R' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 36).toString(36).toUpperCase();
      sh.appendRow([
        id, new Date(), '新規', name, email, tel,
        safe_(clean_(p.course || p.category, 200)), safe_(clean_(p.date, 30)), safe_(clean_(p.time, 30)),
        safe_(clean_(p.people, 10)), safe_(clean_(p.address, 300)), safe_(clean_(p.note, MAX_LEN)),
        safe_(clean_(p._site, 100)), ''
      ].map(function (v, i) { return i === 3 || i === 4 || i === 5 ? safe_(v) : v; }));
    } finally { lock.releaseLock(); }
    notify_(id, name, p);
    return text_('ok');
  } catch (err) {
    console.error(err);
    return text_('error');
  }
}

function notify_(id, name, p) {
  try {
    var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
    if (!to || MailApp.getRemainingDailyQuota() < 1) return;
    var url = ScriptApp.getService().getUrl();
    MailApp.sendEmail({
      to: to, name: 'ホームページ受付', subject: '【新しい受付】' + name + ' 様',
      body: ['ホームページから新しい受付がありました。', '', 'お名前: ' + name, '受付ID: ' + id, '',
        '管理画面: ' + url + '?page=admin', '（合言葉は別途お渡ししたものを入力してください）'].join('\n')
    });
  } catch (err) { console.error('通知メールの送信に失敗: ' + err); }
}

// ---------- 管理画面 ----------
function doGet(e) {
  var page = e && e.parameter && e.parameter.page;
  if (page !== 'admin') return text_('ホームページの受付窓口です。');
  var key = (e.parameter.key || '');
  if (!keyOk_(key)) {
    return HtmlService.createHtmlOutput(
      '<meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px sans-serif;padding:24px;max-width:480px;margin:auto">' +
      '<h1 style="font-size:1.2rem">受付の管理画面</h1><form method="get" action="">' +
      '<input type="hidden" name="page" value="admin"><p><label>合言葉<br><input type="password" name="key" style="width:100%;padding:10px;font-size:16px"></label></p>' +
      '<button style="padding:10px 20px;font-size:16px">開く</button></form>' + (key ? '<p style="color:#b00">合言葉が違います。</p>' : '') + '</body>'
    ).setTitle('受付の管理画面');
  }
  var t = HtmlService.createTemplateFromFile('Admin');
  t.key = key;
  return t.evaluate().setTitle('受付の管理画面').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function adminList(key) {
  if (!keyOk_(key)) throw new Error('forbidden');
  var sh = getSheet_(false);
  if (!sh || sh.getLastRow() < 2) return { statuses: STATUSES, rows: [] };
  var n = Math.min(sh.getLastRow() - 1, 500);
  var start = sh.getLastRow() - n + 1;
  var vals = sh.getRange(start, 1, n, HEADERS.length).getValues();
  var rows = vals.map(function (r) {
    var o = {};
    HEADERS.forEach(function (h, i) { o[h] = r[i] instanceof Date ? Utilities.formatDate(r[i], 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') : String(r[i]); });
    return o;
  }).reverse();
  return { statuses: STATUSES, rows: rows };
}

function adminUpdate(key, id, status, memo) {
  if (!keyOk_(key)) throw new Error('forbidden');
  if (STATUSES.indexOf(status) < 0) throw new Error('bad status');
  memo = safe_(clean_(memo, 500));
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = getSheet_(false);
    if (!sh) throw new Error('no sheet');
    var ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(id)) {
        sh.getRange(i + 2, 3).setValue(status);
        sh.getRange(i + 2, HEADERS.indexOf('メモ') + 1).setValue(memo);
        return true;
      }
    }
    throw new Error('not found');
  } finally { lock.releaseLock(); }
}

// ---------- 小道具 ----------
function getSheet_(create) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh && create) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 3, 1000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build());
  }
  return sh;
}
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max); }
// 先頭が = + - @ だと表計算ソフトが数式として実行してしまうため、先頭に ' を付けて文字として扱わせる
function safe_(v) { v = String(v); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function keyOk_(key) {
  var real = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY') || '';
  key = String(key || '');
  if (!real || key.length !== real.length) return false;
  var d = 0;
  for (var i = 0; i < real.length; i++) d |= real.charCodeAt(i) ^ key.charCodeAt(i);
  return d === 0;
}
function randomKey_() {
  var s = '', chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (var i = 0; i < 20; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
function text_(s) { return ContentService.createTextOutput(s); }
