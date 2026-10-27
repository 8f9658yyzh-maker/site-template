#!/usr/bin/env node
// 業種ごとの見本サイト(各2型)を sites/<業種>-a, -b に作る。内容はすべて架空。
import fs from 'node:fs';
import path from 'node:path';
import { S } from './seo-content.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrastWhite = (hex) => 1.05 / (lum(hex) + 0.05);

const svg = (c1, c2, label, w = 1200, h = 800) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f4f4"/><stop offset="1" stop-color="#dedede"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><text x="50%" y="50%" fill="#8a8a8a" font-size="${Math.round(w / 13)}" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ---- 業種ごとの共通の中身 ----
const C = {
  activity: {
    pages: ['about', 'services', 'flow', 'staff', 'gallery', 'voice', 'news', 'faq', 'access', 'reserve', 'policy'],
    highlights: [['初心者歓迎', '出発前にスタッフが丁寧にレクチャーします。'], ['道具の貸し出し込み', '必要な道具は料金に含まれます。'], ['天候の変更は無料', '荒天で中止の場合は日程変更や返金に対応します。']],
    services: [['ロングコース', '10,000円', 10000, '景色をゆっくり楽しむ人気のコース。'], ['スタンダードコース', '7,000円', 7000, 'はじめての方におすすめ。'], ['ショートコース', '5,000円', 5000, 'お子さま連れにも。'], ['貸切コース', '30,000円', 30000, 'グループ・ご家族だけで。']],
    flow: [['現地に集合', '出発15分前までにお越しください。'], ['準備とレクチャー', '道具をお渡しし、注意事項をご説明します。'], ['体験スタート', 'スタッフがそばでサポートします。'], ['写真のご案内', '撮影した写真をお渡しします。']],
    staffRole: '代表・ガイド', staffMsg: '安全第一で、楽しんでいただけるよう努めます。',
    gallery: [['体験の様子', '晴れた日の様子です。', [['所要時間', '約60分'], ['料金', '7,000円〜']]], ['ご家族での体験', 'お子さま連れの方も多く参加されています。', [['所要時間', '約40分'], ['料金', '5,000円〜']]], ['夕方のコース', '時間帯で景色が変わります。', [['所要時間', '約60分'], ['料金', '7,000円〜']]]],
    voices: [['初めてでも安心でした', '丁寧に教えてもらえて、最後まで楽しめました。', '30代 女性'], ['家族みんな満足', '子どもも大喜びでした。', '40代 男性']],
    faq: [['雨の日でも体験できますか？', '小雨なら実施できる場合があります。荒天の場合は前日または当日にご連絡します。'], ['泳げなくても大丈夫ですか？', 'ライフジャケットを着用するため、泳げない方も参加できます。']],
    access: [['集合場所', '見本港の受付前'], ['駐車場', '無料駐車場あり']],
    news: [['2026-10-01', '冬季休業のお知らせ', '12月から2月末まではお休みをいただきます。'], ['2026-06-07', '夏のご予約受付中', '夏の人気日程はお早めにご予約ください。']],
    ctaLead: 'ご予約はフォーム・お電話から。前日までのキャンセルは無料です。', price: '¥5,000〜¥30,000', times: ['8:30', '10:00', '11:30', '13:30', '15:00'], hours: ['8:00', '17:00', '8:00〜17:00（年中無休）'],
    about: ['お店の想い', ['島の海を、安全に、気軽に楽しんでほしいという想いで始めました。', '経験豊富なスタッフが毎回の天候と海の状態を見て実施を判断します。']],
    notes: ['天候により中止となる場合があります。'],
  },
  restaurant: {
    pages: ['about', 'services', 'gallery', 'voice', 'news', 'faq', 'access', 'reserve', 'policy'],
    highlights: [['地元の食材', '近くの農家・漁師から仕入れた食材を使います。'], ['ランチは予約不要', '平日のランチは席が空いていればご案内します。'], ['個室あり', '6名様までの個室をご用意しています。']],
    services: [['ランチコース', '2,200円', 2200, '前菜・メイン・デザート付き。'], ['ディナーコース', '5,500円', 5500, '季節の食材を使った全6品。'], ['単品メニュー', '900円〜', 900, '一品料理もお選びいただけます。'], ['ドリンク', '600円〜', 600, 'ワイン・地酒・ソフトドリンク。']],
    flow: [], staffRole: '店主', staffMsg: '素材の味を大切にしています。',
    gallery: [['本日の前菜', '季節の野菜を使った一皿です。', [['価格', '1,200円'], ['提供時間', '終日']]], ['メインの肉料理', '地元の豚を低温でじっくり焼いています。', [['価格', '2,400円'], ['提供時間', 'ランチ・ディナー']]], ['デザート', '果物を使った手作りのデザートです。', [['価格', '800円'], ['提供時間', '終日']]]],
    voices: [['また行きたい', '料理も雰囲気もよく、家族の記念日に利用しました。', '40代 女性'], ['ランチが良い', '量がちょうどよく、価格も手頃です。', '30代 男性']],
    faq: [['子ども連れでも入れますか？', 'はい、お子さま用の椅子をご用意しています。'], ['アレルギーに対応できますか？', 'ご予約時にお伝えください。可能な範囲で対応します。']],
    access: [['最寄り', '見本駅から徒歩6分'], ['駐車場', '店舗横に5台']],
    news: [['2026-10-10', '秋のコースが始まりました', 'きのこと栗を使った秋のコースです。'], ['2026-09-01', '定休日のお知らせ', '9月は第2水曜も休みます。']],
    ctaLead: 'ご予約はフォームまたはお電話で承ります。', price: '¥1,000〜¥6,000', times: ['11:30', '12:30', '17:30', '18:30', '19:30'], hours: ['11:30', '22:00', '11:30〜15:00 / 17:30〜22:00（水曜定休）'],
    about: ['お店について', ['小さな店ですが、一皿ずつ丁寧に作っています。', '地元の食材を中心に、季節ごとにメニューを替えています。']],
    notes: ['価格は税込です。仕入れにより内容が変わることがあります。'],
  },
  salon: {
    pages: ['services', 'staff', 'gallery', 'voice', 'news', 'faq', 'access', 'reserve', 'policy'],
    highlights: [['丁寧なカウンセリング', 'お悩みやご希望をじっくり伺います。'], ['髪へのやさしさ', '傷みにくい施術をご提案します。'], ['駅から徒歩5分', '仕事帰りにも通いやすい立地です。']],
    services: [['カット', '5,000円', 5000, '骨格に合わせた似合わせカット。'], ['カラー', '8,000円', 8000, '透明感のある色味をご提案。'], ['パーマ', '9,000円', 9000, '手入れしやすい自然な動き。'], ['トリートメント', '4,000円', 4000, '髪の状態に合わせて選べます。']],
    flow: [], staffRole: 'オーナースタイリスト', staffMsg: 'お客様の「なりたい」を形にします。',
    gallery: [['ショートボブ', '毛量が多い方でも扱いやすい軽さのボブです。', [['所要時間', '約90分'], ['料金', '5,000円〜']]], ['透明感カラー', '肌の色になじむ落ち着いた色味です。', [['所要時間', '約150分'], ['料金', '8,000円〜']]], ['ゆるいパーマ', '朝の支度が短くなる動きをつけます。', [['所要時間', '約120分'], ['料金', '9,000円〜']]]],
    voices: [['初めてでも安心できました', '相談に時間をかけてくれて満足しています。', '30代 女性'], ['通いやすい', '仕事帰りに寄れる時間帯が助かります。', '40代 男性']],
    faq: [['当日予約はできますか？', '空きがあればお受けします。お電話でお問い合わせください。'], ['カラーとカットは同日にできますか？', 'できます。所要時間はおよそ3時間です。']],
    access: [['最寄り駅', '見本駅から徒歩5分'], ['駐車場', '近隣のコインパーキングをご利用ください']],
    news: [['2026-10-05', '年末年始の営業について', '12月31日〜1月3日はお休みです。']],
    ctaLead: 'ご予約はフォーム・お電話から承ります。', price: '¥4,000〜¥15,000', times: ['10:00', '12:00', '14:00', '16:00', '18:00'], hours: ['10:00', '19:00', '10:00〜19:00（火曜定休）'],
    about: ['サロンについて', ['一人ひとりの髪質と暮らしに合わせたスタイルをご提案します。']],
    notes: ['長さや状態により料金が変わる場合があります。'],
  },
  clinic: {
    pages: ['about', 'services', 'flow', 'staff', 'gallery', 'voice', 'news', 'faq', 'access', 'reserve', 'policy'],
    highlights: [['完全予約制', 'お待たせしないよう、1人ずつ丁寧に対応します。'], ['施術前の丁寧な説明', '状態と進め方を説明してから始めます。'], ['土日も営業', '平日に来られない方もご利用いただけます。']],
    services: [['初回カウンセリング＋施術', '5,500円', 5500, '状態を伺い、体の動きを確認します。'], ['通常施術', '4,400円', 4400, '2回目以降の基本の施術です。'], ['肩こり・腰の集中ケア', '6,600円', 6600, 'つらい部位を中心に行います。'], ['回数券（5回）', '20,000円', 20000, '通院しやすい回数券です。']],
    flow: [['ご予約', 'フォームまたはお電話でご予約ください。'], ['問診・検査', '症状や生活習慣を伺い、体の状態を確認します。'], ['施術', '説明した内容に沿って行います。'], ['ご説明・次回のご案内', '自宅でできるケアをお伝えします。']],
    staffRole: '院長', staffMsg: '一人ひとりの体の状態に合わせて施術します。',
    gallery: [['施術室', '個室でゆったりと施術を受けられます。', []], ['待合スペース', '落ち着いてお待ちいただけます。', []], ['受付', '入口は段差がなく、車いすの方もご利用いただけます。', []]],
    voices: [['通いやすい', '説明がていねいで、安心して通えています。', '50代 女性'], ['姿勢を意識するようになった', '自宅でできる体操を教えてもらいました。', '40代 男性']],
    faq: [['保険は使えますか？', '施術内容により異なります。ご来院時にご説明します。'], ['着替えは必要ですか？', '動きやすい服装でお越しください。貸出もあります。']],
    access: [['最寄り駅', '見本駅から徒歩4分'], ['駐車場', '2台分あります']],
    news: [['2026-10-02', '年末年始の診療について', '12月30日〜1月3日はお休みです。']],
    ctaLead: 'ご予約はフォームまたはお電話で。初めての方もお気軽にどうぞ。', price: '¥4,400〜¥20,000', times: ['9:00', '10:30', '13:00', '15:00', '17:00'], hours: ['9:00', '19:00', '9:00〜19:00（木曜・日曜定休）'],
    worries: ['肩や首のこりが取れない', '腰が重く、朝がつらい', '長時間のデスクワークで姿勢が悪い'],
    trust: ['国家資格者が施術', '完全予約制', '初回は問診に時間をかけます'],
    about: ['当院について', ['体の状態を一緒に確認しながら、無理のない進め方を考える整体院です。']],
    notes: ['効果には個人差があります。症状によっては医療機関の受診をおすすめします。'],
  },
  construction: {
    pages: ['about', 'services', 'flow', 'staff', 'gallery', 'voice', 'news', 'faq', 'access', 'reserve', 'policy'],
    highlights: [['自社施工', '設計から施工、アフターまで同じ担当者が対応します。'], ['費用の目安を公開', '工事ごとに概算の範囲をお伝えします。'], ['定期点検', '引き渡し後も定期的に点検にうかがいます。']],
    services: [['新築', '2,000万円〜', 20000000, '土地探しからご相談ください。'], ['リフォーム', '100万円〜', 1000000, '水まわり・内装など部分的な工事。'], ['リノベーション', '800万円〜', 8000000, '間取りから見直す大きな工事。'], ['外壁・屋根塗装', '90万円〜', 900000, '足場・下地補修込みの目安です。']],
    flow: [['お問い合わせ', 'フォームまたはお電話でご連絡ください。'], ['現地調査・ヒアリング', 'ご要望と現場を確認します。'], ['プラン・お見積り', '内訳のわかる見積書をお出しします。'], ['ご契約・着工', '工程表をお渡しして工事を進めます。'], ['お引き渡し・点検', '引き渡し後も定期点検を行います。']],
    staffRole: '代表・施工管理', staffMsg: '現場の状況を、写真つきでこまめにご報告します。',
    gallery: [['築30年の木造住宅をリノベーション', '間取りを変更し、明るい居間にしました。', [['種類', 'リノベーション'], ['工期', '約3か月'], ['費用の目安', '800万〜1,000万円台']]], ['キッチンの入れ替え', '対面式にして家事の動線を整えました。', [['種類', 'リフォーム'], ['工期', '約2週間'], ['費用の目安', '100万〜150万円台']]], ['外壁塗装', '色あせた外壁を塗り替えました。', [['種類', '塗装'], ['工期', '約3週間'], ['費用の目安', '90万〜130万円台']]]],
    voices: [['説明が分かりやすかった', '見積りの内訳を一つずつ説明してもらえました。', '60代 男性'], ['現場の報告が安心', '写真つきで進み具合を教えてもらえました。', '40代 女性']],
    faq: [['見積りは無料ですか？', '現地調査とお見積りは無料です。'], ['工事中は住めますか？', '工事の内容によります。事前にご相談ください。']],
    access: [['事務所', '見本市見本町（地図をご覧ください）'], ['対応エリア', '見本市および隣接する市町']],
    news: [['2026-10-08', '完成見学会のお知らせ', '10月下旬に完成見学会を開催します。']],
    ctaLead: '現地調査とお見積りは無料です。まずはご相談ください。', price: '¥1,000,000〜', times: [], hours: ['8:30', '18:00', '8:30〜18:00（日曜・祝日定休）'],
    trust: ['建設業許可（見本）', '施工実績 多数（見本）', '保証・アフター点検あり'],
    about: ['会社案内', ['地域の住まいを、設計から施工、点検まで一貫して担当しています。']],
    notes: ['費用はあくまで目安です。現地調査のうえ、お見積りします。'],
  },
  office: {
    pages: ['about', 'services', 'flow', 'staff', 'news', 'faq', 'access', 'reserve', 'policy'],
    highlights: [['初回相談 30分無料', 'まずは状況をお聞かせください。'], ['料金を事前にご案内', '見積りは着手前にお出しします。'], ['オンライン相談可', '遠方の方もご利用いただけます。']],
    services: [['相続の手続き', '88,000円〜', 88000, '相続人の調査から名義変更まで。'], ['会社設立の手続き', '55,000円〜', 55000, '定款作成から登記まで。'], ['許認可の申請', '110,000円〜', 110000, '業種ごとの申請をお手伝いします。'], ['顧問契約', '月額 22,000円〜', 22000, '日常の相談に継続して対応します。']],
    flow: [['お問い合わせ', 'フォームまたはお電話でご連絡ください。'], ['初回相談', '状況を伺い、進め方と費用をご説明します。'], ['ご契約', '内容にご納得いただいてから着手します。'], ['手続き・完了報告', '進み具合をこまめにご連絡します。']],
    staffRole: '代表（登録番号 00-0000・見本）', staffMsg: '分かりやすい言葉で、手続きの全体像をご説明します。',
    gallery: [], voices: [],
    faq: [['相談だけでも大丈夫ですか？', 'はい、初回相談だけのご利用も可能です。'], ['費用はいつ分かりますか？', '初回相談の際にお見積りをお出しします。']],
    access: [['最寄り駅', '見本駅から徒歩3分'], ['駐車場', '提携駐車場あり']],
    news: [['2026-10-03', '年末年始の休業について', '12月29日〜1月4日はお休みです。']],
    ctaLead: '初回相談は30分無料です。お気軽にご予約ください。', price: '¥55,000〜', times: [], hours: ['9:00', '18:00', '9:00〜18:00（土日祝定休）'],
    trust: ['登録番号・所属会を明記（見本）', '初回相談 30分無料', '見積りは着手前に提示'],
    about: ['事務所案内', ['暮らしと事業の手続きを、分かりやすくご説明することを大切にしています。']],
    notes: ['料金は税込の目安です。内容により変わります。同種の案件でも結果は異なります。'],
  },
};

