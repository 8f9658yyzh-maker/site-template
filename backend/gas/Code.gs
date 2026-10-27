/**
 * 問い合わせの受け皿と管理画面（Googleスプレッドシート＋Apps Script）。
 * ホームページのフォームから届いた内容を、スプレッドシートに保存し、メールで知らせ、
 * 管理画面（一覧・状態の変更・メモ）で見られるようにします。どの会社にも同じものを使えます。
 *
 * 使い方は backend/README.md を見てください。
 * このファイルを、会社ごとのGoogleアカウントのスプレッドシートに紐づけて使います。
 */

var SHEET_NAME = '受付';
var HEADERS = ['受付日時', '受付番号', '状態', '送信元サイト', 'お名前', 'メール', '電話', '内容', 'メモ'];
var STATUSES = ['新規', '対応中', '完了', '見送り'];
var LABELS = {
  date: '希望日', time: '希望時間', people: '人数', course: 'コース・メニュー',
  address: '施工場所', category: 'ご相談内容', note: '備考・詳細'
};
var MAX_FIELD = 2000;      // 1項目の最大文字数
var MAX_FIELDS = 30;       // 受け付ける項目数の上限
var MAX_PER_MINUTE = 20;   // 1分あたりの受付上限（大量の迷惑送信への対策）

/* ---------- 最初に1回だけ実行する準備 ---------- */

/** 受付シートを作り、管理画面の合言葉を作る。実行後、表示された合言葉を控えてください。 */
function setup() {
  var sh = getSheet_();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_KEY')) props.setProperty('ADMIN_KEY', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
  if (!props.getProperty('NOTIFY_TO')) props.setProperty('NOTIFY_TO', Session.getEffectiveUser().getEmail());
  Logger.log('受付シート: ' + sh.getName());
  Logger.log('通知メールの送信先: ' + props.getProperty('NOTIFY_TO'));
  Logger.log('管理画面の合言葉: ' + props.getProperty('ADMIN_KEY'));
}

/** 管理画面の合言葉を新しくする（漏れたかもしれないとき）。 */
function resetAdminKey() {
  var k = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  PropertiesService.getScriptProperties().setProperty('ADMIN_KEY', k);
  Logger.log('新しい合言葉: ' + k);
}

/* ---------- フォームの受信 ---------- */

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.website) return text_('ok');                       // 人は入力しない欄が埋まっている＝迷惑送信。保存せず成功を装う
    if (tooMany_()) return text_('busy');
    var keys = Object.keys(p).filter(function (k) { return k.charAt(0) !== '_' && k !== 'website'; });
    if (!keys.length || keys.length > MAX_FIELDS) return text_('invalid');
    var name = clean_(p.name), email = clean_(p.email), tel = clean_(p.tel);
    if (!name || (!email && !tel)) return text_('invalid');   // 名前と、連絡先（メールか電話）は必須

    var detail = keys.filter(function (k) { return ['name', 'email', 'tel'].indexOf(k) < 0; })
      .map(function (k) { return (LABELS[k] || k) + '：' + clean_(p[k]); }).join('\n');
    var site = clean_(p._site);

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var no;
    try {
      var sh = getSheet_();
      no = 'R' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyMMdd') + '-' + ('000' + (sh.getLastRow())).slice(-4);
      sh.appendRow([new Date(), no, '新規', safeCell_(site), safeCell_(name), safeCell_(email), safeCell_(tel), safeCell_(detail), '']);
    } finally { lock.releaseLock(); }

    notify_(no, site, name, email, tel, detail);              // 通知に失敗しても、保存は済んでいる
    return text_('ok');
  } catch (err) {
    console.error(err);
    return text_('error');
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.page === 'admin') {
    return HtmlService.createHtmlOutput(adminHtml_()).setTitle('問い合わせ管理').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return text_('ok');
}

/* ---------- 管理画面から呼ばれる ---------- */

