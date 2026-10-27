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
const t = { ...(g.defaultTheme || {}), ...(site.theme || {}) };
// 見た目と構成の型。業種ごとの標準値(genres.json の design)を、会社ごとの site.design で上書きできる
const d = {
  hero: 'full', font: 'sans', radius: 'soft', services: 'cards',
  home: ['highlights', 'trust', 'worries', 'services', 'works', 'voice', 'flow', 'staff', 'news', 'access'],
  ...(g.design || {}), ...(site.design || {}),
};
const bodyClass = `f-${d.font} r-${d.radius} h-${d.hero} s-${d.services}`;

// ---- SEO上の役割の設計図（seo-blueprint.json）と、地域・業種の呼び名 ----
const BP = readJson(path.join(here, 'seo-blueprint.json'));
const area = site.area || site.address.locality || '';
const biz = site.biz || g.biz || g.label;
const bareName = site.name.replace(/（見本）/, '');
const fill = (str, svc = '') => String(str).replace(/\{area\}/g, area).replace(/\{biz\}/g, biz).replace(/\{name\}/g, bareName).replace(/\{svc\}/g, svc);
const roleOf = (key, svc = '') => {
  const r = BP.roles[key]; if (!r) return null;
  return { ...r, intent: fill(r.intent, svc), queries: r.queries.map((q) => fill(q, svc)), write: [...r.write, ...((g.seoExtra || {})[key] || [])] };
};
const seoPanel = (key, svc = '') => {
  if (!site.isSample) return '';
  const r = roleOf(key, svc); if (!r) return '';
  return `<details class="seo-tag"><summary>【見本の説明】このページのSEO上の役割：${esc(r.label)}</summary><dl><dt>対策の種類</dt><dd>${esc(r.measure)}</dd><dt>狙う検索の方向（例）</dt><dd>${esc(r.queries.join(' ／ '))}</dd><dt>このページで答えること</dt><dd>${esc(r.intent)}</dd><dt>ここに書く内容</dt><dd><ul>${r.write.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></dd><dt>避けること</dt><dd><ul>${r.avoid.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></dd></dl></details>`;
};
const seoChip = (k) => (site.isSample && BP.homeSections[k] ? `<p class="seo-chip"><b>対策：</b>${esc(BP.homeSections[k].measure)}　<b>書く内容：</b>${esc(BP.homeSections[k].note)}</p>` : '');
const withChip = (k, html) => (!html ? '' : html.includes('</h2>') ? html.replace('</h2>', '</h2>' + seoChip(k)) : html.replace(/^(<section[^>]*>)/, '$1' + seoChip(k)));
// トップの並び：冒頭文を先頭に、コラムと質問の要点をお知らせの手前に入れる（会社ごとの指定が優先）
if (!d.home.includes('intro')) d.home = ['intro', ...d.home];
for (const k of ['columns', 'faqtop']) if (!d.home.includes(k)) { const i = d.home.indexOf('news') >= 0 ? d.home.indexOf('news') : d.home.indexOf('access'); d.home.splice(i < 0 ? d.home.length : i, 0, k); }
const svcSlug = (x) => (x.slug && x.detail && has('services') ? x.slug : '');
const svcLink = (x, inner) => (svcSlug(x) ? `<a href="/services/${esc(x.slug)}/">${inner}</a>` : inner);