// ---- 型ごとの違い（名前・配色・見た目・コピー） ----
const V = {
  activity: {
    a: { name: 'あおぞらマリン体験', tagline: '初心者でも安心のマリン体験', title: '海と空を、まるごと楽しむ。', lead: '初めての方・お子さま連れも歓迎。道具の貸し出しとレクチャー付きです。', theme: { main: '#0b5f8f', accent: '#c2410c', bg: '#ffffff', text: '#1b2a33' }, design: {}, c: ['#0b5f8f', '#3ec1d3'] },
    b: { name: 'きらり島ツアーズ', tagline: '家族で行く、島の半日ツアー', title: '今日は島を、ゆっくり遊ぶ。', lead: 'お子さまも一緒に。送迎つき、写真データのプレゼントつきです。', theme: { main: '#0f766e', accent: '#b45309', bg: '#fffdf5', text: '#20302d' }, design: { hero: 'split', font: 'round', radius: 'round', home: ['highlights', 'works', 'services', 'flow', 'voice', 'news', 'access'] }, c: ['#0f766e', '#f4b942'] },
  },
  restaurant: {
    a: { name: 'ビストロ 潮風', tagline: '地元食材のフレンチ', title: '島の恵みを、ひと皿に。', lead: '地元の食材を使った、季節のコースとアラカルト。', theme: { main: '#3b2a20', accent: '#9a3412', bg: '#fbf7f1', text: '#2a2018' }, design: {}, c: ['#3b2a20', '#b8794a'] },
    b: { name: 'ごはん屋 まるいち', tagline: '毎日食べたい、家族の食堂', title: 'おなかいっぱい、笑顔いっぱい。', lead: '定食とお弁当。お子さま連れ大歓迎です。', theme: { main: '#9f1239', accent: '#a16207', bg: '#fffaf0', text: '#2d1f1f' }, design: { hero: 'split', font: 'round', radius: 'round', services: 'cards', home: ['highlights', 'works', 'services', 'voice', 'news', 'access'] }, c: ['#9f1239', '#f59e0b'] },
  },
  salon: {
    a: { name: 'ヘアサロン ひなた', tagline: 'あなたに合う髪型を一緒に', title: '毎日が少し楽しくなる髪に。', lead: 'ご来店からスタイリングまで、一人ひとりに合わせてご提案します。', theme: { main: '#5b3a52', accent: '#9d174d', bg: '#ffffff', text: '#2b2230' }, design: {}, c: ['#5b3a52', '#c9a0b8'] },
    b: { name: 'ミモザ美容室', tagline: '大人かわいい、やさしいカラー', title: '似合う色で、やさしく変わる。', lead: 'ダメージを抑えたカラーとケアが得意なサロンです。', theme: { main: '#9d3a6b', accent: '#0f766e', bg: '#fff7fa', text: '#3a2230' }, design: { hero: 'split', font: 'round', radius: 'round', services: 'cards', home: ['works', 'services', 'staff', 'voice', 'news', 'access'] }, c: ['#9d3a6b', '#f4b6c8'] },
  },
  clinic: {
    a: { name: 'やすらぎ整体院', tagline: '肩・腰・姿勢のお悩みに', title: 'つらい肩こり・腰の重さに、ていねいに向き合います。', lead: '完全予約制。初回は問診と検査に時間をかけます。', theme: { main: '#0f6b4f', accent: '#c2410c', bg: '#ffffff', text: '#18302a' }, design: {}, c: ['#0f6b4f', '#7fd1ae'] },
    b: { name: 'かがやき整骨院', tagline: '通いやすい、駅近の整骨院', title: '体の不調を、一緒に整えましょう。', lead: '平日夜・土日も営業。保険の相談もできます。', theme: { main: '#0e5a8a', accent: '#15803d', bg: '#f7fbfe', text: '#17293a' }, design: { hero: 'full', font: 'round', radius: 'round', services: 'cards', home: ['trust', 'highlights', 'worries', 'services', 'staff', 'voice', 'flow', 'news', 'access'] }, c: ['#0e5a8a', '#7cc4ee'] },
  },
  construction: {
    a: { name: '見本建築', tagline: '地域の住まいを、設計から点検まで', title: '長く住める家を、地元で。', lead: '新築・リフォーム・リノベーション。現地調査とお見積りは無料です。', theme: { main: '#1f2937', accent: '#b45309', bg: '#ffffff', text: '#1f2937' }, design: {}, c: ['#1f2937', '#9ca3af'] },
    b: { name: '木のいえ工房', tagline: '自然素材の家づくり', title: '木のぬくもりに、毎日帰る。', lead: '無垢材を使った家を、地元の職人がつくります。', theme: { main: '#4d3b2a', accent: '#3f6212', bg: '#fbf8f2', text: '#2c2218' }, design: { hero: 'split', font: 'serif', radius: 'soft', home: ['highlights', 'works', 'services', 'trust', 'flow', 'voice', 'staff', 'news', 'access'] }, c: ['#4d3b2a', '#c8a47a'] },
  },
  office: {
    a: { name: '見本総合事務所', tagline: '相続・登記・許認可の手続き', title: '手続きのことは、早めにご相談ください。', lead: '分野ごとの料金の目安を公開しています。初回相談は30分無料です。', theme: { main: '#1e3a5f', accent: '#b45309', bg: '#ffffff', text: '#1b2733' }, design: {}, c: ['#1e3a5f', '#6b8cb8'] },
    b: { name: 'みどり行政書士事務所', tagline: '許認可と相続の相談窓口', title: 'はじめてでも、順番にご説明します。', lead: '建設業許可・相続・会社設立など。オンライン相談にも対応します。', theme: { main: '#14532d', accent: '#92400e', bg: '#faf9f5', text: '#1d2a21' }, design: { hero: 'split', font: 'sans', radius: 'soft', services: 'cards', home: ['worries', 'services', 'trust', 'staff', 'flow', 'news', 'access'] }, c: ['#14532d', '#86b497'] },
  },
};
// 悩み（事務所用）
C.office.worries = ['相続の手続きが何から始めればいいか分からない', '会社を作りたいが、必要な書類が分からない', '許認可が必要か、自分では判断できない'];