/** 受付の一覧（新しい順、最大300件）。 */
function adminList(key) {
  checkKey_(key);
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var from = Math.max(2, last - 299);
  var vals = sh.getRange(from, 1, last - from + 1, HEADERS.length).getValues();
  return vals.map(function (r, i) {
    return { row: from + i, at: Utilities.formatDate(new Date(r[0]), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'), no: String(r[1]), status: String(r[2]), site: String(r[3]), name: String(r[4]), email: String(r[5]), tel: String(r[6]), detail: String(r[7]), memo: String(r[8]) };
  }).reverse();
}

/** 状態とメモを更新する。受付番号で行を特定する（行がずれても別の人を書き換えない）。 */
function adminUpdate(key, no, status, memo) {
  checkKey_(key);
  if (STATUSES.indexOf(status) < 0) throw new Error('状態が正しくありません');
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) throw new Error('受付が見つかりません');
  var nos = sh.getRange(2, 2, last - 1, 1).getValues();
  for (var i = nos.length - 1; i >= 0; i--) {
    if (String(nos[i][0]) === String(no)) {
      sh.getRange(i + 2, 3).setValue(status);
      sh.getRange(i + 2, 9).setValue(safeCell_(clean_(memo)));
      return true;
    }
  }
  throw new Error('受付が見つかりません');
}

/* ---------- 内部の道具 ---------- */

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function text_(s) { return ContentService.createTextOutput(s); }

/** 余計な制御文字を除き、長さを制限する。 */
function clean_(v) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, MAX_FIELD);
}

/** スプレッドシートで「= + - @」始まりの文字が計算式として実行されるのを防ぐ。 */
function safeCell_(s) {
  s = String(s);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

/** 1分あたりの受付件数を数え、多すぎたら止める。 */
function tooMany_() {
  var c = CacheService.getScriptCache();
  var k = 'rate_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHHmm');
  var n = Number(c.get(k) || 0) + 1;
  c.put(k, String(n), 120);
  return n > MAX_PER_MINUTE;
}

function notify_(no, site, name, email, tel, detail) {
  try {
    var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_TO');
    if (!to) return;
    var url = ScriptApp.getService().getUrl();
    var body = '新しい問い合わせが届きました。\n\n受付番号：' + no + '\n送信元：' + site + '\nお名前：' + name + '\nメール：' + email + '\n電話：' + tel + '\n\n' + detail + '\n\n管理画面：' + url + '?page=admin';
    MailApp.sendEmail({ to: to, subject: '【問い合わせ】' + (site || 'ホームページ') + '：' + name + ' 様', body: body, noReply: true });
  } catch (err) { console.error('通知メールの送信に失敗: ' + err); }
}

/** 合言葉の確認。間違いが続いたら10分ロックする（総当たりへの対策）。 */
function checkKey_(key) {
  var c = CacheService.getScriptCache();
  var fails = Number(c.get('adminFails') || 0);
  if (fails >= 5) throw new Error('間違いが続いたため、しばらく使えません。10分後にもう一度お試しください。');
  var real = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY') || '';
  var given = String(key || '');
  var ok = real.length > 0 && given.length === real.length;
  var diff = 0;
  for (var i = 0; i < real.length; i++) diff |= real.charCodeAt(i) ^ (given.charCodeAt(i) || 0);
  if (!ok || diff !== 0) { c.put('adminFails', String(fails + 1), 600); throw new Error('合言葉が違います'); }
  c.remove('adminFails');
}

/* ---------- 管理画面の見た目 ---------- */

