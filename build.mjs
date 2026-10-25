#!/usr/bin/env node
// 社ごとの設定ファイル（site.json）から、検索対策済みの静的ホームページ一式を作る。
// 使い方: node build.mjs sites/<社名フォルダ>
// 出力先: dist/<社名フォルダ>/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(process.argv[2] || 'sites/sample');
const siteName = path.basename(siteDir);
const outDir = path.join(here, 'dist', siteName);

const fail = (msg) => { console.error('エラー: ' + msg); process.exit(1); };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { fail(`${p} を読めません（${e.message}）`); } };

const site = readJson(path.join(siteDir, 'site.json'));
const genres = readJson(path.join(here, 'genres.json'));
const g = genres[site.genre] || fail(`genre「${site.genre}」は genres.json にありません。候補: ${Object.keys(genres).join(', ')}`);

// ---- 必須項目の確認（足りなければ作らずに止める） ----
const need = [['name', site.name], ['baseUrl', site.baseUrl], ['contact.tel', site.contact?.tel], ['address.text', site.address?.text], ['description', site.description]];
for (const [k, v] of need) if (!v) fail(`site.json の「${k}」が空です`);
const base = site.baseUrl.replace(/\/+$/, '');

// ---- 小道具 ----
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const paras = (arr) => (arr || []).map((t) => `<p>${esc(t)}</p>`).join('\n');
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const telHref = (t) => 'tel:' + String(t).replace(/[^\d+]/g, '');
const abs = (p) => (/^https?:\/\//.test(p) ? p : base + (p.startsWith('/') ? p : '/' + p));
const imgSrc = (p) => (/^https?:\/\//.test(p) ? p : '/images/' + p.replace(/^images\//, ''));
const img = (o, cls = '', eager = false) =>
  o?.image
    ? `<img class="${cls}" src="${esc(imgSrc(o.image))}" alt="${esc(o.alt || '')}" width="${o.w || 1200}" height="${o.h || 800}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
    : '';

const L = g.labels;
const ORDER = ['about', 'services', 'flow', 'staff', 'gallery', 'voice', 'news', 'column', 'faq', 'access', 'reserve', 'policy'];
const notes = []; // 作成時の注意メッセージ（画面に表示）
const enabled = ORDER.filter((p) => (site.pages || []).includes(p));
const has = (p) => enabled.includes(p);
const pagePath = (p) => (p === 'index' ? '/' : `/${p}/`);
const ctaPage = has(g.cta.page) ? g.cta.page : null;
const ctaHref = ctaPage ? pagePath(ctaPage) : telHref(site.contact.tel);
const t = site.theme || {};

// ---- 全ページ共通の枠 ----
function layout({ slug, title, description, h1, body, noindex = false, crumbs = [], extraLd = [] }) {
  const urlPath = pagePath(slug);
  const canonical = base + (urlPath === '/' ? '/' : urlPath);
  const robots = noindex || site.isSample ? '<meta name="robots" content="noindex,nofollow">' : '';
  const ogImage = site.hero?.image ? abs(imgSrc(site.hero.image)) : '';
  const nav = enabled.filter((p) => p !== 'policy').map((p) => `<li><a href="${pagePath(p)}"${p === slug ? ' aria-current="page"' : ''}>${esc(L[p])}</a></li>`).join('');
  const bc = crumbs.length
    ? jsonLd({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ name: 'ホーム', path: '/' }, ...crumbs].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: base + c.path })) })
    : '';
  const crumbHtml = crumbs.length ? `<nav class="crumbs" aria-label="パンくずリスト"><a href="/">ホーム</a> › ${crumbs.map((c) => esc(c.name)).join(' › ')}</nav>` : '';
  const sampleBanner = site.isSample ? '<div class="sample-banner">これは見本サイトです（検索には表示されません）</div>' : '';
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
${robots}
<meta property="og:type" content="${slug === 'index' ? 'website' : 'article'}">
<meta property="og:locale" content="ja_JP">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
<meta name="theme-color" content="${esc(t.main || '#0b6fa4')}">
<link rel="icon" href="/images/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/style.css">
<style>:root{--main:${esc(t.main || '#0b6fa4')};--accent:${esc(t.accent || '#ff7a45')};--bg:${esc(t.bg || '#ffffff')};--text:${esc(t.text || '#1b2a33')}}</style>
${bc}${extraLd.map(jsonLd).join('')}
</head>
<body>
${sampleBanner}
<a class="skip" href="#main">本文へ移動</a>
<header class="site-header">
  <a class="brand" href="/">${esc(site.name)}</a>
  <button class="menu-btn" aria-expanded="false" aria-controls="gnav">メニュー</button>
  <nav id="gnav" class="gnav" aria-label="メインメニュー"><ul>${nav}</ul></nav>
</header>
<main id="main">
${crumbHtml}
${h1 ? `<h1 class="page-title">${esc(h1)}</h1>` : ''}
${body}
</main>
<footer class="site-footer">
  <p class="f-name">${esc(site.name)}</p>
  <p>${esc(site.address.postalCode ? '〒' + site.address.postalCode + ' ' : '')}${esc(site.address.text)}</p>
  <p>TEL <a href="${telHref(site.contact.tel)}">${esc(site.contact.tel)}</a>${site.hours?.text ? ' ／ ' + esc(site.hours.text) : ''}</p>
  <ul class="f-links">${enabled.map((p) => `<li><a href="${pagePath(p)}">${esc(L[p] || (p === 'policy' ? 'プライバシーポリシー' : p))}</a></li>`).join('')}</ul>
  <p class="copy">© ${esc(site.name)}</p>
</footer>
<div class="cta-bar">
  <a class="btn btn-tel" href="${telHref(site.contact.tel)}">電話する</a>
  ${site.contact.line ? `<a class="btn btn-line" href="${esc(site.contact.line)}" rel="noopener">LINE</a>` : ''}
  <a class="btn btn-main" href="${esc(ctaHref)}">${esc(g.cta.text)}</a>
</div>
<script src="/assets/main.js" defer></script>
</body>
</html>`;
}

const ctaBlock = () => `<section class="cta-block"><p>${esc(site.ctaLead || 'ご予約・ご相談はお気軽にどうぞ。')}</p><p><a class="btn btn-main btn-lg" href="${esc(ctaHref)}">${esc(g.cta.text)}</a> <a class="btn btn-tel btn-lg" href="${telHref(site.contact.tel)}">${esc(site.contact.tel)}</a></p></section>`;

const mapBlock = () => {
  const a = site.address;
  const q = encodeURIComponent(a.text);
  const embed = a.mapEmbed ? `<iframe class="map" src="${esc(a.mapEmbed)}" title="${esc(site.name)}の地図" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>` : '';
  return `${embed}<p><a href="https://www.google.com/maps/search/?api=1&query=${q}" rel="noopener">Googleマップで開く</a></p>`;
};

// ---- ページごとの中身 ----
const pages = {};

pages.index = () => {
  const h = site.hero || {};
  const hl = (site.highlights || []).map((x) => `<li><h3>${esc(x.title)}</h3><p>${esc(x.body)}</p></li>`).join('');
  const sv = (site.services?.items || []).slice(0, 4).map((x) => `<li class="card">${img(x, 'card-img')}<h3>${esc(x.name)}</h3><p class="price">${esc(x.price || '')}</p><p>${esc(x.summary || '')}</p></li>`).join('');
  const fl = (site.flow?.steps || []).map((s) => `<li><strong>${esc(s.title)}</strong><span>${esc(s.body)}</span></li>`).join('');
  const nw = (site.news || []).slice(0, 3).map((n) => `<li><time datetime="${esc(n.date)}">${esc(n.date)}</time> <a href="/news/">${esc(n.title)}</a></li>`).join('');
  const body = `
<section class="hero">${img(h, 'hero-img', true)}<div class="hero-text"><h1>${esc(h.title || site.name)}</h1><p>${esc(h.lead || site.tagline || '')}</p><p><a class="btn btn-main btn-lg" href="${esc(ctaHref)}">${esc(g.cta.text)}</a></p></div></section>
${hl ? `<section class="sec"><h2>${esc(site.name)}の特長</h2><ul class="highlights">${hl}</ul></section>` : ''}
${sv && has('services') ? `<section class="sec"><h2>${esc(L.services)}</h2><ul class="cards">${sv}</ul><p class="more"><a href="/services/">${esc(L.services)}をすべて見る</a></p></section>` : ''}
${fl && has('flow') ? `<section class="sec"><h2>${esc(L.flow)}</h2><ol class="steps">${fl}</ol></section>` : ''}
${nw && has('news') ? `<section class="sec"><h2>${esc(L.news)}</h2><ul class="news">${nw}</ul><p class="more"><a href="/news/">${esc(L.news)}一覧</a></p></section>` : ''}
${has('access') ? `<section class="sec"><h2>${esc(L.access)}</h2><p>${esc(site.address.text)}</p>${site.hours?.text ? `<p>${esc(site.hours.text)}</p>` : ''}${mapBlock()}</section>` : ''}
${ctaBlock()}`;
  const a = site.address;
  const ld = {
    '@context': 'https://schema.org',
    '@type': g.schemaType,
    '@id': base + '/#business',
    name: site.name,
    url: base + '/',
    telephone: site.contact.tel,
    description: site.description,
    image: [site.hero?.image, ...(site.gallery || []).slice(0, 2).map((x) => x.image)].filter(Boolean).map((p) => abs(imgSrc(p))),
    address: { '@type': 'PostalAddress', postalCode: a.postalCode, addressRegion: a.region, addressLocality: a.locality, streetAddress: a.street, addressCountry: 'JP' },
    ...(a.lat && a.lng ? { geo: { '@type': 'GeoCoordinates', latitude: a.lat, longitude: a.lng } } : {}),
    ...(site.priceRange ? { priceRange: site.priceRange } : {}),
    ...(site.hours?.spec ? { openingHoursSpecification: site.hours.spec.map((s) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: s.days, opens: s.opens, closes: s.closes })) } : {}),
    ...(site.contact.instagram ? { sameAs: [site.contact.instagram] } : {}),
  };
  return { title: `${site.name}｜${site.tagline || L.services}`, description: site.description, body, extraLd: [ld] };
};