const BANDS = {"activity": {"a": ["#f2f8fc", "#dcedf7"], "b": ["#fffaf0", "#d8eeea"]}, "restaurant": {"a": ["#fbf6ef", "#eee1d0"], "b": ["#fff6ee", "#fadfe5"]}, "salon": {"a": ["#fbf7fa", "#eee1ea"], "b": ["#fff6f9", "#fadce8"]}, "clinic": {"a": ["#f5fbf8", "#dcf0e6"], "b": ["#f3f9fd", "#d9eaf6"]}, "construction": {"a": ["#f5f6f7", "#e2e5ea"], "b": ["#fbf7f0", "#e9dcc9"]}, "office": {"a": ["#f4f6fa", "#dfe6f0"], "b": ["#f7f8f2", "#dfeae1"]}};
// 強調色が帯の上でも読めるよう、明暗差が4.6を超えるまで少しずつ濃くする
const crHex = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const darken = (hex, bg) => { let h = hex; for (let i = 0; i < 30 && crHex(h, bg) < 4.6; i++) h = '#' + [1, 3, 5].map((k) => Math.round(parseInt(h.slice(k, k + 2), 16) * 0.95).toString(16).padStart(2, '0')).join(''); return h; };
const out = [];
for (const genre of Object.keys(C)) {
  for (const key of ['a', 'b']) {
    const c = C[genre], v = V[genre][key];
    const dir = path.join(root, 'sites', `${genre}-${key}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
    const name = `${v.name}（見本）`;
    const [c1, c2] = v.c;
    const imgs = { 'hero.svg': 'メイン写真（見本）', 'favicon.svg': '' };
    const put = (f, l, w = 1200, h = 800) => fs.writeFileSync(path.join(dir, 'images', f), svg(c1, c2, l, w, h));
    put('hero.svg', 'メイン写真（見本）');
    fs.writeFileSync(path.join(dir, 'images', 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${c1}"/></svg>`);
    c.services.forEach((_, i) => put(`menu${i + 1}.svg`, `メニュー${i + 1}（見本）`));
    put('staff1.svg', 'スタッフ（見本）');
    c.gallery.forEach((_, i) => put(`g${i + 1}.svg`, `写真${i + 1}（見本）`));
    const site = {
      isSample: true, genre, baseUrl: `https://${genre}-${key}.example.com`, name, tagline: v.tagline,
      description: `${name}の見本サイトです。${c.about[1][0]}`.slice(0, 118),
      ctaLead: c.ctaLead, theme: { ...v.theme, bg: BANDS[genre][key][0], band: BANDS[genre][key][1], accent: darken(darken(v.theme.accent, BANDS[genre][key][1]), BANDS[genre][key][0]) }, design: v.design,
      contact: { tel: '000-0000-0000', line: '', instagram: '' },
      address: { postalCode: '000-0000', region: '沖縄県', locality: 'サンプル市', street: '見本町1-2-3', text: '沖縄県サンプル市見本町1-2-3', lat: 26.2123, lng: 127.6791, mapEmbed: '' },
      hours: { text: c.hours[2], spec: [{ days, opens: c.hours[0].padStart(5, '0'), closes: c.hours[1] }] },
      priceRange: c.price,
      hero: { image: 'hero.svg', alt: `${name}のイメージ（見本）`, title: v.title, lead: v.lead },
      pages: c.pages,
      highlights: c.highlights.map(([title, body]) => ({ title, body })),
      about: { description: `${name}の${c.about[0]}です。${c.about[1][0]}`.slice(0, 118), sections: [{ heading: c.about[0], body: c.about[1] }], facts: [{ k: '営業時間', v: c.hours[2] }] },
      services: { intro: `${c.services[0][0]}などの内容と料金です（税込・見本）。`, items: c.services.map(([n, p, pn, s], i) => ({ name: n, price: p, priceNumber: pn, summary: s, description: s, image: `menu${i + 1}.svg`, alt: `${n}のイメージ（見本）` })), notes: c.notes },
      flow: { intro: 'ご利用の流れです。', steps: c.flow.map(([title, body]) => ({ title, body })) },
      staff: [{ name: '見本 太郎', role: c.staffRole, message: c.staffMsg, image: 'staff1.svg', alt: 'スタッフの写真（見本）' }],
      gallery: c.gallery.map(([title, body, meta], i) => ({ image: `g${i + 1}.svg`, alt: `${title}（見本）`, title, body, meta: meta.map(([k, vv]) => ({ k, v: vv })) })),
      voices: c.voices.map(([title, body, nm]) => ({ title, body, name: `${nm}（掲載許可済み・見本）` })),
      news: c.news.map(([date, title, body]) => ({ date, title, body })),
      faq: c.faq.map(([q, a]) => ({ q, a })),
      access: { directions: c.access.map(([k, vv]) => ({ k, v: vv })) },
      reserve: { intro: 'ご希望の内容を入力してください。確認後、ご連絡します。', times: c.times, formAction: '', replyNote: '1営業日以内にご連絡いたします', notice: ['送信しただけでは確定しません。確認のご連絡をもって確定となります。'] },
    };
    // ---- 検索対策の構成に沿った中身（tools/seo-content.mjs） ----
    const sc = S[genre];
    site.area = sc.area;
    site.intro = { body: sc.intro };
    if (sc.areaServed.length) site.access.areaServed = sc.areaServed;
    site.services.items = site.services.items.map((it, i) => ({ ...it, slug: sc.services[i].slug, time: sc.services[i].time === '—' ? undefined : sc.services[i].time, related: sc.services[i].related, detail: sc.services[i].detail }));
    site.columns = sc.columns;
    site.faq = sc.faq;
    site.staff[0].qualifications = sc.staff.qualifications;
    site.staff[0].career = sc.staff.career;
    if (!site.pages.includes('column')) site.pages.splice(site.pages.indexOf('faq'), 0, 'column');
    if (c.worries) site.worries = { title: 'こんなお悩みはありませんか', items: c.worries, after: c.worries.length ? 'ひとつでも当てはまれば、お気軽にご相談ください。' : '' };
    if (c.trust) site.trust = c.trust;
    if (!c.gallery.length) delete site.gallery;
    if (!c.voices.length) delete site.voices;
    if (!c.flow.length) delete site.flow;
    site.pages = site.pages.filter((p) => !(p === 'gallery' && !c.gallery.length) && !(p === 'voice' && !c.voices.length) && !(p === 'flow' && !c.flow.length));
    fs.writeFileSync(path.join(dir, 'site.json'), JSON.stringify(site, null, 2));
    out.push(`${genre}-${key} 白文字×主色=${contrastWhite(v.theme.main).toFixed(1)} 白文字×強調色=${contrastWhite(v.theme.accent).toFixed(1)}`);
  }
}
console.log(out.join('\n'));
