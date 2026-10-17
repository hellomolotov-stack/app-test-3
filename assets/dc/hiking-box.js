// Страница «хайкинг бокс» на dietcakes.ru/hiking-intelligence.
// На самой странице WordPress стоит только: <div id="hi-root"></div><script src="https://app-test-3-delta.vercel.app/assets/dc/hiking-box.js"></script>
// Вся разметка, стили и логика живут здесь – правки выкатываются через наш Vercel, в админку dietcakes заходить не нужно.
(function () {
  if (window.__hiBox) return; window.__hiBox = true;
  var mount = document.getElementById('hi-root');
  if (!mount) { mount = document.createElement('div'); (document.currentScript && document.currentScript.parentNode || document.body).appendChild(mount); }
  mount.innerHTML = "<div class=\"hi\" id=\"hi\">\n<style>\n/* стиль магазина «Жить здорово»: Inter, белые карточки 24px на сером фоне сайта, зелёный акцент, розовая кнопка оформления.\n   фирменный цвет клуба – только в баннере сверху */\n.hi{--g:rgb(140,188,103);--g2:#eef6e7;--pink:rgb(231,34,104);--t:#404040;--h:#242424;--mut:#8a8a8a;--line:#ececec;--soft:#f5f5f7;\n font-family:Inter,Arial,Helvetica,sans-serif;color:var(--t);max-width:900px;margin:20px auto 0;padding:0 0 120px}\n.hi *{box-sizing:border-box}\n.hi [hidden]{display:none!important}\n.hi p{margin:0;line-height:1.5}\n.hi h1,.hi h2{color:var(--h);font-weight:700;margin:0}\n.hi button{height:auto;min-height:0;line-height:1.25;text-transform:none;letter-spacing:normal;box-shadow:none;font-family:inherit}\n.hi-card{background:#fff;border-radius:24px;padding:24px;margin:0 0 16px}\n.hi .hi-btn{display:inline-block;border:0;border-radius:30px;padding:14px 26px;font-weight:600;font-size:15px;color:#fff;background:var(--pink);text-decoration:none;cursor:pointer}\n.hi .hi-btn[disabled]{opacity:.6;cursor:wait}\n.hi h2{font-size:22px;margin-bottom:6px}\n.hi-sub{color:var(--mut);margin:0 0 14px!important;font-size:14px}\n/* баннер – единственный фирменный блок */\n/* вкладки – как чипы категорий магазина */\n.hi-tabs{display:flex;gap:8px;margin:0 0 6px}\n.hi-tab{flex:1;border:0;border-radius:20px;padding:12px 10px;background:var(--soft);font-size:15px;font-weight:600;color:var(--h);cursor:pointer}\n.hi-tab small{display:block;font-size:12.5px;font-weight:500;color:var(--mut);margin-top:2px}\n.hi-tab.is-on{background:var(--g);color:#fff}.hi-tab.is-on small{color:rgba(255,255,255,.85)}\n/* замена */\n.hi-slot{display:grid;grid-template-columns:150px 1fr;gap:14px;align-items:center;padding:16px 0;border-top:1px solid var(--line)}\n.hi-slot-k b{display:block;color:var(--h);font-size:15px;font-weight:700}\n.hi-slot-k small{display:block;color:var(--mut);font-size:13px}\n.hi-slot-k em{display:block;font-style:normal;font-size:12px;color:var(--mut);margin-top:6px}\n.hi-row{display:flex;gap:10px;overflow-x:auto;padding:4px 2px 8px;scroll-snap-type:x mandatory;scrollbar-width:thin}\n.hi-opt{flex:none;width:130px;scroll-snap-align:start;border-radius:20px;background:#fff;border:2px solid transparent;padding:0 0 6px;cursor:pointer;position:relative;user-select:none}\n.hi .hi-opt img{display:block;width:100%;height:110px;object-fit:contain;background:var(--soft);border-radius:18px;padding:8px}\n.hi-opt span{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-size:13px;line-height:1.3;margin:8px 4px 0;color:var(--h);height:51px}\n.hi-opt b{display:block;font-size:15px;font-weight:700;color:var(--h);margin:4px 4px 0}\n.hi-opt i{font-style:normal;font-size:12px;font-weight:600;color:var(--mut);margin-left:4px}\n.hi-opt.is-on{border-color:var(--g);background:var(--g2)}\n.hi-opt.is-on::after{content:\"✓\";position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;background:var(--g);color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center}\n.hi-warn{margin:12px 0 0;padding:12px 14px;border-radius:16px;font-size:14px;color:#7a5a12;background:#fff7e6}\n.hi-fair{font-size:14px;color:var(--t);padding:12px 14px;border-radius:16px;background:var(--soft);margin-top:12px}\n.hi-fair b{color:var(--h)}\n.hi-cardrow{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:12px;padding:12px 14px;border-radius:16px;background:var(--g2)}\n.hi .hi-cardrow img{width:60px;height:40px;object-fit:cover;border-radius:7px;transform:rotate(-6deg)}\n.hi-cardrow div{flex:1;min-width:180px}\n.hi-cardrow b{display:block;color:var(--h)}\n.hi-cardrow small{color:var(--mut)}\n.hi .hi-cardrow .hi-btn{padding:10px 18px;font-size:14px;color:#fff;background:var(--g)}\n/* как получить */\n.hi-ways{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}\n.hi-way{position:relative;border-radius:18px;background:var(--soft);padding:16px 14px 16px 44px;border:2px solid transparent;cursor:pointer;user-select:none}\n.hi-way::before{content:\"\";position:absolute;left:14px;top:18px;width:18px;height:18px;border-radius:50%;border:2px solid #c8c8c8;background:#fff}\n.hi-way.is-on{border-color:var(--g);background:var(--g2)}\n.hi-way.is-on::before{border-color:var(--g);background:var(--g);box-shadow:inset 0 0 0 3px #fff}\n.hi-way b{display:block;margin-bottom:4px;color:var(--h)}\n.hi-way small{color:var(--mut);font-size:13px}\n.hi-date{margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}\n.hi .hi-date input{border:1px solid #e0e0e0;border-radius:20px;padding:10px 14px;font:inherit;background:#fff;color:var(--h);height:auto;margin:0;width:auto}\n.hi-msg{margin-top:12px!important;font-size:13px;color:var(--mut)}\n/* добери до 2 000 ₽ */\n.hi-left{font-size:14.5px;margin:0 0 8px!important}\n.hi-left b{color:var(--pink)}\n.hi-bar{height:8px;border-radius:8px;background:#eee;overflow:hidden;margin:0 0 16px}\n.hi-bar i{display:block;height:100%;width:0;background:var(--g);border-radius:8px;transition:width .3s}\n.hi-more{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}\n.hi-m{display:flex;flex-direction:column}\n.hi .hi-m img{width:100%;aspect-ratio:1;object-fit:contain;background:var(--soft);border-radius:20px;padding:10px;margin-bottom:8px}\n.hi-m-n{font-size:13px;line-height:1.3;color:var(--h);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:50px}\n.hi-m-p{font-weight:700;color:var(--h);margin:6px 0 8px;font-size:15px}\n.hi .hi-m-add{margin-top:auto;border:1px solid var(--line);border-radius:20px;padding:9px 10px;font-size:14px;font-weight:600;color:var(--h);background:#fff;cursor:pointer}\n.hi .hi-m-add.is-in{background:var(--g);border-color:var(--g);color:#fff}\n.hi-faq details{border-top:1px solid var(--line);padding:14px 0}\n.hi-faq summary{cursor:pointer;font-weight:600;color:var(--h)}\n.hi-faq details p{margin-top:8px!important;color:var(--t)}\n/* нижняя панель – как блок «Итого» в корзине магазина */\n.hi-sticky{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);width:min(872px,calc(100% - 20px));display:flex;align-items:center;gap:14px;padding:10px 10px 10px 16px;border-radius:24px;background:#fff;z-index:500;box-shadow:0 8px 30px rgba(0,0,0,.14)}\n.hi-thumbs{display:flex;padding-left:8px}\n.hi .hi-thumbs img{width:36px;height:36px;object-fit:contain;background:var(--soft);border-radius:50%;border:2px solid #fff;margin-left:-8px;transition:transform .25s}\n.hi .hi-thumbs img.is-pop{transform:scale(1.25)}\n.hi-sp{flex:1;min-width:0}\n.hi-sp b{font-size:21px;color:var(--g);font-weight:700}\n.hi-sp em{font-style:normal;font-size:13px;font-weight:600;color:var(--t);margin-left:8px}\n.hi-sp small{display:block;color:var(--mut);font-size:12px}\n@media(max-width:640px){\n .hi{margin-top:12px;padding:0 0 110px}\n .hi-card{padding:18px;border-radius:24px}\n .hi-slot{grid-template-columns:1fr;gap:8px;padding:14px 0}\n .hi-slot-k{display:grid;grid-template-columns:1fr auto;column-gap:10px}\n .hi-slot-k b{grid-column:1}.hi-slot-k em{grid-column:2;grid-row:1;margin:0;align-self:center}.hi-slot-k small{grid-column:1/3}\n .hi-opt{width:120px}.hi .hi-opt img{height:100px}\n .hi-tab{font-size:14.5px}.hi-tab small{font-size:12px}\n .hi-ways{grid-template-columns:1fr}\n .hi-cardrow{display:grid;grid-template-columns:auto 1fr;gap:10px 14px}.hi-cardrow div{min-width:0}.hi .hi-cardrow .hi-btn{grid-column:1/3;text-align:center}\n .hi-thumbs{display:none}\n .hi-sp b{font-size:19px}.hi-sp em{display:block;margin:2px 0 0;font-size:12px}.hi-sp small{display:none}.hi .hi-sticky .hi-btn{padding:13px 18px;font-size:15px}\n}\n/* шапка-баннер: фото скалы, белые логотипы через тонкий ×, матовая метка «коллаборация» */\n.hi-hero{position:relative;overflow:hidden;border-radius:24px;margin:0 0 16px;min-height:330px;display:flex;flex-direction:column;justify-content:space-between;align-items:center;text-align:center;color:#fff;padding:22px 20px 22px;\n background:#4a90c8 url(https://app-test-3-delta.vercel.app/assets/box/rock.jpg) center 52%/cover}\n.hi-hero::before{content:\"\";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0) 38%,rgba(10,16,24,.5) 70%,rgba(10,16,24,.78) 100%)}\n.hi-hero>*{position:relative;z-index:1}\n.hi-lock{display:flex;align-items:center;gap:16px}\n.hi .hi-lock img{display:block;width:auto;filter:brightness(0) invert(1) drop-shadow(0 2px 8px rgba(0,0,0,.25))}\n.hi .hi-lock .hi-lh{height:40px}.hi .hi-lock .hi-ld{height:36px}\n.hi-lock svg{width:15px;height:15px;flex:none;filter:drop-shadow(0 1px 4px rgba(0,0,0,.3))}\n.hi-pill{display:inline-block;padding:6px 14px;border-radius:14px;background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.45);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#fff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}\n.hi-hero h1{color:#fff;margin:10px 0 6px;font-size:30px;line-height:1.15;text-wrap:balance;text-shadow:0 2px 12px rgba(0,0,0,.35)}\n.hi-hero h1 span{white-space:nowrap}\n.hi-hero p{margin:0 auto 14px;max-width:440px;font-size:15px;line-height:1.45;color:rgba(255,255,255,.92);text-shadow:0 1px 8px rgba(0,0,0,.4)}\n.hi .hi-hero .hi-btn{color:#000;background:linear-gradient(180deg,#e8ff4a,#c9ec00);padding:14px 32px;box-shadow:0 6px 18px rgba(0,0,0,.25)}\n.hi-club{margin-top:12px}\n.hi-club summary{cursor:pointer;color:rgba(255,255,255,.9);font-weight:600;font-size:13.5px;list-style:none;text-decoration:underline;text-underline-offset:3px}\n.hi-club summary::-webkit-details-marker{display:none}\n.hi-club p{font-size:13.5px;margin:10px auto 0!important;color:rgba(255,255,255,.88)}\n.hi-club a{color:#D9FD19;font-weight:600;text-decoration:none}\n@media(max-width:640px){.hi-hero{min-height:360px;background-position:center 36%}.hi-hero h1{font-size:27px}.hi .hi-lock .hi-lh{height:34px}.hi .hi-lock .hi-ld{height:30px}.hi-lock{gap:12px}}\n/* компьютер: оригинал фото в полном размере + лёгкое зерно, чтобы растянутая картинка не выглядела мыльной */\n@media(min-width:641px){\n .hi-hero{background-image:url(https://app-test-3-delta.vercel.app/assets/box/rock-hd.jpg)}\n .hi-hero::after{content:\"\";position:absolute;inset:0;pointer-events:none;opacity:.16;mix-blend-mode:overlay;\n  background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")}\n}\n.hi-mtabs{display:flex;gap:8px;margin:0 0 14px}\n.hi-mtab{border:0;border-radius:20px;padding:10px 16px;background:var(--soft);font-size:14.5px;font-weight:600;color:var(--h);cursor:pointer}\n.hi-mtab.is-on{background:var(--g);color:#fff}\n.hi .hi-i{position:absolute;top:6px;left:6px;z-index:2;width:24px;height:24px;border-radius:50%;border:0;padding:0;background:rgba(255,255,255,.95);color:var(--h);font:italic 700 13px/24px Georgia,serif;box-shadow:0 1px 4px rgba(0,0,0,.18);cursor:pointer}\n.hi-modal{position:fixed;inset:0;z-index:1000;background:rgba(20,24,30,.45);display:flex;align-items:flex-end;justify-content:center}\n.hi-modal-c{position:relative;width:min(560px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:24px 24px 0 0;padding:20px 20px calc(env(safe-area-inset-bottom,0px) + 24px)}\n.hi .hi-modal-c img{display:block;width:100%;height:240px;object-fit:contain;background:var(--soft);border-radius:18px;margin:0 0 14px}\n.hi-modal-c b{display:block;font-size:17px;line-height:1.3;color:var(--h)}\n.hi-modal-p{font-size:18px;font-weight:700;color:var(--g);margin:6px 0 10px}\n.hi-modal-d{font-size:14px!important;line-height:1.55!important;color:var(--t)}\n.hi-modal-a{display:inline-block;margin-top:12px;font-weight:600;color:var(--g);text-decoration:none}\n.hi .hi-modal-x{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;border:0;background:var(--soft);font-size:15px;cursor:pointer;color:var(--h)}\n@media(min-width:641px){.hi-modal{align-items:center}.hi-modal-c{border-radius:24px}}\n/* телефон: баннер сразу под шапкой сайта, без серого отступа темы */\n@media(max-width:640px){.page-id-15624 .main-page-wrapper,.page-id-15624 .wd-page-content,.page-id-15624 .wd-content-layout,.page-id-15624 .site-content,.page-id-15624 .entry-content{padding-top:0!important;margin-top:0!important}.hi{margin-top:8px}}\n</style>\n\n\n<div class=\"hi-hero\">\n  <div class=\"hi-lock\"><img class=\"hi-lh\" src=\"https://app-test-3-delta.vercel.app/assets/logo-hiking.png\" alt=\"хайкинг интеллигенция\"><svg viewBox=\"0 0 22 22\" aria-hidden=\"true\"><path d=\"M3 3 L19 19 M19 3 L3 19\" stroke=\"#fff\" stroke-width=\".9\" stroke-linecap=\"round\"/></svg><img class=\"hi-ld\" src=\"https://dietcakes.ru/wp-content/uploads/2026/04/%D0%A0%D0%B5%D1%81%D1%83%D1%80%D1%81-4.svg\" alt=\"жить здорово\"></div>\n  <div class=\"hi-hero-b\">\n    <span class=\"hi-pill\">коллаборация</span>\n    <h1 id=\"hi-h1\">хайкинг бокс</h1>\n    <p>собрали всё, что держит энергию на маршруте, – из продуктов «Жить здорово»</p>\n    <a class=\"hi-btn\" href=\"#hi-box\">собрать бокс</a>\n    <details class=\"hi-club\"><summary>о клубе</summary>\n      <p>хайкинг интеллигенция – клуб молодых деятельных людей большой Ялты, которые проводят свободное время стильно, отдыхают продуктивно и знакомятся лично. 3–5 часов лёгкой ходьбы по видовым тропам в компании таких же интеллигентов, как ты.</p>\n      <p><a href=\"https://t.me/yaltahiking_bot\" target=\"_blank\" rel=\"noopener\">открыть приложение клуба →</a></p>\n    </details>\n  </div>\n  <div id=\"hi-col\" hidden></div>\n</div>\n\n<div class=\"hi-card\" id=\"hi-box\">\n  <div class=\"hi-tabs\">\n    <button type=\"button\" class=\"hi-tab\" data-box=\"light\">лёгкий</button>\n    <button type=\"button\" class=\"hi-tab\" data-box=\"full\">сытный</button>\n  </div>\n  <div id=\"hi-slots\"><p class=\"hi-sub\" style=\"padding:16px 0\">загружаем товары…</p></div>\n  <div class=\"hi-warn\" id=\"hi-warn\" hidden>⏰ сэндвич или ролл – при заказе за 2 дня до хайка</div>\n  <div class=\"hi-cardrow\"><img src=\"https://app-test-3-delta.vercel.app/assets/card-front.jpg\" alt=\"\"><div><b>по карте интеллигента −10%</b><small id=\"hi-card-note\">скидка для владельцев карты клуба</small></div><a class=\"hi-btn\" id=\"hi-card-btn\" href=\"https://t.me/yaltahiking_bot\" target=\"_blank\" rel=\"noopener\">узнать о карте</a></div>\n</div>\n\n<div class=\"hi-card\">\n  <h2>как получить</h2>\n  <p class=\"hi-sub\">выбери способ – дальше обычное оформление заказа</p>\n  <div class=\"hi-ways\">\n    <div class=\"hi-way is-on\" role=\"button\" tabindex=\"0\" data-way=\"hike\"><b>🏔 в день хайка</b><small>получишь бокс в начале маршрута</small></div>\n    <div class=\"hi-way\" role=\"button\" tabindex=\"0\" data-way=\"home\"><b>🚚 доставка домой</b><small>по Ялте; от 2 000 ₽ – бесплатно</small></div>\n    <div class=\"hi-way\" role=\"button\" tabindex=\"0\" data-way=\"pickup\"><b>🏪 самовывоз</b><small>из магазина</small></div>\n  </div>\n  <div class=\"hi-date\" id=\"hi-date-row\"><b>дата хайка</b><input type=\"date\" id=\"hi-date\"></div>\n  <p class=\"hi-msg\" id=\"hi-msg\">товары бокса добавятся в корзину – дальше обычное оформление заказа. дату хайка напиши в комментарии к заказу.</p>\n</div>\n\n<div class=\"hi-card\" id=\"hi-more-card\" hidden>\n  <h2>собери корзину на 2 000 ₽ – и доставка домой бесплатно</h2>\n  <p class=\"hi-left\" id=\"hi-left\"></p>\n  <div class=\"hi-bar\"><i id=\"hi-bar\"></i></div>\n  <div class=\"hi-mtabs\"><button type=\"button\" class=\"hi-mtab is-on\" data-m=\"home\">🍳 домой</button><button type=\"button\" class=\"hi-mtab\" data-m=\"rec\">💪 для восстановления</button></div>\n  <div class=\"hi-more\" id=\"hi-more\"></div>\n</div>\n\n<div class=\"hi-card hi-faq\">\n  <h2>частые вопросы</h2>\n  <details><summary>хайк перенесли или отменили – что с боксом?</summary><p>[уточнить у «Жить здорово»: перенос на новую дату или возврат]</p></details>\n  <details><summary>сколько хранится сэндвич?</summary><p>[уточнить у «Жить здорово»]</p></details>\n  <details><summary>можно взять два бокса?</summary><p>да – просто укажи количество в корзине.</p></details>\n  <details><summary>как получить скидку по карте?</summary><p>открой бокс из приложения клуба – скидка применится сама.</p></details>\n</div>\n\n<div class=\"hi-modal\" id=\"hi-modal\" hidden></div>\n<div class=\"hi-sticky\"><div class=\"hi-thumbs\" id=\"hi-thumbs\"></div><div class=\"hi-sp\"><b id=\"hi-sum\">–</b><small id=\"hi-sumk\">собираем бокс…</small></div><button type=\"button\" class=\"hi-btn\" id=\"hi-cta\">заказать</button></div>\n\n\n</div>\n";

(function () {
  // слоты боксов: [название, подпись, [id товаров: первый – по умолчанию]]; цены и наличие – из каталога в реальном времени
  var BOXES = {
    light: { name: 'лёгкий бокс', slots: [
      ['⚡ восстановить силы', 'на подъём', [4899, 4642, 2222, 4607, 4741, 1812, 14965, 1868, 4654]],
      ['🥨 белок и соль', 'на привал', [3139, 4060, 2862, 2315, 1871]],
      ['🧇 хрустящее к чаю', 'на крутой участок', [1671, 1801, 1583, 1647, 1930, 4820]],
      ['🍪 сладкое без сахара', 'награда за подъём', [3985, 3263, 4051, 2707, 4747, 1602, 4320, 4897, 3356, 1860, 1973, 1975, 1563, 1972, 1634, 1974, 2831, 2872, 2871, 4064, 14639, 14642, 14911]],
      ['💧 глоток на привале', '0,5 л', [15026, 4997, 14971, 4991, 3456, 3457, 3455, 3408, 3407, 14263]]
    ]},
    full: { name: 'сытный бокс', warn: true, slots: [
      ['🥪 обед на вершине', 'сытно и не тяжело', [11683, 11678, 11681, 11720, 14279]],
      ['⚡ восстановить силы', 'после подъёма', [2466, 2272, 11299, 1868, 4654, 4991, 3456]],
      ['🧇 хрустящее к чаю', 'без сахара', [14266, 14265, 2906, 3049, 2932]],
      ['🍪 сладкое без сахара', 'награда за подъём', [1602, 4320, 4897, 3356, 1860, 1973, 1975, 1563, 1972, 1634, 1974, 2831, 2872, 2871, 4064, 14639, 14642, 14911]],
      ['🥨 белок и соль', 'на привал', [2315, 1871, 3139, 2862]],
      ['💧 глоток на привале', '0,5 л', [15026, 4997, 14971, 4991, 3456, 3457, 3455, 3408, 3407, 14263]]
    ]}
  };
  var CUT = 'https://app-test-3-delta.vercel.app/assets/box/cut/';
  var COL = {
    light: [['chips', 'height:180px;left:0;top:40px;transform:rotate(-7deg)'], ['water', 'height:160px;left:250px;top:20px;transform:rotate(6deg)'], ['bar', 'width:220px;left:60px;top:170px;transform:rotate(-8deg)'], ['qwikler', 'width:180px;left:170px;top:120px;transform:rotate(9deg)'], ['frut', 'width:160px;left:20px;top:230px;transform:rotate(-3deg)']],
    full: [['pesto', 'width:190px;left:0;top:60px;transform:rotate(-10deg)'], ['shake', 'height:160px;left:150px;top:10px;transform:rotate(6deg)'], ['water', 'height:170px;left:250px;top:40px;transform:rotate(-6deg)'], ['wafers', 'width:170px;left:40px;top:190px;transform:rotate(-6deg)'], ['sticks', 'width:110px;left:210px;top:170px;transform:rotate(9deg)']]
  };
  // «добери до 2 000 ₽»: продукты домой (первые 8 в наличии)
  // «собери корзину на 2 000 ₽»: две вкладки – еда домой и БАДы для восстановления (по 8 первых в наличии)
  var MORE_SETS = { home: [14288, 14283, 2840, 4034, 3625, 2439, 14902, 11628, 4768, 4131, 13890, 2540, 3115, 2049, 11710, 11715, 14699], rec: [2136, 2137, 15526, 3944, 14926, 15015, 3270, 2676, 3022, 3344, 14584, 2071, 15204, 15205] };
  var moreTab = 'home';
  var MORE = MORE_SETS.home.concat(MORE_SETS.rec);
  var FREE = 2000, extra = {};
  var $ = function (id) { return document.getElementById(id); };
  var root = $('hi');
  var qs = new URLSearchParams(location.search);
  var cur = qs.get('box') === 'light' ? 'light' : 'full';
  // из приложения клуба: ?hike=ГГГГ-ММ-ДД&route=Ай-Петри&box=light|full&custom=1&card=1
  if (qs.get('hike')) $('hi-date').value = qs.get('hike');
  var route = (qs.get('route') || '').trim().slice(0, 60);
  if (route) { var h1 = $('hi-h1'), rs = document.createElement('span'); rs.textContent = route; h1.textContent = 'хайкинг бокс на '; h1.appendChild(rs); }
  var hasCard = qs.get('card') === '1';
  if (hasCard) { $('hi-card-note').textContent = 'у тебя есть карта – скидка применится в корзине сама'; $('hi-card-btn').hidden = true; }
  if (qs.get('custom') === '1') setTimeout(function () { $('hi-box').scrollIntoView({ behavior: 'smooth' }); }, 600);

  var P = {}, pick = {}, boxSum = 0;
  var price = function (p) { return Number(p.prices.price) / Math.pow(10, p.prices.currency_minor_unit); };
  var rub = function (n) { return Math.round(n).toLocaleString('ru-RU') + ' ₽'; };
  var form = function (n, a, b, c) { var x = n % 10, y = n % 100; return x === 1 && y !== 11 ? a : x >= 2 && x <= 4 && (y < 12 || y > 14) ? b : c; };
  var dec = function (s) { var t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
  // короткое название: без «ИП …», «1шт» и слова «протеиновый» – чтобы был виден вкус
  var short = function (n) { return dec(n).replace(/\s*ИП\s+[А-ЯЁ][а-яё]+,?/g, '').replace(/,?\s*1\s*шт\.?/gi, '').replace(/\s*протеинов\S*/gi, '').replace(/BOMBBAR/g, 'Bombbar').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim(); };
  var img = function (p) { return p.images && p.images[0] ? p.images[0].thumbnail : ''; };
  function avail(arr) { return arr.filter(function (id) { return P[id] && P[id].is_in_stock && P[id].is_purchasable; }); }

  // коллаж рисуем сразу, не дожидаясь каталога
  $('hi-col').innerHTML = COL[cur].map(function (c) { return '<img src="' + CUT + c[0] + '.png" style="' + c[1] + '" alt="">'; }).join('');
  var ids = MORE.slice();
  Object.keys(BOXES).forEach(function (k) { BOXES[k].slots.forEach(function (s) { ids = ids.concat(s[2]); }); });
  fetch('/wp-json/wc/store/v1/products?per_page=100&include=' + ids.join(','))
    .then(function (r) { return r.json(); })
    .then(function (list) {
      list.forEach(function (p) { P[p.id] = p; });
      Object.keys(BOXES).forEach(function (k) { pick[k] = BOXES[k].slots.map(function (s) { return avail(s[2])[0] || null; }); });
      render();
    })
    .catch(function () { $('hi-slots').innerHTML = '<p class="hi-sub" style="padding:16px 0">не получилось загрузить товары – обнови страницу</p>'; });

  function render(pop) {
    root.querySelectorAll('.hi-tab').forEach(function (t) { t.classList.toggle('is-on', t.dataset.box === cur); });
    var b = BOXES[cur];
    $('hi-warn').hidden = !b.warn;
    $('hi-col').innerHTML = COL[cur].map(function (c) { return '<img src="' + CUT + c[0] + '.png" style="' + c[1] + '" alt="">'; }).join('');
    var html = '';
    b.slots.forEach(function (s, i) {
      var list = avail(s[2]); if (!list.length) return;
      var base = price(P[list[0]]);
      html += '<div class="hi-slot"><div class="hi-slot-k"><b>' + s[0] + '</b><small>' + s[1] + '</small><em>' + list.length + ' ' + form(list.length, 'вариант', 'варианта', 'вариантов') + (list.length > 1 ? ' →' : '') + '</em></div><div class="hi-row">'
        + list.map(function (id) {
            var d = Math.round(price(P[id]) - base);
            return '<div class="hi-opt' + (id === pick[cur][i] ? ' is-on' : '') + '" role="button" tabindex="0" data-i="' + i + '" data-id="' + id + '"><button type="button" class="hi-i" data-info="' + id + '" aria-label="подробнее">i</button><img src="' + img(P[id]) + '" alt="" loading="lazy"><span>' + short(P[id].name) + '</span><b>' + rub(price(P[id])) + (d ? '<i>' + (d > 0 ? '+' : '−') + Math.abs(d) + '</i>' : '') + '</b></div>';
          }).join('') + '</div></div>';
    });
    $('hi-slots').innerHTML = html;
    var items = pick[cur].filter(Boolean);
    boxSum = items.reduce(function (a, id) { return a + price(P[id]); }, 0);
    $('hi-thumbs').innerHTML = items.map(function (id, i) { return '<img src="' + img(P[id]) + '" alt=""' + (pop === i ? ' class="is-pop"' : '') + '>'; }).join('');
    if (pop != null) setTimeout(function () { var t = $('hi-thumbs').children[pop]; if (t) t.classList.remove('is-pop'); }, 300);
    renderMore();
  }

  function renderMore() {
    var add = 0, extraIds = Object.keys(extra).filter(function (id) { return extra[id] && P[id]; });
    extraIds.forEach(function (id) { add += price(P[id]); });
    var total = boxSum + add, left = Math.max(0, FREE - total);
    $('hi-sum').innerHTML = rub(total) + '<em>' + rub(total * 0.9) + ' с картой интеллигента</em>';
    var n = pick[cur].filter(Boolean).length + extraIds.length;
    $('hi-sumk').textContent = BOXES[cur].name + ' · ' + n + ' ' + form(n, 'продукт', 'продукта', 'продуктов');
    $('hi-left').innerHTML = left ? 'бокс и добавленное – ' + rub(total) + '. до бесплатной доставки осталось <b>' + rub(left) + '</b>' : '🎉 доставка по Ялте – бесплатно';
    $('hi-bar').style.width = Math.min(100, total / FREE * 100) + '%';
    root.querySelectorAll('.hi-mtab').forEach(function (t) { t.classList.toggle('is-on', t.dataset.m === moreTab); });
    $('hi-more').innerHTML = avail(MORE_SETS[moreTab]).slice(0, 8).map(function (id) {
      var p = P[id];
      return '<div class="hi-m"><img src="' + img(p) + '" alt=""><div class="hi-m-n">' + short(p.name) + '</div><div class="hi-m-p">' + rub(price(p)) + '</div>'
        + '<button type="button" class="hi-m-add' + (extra[id] ? ' is-in' : '') + '" data-add="' + id + '">' + (extra[id] ? '✓ добавлено' : '+ к заказу') + '</button></div>';
    }).join('');
  }

  // способ получения: «в день хайка» и «самовывоз» – в корзине сразу выбираем самовывоз магазина;
  // для хайка добавляем строку с датой и маршрутом (копируем – пока на сайте нет кода, который вставит её сам)
  var wayNow = 'hike';
  var WAY_MSG = {
    hike: 'при оформлении уже будет выбран самовывоз – бокс заберёт организатор и отдаст тебе на старте маршрута. строку с датой хайка мы скопируем – вставь её в комментарий к заказу',
    pickup: 'при оформлении уже будет выбран самовывоз – заберёшь бокс в магазине',
    home: 'товары добавятся в корзину – доставку выберешь при оформлении заказа'
  };
  function setWayMsg() { $('hi-msg').textContent = WAY_MSG[wayNow]; }
  setWayMsg();
  function hikeNote() {
    var d = $('hi-date').value, p = d ? d.split('-') : null;
    return 'Хайкинг бокс · заберу на старте хайка' + (p ? ' ' + p[2] + '.' + p[1] : '') + (route ? ' · ' + route : '');
  }
  function pickPickup(n) {
    // находим в корзине способ «самовывоз» и выбираем его; если не нашли – оставляем выбор человеку
    return fetch('/wp-json/wc/store/v1/cart', { credentials: 'include' }).then(function (res) { return res.json(); }).then(function (cart) {
      var pk = (cart.shipping_rates || [])[0]; if (!pk) return;
      var rate = (pk.shipping_rates || []).filter(function (x) { return /pickup/i.test(x.method_id) || /самовывоз/i.test(x.name); })[0];
      if (!rate || rate.selected) return;
      return fetch('/wp-json/wc/store/v1/cart/select-shipping-rate', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Nonce': n }, body: JSON.stringify({ package_id: pk.package_id, rate_id: rate.rate_id }) });
    }).catch(function () {});
  }

  // карточка товара по «i»: крупное фото, цена, описание из магазина, ссылка на товар
  function openInfo(id) {
    var p = P[id]; if (!p) return;
    var t = document.createElement('div'); t.innerHTML = p.short_description || p.description || '';
    var d = (t.textContent || '').replace(/\s+/g, ' ').trim();
    if (d.length > 700) d = d.slice(0, 700).replace(/\s\S*$/, '') + '…';
    var big = p.images && p.images[0] ? (p.images[0].src || p.images[0].thumbnail) : '';
    var m = $('hi-modal');
    m.innerHTML = '<div class="hi-modal-c"><button type="button" class="hi-modal-x" aria-label="закрыть">✕</button>'
      + (big ? '<img src="' + big + '" alt="">' : '') + '<b>' + dec(p.name) + '</b><div class="hi-modal-p">' + rub(price(p)) + '</div>'
      + (d ? '<p class="hi-modal-d"></p>' : '') + (p.permalink ? '<a class="hi-modal-a" href="' + p.permalink + '" target="_blank" rel="noopener">подробнее в магазине →</a>' : '') + '</div>';
    if (d) m.querySelector('.hi-modal-d').textContent = d;
    m.hidden = false; document.documentElement.style.overflow = 'hidden';
  }
  function closeInfo() { $('hi-modal').hidden = true; document.documentElement.style.overflow = ''; }

  root.addEventListener('click', function (e) {
    var way = e.target.closest('.hi-way');
    if (way) {
      root.querySelectorAll('.hi-way').forEach(function (w) { w.classList.toggle('is-on', w === way); });
      wayNow = way.dataset.way; setWayMsg();
      $('hi-date-row').hidden = way.dataset.way !== 'hike';
      $('hi-more-card').hidden = way.dataset.way !== 'home';
      if (way.dataset.way !== 'home') extra = {};
      renderMore();
      return;
    }
    var info = e.target.closest('[data-info]');
    if (info) { e.stopPropagation(); openInfo(+info.dataset.info); return; }
    if (e.target.closest('.hi-modal-x') || e.target.classList.contains('hi-modal')) { closeInfo(); return; }
    var mt = e.target.closest('.hi-mtab');
    if (mt) { moreTab = mt.dataset.m; renderMore(); return; }
    var add = e.target.closest('[data-add]');
    if (add) { var aid = +add.dataset.add; extra[aid] = !extra[aid]; renderMore(); return; }
    var tab = e.target.closest('.hi-tab');
    if (tab) { cur = tab.dataset.box; render(); return; }
    var opt = e.target.closest('.hi-opt');
    if (opt) {
      var i = +opt.dataset.i, row = opt.closest('.hi-row'), rows = [].slice.call(root.querySelectorAll('.hi-row')), k = rows.indexOf(row), x = row.scrollLeft;
      pick[cur][i] = +opt.dataset.id;
      render(pick[cur].slice(0, i + 1).filter(Boolean).length - 1);
      var nr = root.querySelectorAll('.hi-row')[k]; if (nr) nr.scrollLeft = x;
    }
  });

  // оформить: кладём товары бокса (и добавленное) в обычную корзину магазина; владельцу карты – сразу скидка клуба
  $('hi-cta').addEventListener('click', function () {
    var btn = this, msg = $('hi-msg');
    var items = pick[cur].filter(Boolean).concat(Object.keys(extra).filter(function (id) { return extra[id]; }).map(Number));
    if (!items.length) return;
    if (wayNow === 'hike' && !$('hi-date').value) { msg.textContent = 'укажи дату хайка – соберём бокс к этому дню'; $('hi-date').focus(); $('hi-date-row').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    var note = wayNow === 'hike' ? hikeNote() : '';
    // строка для комментария: в буфер обмена (сразу, пока действует нажатие) и в cookie – для будущей вставки кодом на сайте
    document.cookie = 'hi_note=' + encodeURIComponent(note) + ';path=/;max-age=' + (note ? 7200 : 0);
    if (note && navigator.clipboard) navigator.clipboard.writeText(note).catch(function () {});
    btn.disabled = true; btn.textContent = 'кладём в корзину…';
    var nonce = function () { return fetch('/wp-json/wc/store/v1/cart', { credentials: 'include' }).then(function (r) { return r.headers.get('Nonce'); }); };
    nonce()
      .then(function (n) {
        return fetch('/wp-json/wc/store/v1/batch', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Nonce': n },
          body: JSON.stringify({ requests: items.map(function (id) {
            return { path: '/wc/store/v1/cart/add-item', method: 'POST', headers: { 'Nonce': n }, body: { id: id, quantity: 1 } };
          }) })
        });
      })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        if (!hasCard) return;
        return nonce().then(function (n2) {
          return fetch('/wp-json/wc/store/v1/cart/apply-coupon', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Nonce': n2 }, body: JSON.stringify({ code: atob('aW50ZWxsaWdlbnQ=') }) });
        }).catch(function () {});
      })
      .then(function () { if (wayNow !== 'home') return nonce().then(pickPickup); })
      .then(function () {
        if (!note) { location.href = '/checkout/'; return; }
        msg.innerHTML = '✓ скопировали: <b>' + note.replace(/</g, '') + '</b> – вставь в комментарий к заказу';
        btn.textContent = 'переходим к оформлению…';
        setTimeout(function () { location.href = '/checkout/'; }, 2200);
      })
      .catch(function () { btn.disabled = false; btn.textContent = 'заказать'; msg.textContent = 'не получилось добавить в корзину – попробуй ещё раз'; });
  });
})();

})();