// ---- 全ページ共通の枠 ----
function layout({ slug, title, description, h1, body, noindex = false, crumbs = [], extraLd = [], role = '', svc = '' }) {
  const urlPath = pagePath(slug);
  const canonical = base + (urlPath === '/' ? '/' : urlPath);
  const robots = noindex || site.isSample ? '<meta name="robots" content="noindex,nofollow">' : '';
  const ogImage = site.hero?.image ? abs(imgSrc(site.hero.image)) : '';
  const nav = enabled.filter((p) => p !== 'policy').map((p) => `<li><a href="${pagePath(p)}"${p === slug ? ' aria-current="page"' : ''}>${esc(L[p])}</a></li>`).join('');
  const bc = crumbs.length
    ? jsonLd({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ name: 'ホーム', path: '/' }, ...crumbs].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: base + c.path })) })
    : '';
  const crumbHtml = crumbs.length ? `<nav class="crumbs" aria-label="パンくずリスト"><a href="/">ホーム</a> › ${crumbs.map((c) => esc(c.name)).join(' › ')}</nav>` : '';
  const sampleBanner = site.isSample ? `<div class="sample-banner">これは見本サイトです（検索には表示されません）${slug !== '_seo-plan' ? ' ／ <a href="/_seo-plan/">SEO構成図を見る</a>' : ' ／ <a href="/">トップへ</a>'}</div>` : '';
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
<style>:root{--main:${esc(t.main || '#0b6fa4')};--accent:${esc(t.accent || '#ff7a45')};--bg:${esc(t.bg || '#ffffff')};--text:${esc(t.text || '#1b2a33')};--band:${esc(t.band || 'color-mix(in srgb,var(--main) 10%,var(--bg))')};--card:${esc(t.card || '#ffffff')};--line:color-mix(in srgb,var(--main) 20%,var(--bg))}</style>
${bc}${extraLd.map(jsonLd).join('')}
</head>
<body class="${bodyClass}">
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
${role ? seoPanel(role, svc) : ''}
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
  const cta = `<a class="btn btn-main btn-lg" href="${esc(ctaHref)}">${esc(g.cta.text)}</a>`;
  const heroText = `<div class="hero-text"><h1>${esc(h.title || site.name)}</h1><p>${esc(h.lead || site.tagline || '')}</p><p>${cta} <a class="btn btn-tel btn-lg hero-tel" href="${telHref(site.contact.tel)}">${esc(site.contact.tel)}</a></p></div>`;
  const hero = d.hero === 'text'
    ? `<section class="hero">${heroText}</section>`
    : d.hero === 'split'
      ? `<section class="hero">${heroText}${img(h, 'hero-img', true)}</section>`
      : `<section class="hero">${img(h, 'hero-img', true)}${heroText}</section>`;
  const sec = {};
  const hl = (site.highlights || []).map((x) => `<li><h3>${esc(x.title)}</h3><p>${esc(x.body)}</p></li>`).join('');
  sec.highlights = hl ? `<section class="sec"><h2>${esc(site.name)}の特長</h2><ul class="highlights">${hl}</ul></section>` : '';
  sec.trust = (site.trust || []).length ? `<section class="trust" aria-label="信頼の目安"><ul>${site.trust.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : '';
  sec.worries = site.worries?.items?.length ? `<section class="sec"><h2>${esc(site.worries.title || 'こんなお悩みはありませんか')}</h2><ul class="worries">${site.worries.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${site.worries.after ? `<p>${esc(site.worries.after)}</p>` : ''}</section>` : '';
  const svItems = (site.services?.items || []).slice(0, 4);
  const svHtml = d.services === 'list'
    ? `<ul class="menu-list">${svItems.map((x) => `<li><span class="mn">${svcLink(x, esc(x.name))}<small>${esc(x.summary || '')}</small></span><span class="mp">${esc(x.price || '')}</span></li>`).join('')}</ul>`
    : `<ul class="cards">${svItems.map((x) => `<li class="card">${img(x, 'card-img')}<h3>${svcLink(x, esc(x.name))}</h3><p class="price">${esc(x.price || '')}</p><p>${esc(x.summary || '')}</p></li>`).join('')}</ul>`;
  sec.services = svItems.length && has('services') ? `<section class="sec"><h2>${esc(L.services)}</h2>${svHtml}<p class="more"><a href="/services/">${esc(L.services)}をすべて見る</a></p></section>` : '';
  const wk = (site.gallery || []).slice(0, 3);
  sec.works = wk.length && has('gallery') ? `<section class="sec"><h2>${esc(L.gallery)}</h2><ul class="grid works">${wk.map((x) => `<li>${img(x, 'grid-img')}${x.title ? `<h3>${esc(x.title)}</h3>` : ''}${(x.meta || []).length ? `<dl class="meta">${x.meta.map((m) => `<dt>${esc(m.k)}</dt><dd>${esc(m.v)}</dd>`).join('')}</dl>` : ''}</li>`).join('')}</ul><p class="more"><a href="/gallery/">${esc(L.gallery)}をすべて見る</a></p></section>` : '';
  const vc = (site.voices || []).slice(0, 2);
  sec.voice = vc.length && has('voice') ? `<section class="sec"><h2>${esc(L.voice)}</h2>${vc.map((v) => `<article class="voice"><h3>${esc(v.title || '')}</h3><p>${esc(v.body)}</p><p class="note">${esc(v.name || '')}</p></article>`).join('')}<p class="more"><a href="/voice/">${esc(L.voice)}をすべて見る</a></p></section>` : '';
  const fl = (site.flow?.steps || []).map((x) => `<li><strong>${esc(x.title)}</strong><span>${esc(x.body)}</span></li>`).join('');
  sec.flow = fl && has('flow') ? `<section class="sec"><h2>${esc(L.flow)}</h2><ol class="steps">${fl}</ol><p class="more"><a href="/flow/">${esc(L.flow)}の詳細を見る</a></p></section>` : '';
  const sf = (site.staff || []).slice(0, 2);
  sec.staff = sf.length && has('staff') ? `<section class="sec"><h2>${esc(L.staff)}</h2><ul class="cards">${sf.map((m) => `<li class="card">${img(m, 'card-img')}<h3>${esc(m.name)}</h3><p class="price">${esc(m.role || '')}</p><p>${esc(m.message || '')}</p></li>`).join('')}</ul><p class="more"><a href="/staff/">${esc(L.staff)}（資格・経歴）を見る</a></p></section>` : '';
  const nw = (site.news || []).slice(0, 3).map((n) => `<li><time datetime="${esc(n.date)}">${esc(n.date)}</time> <a href="/news/">${esc(n.title)}</a></li>`).join('');
  sec.news = nw && has('news') ? `<section class="sec"><h2>${esc(L.news)}</h2><ul class="news">${nw}</ul><p class="more"><a href="/news/">${esc(L.news)}一覧</a></p></section>` : '';
  sec.access = has('access') ? `<section class="sec"><h2>${esc(L.access)}</h2><p>${esc(site.address.text)}</p>${site.hours?.text ? `<p>${esc(site.hours.text)}</p>` : ''}${mapBlock()}<p class="more"><a href="/access/">${esc(L.access)}の詳細（行き方・駐車場）を見る</a></p></section>` : '';
  const it = site.intro;
  sec.intro = it?.body?.length ? `<section class="sec intro"><h2>${esc(it.title || `${area}の${biz}、${site.name}`)}</h2>${paras(it.body)}${has('about') ? `<p class="more"><a href="/about/">${esc(L.about)}を見る</a></p>` : ''}</section>` : '';
  const cols = [...(site.columns || [])].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);
  sec.columns = cols.length && has('column') ? `<section class="sec"><h2>${esc(L.column)}</h2><ul class="news">${cols.map((c) => `<li><time datetime="${esc(c.date)}">${esc(c.date)}</time> <a href="/column/${esc(c.slug)}/">${esc(c.title)}</a></li>`).join('')}</ul><p class="more"><a href="/column/">${esc(L.column)}一覧</a></p></section>` : '';
  const fq = (site.faq || []).filter((x) => x.top).concat((site.faq || []).filter((x) => !x.top)).slice(0, 3);
  sec.faqtop = fq.length && has('faq') ? `<section class="sec"><h2>${esc(L.faq)}</h2><dl class="faq">${fq.map((x) => `<dt>${esc(x.q)}</dt><dd>${esc(x.a)}</dd>`).join('')}</dl><p class="more"><a href="/faq/">${esc(L.faq)}をすべて見る</a></p></section>` : '';
  for (const k of Object.keys(sec)) sec[k] = withChip(k, sec[k]);
  const body = `
${hero}
${d.home.map((k) => sec[k] || '').join('\n')}
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
    ...(site.access?.areaServed ? { areaServed: site.access.areaServed } : {}),
  };
  return { title: `${site.name}｜${area ? area + 'の' : ''}${biz}`, description: site.description, body, extraLd: [ld], role: 'index' };
};