function adminHtml_() {
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><base target="_top"><style>' +
    ':root{--bg:#f6f7f9;--fg:#1c2530;--sub:#5d6b78;--card:#fff;--line:#d8dee5;--main:#1f5f8b}' +
    '@media(prefers-color-scheme:dark){:root{--bg:#131a20;--fg:#e8edf2;--sub:#9aa9b6;--card:#1b242c;--line:#2e3a45;--main:#6db3e0}}' +
    '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.7 "Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;padding:16px}' +
    'main{max-width:760px;margin:0 auto}h1{font-size:1.2rem;margin:0 0 12px}' +
    '.box{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px;margin:0 0 12px}' +
    'input,select,textarea,button{font:inherit;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:8px 10px;max-width:100%}' +
    'button{cursor:pointer;background:var(--main);color:#fff;border-color:var(--main)}button.sub{background:transparent;color:var(--main)}' +
    '.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.row>*{min-width:0}' +
    '.tag{display:inline-block;border-radius:999px;padding:0 10px;font-size:.8rem;border:1px solid var(--line);color:var(--sub)}.tag.new{background:#c2410c;border-color:#c2410c;color:#fff}' +
    'pre{white-space:pre-wrap;word-break:break-word;margin:6px 0;font:inherit}.meta{color:var(--sub);font-size:.85rem}.err{color:#c2410c}' +
    'textarea{width:100%}[hidden]{display:none!important}' +
    '</style></head><body><main><h1>問い合わせ管理</h1>' +
    '<div id="login" class="box"><p>合言葉を入力してください。</p><div class="row"><input id="key" type="password" autocomplete="current-password" aria-label="合言葉"><button id="go">開く</button></div><p id="lerr" class="err" role="status"></p></div>' +
    '<div id="app" hidden><div class="box row"><select id="flt" aria-label="状態で絞り込み"><option value="">すべての状態</option></select><input id="q" placeholder="名前・内容で検索" aria-label="検索"><button id="reload" class="sub">更新</button><span id="cnt" class="meta"></span></div><div id="list"></div></div>' +
    '<script>' +
    'var KEY="",ROWS=[],ST=' + JSON.stringify(STATUSES) + ';' +
    'function $(i){return document.getElementById(i)}' +
    'function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}' +
    'ST.forEach(function(s){var o=el("option",null,s);o.value=s;$("flt").appendChild(o)});' +
    'function load(){google.script.run.withSuccessHandler(function(r){ROWS=r;$("login").hidden=true;$("app").hidden=false;draw()}).withFailureHandler(function(e){$("lerr").textContent=String(e.message||e).replace(/^Error: /,"")}).adminList(KEY)}' +
    '$("go").onclick=function(){KEY=$("key").value;$("lerr").textContent="確認中…";load()};' +
    '$("key").onkeydown=function(e){if(e.key==="Enter")$("go").click()};' +
    '$("reload").onclick=load;$("flt").onchange=draw;$("q").oninput=draw;' +
    'function draw(){var f=$("flt").value,q=$("q").value.trim(),L=$("list");L.textContent="";var n=0;' +
    'ROWS.forEach(function(r){if(f&&r.status!==f)return;if(q&&(r.name+r.detail+r.email+r.tel+r.site).indexOf(q)<0)return;n++;' +
    'var b=el("div","box");var h=el("div","row");h.appendChild(el("strong",null,r.name+" 様"));h.appendChild(el("span","tag"+(r.status==="新規"?" new":""),r.status));b.appendChild(h);' +
    'b.appendChild(el("div","meta",r.at+"　"+r.no+"　"+r.site));' +
    'b.appendChild(el("div","meta","メール："+r.email+"　電話："+r.tel));b.appendChild(el("pre",null,r.detail));' +
    'var s=el("select");ST.forEach(function(x){var o=el("option",null,x);o.value=x;if(x===r.status)o.selected=true;s.appendChild(o)});' +
    'var m=el("textarea");m.rows=2;m.value=r.memo;m.placeholder="メモ（対応の内容など）";' +
    'var sv=el("button",null,"保存");var msg=el("span","meta");' +
    'sv.onclick=function(){sv.disabled=true;msg.textContent="保存中…";google.script.run.withSuccessHandler(function(){r.status=s.value;r.memo=m.value;msg.textContent="保存しました";sv.disabled=false;h.lastChild.textContent=r.status}).withFailureHandler(function(e){msg.textContent="保存できませんでした："+String(e.message||e);sv.disabled=false}).adminUpdate(KEY,r.no,s.value,m.value)};' +
    'var rw=el("div","row");rw.appendChild(s);rw.appendChild(sv);rw.appendChild(msg);b.appendChild(rw);b.appendChild(m);L.appendChild(b)});' +
    '$("cnt").textContent=n+"件";if(!n)L.appendChild(el("p","meta","該当する問い合わせはありません。"))}' +
    '</script></main></body></html>';
}