pages.about = () => {
  const a = site.about || {};
  const body = (a.sections || []).map((s) => `<section class="sec">${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}${paras(s.body)}</section>`).join('') +
    `<section class="sec"><h2>基本情報</h2><dl class="info"><dt>名称</dt><dd>${esc(site.name)}</dd><dt>所在地</dt><dd>${esc(site.address.text)}</dd><dt>電話</dt><dd><a href="${telHref(site.contact.tel)}">${esc(site.contact.tel)}</a></dd>${site.hours?.text ? `<dt>営業時間</dt><dd>${esc(site.hours.text)}</dd>` : ''}${(a.facts || []).map((f) => `<dt>${esc(f.k)}</dt><dd>${esc(f.v)}</dd>`).join('')}</dl></section>` + ctaBlock();
  return { title: `${L.about}｜${site.name}`, description: a.description || `${site.name}の${L.about}です。${site.description}`.slice(0, 120), h1: L.about, body, crumbs: [{ name: L.about, path: '/about/' }] };
};

pages.services = () => {
  const s = site.services || {};
  const items = (s.items || []).map((x) => `<article class="svc">${img(x, 'svc-img')}<div><h2>${esc(x.name)}</h2><p class="price">${esc(x.price || '')}</p>${x.note ? `<p class="note">${esc(x.note)}</p>` : ''}<p>${esc(x.description || x.summary || '')}</p></div></article>`).join('');
  const body = `${s.intro ? `<p class="lead">${esc(s.intro)}</p>` : ''}${items}
${s.included ? `<section class="sec"><h2>料金に含まれるもの</h2><p>${esc(s.included)}</p></section>` : ''}
${(s.details || []).length ? `<section class="sec"><h2>詳細</h2><dl class="info">${s.details.map((d) => `<dt>${esc(d.k)}</dt><dd>${esc(d.v)}</dd>`).join('')}</dl></section>` : ''}
${(s.notes || []).length ? `<section class="sec"><h2>ご注意</h2><ul class="notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}${ctaBlock()}`;
  const ld = (s.items || []).some((x) => x.priceNumber)
    ? [{ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: s.items.map((x, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Service', name: x.name, provider: { '@id': base + '/#business' }, ...(x.priceNumber ? { offers: { '@type': 'Offer', price: x.priceNumber, priceCurrency: 'JPY' } } : {}) } })) }]
    : [];
  return { title: `${L.services}｜${site.name}`, description: s.description || `${site.name}の${L.services}。${s.intro || ''}`.slice(0, 120), h1: L.services, body, crumbs: [{ name: L.services, path: '/services/' }], extraLd: ld };
};

pages.flow = () => {
  const f = site.flow || {};
  const body = `${f.intro ? `<p class="lead">${esc(f.intro)}</p>` : ''}<ol class="steps big">${(f.steps || []).map((s) => `<li><strong>${esc(s.title)}</strong><span>${esc(s.body)}</span></li>`).join('')}</ol>${ctaBlock()}`;
  return { title: `${L.flow}｜${site.name}`, description: f.description || `${site.name}の${L.flow}を順番にご案内します。${site.description}`.slice(0, 120), h1: L.flow, body, crumbs: [{ name: L.flow, path: '/flow/' }] };
};

pages.staff = () => {
  const body = `<ul class="cards">${(site.staff || []).map((m) => `<li class="card">${img(m, 'card-img')}<h2 class="h3">${esc(m.name)}</h2><p class="price">${esc(m.role || '')}</p><p>${esc(m.message || '')}</p></li>`).join('')}</ul>`;
  return { title: `${L.staff}｜${site.name}`, description: `${site.name}の${L.staff}です。${site.description}`.slice(0, 120), h1: L.staff, body, crumbs: [{ name: L.staff, path: '/staff/' }] };
};

pages.gallery = () => {
  const one = (x) => `<li>${img(x, 'grid-img')}${x.title ? `<h2 class="h3">${esc(x.title)}</h2>` : ''}${x.body ? `<p>${esc(x.body)}</p>` : ''}${(x.meta || []).length ? `<dl class="meta">${x.meta.map((m) => `<dt>${esc(m.k)}</dt><dd>${esc(m.v)}</dd>`).join('')}</dl>` : ''}</li>`;
  const body = `<ul class="grid works">${(site.gallery || []).map(one).join('')}</ul>`;
  return { title: `${L.gallery}｜${site.name}`, description: `${site.name}の${L.gallery}です。${site.description}`.slice(0, 120), h1: L.gallery, body, crumbs: [{ name: L.gallery, path: '/gallery/' }] };
};

pages.voice = () => {
  const body = `<p class="lead">ご利用いただいたお客様からいただいたご感想です（掲載の許可をいただいたものだけを載せています）。</p>${(site.voices || []).map((v) => `<article class="voice"><h2 class="h3">${esc(v.title || '')}</h2><p>${esc(v.body)}</p><p class="note">${esc(v.name || '')}</p></article>`).join('')}${ctaBlock()}`;
  return { title: `${L.voice}｜${site.name}`, description: `${site.name}をご利用いただいたお客様の声です。${site.description}`.slice(0, 120), h1: L.voice, body, crumbs: [{ name: L.voice, path: '/voice/' }] };
};

pages.column = () => {
  const body = `<ul class="news big">${(site.columns || []).map((c) => `<li><time datetime="${esc(c.date)}">${esc(c.date)}</time><h2 class="h3"><a href="/column/${esc(c.slug)}/">${esc(c.title)}</a></h2><p>${esc(c.description || '')}</p></li>`).join('')}</ul>`;
  return { title: `${L.column}｜${site.name}`, description: `${site.name}が、お客様からよく聞かれる疑問や役立つ情報をまとめたコラムの一覧です。`, h1: L.column, body, crumbs: [{ name: L.column, path: '/column/' }] };
};

pages.news = () => {
  const body = `<ul class="news big">${(site.news || []).map((n) => `<li><time datetime="${esc(n.date)}">${esc(n.date)}</time><h2 class="h3">${esc(n.title)}</h2>${n.body ? `<p>${esc(n.body)}</p>` : ''}</li>`).join('')}</ul>`;
  return { title: `${L.news}｜${site.name}`, description: `${site.name}からのお知らせ・営業情報の一覧です。${site.description}`.slice(0, 120), h1: L.news, body, crumbs: [{ name: L.news, path: '/news/' }] };
};

pages.faq = () => {
  const body = `<dl class="faq">${(site.faq || []).map((x) => `<dt>${esc(x.q)}</dt><dd>${esc(x.a)}</dd>`).join('')}</dl>${ctaBlock()}`;
  return { title: `${L.faq}｜${site.name}`, description: `${site.name}に寄せられるご質問と回答をまとめています。`, h1: L.faq, body, crumbs: [{ name: L.faq, path: '/faq/' }] };
};

pages.access = () => {
  const a = site.access || {};
  const body = `<section class="sec"><dl class="info"><dt>所在地</dt><dd>${esc(site.address.postalCode ? '〒' + site.address.postalCode + ' ' : '')}${esc(site.address.text)}</dd>${site.hours?.text ? `<dt>営業時間</dt><dd>${esc(site.hours.text)}</dd>` : ''}<dt>電話</dt><dd><a href="${telHref(site.contact.tel)}">${esc(site.contact.tel)}</a></dd>${(a.directions || []).map((d) => `<dt>${esc(d.k)}</dt><dd>${esc(d.v)}</dd>`).join('')}</dl></section><section class="sec">${mapBlock()}</section>${ctaBlock()}`;
  return { title: `${L.access}｜${site.name}`, description: `${site.name}の所在地（${site.address.text}）と営業時間、アクセス方法のご案内です。`, h1: L.access, body, crumbs: [{ name: L.access, path: '/access/' }] };
};

const FORM = {
  reserve: () => [
    ['name', 'お名前', 'text', true], ['email', 'メールアドレス', 'email', true], ['tel', '電話番号', 'tel', true],
    ['date', '希望日', 'date', true], ['time', '希望時間', 'select', true, site.reserve?.times || []],
    ['people', '参加（ご来店）人数', 'number', true], ['course', 'コース・メニュー', 'select', true, (site.services?.items || []).map((x) => x.name)],
    ['note', '備考（アレルギー・ご要望など）', 'textarea', false],
  ],
  estimate: () => [
    ['name', 'お名前', 'text', true], ['email', 'メールアドレス', 'email', true], ['tel', '電話番号', 'tel', true],
    ['address', '施工場所（市区町村まで）', 'text', true], ['category', 'ご相談内容', 'select', true, (site.services?.items || []).map((x) => x.name)],
    ['note', '内容の詳細', 'textarea', false],
  ],
  inquiry: () => [
    ['name', 'お名前', 'text', true], ['email', 'メールアドレス', 'email', true], ['tel', '電話番号', 'tel', false],
    ['category', 'ご相談の種類', 'select', true, (site.services?.items || []).map((x) => x.name)],
    ['note', 'ご相談内容', 'textarea', true],
  ],
};

pages.reserve = () => {
  const r = site.reserve || {};
  const fields = FORM[g.formKind]().map(([name, label, type, req, opts]) => {
    const id = 'f-' + name;
    const star = req ? ' <span class="req">必須</span>' : '';
    let ctl;
    if (type === 'select') ctl = `<select id="${id}" name="${name}"${req ? ' required' : ''}><option value="">選択してください</option>${(opts || []).map((o) => `<option>${esc(o)}</option>`).join('')}</select>`;
    else if (type === 'textarea') ctl = `<textarea id="${id}" name="${name}" rows="5"${req ? ' required' : ''}></textarea>`;
    else ctl = `<input id="${id}" name="${name}" type="${type}"${type === 'number' ? ' min="1" max="30" inputmode="numeric"' : ''}${type === 'tel' ? ' inputmode="tel" autocomplete="tel"' : ''}${type === 'email' ? ' autocomplete="email"' : ''}${name === 'name' ? ' autocomplete="name"' : ''}${req ? ' required' : ''}>`;
    return `<p class="field"><label for="${id}">${esc(label)}${star}</label>${ctl}</p>`;
  }).join('');
  const action = r.formAction ? ` action="${esc(r.formAction)}" method="post"` : ' data-no-endpoint="1"';
  const body = `${r.intro ? `<p class="lead">${esc(r.intro)}</p>` : ''}
<form class="form" id="reserve-form"${action}>
${fields}
<p class="hp" aria-hidden="true"><label>こちらは空のままにしてください<input type="text" name="website" tabindex="-1" autocomplete="off"></label></p>
<p class="field consent"><label><input type="checkbox" required> ${has('policy') ? '<a href="/policy/" target="_blank" rel="noopener">プライバシーポリシー</a>' : 'プライバシーポリシー'}に同意します <span class="req">必須</span></label></p>
<p><button class="btn btn-main btn-lg" type="submit">${esc(r.submitText || '内容を送信する')}</button></p>
<p class="form-msg" role="status" aria-live="polite" hidden></p>
</form>
${(r.notice || []).length ? `<section class="sec"><h2>ご予約前にご確認ください</h2><ul class="notes">${r.notice.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}
<p>お急ぎの場合はお電話でどうぞ：<a href="${telHref(site.contact.tel)}">${esc(site.contact.tel)}</a></p>`;
  return { title: `${L.reserve}フォーム｜${site.name}`, description: `${site.name}の${L.reserve}ページです。必要事項を入力して送信してください。`, h1: `${L.reserve}フォーム`, body, crumbs: [{ name: L.reserve, path: '/reserve/' }] };
};

pages.policy = () => {
  const p = site.policy?.body || [
    `${site.name}（以下「当店」）は、お客様の個人情報を次のとおり取り扱います。`,
    'お預かりした氏名・連絡先などは、ご予約・ご相談への対応とご連絡のためにのみ利用します。',
    '法令に基づく場合を除き、ご本人の同意なく第三者へ提供しません。',
    '個人情報の開示・訂正・削除のご希望は、お電話またはメールでお問い合わせください。',
  ];
  return { title: `プライバシーポリシー｜${site.name}`, description: `${site.name}の個人情報の取り扱い方針です。ご予約・お問い合わせで入力いただく情報の利用目的をご説明します。`, h1: 'プライバシーポリシー', body: `<section class="sec">${paras(p)}</section>`, crumbs: [{ name: 'プライバシーポリシー', path: '/policy/' }] };
};

// ---- 書き出し ----
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
const write = (rel, text) => { const f = path.join(outDir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

const built = [];
for (const slug of ['index', ...enabled]) {
  const p = pages[slug]();
  write(slug === 'index' ? 'index.html' : `${slug}/index.html`, layout({ slug, ...p }));
  built.push(slug);
}
// コラム（1記事＝1ページ。記事ごとに固有のアドレスと説明文を持つ）
if (has('column')) {
  for (const c of site.columns || []) {
    if (!c.slug || !/^[a-z0-9-]+$/.test(c.slug)) fail(`columns の slug は半角英数字とハイフンのみです: ${c.slug}`);
    const body = `<article><p class="note"><time datetime="${esc(c.date)}">${esc(c.date)}</time></p>${(c.sections || []).map((x) => `${x.heading ? `<h2>${esc(x.heading)}</h2>` : ''}${paras(x.body)}`).join('')}</article>${ctaBlock()}`;
    const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: c.title, datePublished: c.date, dateModified: c.updated || c.date, author: { '@type': 'Organization', name: site.name }, mainEntityOfPage: `${base}/column/${c.slug}/` };
    write(`column/${c.slug}/index.html`, layout({ slug: `column/${c.slug}`, title: `${c.title}｜${site.name}`, description: c.description || c.title, h1: c.title, body, crumbs: [{ name: L.column, path: '/column/' }, { name: c.title, path: `/column/${c.slug}/` }], extraLd: [ld] }));
    built.push(`column/${c.slug}`);
  }
}
// 送信完了ページ（検索には出さない）
if (has('reserve')) write('reserve/thanks/index.html', layout({ slug: 'reserve/thanks', title: `送信ありがとうございました｜${site.name}`, description: 'フォームの送信が完了しました。', h1: '送信ありがとうございました', noindex: true, body: `<p class="lead">内容を受け付けました。確認のうえ、${esc(site.reserve?.replyNote || 'ご連絡いたします')}。</p><p><a class="btn btn-main" href="/">トップへ戻る</a></p>` }));
write('404.html', layout({ slug: '404', title: `ページが見つかりません｜${site.name}`, description: 'お探しのページは見つかりませんでした。', h1: 'ページが見つかりません', noindex: true, body: '<p class="lead">URLが変わったか、ページが削除された可能性があります。</p><p><a class="btn btn-main" href="/">トップへ戻る</a></p>' }));

for (const it of site.services?.items || []) if (!it.price) notes.push(`料金が未記入です: 「${it.name}」（料金が分からないページは離脱されやすいため、最低料金だけでも載せてください）`);
if (has('voice') && !(site.voices || []).length) notes.push('お客様の声のページがありますが、内容が空です。掲載許可を得たものを入れてください');
const today = new Date().toISOString().slice(0, 10);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${built.map((s) => `  <url><loc>${base}${pagePath(s)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', site.isSample ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);

fs.copyFileSync(path.join(here, 'src/style.css'), path.join(outDir, 'assets/style.css'));
fs.copyFileSync(path.join(here, 'src/main.js'), path.join(outDir, 'assets/main.js'));
const imgDir = path.join(siteDir, 'images');
if (fs.existsSync(imgDir)) fs.cpSync(imgDir, path.join(outDir, 'images'), { recursive: true });

if (notes.length) console.log('\n【注意】\n' + notes.map((n) => ' - ' + n).join('\n') + '\n');
console.log(`作成完了: ${outDir}\nページ数: ${built.length}（${built.join(', ')}）${site.isSample ? '\n※ isSample=true のため検索に出ない設定です' : ''}`);