pages.about = () => {
  const a = site.about || {};
  const body = (a.sections || []).map((s) => `<section class="sec">${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}${paras(s.body)}</section>`).join('') +
    `<section class="sec"><h2>基本情報</h2><dl class="info"><dt>名称</dt><dd>${esc(site.name)}</dd><dt>所在地</dt><dd>${esc(site.address.text)}</dd><dt>電話</dt><dd><a href="${telHref(site.contact.tel)}">${esc(site.contact.tel)}</a></dd>${site.hours?.text ? `<dt>営業時間</dt><dd>${esc(site.hours.text)}</dd>` : ''}${(a.facts || []).map((f) => `<dt>${esc(f.k)}</dt><dd>${esc(f.v)}</dd>`).join('')}</dl></section>` + ctaBlock();
  return { title: `${L.about}｜${site.name}`, description: a.description || `${site.name}の${L.about}です。${site.description}`.slice(0, 120), h1: L.about, body, crumbs: [{ name: L.about, path: '/about/' }], role: 'about' };
};

pages.services = () => {
  const s = site.services || {};
  const items = (s.items || []).map((x) => `<article class="svc">${img(x, 'svc-img')}<div><h2>${svcLink(x, esc(x.name))}</h2><p class="price">${esc(x.price || '')}${x.time ? ` ／ ${esc(x.time)}` : ''}</p>${x.note ? `<p class="note">${esc(x.note)}</p>` : ''}<p>${esc(x.description || x.summary || '')}</p>${svcSlug(x) ? `<p class="more"><a href="/services/${esc(x.slug)}/">${esc(x.name)}の詳細を見る</a></p>` : ''}</div></article>`).join('');
  const body = `${s.intro ? `<p class="lead">${esc(s.intro)}</p>` : ''}${items}
${s.included ? `<section class="sec"><h2>料金に含まれるもの</h2><p>${esc(s.included)}</p></section>` : ''}
${(s.details || []).length ? `<section class="sec"><h2>詳細</h2><dl class="info">${s.details.map((d) => `<dt>${esc(d.k)}</dt><dd>${esc(d.v)}</dd>`).join('')}</dl></section>` : ''}
${(s.notes || []).length ? `<section class="sec"><h2>ご注意</h2><ul class="notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}${ctaBlock()}`;
  const ld = (s.items || []).some((x) => x.priceNumber)
    ? [{ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: s.items.map((x, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Service', name: x.name, provider: { '@id': base + '/#business' }, ...(x.priceNumber ? { offers: { '@type': 'Offer', price: x.priceNumber, priceCurrency: 'JPY' } } : {}) } })) }]
    : [];
  return { title: `${L.services}｜${site.name}`, description: s.description || `${site.name}の${L.services}。${s.intro || ''}`.slice(0, 120), h1: L.services, body, crumbs: [{ name: L.services, path: '/services/' }], extraLd: ld, role: 'services' };
};

// メニュー個別ページ（1メニュー＝1ページ。具体的な検索に1ページで答える）
const serviceDetail = (x) => {
  const dt = x.detail || {};
  const li = (arr) => (arr || []).map((v) => `<li>${esc(v)}</li>`).join('');
  const rel = (x.related || []).map((sl) => (site.columns || []).find((c) => c.slug === sl)).filter(Boolean);
  const body = `<p class="lead">${esc(x.summary || '')}</p>
<dl class="info"><dt>料金</dt><dd>${esc(x.price || '')}</dd>${x.time ? `<dt>所要時間</dt><dd>${esc(x.time)}</dd>` : ''}${area ? `<dt>実施場所</dt><dd>${esc(area)}</dd>` : ''}</dl>
${(dt.target || []).length ? `<section class="sec"><h2>こんな方におすすめです</h2><ul class="checks">${li(dt.target)}</ul>${(dt.notFor || []).length ? `<h3>向いていない場合</h3><ul class="notes">${li(dt.notFor)}</ul>` : ''}</section>` : ''}
${(dt.contents || []).length ? `<section class="sec"><h2>${esc(x.name)}の内容</h2><ul class="checks">${li(dt.contents)}</ul></section>` : ''}
${(dt.priceBreakdown || []).length ? `<section class="sec"><h2>料金の内訳</h2><dl class="info">${dt.priceBreakdown.map((r) => `<dt>${esc(r.k)}</dt><dd>${esc(r.v)}</dd>`).join('')}</dl></section>` : ''}
${(dt.steps || []).length ? `<section class="sec"><h2>当日の流れ</h2><ol class="steps">${dt.steps.map((st) => `<li><strong>${esc(st.title)}</strong>${st.body ? `<span>${esc(st.body)}</span>` : ''}</li>`).join('')}</ol></section>` : ''}
${(dt.cautions || []).length ? `<section class="sec"><h2>ご注意</h2><ul class="notes">${li(dt.cautions)}</ul></section>` : ''}
${(dt.faq || []).length ? `<section class="sec"><h2>${esc(x.name)}のよくある質問</h2><dl class="faq">${dt.faq.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join('')}</dl></section>` : ''}
${rel.length ? `<section class="sec"><h2>あわせて読みたい</h2><ul class="news">${rel.map((c) => `<li><a href="/column/${esc(c.slug)}/">${esc(c.title)}</a></li>`).join('')}</ul></section>` : ''}
<p class="more"><a href="/services/">${esc(L.services)}の一覧に戻る</a></p>${ctaBlock()}`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'Service', name: x.name, description: x.summary || x.name, provider: { '@id': base + '/#business' }, ...(area ? { areaServed: area } : {}), ...(x.priceNumber ? { offers: { '@type': 'Offer', price: x.priceNumber, priceCurrency: 'JPY' } } : {}) }];
  return { title: `${x.name}の内容と料金｜${site.name}`, description: dt.description || `${area ? area + 'の' : ''}${site.name}の「${x.name}」。${x.summary || ''}料金は${x.price || ''}${x.time ? '、' + x.time : ''}。`.slice(0, 120), h1: `${x.name}の内容と料金`, body, crumbs: [{ name: L.services, path: '/services/' }, { name: x.name, path: `/services/${x.slug}/` }], extraLd: ld, role: 'service', svc: x.name };
};

pages.flow = () => {
  const f = site.flow || {};
  const body = `${f.intro ? `<p class="lead">${esc(f.intro)}</p>` : ''}<ol class="steps big">${(f.steps || []).map((s) => `<li><strong>${esc(s.title)}</strong><span>${esc(s.body)}</span></li>`).join('')}</ol>${ctaBlock()}`;
  return { title: `${L.flow}｜${site.name}`, description: f.description || `${site.name}の${L.flow}を順番にご案内します。${site.description}`.slice(0, 120), h1: L.flow, body, crumbs: [{ name: L.flow, path: '/flow/' }], role: 'flow' };
};

pages.staff = () => {
  const body = `<ul class="cards">${(site.staff || []).map((m) => `<li class="card">${img(m, 'card-img')}<h2 class="h3">${esc(m.name)}</h2><p class="price">${esc(m.role || '')}</p><p>${esc(m.message || '')}</p>${(m.qualifications || []).length || m.career ? `<dl class="info">${(m.qualifications || []).length ? `<dt>資格・所属</dt><dd>${m.qualifications.map(esc).join('<br>')}</dd>` : ''}${m.career ? `<dt>経歴</dt><dd>${esc(m.career)}</dd>` : ''}</dl>` : ''}</li>`).join('')}</ul>`;
  const pld = (site.staff || []).map((m) => ({ '@context': 'https://schema.org', '@type': 'Person', name: m.name, jobTitle: m.role, worksFor: { '@id': base + '/#business' } }));
  return { title: `${L.staff}｜${site.name}`, description: `${site.name}の${L.staff}です。${(site.staff || []).map((m) => m.name + '（' + (m.role || '') + '）').join('、')}の資格・経歴をご紹介します。`.slice(0, 120), h1: L.staff, body, crumbs: [{ name: L.staff, path: '/staff/' }], extraLd: pld, role: 'staff' };
};

pages.gallery = () => {
  const one = (x) => `<li>${img(x, 'grid-img')}${x.title ? `<h2 class="h3">${esc(x.title)}</h2>` : ''}${x.body ? `<p>${esc(x.body)}</p>` : ''}${(x.meta || []).length ? `<dl class="meta">${x.meta.map((m) => `<dt>${esc(m.k)}</dt><dd>${esc(m.v)}</dd>`).join('')}</dl>` : ''}</li>`;
  const body = `<ul class="grid works">${(site.gallery || []).map(one).join('')}</ul>`;
  return { title: `${L.gallery}｜${site.name}`, description: `${site.name}の${L.gallery}です。${site.description}`.slice(0, 120), h1: L.gallery, body, crumbs: [{ name: L.gallery, path: '/gallery/' }], role: 'gallery' };
};

pages.voice = () => {
  const body = `<p class="lead">ご利用いただいたお客様からいただいたご感想です（掲載の許可をいただいたものだけを載せています）。</p>${(site.voices || []).map((v) => `<article class="voice"><h2 class="h3">${esc(v.title || '')}</h2><p>${esc(v.body)}</p><p class="note">${esc(v.name || '')}</p></article>`).join('')}${ctaBlock()}`;
  return { title: `${L.voice}｜${site.name}`, description: `${site.name}をご利用いただいたお客様の声です。${site.description}`.slice(0, 120), h1: L.voice, body, crumbs: [{ name: L.voice, path: '/voice/' }], role: 'voice' };
};

pages.column = () => {
  const body = `<ul class="news big">${(site.columns || []).map((c) => `<li><time datetime="${esc(c.date)}">${esc(c.date)}</time>${c.category ? ` <span class="tag">${esc(c.category)}</span>` : ''}<h2 class="h3"><a href="/column/${esc(c.slug)}/">${esc(c.title)}</a></h2><p>${esc(c.description || '')}</p></li>`).join('')}</ul>`;
  return { title: `${L.column}｜${site.name}`, description: `${site.name}が、お客様からよく聞かれる疑問や役立つ情報をまとめたコラムの一覧です。`, h1: L.column, body, crumbs: [{ name: L.column, path: '/column/' }], role: 'column' };
};

pages.news = () => {
  const body = `<ul class="news big">${(site.news || []).map((n) => `<li><time datetime="${esc(n.date)}">${esc(n.date)}</time><h2 class="h3">${esc(n.title)}</h2>${n.body ? `<p>${esc(n.body)}</p>` : ''}</li>`).join('')}</ul>`;
  return { title: `${L.news}｜${site.name}`, description: `${site.name}からのお知らせ・営業情報の一覧です。${site.description}`.slice(0, 120), h1: L.news, body, crumbs: [{ name: L.news, path: '/news/' }], role: 'news' };
};

pages.faq = () => {
  const all = site.faq || [];
  const cats = [...new Set(all.map((x) => x.category || 'その他'))];
  const one = (x) => `<dt>${esc(x.q)}</dt><dd>${esc(x.a)}${x.link ? ` <a href="${esc(x.link.href)}">${esc(x.link.text)}</a>` : ''}</dd>`;
  const jump = cats.length > 1 ? `<nav class="jump" aria-label="質問の分類"><ul>${cats.map((c, i) => `<li><a href="#faq-${i + 1}">${esc(c)}</a></li>`).join('')}</ul></nav>` : '';
  const groups = cats.map((c, i) => `<section class="sec" id="faq-${i + 1}"><h2>${esc(c)}</h2><dl class="faq">${all.filter((x) => (x.category || 'その他') === c).map(one).join('')}</dl></section>`).join('');
  const body = `<p class="lead">${esc(site.name)}に寄せられるご質問を、分類ごとにまとめています。載っていないことは、お電話でもお答えします。</p>${jump}${groups}${ctaBlock()}`;
  return { title: `${L.faq}（${cats.slice(0, 3).join('・')}）｜${site.name}`, description: `${area ? area + 'の' : ''}${site.name}によくいただくご質問と回答です。${cats.join('・')}について、結論から先にお答えします。`.slice(0, 120), h1: L.faq, body, crumbs: [{ name: L.faq, path: '/faq/' }], role: 'faq' };
};

pages.access = () => {
  const a = site.access || {};
  const body = `<section class="sec"><dl class="info"><dt>所在地</dt><dd>${esc(site.address.postalCode ? '〒' + site.address.postalCode + ' ' : '')}${esc(site.address.text)}</dd>${site.hours?.text ? `<dt>営業時間</dt><dd>${esc(site.hours.text)}</dd>` : ''}<dt>電話</dt><dd><a href="${telHref(site.contact.tel)}">${esc(site.contact.tel)}</a></dd>${(a.directions || []).map((d) => `<dt>${esc(d.k)}</dt><dd>${esc(d.v)}</dd>`).join('')}${a.areaServed ? `<dt>対応エリア</dt><dd>${esc([].concat(a.areaServed).join('、'))}</dd>` : ''}</dl></section><section class="sec">${mapBlock()}</section>${ctaBlock()}`;
  return { title: `${L.access}・営業時間｜${site.name}`, description: `${site.name}の所在地（${site.address.text}）、営業時間、行き方・駐車場のご案内です。`, h1: L.access, body, crumbs: [{ name: L.access, path: '/access/' }], role: 'access' };
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
  const action = r.formAction ? ` action="${esc(r.formAction)}" method="post" data-thanks="/reserve/thanks/"` : ' data-no-endpoint="1"';
  const body = `${r.intro ? `<p class="lead">${esc(r.intro)}</p>` : ''}
<form class="form" id="reserve-form"${action}>
${fields}
<input type="hidden" name="_site" value="${esc(site.name)}">
<p class="hp" aria-hidden="true"><label>こちらは空のままにしてください<input type="text" name="website" tabindex="-1" autocomplete="off"></label></p>
<p class="field consent"><label><input type="checkbox" required> ${has('policy') ? '<a href="/policy/" target="_blank" rel="noopener">プライバシーポリシー</a>' : 'プライバシーポリシー'}に同意します <span class="req">必須</span></label></p>
<p><button class="btn btn-main btn-lg" type="submit">${esc(r.submitText || '内容を送信する')}</button></p>
<p class="form-msg" role="status" aria-live="polite" hidden></p>
</form>
${(r.notice || []).length ? `<section class="sec"><h2>ご予約前にご確認ください</h2><ul class="notes">${r.notice.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}
<p>お急ぎの場合はお電話でどうぞ：<a href="${telHref(site.contact.tel)}">${esc(site.contact.tel)}</a></p>`;
  return { title: `${L.reserve}フォーム｜${site.name}`, description: `${site.name}の${L.reserve}ページです。必要事項を入力して送信してください。`, h1: `${L.reserve}フォーム`, body, crumbs: [{ name: L.reserve, path: '/reserve/' }], role: 'reserve' };
};

pages.policy = () => {
  const p = site.policy?.body || [
    `${site.name}（以下「当店」）は、お客様の個人情報を次のとおり取り扱います。`,
    'お預かりした氏名・連絡先などは、ご予約・ご相談への対応とご連絡のためにのみ利用します。',
    '法令に基づく場合を除き、ご本人の同意なく第三者へ提供しません。',
    '個人情報の開示・訂正・削除のご希望は、お電話またはメールでお問い合わせください。',
  ];
  return { title: `プライバシーポリシー｜${site.name}`, description: `${site.name}の個人情報の取り扱い方針です。ご予約・お問い合わせで入力いただく情報の利用目的をご説明します。`, h1: 'プライバシーポリシー', body: `<section class="sec">${paras(p)}</section>`, crumbs: [{ name: 'プライバシーポリシー', path: '/policy/' }], role: 'policy' };
};

// ---- 書き出し ----
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
const write = (rel, text) => { const f = path.join(outDir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

const built = [];
const records = []; // SEO構成図と点検に使う、ページごとの記録
const emit = (slug, p, kind) => {
  const html = layout({ slug, ...p });
  write(slug === 'index' ? 'index.html' : `${slug}/index.html`, html);
  built.push(slug);
  records.push({ slug, kind: kind || p.role || slug, role: p.role, svc: p.svc || '', title: p.title, description: p.description, h1: p.h1 || site.hero?.title || site.name, html });
};
for (const slug of ['index', ...enabled]) emit(slug, pages[slug]());
// メニュー個別ページ
if (has('services')) {
  for (const x of site.services?.items || []) {
    if (!x.slug) continue;
    if (!/^[a-z0-9-]+$/.test(x.slug)) fail(`services の slug は半角英数字とハイフンのみです: ${x.slug}`);
    if (x.detail) emit(`services/${x.slug}`, serviceDetail(x), 'service');
  }
}
// コラム（1記事＝1ページ。記事ごとに固有のアドレスと説明文を持つ）
if (has('column')) {
  for (const c of site.columns || []) {
    if (!c.slug || !/^[a-z0-9-]+$/.test(c.slug)) fail(`columns の slug は半角英数字とハイフンのみです: ${c.slug}`);
    const relSvc = (site.services?.items || []).filter((x) => svcSlug(x) && (x.related || []).includes(c.slug));
    const relBox = relSvc.length ? `<section class="sec relbox"><h2>この悩みに関係するメニュー</h2><ul class="news">${relSvc.map((x) => `<li><a href="/services/${esc(x.slug)}/">${esc(x.name)}</a>（${esc(x.price || '')}）</li>`).join('')}</ul></section>` : '';
    const body = `<article><p class="note"><time datetime="${esc(c.date)}">${esc(c.date)}</time>${c.updated ? `（更新 ${esc(c.updated)}）` : ''}${c.category ? ` <span class="tag">${esc(c.category)}</span>` : ''}</p>${c.summary ? `<p class="answer"><strong>結論</strong>${esc(c.summary)}</p>` : ''}${(c.sections || []).map((x) => `${x.heading ? `<h2>${esc(x.heading)}</h2>` : ''}${paras(x.body)}`).join('')}</article>${relBox}${ctaBlock()}`;
    const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: c.title, datePublished: c.date, dateModified: c.updated || c.date, author: { '@type': 'Organization', name: site.name }, mainEntityOfPage: `${base}/column/${c.slug}/` };
    emit(`column/${c.slug}`, { title: `${c.title}｜${site.name}`, description: c.description || c.title, h1: c.title, body, crumbs: [{ name: L.column, path: '/column/' }, { name: c.title, path: `/column/${c.slug}/` }], extraLd: [ld], role: 'article', svc: '' }, 'article');
  }
}
// 送信完了ページ（検索には出さない）
if (has('reserve')) write('reserve/thanks/index.html', layout({ slug: 'reserve/thanks', title: `送信ありがとうございました｜${site.name}`, description: 'フォームの送信が完了しました。', h1: '送信ありがとうございました', noindex: true, body: `<p class="lead">内容を受け付けました。確認のうえ、${esc(site.reserve?.replyNote || 'ご連絡いたします')}。</p><p><a class="btn btn-main" href="/">トップへ戻る</a></p>` }));
write('404.html', layout({ slug: '404', title: `ページが見つかりません｜${site.name}`, description: 'お探しのページは見つかりませんでした。', h1: 'ページが見つかりません', noindex: true, body: '<p class="lead">URLが変わったか、ページが削除された可能性があります。</p><p><a class="btn btn-main" href="/">トップへ戻る</a></p>' }));

// ---- ページの記録を集計（本文の量・本文内リンク） ----
const mainOf = (h) => (h.match(/<main id="main">([\s\S]*?)<\/main>/) || [])[1] || '';
const textOf = (h) => mainOf(h).replace(/<script[\s\S]*?<\/script>|<details class="seo-tag">[\s\S]*?<\/details>|<p class="seo-chip">[\s\S]*?<\/p>|<[^>]+>/g, '').replace(/\s+/g, '');
const linksOf = (h) => [...new Set([...mainOf(h).replace(/<details class="seo-tag">[\s\S]*?<\/details>/g, '').matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]).filter((u) => u.endsWith('/') && !u.startsWith('/_seo-plan')))];
const pathOf = (slug) => (slug === 'index' ? '/' : `/${slug}/`);
for (const r of records) { r.len = textOf(r.html).length; r.out = linksOf(r.html).filter((u) => u !== pathOf(r.slug)); }
for (const r of records) r.inn = records.filter((o) => o !== r && o.out.includes(pathOf(r.slug))).length;

const HOME_JA = { intro: '冒頭文', highlights: '特長', trust: '信頼の帯', worries: 'お悩み', services: 'メニュー', works: '事例', voice: 'お客様の声', flow: '流れ', staff: 'スタッフ', columns: 'コラム', faqtop: 'よくある質問（要点）', news: 'お知らせ', access: 'アクセス' };
// ---- SEO構成図（見本サイトだけに出力。本番サイトには出さない） ----
if (site.isSample || process.env.SEO_PLAN === '1') {
  const sample = site.isSample;
  const rows = records.map((r) => {
    const ro = roleOf(r.kind === 'index' ? 'index' : r.kind, r.svc);
    if (!ro) return '';
    return `<section class="sec plan-item" id="p-${esc(r.slug.replace(/\//g, '-'))}"><h2><a href="${pathOf(r.slug)}">${esc(pathOf(r.slug))}</a>　${esc(ro.label)}${r.svc ? `（${esc(r.svc)}）` : ''}</h2>
<dl class="info"><dt>対策の種類</dt><dd>${esc(ro.measure)}</dd><dt>このページで答えること</dt><dd>${esc(ro.intent)}</dd><dt>狙う検索の方向（例）</dt><dd>${esc(ro.queries.join(' ／ '))}</dd>
<dt>タイトル</dt><dd>${esc(r.title)}（${r.title.length}文字）</dd><dt>説明文</dt><dd>${esc(r.description)}（${r.description.length}文字）</dd><dt>大見出し(h1)</dt><dd>${esc(r.h1)}</dd>
<dt>ここに書く内容</dt><dd><ul>${ro.write.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></dd><dt>避けること</dt><dd><ul>${ro.avoid.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></dd>
<dt>本文の量</dt><dd>約${r.len}文字</dd><dt>本文内のリンク</dt><dd>このページから ${r.out.length}か所 ／ 他のページから ${r.inn}か所</dd></dl></section>`;
  }).join('');
  const hs = d.home.map((k) => (BP.homeSections[k] ? `<tr><td>${esc(HOME_JA[k] || k)}</td><td>${esc(BP.homeSections[k].measure)}</td><td>${esc(BP.homeSections[k].note)}</td></tr>` : '')).join('');
  const body = `<p class="lead">${esc(site.name)}の各ページに、検索対策としてどんな役割を持たせ、何を書くかをまとめた構成図です。実際のページ上部の「【見本の説明】」と同じ内容です。</p>
<section class="sec"><h2>見方</h2><ul class="notes"><li>「対策の種類」：そのページが担う検索対策の名前です（内部対策／コンテンツSEO／MEO／信頼性 など）。</li><li>「狙う検索の方向（例）」：どんな言葉で探す人に向けたページかの例です。検索回数や順位を示すものではありません。</li><li>「ここに書く内容」：会社から文面をもらうとき、この項目を質問として渡せます。</li><li>効果（順位・クリック数）は、公開後に Search Console で確認します。この構成図は順位を保証するものではありません。</li></ul></section>
<section class="sec"><h2>トップページの区画ごとの役割</h2><div class="table-wrap"><table class="plan-table"><thead><tr><th>区画</th><th>対策</th><th>書く内容</th></tr></thead><tbody>${hs}</tbody></table></div></section>
${rows}`;
  const html = layout({ slug: '_seo-plan', title: `SEO構成図｜${site.name}`, description: `${site.name}の各ページの検索対策上の役割と書く内容の一覧です。`, h1: `${site.name}　SEO構成図`, noindex: true, body });
  write('_seo-plan/index.html', html);
}

// 色の読みやすさ（文字と背景の明暗差が4.5未満なら注意）。#RRGGBB 形式のみ判定
{
  const L = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const cr = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const hex = (v) => /^#[0-9a-f]{6}$/i.test(v || '');
  const band = t.band || t.bg || '#ffffff';
  const pairs = [['白文字と主色', '#ffffff', t.main], ['白文字と強調色（ボタン）', '#ffffff', t.accent], ['主色と帯の背景', t.main, band], ['強調色（価格など）と背景', t.accent, t.bg || '#ffffff'], ['強調色（価格など）と帯の背景', t.accent, band]];
  for (const [name, a, b] of pairs) if (hex(a) && hex(b) && cr(a, b) < 4.5) notes.push(`色の読みやすさ: ${name}の明暗差が ${cr(a, b).toFixed(1)} です（4.5以上が目安）。色を少し濃く／薄くしてください`);
}
if ((site.trust || []).length) notes.push('「信頼の目安」の帯に載せる内容（資格・許可・実績など）は、事実で裏付けられるものだけにしてください');
if (g.formKind && ['clinic'].includes(site.genre) && (site.voices || []).length) notes.push('整体・整骨院などでは、体験談の広告掲載に法令やガイドライン上の制限がある場合があります。公開前に確認してください（私は法律の専門家ではありません）');
for (const it of site.services?.items || []) if (!it.price) notes.push(`料金が未記入です: 「${it.name}」（料金が分からないページは離脱されやすいため、最低料金だけでも載せてください）`);
if (has('voice') && !(site.voices || []).length) notes.push('お客様の声のページがありますが、内容が空です。掲載許可を得たものを入れてください');
// ---- SEO面の不足チェック ----
if (!site.area && !site.address.locality) notes.push('SEO: 地域名(area)が未記入です。トップのタイトルや冒頭文に地域名が入りません');
if (!site.intro?.body?.length) notes.push('SEO: トップの冒頭文(intro)が未記入です。「地域×業種」で探す人に伝わる文章を3〜4文書いてください');
if (has('services')) {
  const noDetail = (site.services?.items || []).filter((x) => !(x.slug && x.detail));
  if (noDetail.length) notes.push(`SEO: メニュー個別ページがありません: ${noDetail.map((x) => x.name).join('、')}（具体的な検索に答えるページです。対象・内容・料金内訳・流れ・注意・質問を書いてください）`);
}
if (has('faq')) {
  const f = site.faq || [];
  if (f.length < 6) notes.push(`SEO: よくある質問が${f.length}件です。お客様が実際に聞く質問を6件以上、分類（予約・料金・当日など）ごとに書くのが目安です`);
  if (f.length && !f.some((x) => x.category)) notes.push('SEO: 質問に分類(category)がありません。探しやすさのため分類してください');
}
if (!has('column') || (site.columns || []).length < 3) notes.push('SEO: コラム（悩み・疑問に答える記事）が3本未満です。お店の名前を知らない人との最初の接点になります');
for (const c of site.columns || []) if (!c.summary) notes.push(`SEO: コラム「${c.title}」に結論(summary)がありません。冒頭で答えを先に書いてください`);
if (has('column')) for (const c of site.columns || []) if (!(site.services?.items || []).some((x) => (x.related || []).includes(c.slug))) notes.push(`SEO: コラム「${c.title}」から関連メニューへのリンクがありません（services.items[].related に slug を追加）`);
if (has('staff') && (site.staff || []).some((m) => !(m.qualifications || []).length && !m.career)) notes.push('SEO: スタッフの資格・経歴が未記入です（信頼性の根拠になります。事実のみ記入）');
if (!site.access?.directions?.length && has('access')) notes.push('SEO(MEO): アクセスの道順・駐車場が未記入です');
notes.push('SEO(MEO): アクセス欄の店名・住所・電話・営業時間は、Googleビジネスプロフィールの登録と一字一句同じにしてください');
const today = new Date().toISOString().slice(0, 10);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${built.map((s) => `  <url><loc>${base}${pagePath(s)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', site.isSample ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);

fs.copyFileSync(path.join(here, 'src/style.css'), path.join(outDir, 'assets/style.css'));
fs.copyFileSync(path.join(here, 'src/main.js'), path.join(outDir, 'assets/main.js'));
const imgDir = path.join(siteDir, 'images');
if (fs.existsSync(imgDir)) fs.cpSync(imgDir, path.join(outDir, 'images'), { recursive: true });

if (notes.length) console.log('\n【注意】\n' + notes.map((n) => ' - ' + n).join('\n') + '\n');
console.log(`作成完了: ${outDir}\nページ数: ${built.length}（${built.join(', ')}）${site.isSample ? '\n※ isSample=true のため検索に出ない設定です' : ''}`);
