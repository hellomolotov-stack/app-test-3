// Страница «хайкинг бокс» на dietcakes.ru/hiking-intelligence.
// На самой странице WordPress стоит только: <div id="hi-root"></div><script src="https://app-test-3-delta.vercel.app/assets/dc/hiking-box.js"></script>
// Вся разметка, стили и логика живут здесь – правки выкатываются через наш Vercel, в админку dietcakes заходить не нужно.
(function () {
  if (window.__hiBox) return; window.__hiBox = true;
  var mount = document.getElementById('hi-root');
  if (!mount) { mount = document.createElement('div'); (document.currentScript && document.currentScript.parentNode || document.body).appendChild(mount); }
  mount.innerHTML = "<div class=\"hi\" id=\"hi\">\n<style>\n/* стиль магазина «Жить здорово»: Inter, белые карточки 24px на сером фоне сайта, зелёный акцент, розовая кнопка оформления.\n   фирменный цвет клуба – только в баннере сверху */\n.hi{--g:rgb(140,188,103);--g2:#eef6e7;--pink:rgb(231,34,104);--t:#404040;--h:#242424;--mut:#8a8a8a;--line:#ececec;--soft:#f5f5f7;\n font-family:Inter,Arial,Helvetica,sans-serif;color:var(--t);max-width:900px;margin:20px auto 0;padding:0 0 120px}\n.hi *{box-sizing:border-box}\n.hi [hidden]{display:none!important}\n.hi p{margin:0;line-height:1.5}\n.hi h1,.hi h2{color:var(--h);font-weight:700;margin:0}\n.hi button{height:auto;min-height:0;line-height:1.25;text-transform:none;letter-spacing:normal;box-shadow:none;font-family:inherit}\n.hi-card{background:#fff;border-radius:24px;padding:24px;margin:0 0 16px}\n.hi .hi-btn{display:inline-block;border:0;border-radius:30px;padding:14px 26px;font-weight:600;font-size:15px;color:#fff;background:var(--pink);text-decoration:none;cursor:pointer}\n.hi .hi-btn[disabled]{opacity:.6;cursor:wait}\n.hi h2{font-size:22px;margin-bottom:6px}\n.hi-sub{color:var(--mut);margin:0 0 14px!important;font-size:14px}\n/* баннер – единственный фирменный блок */\n/* вкладки – как чипы категорий магазина */\n.hi-tabs{display:flex;gap:8px;margin:0 0 6px}\n.hi-tab{flex:1;border:0;border-radius:20px;padding:12px 10px;background:var(--soft);font-size:15px;font-weight:600;color:var(--h);cursor:pointer}\n.hi-tab small{display:block;font-size:12.5px;font-weight:500;color:var(--mut);margin-top:2px}\n.hi-tab.is-on{background:var(--g);color:#fff}.hi-tab.is-on small{color:rgba(255,255,255,.85)}\n/* замена */\n.hi-slot{display:grid;grid-template-columns:150px 1fr;gap:14px;align-items:center;padding:16px 0;border-top:1px solid var(--line)}\n.hi-slot-k b{display:block;color:var(--h);font-size:15px;font-weight:700}\n.hi-slot-k small{display:block;color:var(--mut);font-size:13px}\n.hi-slot-k em{display:block;font-style:normal;font-size:12px;color:var(--mut);margin-top:6px}\n.hi-row{display:flex;gap:10px;overflow-x:auto;padding:4px 2px 8px;scroll-snap-type:x mandatory;scrollbar-width:thin}\n.hi-opt{flex:none;width:130px;scroll-snap-align:start;border-radius:20px;background:#fff;border:2px solid transparent;padding:0 0 6px;cursor:pointer;position:relative;user-select:none}\n.hi .hi-opt img{display:block;width:100%;height:110px;object-fit:contain;background:var(--soft);border-radius:18px;padding:8px}\n.hi-opt span{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-size:13px;line-height:1.3;margin:8px 4px 0;color:var(--h);height:51px}\n.hi-opt b{display:block;font-size:15px;font-weight:700;color:var(--h);margin:4px 4px 0}\n.hi-opt i{font-style:normal;font-size:12px;font-weight:600;color:var(--mut);margin-left:4px}\n.hi-opt.is-on{border-color:var(--g);background:var(--g2)}\n.hi-opt.is-on::after{content:\"✓\";position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;background:var(--g);color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center}\n.hi-warn{margin:12px 0 0;padding:12px 14px;border-radius:16px;font-size:14px;color:#7a5a12;background:#fff7e6}\n.hi-fair{font-size:14px;color:var(--t);padding:12px 14px;border-radius:16px;background:var(--soft);margin-top:12px}\n.hi-fair b{color:var(--h)}\n.hi-cardrow{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:12px;padding:12px 14px;border-radius:16px;background:var(--g2)}\n.hi .hi-cardrow img{width:60px;height:40px;object-fit:cover;border-radius:7px;transform:rotate(-6deg)}\n.hi-cardrow div{flex:1;min-width:180px}\n.hi-cardrow b{display:block;color:var(--h)}\n.hi-cardrow small{color:var(--mut)}\n.hi .hi-cardrow .hi-btn{padding:10px 18px;font-size:14px;color:#fff;background:var(--g)}\n/* как получить */\n.hi-ways{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}\n.hi-way{position:relative;border-radius:18px;background:var(--soft);padding:16px 14px 16px 44px;border:2px solid transparent;cursor:pointer;user-select:none}\n.hi-way::before{content:\"\";position:absolute;left:14px;top:18px;width:18px;height:18px;border-radius:50%;border:2px solid #c8c8c8;background:#fff}\n.hi-way.is-on{border-color:var(--g);background:var(--g2)}\n.hi-way.is-on::before{border-color:var(--g);background:var(--g);box-shadow:inset 0 0 0 3px #fff}\n.hi-way b{display:block;margin-bottom:4px;color:var(--h)}\n.hi-way small{color:var(--mut);font-size:13px}\n.hi-date{margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}\n.hi .hi-date input{border:1px solid #e0e0e0;border-radius:20px;padding:10px 14px;font:inherit;background:#fff;color:var(--h);height:auto;margin:0;width:auto}\n.hi-msg{margin-top:12px!important;font-size:13px;color:var(--mut)}\n/* добери до 2 000 ₽ */\n.hi-left{font-size:14.5px;margin:0 0 8px!important}\n.hi-left b{color:var(--pink)}\n.hi-bar{height:8px;border-radius:8px;background:#eee;overflow:hidden;margin:0 0 16px}\n.hi-bar i{display:block;height:100%;width:0;background:var(--g);border-radius:8px;transition:width .3s}\n.hi-more{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}\n.hi-m{display:flex;flex-direction:column}\n.hi .hi-m img{width:100%;aspect-ratio:1;object-fit:contain;background:var(--soft);border-radius:20px;padding:10px;margin-bottom:8px}\n.hi-m-n{font-size:13px;line-height:1.3;color:var(--h);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:50px}\n.hi-m-p{font-weight:700;color:var(--h);margin:6px 0 8px;font-size:15px}\n.hi .hi-m-add{margin-top:auto;border:1px solid var(--line);border-radius:20px;padding:9px 10px;font-size:14px;font-weight:600;color:var(--h);background:#fff;cursor:pointer}\n.hi .hi-m-add.is-in{background:var(--g);border-color:var(--g);color:#fff}\n.hi-faq details{border-top:1px solid var(--line);padding:14px 0}\n.hi-faq summary{cursor:pointer;font-weight:600;color:var(--h)}\n.hi-faq details p{margin-top:8px!important;color:var(--t)}\n/* нижняя панель – как блок «Итого» в корзине магазина */\n.hi-sticky{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);width:min(872px,calc(100% - 20px));display:flex;align-items:center;gap:14px;padding:10px 10px 10px 16px;border-radius:24px;background:#fff;z-index:500;box-shadow:0 8px 30px rgba(0,0,0,.14)}\n.hi-thumbs{display:flex;padding-left:8px}\n.hi .hi-thumbs img{width:36px;height:36px;object-fit:contain;background:var(--soft);border-radius:50%;border:2px solid #fff;margin-left:-8px;transition:transform .25s}\n.hi .hi-thumbs img.is-pop{transform:scale(1.25)}\n.hi-sp{flex:1;min-width:0}\n.hi-sp b{font-size:21px;color:var(--g);font-weight:700}\n.hi-sp em{font-style:normal;font-size:13px;font-weight:600;color:var(--t);margin-left:8px}\n.hi-sp small{display:block;color:var(--mut);font-size:12px}\n@media(max-width:640px){\n .hi{margin-top:12px;padding:0 0 110px}\n .hi-card{padding:18px;border-radius:24px}\n .hi-slot{grid-template-columns:1fr;gap:8px;padding:14px 0}\n .hi-slot-k{display:grid;grid-template-columns:1fr auto;column-gap:10px}\n .hi-slot-k b{grid-column:1}.hi-slot-k em{grid-column:2;grid-row:1;margin:0;align-self:center}.hi-slot-k small{grid-column:1/3}\n .hi-opt{width:120px}.hi .hi-opt img{height:100px}\n .hi-tab{font-size:14.5px}.hi-tab small{font-size:12px}\n .hi-ways{grid-template-columns:1fr}\n .hi-cardrow{display:grid;grid-template-columns:auto 1fr;gap:10px 14px}.hi-cardrow div{min-width:0}.hi .hi-cardrow .hi-btn{grid-column:1/3;text-align:center}\n .hi-thumbs{display:none}\n .hi-sp b{font-size:19px}.hi-sp em{display:block;margin:2px 0 0;font-size:12px}.hi-sp small{display:none}.hi .hi-sticky .hi-btn{padding:13px 18px;font-size:15px}\n}\n/* шапка-баннер: фото скалы, белые логотипы через тонкий ×, матовая метка «коллаборация» */\n.hi-hero{position:relative;overflow:hidden;border-radius:24px;margin:0 0 16px;min-height:330px;display:flex;flex-direction:column;justify-content:space-between;align-items:center;text-align:center;color:#fff;padding:22px 20px 22px;\n background:#4a90c8 url(https://app-test-3-delta.vercel.app/assets/box/rock.jpg) center 52%/cover}\n.hi-hero::before{content:\"\";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0) 38%,rgba(10,16,24,.5) 70%,rgba(10,16,24,.78) 100%)}\n.hi-hero>*{position:relative;z-index:1}\n.hi-lock{display:flex;align-items:center;gap:16px}\n.hi .hi-lock img{display:block;width:auto;filter:brightness(0) invert(1) drop-shadow(0 2px 8px rgba(0,0,0,.25))}\n.hi .hi-lock .hi-lh{height:40px}.hi .hi-lock .hi-ld{height:36px}\n.hi-lock svg{width:15px;height:15px;flex:none;filter:drop-shadow(0 1px 4px rgba(0,0,0,.3))}\n.hi-pill{display:inline-block;padding:6px 14px;border-radius:14px;background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.45);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#fff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}\n.hi-hero h1{color:#fff;margin:10px 0 6px;font-size:30px;line-height:1.15;text-wrap:balance;text-shadow:0 2px 12px rgba(0,0,0,.35)}\n.hi-hero h1 span{white-space:nowrap}\n.hi-hero p{margin:0 auto 14px;max-width:440px;font-size:15px;line-height:1.45;color:rgba(255,255,255,.92);text-shadow:0 1px 8px rgba(0,0,0,.4)}\n.hi .hi-hero .hi-btn{color:#000;background:linear-gradient(180deg,#e8ff4a,#c9ec00);padding:14px 32px;box-shadow:0 6px 18px rgba(0,0,0,.25)}\n.hi-club{margin-top:12px}\n.hi-club summary{cursor:pointer;color:rgba(255,255,255,.9);font-weight:600;font-size:13.5px;list-style:none;text-decoration:underline;text-underline-offset:3px}\n.hi-club summary::-webkit-details-marker{display:none}\n.hi-club p{font-size:13.5px;margin:10px auto 0!important;color:rgba(255,255,255,.88)}\n.hi-club a{color:#D9FD19;font-weight:600;text-decoration:none}\n@media(max-width:640px){.hi-hero{min-height:360px;background-position:center 36%}.hi-hero h1{font-size:27px}.hi .hi-lock .hi-lh{height:34px}.hi .hi-lock .hi-ld{height:30px}.hi-lock{gap:12px}}\n/* компьютер: оригинал фото в полном размере + лёгкое зерно, чтобы растянутая картинка не выглядела мыльной */\n@media(min-width:641px){\n .hi-hero{background-image:url(https://app-test-3-delta.vercel.app/assets/box/rock-hd.jpg)}\n .hi-hero::after{content:\"\";position:absolute;inset:0;pointer-events:none;opacity:.16;mix-blend-mode:overlay;\n  background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")}\n}\n.hi-mtabs{display:flex;gap:8px;margin:0 0 14px}\n.hi-mtab{border:0;border-radius:20px;padding:10px 16px;background:var(--soft);font-size:14.5px;font-weight:600;color:var(--h);cursor:pointer}\n.hi-mtab.is-on{background:var(--g);color:#fff}\n.hi .hi-i{position:absolute;top:6px;left:6px;z-index:2;width:24px;height:24px;border-radius:50%;border:0;padding:0;background:rgba(255,255,255,.95);color:var(--h);font:italic 700 13px/24px Georgia,serif;box-shadow:0 1px 4px rgba(0,0,0,.18);cursor:pointer}\n.hi-modal{position:fixed;inset:0;z-index:1000;background:rgba(20,24,30,.45);display:flex;align-items:flex-end;justify-content:center}\n.hi-modal-c{position:relative;width:min(560px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:24px 24px 0 0;padding:20px 20px calc(env(safe-area-inset-bottom,0px) + 24px)}\n.hi .hi-modal-c img{display:block;width:100%;height:240px;object-fit:contain;background:var(--soft);border-radius:18px;margin:0 0 14px}\n.hi-modal-c b{display:block;font-size:17px;line-height:1.3;color:var(--h)}\n.hi-modal-p{font-size:18px;font-weight:700;color:var(--g);margin:6px 0 10px}\n.hi-modal-d{font-size:14px!important;line-height:1.55!important;color:var(--t)}\n.hi-modal-a{display:inline-block;margin-top:12px;font-weight:600;color:var(--g);text-decoration:none}\n.hi .hi-modal-x{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;border:0;background:var(--soft);font-size:15px;cursor:pointer;color:var(--h)}\n@media(min-width:641px){.hi-modal{align-items:center}.hi-modal-c{border-radius:24px}}\n/* телефон: баннер сразу под шапкой сайта, без серого отступа темы */\n@media(max-width:640px){.page-id-15624 .main-page-wrapper,.page-id-15624 .wd-page-content,.page-id-15624 .wd-content-layout,.page-id-15624 .site-content,.page-id-15624 .entry-content{padding-top:0!important;margin-top:0!important}.hi{margin-top:8px}}\n/* заставка загрузки – как в приложении клуба, поверх размытой страницы */\n.hi-load{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:rgba(242,243,247,.55);-webkit-backdrop-filter:blur(18px) saturate(120%);backdrop-filter:blur(18px) saturate(120%);transition:opacity .45s ease}\n.hi-load.is-out{opacity:0;pointer-events:none}\n.hi-load-st{position:relative;width:280px;height:110px;text-align:center;color:var(--h);font:600 18px/1.2 Inter,Arial,sans-serif}\n.hi-load-s{position:absolute;inset:0;opacity:0;animation:hiStep 4.5s linear infinite}\n.hi-load-s b{display:block;font-size:48px;line-height:1;margin-bottom:16px;font-weight:400;animation:hiPulse 1.5s ease-in-out infinite}\n.hi-load-s:nth-child(2){animation-delay:1.5s}.hi-load-s:nth-child(3){animation-delay:3s}\n@keyframes hiStep{0%,33.2%{opacity:1}33.3%,100%{opacity:0}}\n@keyframes hiPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.1);opacity:.8}}\n.hi .hi-modal-b{display:block;width:100%;margin-top:16px;text-align:center}\n.hi .hi-modal-b.is-in{background:var(--g2);color:var(--g)}\n.hi .hi-club-btn{display:block;margin:12px auto 0;border:0;background:none;padding:4px 8px;color:rgba(255,255,255,.9);font-size:13.5px;font-weight:600;text-decoration:underline;text-underline-offset:3px;cursor:pointer}\n.hi-hero-b{margin-top:28px}\n.hi .hi-modal-c a.hi-btn{color:#fff;text-decoration:none}\n.hi-row{position:relative}\n/* количество у выбранного товара */\n.hi-qty{display:flex;align-items:center;justify-content:space-between;margin:8px 4px 0;background:#fff;border-radius:16px;padding:3px}\n.hi .hi-qty button{width:30px;height:30px;border:0;border-radius:50%;background:var(--g);color:#fff;font-size:18px;font-weight:700;line-height:30px;padding:0;cursor:pointer}\n.hi-qty span{font-weight:700;color:var(--h);font-size:15px}\n/* «ещё товары» */\n.hi .hi-more-btn{grid-column:1/-1;border:1px solid var(--line);border-radius:20px;background:#fff;padding:13px;font-size:15px;font-weight:600;color:var(--h);cursor:pointer}\n/* карта целиком, со своим скруглением */\n.hi .hi-cardrow img{width:72px;height:auto;aspect-ratio:1000/602;object-fit:fill;border-radius:5px;transform:rotate(-6deg);box-shadow:0 3px 8px rgba(0,0,0,.25)}\n/* поддержка клуба – голубой цвет карты клуба */\n.hi-help{display:grid;grid-template-columns:auto 1fr;gap:12px 14px;align-items:center;margin:0 0 16px;padding:22px;border-radius:24px;color:#fff;background:linear-gradient(135deg,#5fa6d0,#3f87bb)}\n.hi-help-e{font-size:34px;line-height:1}\n.hi-help-t b{display:block;font-size:19px;font-weight:700;margin-bottom:4px}\n.hi-help-t span{font-size:14px;line-height:1.45;color:rgba(255,255,255,.9)}\n.hi .hi-help-b{grid-column:1/-1;display:block;text-align:center;border-radius:30px;padding:14px;font-weight:700;font-size:15px;color:#000;text-decoration:none;background:linear-gradient(180deg,#e8ff4a,#c9ec00)}\n@media(min-width:641px){.hi-help{grid-template-columns:auto 1fr auto}.hi .hi-help-b{grid-column:auto;padding:13px 26px}}\n/* плитки фото – как в каталоге магазина: серая подложка, белый фон фото «впечатан» в неё */\n.hi .hi-ph{position:relative;border-radius:18px;background:#f2f2f2;overflow:hidden}\n.hi .hi-ph img{display:block;width:100%;background:transparent!important;padding:8px!important;border-radius:0!important;mix-blend-mode:multiply;object-fit:contain;margin:0!important}\n.hi .hi-opt .hi-ph img{height:110px}\n.hi .hi-m .hi-ph{margin-bottom:8px}.hi .hi-m .hi-ph img{aspect-ratio:1;height:auto}\n.hi-opt.is-on .hi-ph{background:#f2f2f2}\n/* количество – белая «таблетка» поверх фото, как на сайте */\n.hi .hi-qty{position:absolute;left:6px;right:6px;bottom:6px;margin:0;display:flex;align-items:center;justify-content:space-between;height:32px;padding:0 4px;border-radius:16px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.12)}\n.hi .hi-qty button{width:26px;height:26px;border:0;border-radius:50%;background:#fff;color:var(--h);font-size:17px;font-weight:500;line-height:26px;padding:0;cursor:pointer}\n.hi .hi-qty span{font-size:14px;font-weight:600;color:var(--h)}\n/* карта поменьше */\n.hi .hi-cardrow img{width:52px}\n@media(max-width:640px){.hi .hi-opt .hi-ph img{height:100px}}\n/* фото само и есть плитка (у фото магазина свой светло-серый фон) – без второй подложки */\n.hi .hi-ph{background:#f4f4f4}\n.hi .hi-ph img{padding:0!important;mix-blend-mode:normal;object-fit:cover}\n.hi .hi-opt .hi-ph img{height:118px}\n.hi .hi-qty span{display:inline!important;height:auto!important;margin:0!important;-webkit-line-clamp:unset!important;line-height:1}\n@media(max-width:640px){.hi .hi-opt .hi-ph img{height:108px}}\n/* карточки – как в каталоге магазина: вытянуты вверх, название до 4 строк */\n.hi .hi-opt{width:136px;padding:0 0 8px}\n.hi .hi-opt .hi-ph img{height:auto;aspect-ratio:5/6}\n.hi .hi-opt > span{-webkit-line-clamp:4;height:auto;min-height:68px;font-size:13px;line-height:1.3;margin:8px 4px 0}\n.hi .hi-m .hi-ph img{aspect-ratio:5/6}\n.hi .hi-m-n{-webkit-line-clamp:4;min-height:68px}\n@media(max-width:640px){.hi .hi-opt{width:128px}.hi .hi-opt .hi-ph img{height:auto}}\n.hi-sticky{transition:transform .25s ease,opacity .25s ease}\n.hi-sticky.is-away{transform:translate(-50%,140%);opacity:0;pointer-events:none}\n\n/* несколько товаров в категории: миниатюры выбранного рядом с названием */\n.hi-slot-k{grid-template-columns:1fr auto!important;align-items:center}\n.hi-slot-k small{grid-column:1/3}\n.hi .hi-picked{grid-column:2;grid-row:1;display:flex;flex-direction:row;flex-wrap:nowrap;gap:6px;justify-content:flex-end;align-items:center}\n.hi .hi-pk{flex:0 0 34px}\n.hi-pk-n{font-size:12px;font-weight:700;color:var(--g)}\n.hi .hi-pk{position:relative;width:34px;height:34px;padding:0;border:2px solid var(--g);border-radius:10px;background:#f4f4f4;overflow:visible;cursor:pointer;transition:transform .2s}\n.hi .hi-pk img{width:100%;height:100%;object-fit:cover;border-radius:8px;display:block}\n.hi .hi-pk i{position:absolute;top:-7px;right:-7px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:var(--g);color:#fff;font-style:normal;font-size:11px;font-weight:700;line-height:18px;text-align:center}\n.hi .hi-pk.is-pop{transform:scale(1.25)}\n.hi-pk-0{font-size:12px;color:var(--mut)}\n.hi .hi-multi{margin:0 0 18px;font-size:13px;color:var(--mut)}\n.hi .hi-opt.is-pop{transform:scale(1.04);transition:transform .2s}\n.hi .hi-qty button svg{display:block;margin:auto}\n\n/* состав в карточке товара */\n.hi .hi-comp{margin-top:14px;padding:12px 14px;border-radius:14px;background:var(--soft)}\n.hi .hi-comp h4{margin:0 0 4px!important;font-size:13px!important;font-weight:700;color:var(--h);text-transform:none}\n.hi .hi-comp p{margin:0!important;font-size:13px!important;line-height:1.5!important;color:var(--t)}\n\n/* имя – жёлтая наклейка вместо кнопки «собрать бокс» */\n.hi .hi-pill.is-name{background:#e8ff4a;border-color:#e8ff4a;color:#1d2200;-webkit-backdrop-filter:none;backdrop-filter:none;font-size:15px;padding:8px 18px;border-radius:16px;transform:rotate(-4deg);box-shadow:0 4px 14px rgba(0,0,0,.25);text-transform:none;letter-spacing:0}\n.hi .hi-hero-b .hi-club-btn{margin-top:16px}\n\n/* метка всегда жёлтая наклейка (и без имени), баннер ниже */\n.hi .hi-pill{background:#e8ff4a;border-color:#e8ff4a;color:#1d2200;-webkit-backdrop-filter:none;backdrop-filter:none;font-size:15px;padding:8px 18px;border-radius:16px;transform:rotate(-4deg);box-shadow:0 4px 14px rgba(0,0,0,.25);text-transform:none;letter-spacing:0}\n.hi .hi-hero{min-height:270px!important}\n.hi .hi-hero-b{margin-top:28px!important}\n@media (min-width:641px){.hi .hi-hero{min-height:320px!important}}\n\n/* стрелки ряда в стиле сайта – только там, где есть мышь */\n.hi-rw{position:relative;min-width:0}\n.hi .hi-arr{display:none;position:absolute;top:calc(50% - 24px);z-index:3;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.14);cursor:pointer;transition:opacity .2s,transform .2s}\n.hi .hi-arr::before{content:\"\";position:absolute;left:50%;top:50%;width:10px;height:10px;border:solid var(--g);border-width:2.5px 2.5px 0 0;transform:translate(-65%,-50%) rotate(45deg)}\n.hi .hi-arr.is-l::before{transform:translate(-35%,-50%) rotate(-135deg)}\n.hi .hi-arr.is-l{left:-14px}.hi .hi-arr.is-r{right:-14px}\n.hi .hi-arr:hover{transform:scale(1.08)}\n@media (hover:hover) and (min-width:641px){.hi-rw.has-l .hi-arr.is-l,.hi-rw.has-r .hi-arr.is-r{display:block}}\n/* на компьютере миниатюры выбранного – под названием, с переносом, не вылезают за край */\n@media (min-width:641px){\n .hi .hi-slot-k{display:flex!important;flex-direction:column;align-items:flex-start;gap:8px;min-width:0}\n .hi .hi-picked{justify-content:flex-start;flex-wrap:wrap;padding:6px 6px 0 2px;max-width:100%;gap:8px}\n .hi .hi-slot-k small{order:3}\n .hi .hi-slot{grid-template-columns:200px minmax(0,1fr)!important}\n}\n\n/* заголовок-наклейка */\n.hi .hi-hero h1 .hi-h1-pill{display:inline-block;font-size:24px;padding:8px 20px;border-radius:18px;margin:0 0 6px;white-space:nowrap}\n.hi .hi-hero h1 .hi-h1-route{display:block;white-space:normal}\n/* названия категорий крупнее */\n.hi .hi-slot-k b{font-size:18px!important;line-height:1.25}\n@media(max-width:640px){.hi .hi-slot-k b{font-size:17px!important}}\n\n/* выбранные товары в нижней панели: на телефоне – стопка из 3 кружков и «+N» в той же строке */\n.hi-thumbs-n{display:none}\n@media(max-width:640px){\n .hi .hi-thumbs{display:flex;align-items:center;flex:none;padding-left:8px;order:2}\n .hi .hi-sp{order:1}\n .hi .hi-sticky .hi-btn{order:3}\n .hi .hi-thumbs img{width:28px;height:28px;margin-left:-9px}\n .hi .hi-thumbs img:nth-of-type(n+4){display:none}\n .hi .hi-thumbs-n{display:block;margin-left:4px;font-size:12px;font-weight:700;color:var(--g)}\n .hi .hi-sticky{gap:10px}\n .hi .hi-sp-x{display:none}\n .hi .hi-sp em{white-space:nowrap}\n}\n\n/* карта в шторке: без тёмных уголков из картинки, скруглённая, с лёгкой тенью */\n.hi .hi-modal-c img.hi-mcard{width:calc(100% - 48px);max-width:400px;height:auto;aspect-ratio:1000/602;margin:8px auto 18px;object-fit:cover;background:none;border-radius:20px;clip-path:inset(3px round 18px);filter:drop-shadow(0 10px 18px rgba(30,60,90,.25))}\n\n/* заставка – как у самого магазина: их анимация на их бледно-розовом фоне */\n.hi .hi-load{background:rgb(250,233,234)!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}\n.hi .hi-load img{width:320px;max-width:82vw;height:auto;display:block}\n\n/* нижняя панель: ничего не наезжает друг на друга при любой ширине и любой сумме */\n.hi .hi-sp{min-width:0;overflow:hidden}\n.hi .hi-sp b,.hi .hi-sp em{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.hi .hi-sp em{margin-left:0}\n@media(min-width:641px){.hi .hi-sp em{display:inline;margin-left:8px}}\n.hi .hi-sticky .hi-btn{flex:none;white-space:nowrap}\n@media(max-width:640px){\n .hi .hi-sticky .hi-btn{width:118px;padding-left:0;padding-right:0;text-align:center}\n .hi .hi-thumbs{flex:0 1 auto;min-width:0;overflow:hidden}\n}\n@media(max-width:360px){.hi .hi-thumbs{display:none!important}}\n/* заголовок для посетителей, открывших страницу без перехода из приложения */\n.hi .hi-hero .hi-pitch{max-width:580px;margin:12px auto 14px;font-size:26px;line-height:1.2;font-weight:700;color:#fff;text-wrap:balance;text-shadow:0 2px 12px rgba(0,0,0,.4)}\n@media(max-width:640px){.hi .hi-hero .hi-pitch{font-size:22px;max-width:340px}}\n</style>\n\n\n<div class=\"hi-load\" id=\"hi-load\" aria-hidden=\"true\"><img src=\"https://dietcakes.ru/wp-content/uploads/2026/04/%D0%BB%D0%BE%D0%B0%D0%B4%D0%B5%D1%80.gif\" alt=\"\"></div>\n<div class=\"hi-hero\">\n  <div class=\"hi-lock\"><img class=\"hi-lh\" src=\"https://app-test-3-delta.vercel.app/assets/logo-hiking.png\" alt=\"хайкинг интеллигенция\"><svg viewBox=\"0 0 22 22\" aria-hidden=\"true\"><path d=\"M3 3 L19 19 M19 3 L3 19\" stroke=\"#fff\" stroke-width=\".9\" stroke-linecap=\"round\"/></svg><img class=\"hi-ld\" src=\"https://dietcakes.ru/wp-content/uploads/2026/04/%D0%A0%D0%B5%D1%81%D1%83%D1%80%D1%81-4.svg\" alt=\"жить здорово\"></div>\n  <div class=\"hi-hero-b\">\n    <h1 id=\"hi-h1\">хайкинг бокс</h1>\n    <h2 class=\"hi-pitch\" id=\"hi-pitch\" hidden>закажи перед хайком и получи у начала маршрута</h2>\n    <p>протеиновые снеки, сладкое без сахара и функциональные напитки от наших друзей «Жить здорово». мы собрали основу, а ты меняешь её под свой маршрут и вкус</p>\n    <button type=\"button\" class=\"hi-club-btn\">о клубе</button>\n  </div>\n  <div id=\"hi-col\" hidden></div>\n</div>\n\n<div class=\"hi-card\" id=\"hi-box\">\n  <div class=\"hi-tabs\">\n    <button type=\"button\" class=\"hi-tab\" data-box=\"light\">лёгкий</button>\n    <button type=\"button\" class=\"hi-tab\" data-box=\"full\">сытный</button>\n  </div>\n  <div id=\"hi-slots\"><p class=\"hi-sub\" style=\"padding:16px 0\">загружаем товары…</p></div>\n  <div class=\"hi-warn\" id=\"hi-warn\" hidden>⏰ сэндвич или ролл – при заказе за 2 дня до хайка</div>\n  <div class=\"hi-cardrow\"><img src=\"https://app-test-3-delta.vercel.app/assets/card-front.jpg\" alt=\"\"><div><b>по карте интеллигента −10%</b><small id=\"hi-card-note\">скидка для владельцев карты клуба</small></div><a class=\"hi-btn\" id=\"hi-card-btn\" href=\"https://t.me/yaltahiking_bot?startapp=buy_card\" target=\"_blank\" rel=\"noopener\">узнать о карте</a></div>\n</div>\n\n<div class=\"hi-card\">\n  <h2>как получить</h2>\n  <p class=\"hi-sub\">выбери способ – дальше обычное оформление заказа</p>\n  <div class=\"hi-ways\">\n    <div class=\"hi-way is-on\" role=\"button\" tabindex=\"0\" data-way=\"hike\"><b>🏔 в день хайка</b><small>получишь бокс в начале маршрута</small></div>\n    <div class=\"hi-way\" role=\"button\" tabindex=\"0\" data-way=\"home\"><b>🚚 доставка домой</b><small>по Ялте; от 2 000 ₽ – бесплатно</small></div>\n    <div class=\"hi-way\" role=\"button\" tabindex=\"0\" data-way=\"pickup\"><b>🏪 самовывоз</b><small>из магазина</small></div>\n  </div>\n  <div class=\"hi-date\" id=\"hi-date-row\"><b>дата хайка</b><input type=\"date\" id=\"hi-date\"></div>\n  <p class=\"hi-msg\" id=\"hi-msg\">товары бокса добавятся в корзину – дальше обычное оформление заказа. дату хайка напиши в комментарии к заказу.</p>\n</div>\n\n<div class=\"hi-card\" id=\"hi-more-card\" hidden>\n  <h2>собери корзину на 2 000 ₽ – и доставка домой бесплатно</h2>\n  <p class=\"hi-left\" id=\"hi-left\"></p>\n  <div class=\"hi-bar\"><i id=\"hi-bar\"></i></div>\n  <div class=\"hi-mtabs\"><button type=\"button\" class=\"hi-mtab is-on\" data-m=\"home\">🍳 домой</button><button type=\"button\" class=\"hi-mtab\" data-m=\"rec\">💪 для восстановления</button></div>\n  <div class=\"hi-more\" id=\"hi-more\"></div>\n</div>\n\n<div class=\"hi-help\">\n  <div class=\"hi-help-e\">💬</div>\n  <div class=\"hi-help-t\"><b>остались вопросы?</b><span>спроси интеллигентную поддержку клуба – подскажут про бокс, получение в день хайка и карту</span></div>\n  <a class=\"hi-help-b\" href=\"https://t.me/hellointelligent\" target=\"_blank\" rel=\"noopener\">написать в поддержку</a>\n</div>\n\n<div class=\"hi-modal\" id=\"hi-modal\" hidden></div>\n<div class=\"hi-sticky\"><div class=\"hi-thumbs\" id=\"hi-thumbs\"></div><div class=\"hi-sp\"><b id=\"hi-sum\">–</b><small id=\"hi-sumk\">собираем бокс…</small></div><button type=\"button\" class=\"hi-btn\" id=\"hi-cta\">заказать</button></div>\n\n\n</div>\n";

(function () {
  // слоты боксов: [название, подпись, [id товаров: первый – по умолчанию]]; цены и наличие – из каталога в реальном времени
  var BOXES = {
    light: { name: 'лёгкий бокс', slots: [
      ['⚡ восстановить силы', 'на подъём', [4607, 14965, 1868, 4654, 2172, 3012, 4899, 4642, 2222, 4741, 1812, 1590, 2320, 2734, 2735, 2736, 2838, 2945, 3118, 3186, 3187, 3544, 3545, 4089, 4234, 4268, 4376, 5005, 5100, 5104, 13874, 14261, 14262, 14643, 14711, 14809]],
      ['🥨 солёный перекус', 'держит водно-солевой баланс', [3139, 4060, 2862, 3140, 4196, 2514, 3688, 2038, 2313, 2315, 1871, 2039, 3142, 4095, 4097, 4098, 4099, 4758, 4866, 4916, 2171, 11303, 2069]],
      ['🧇 хрустящее к чаю', 'к термосу на вершине', [2932, 3049, 3894, 4855, 2301, 2690, 2904, 2906, 3112, 3893, 14265, 14266, 14267, 14268, 14930, 14931]],
      ['🍪 сладкое без сахара', 'награда за подъём', [1602, 14205, 14206, 14207, 4320, 4897, 3356, 1860, 1973, 1975, 1563, 1972, 1634, 1974, 2831, 2872, 2871, 4064, 14639, 14642, 14911, 1671, 1801, 1647, 2182, 5015, 2183, 14967, 1893, 3342, 4270, 2312, 3985, 3263, 4051, 2707, 4747, 1930, 4820]],
      ['💧 глоток на привале', 'вода и лимонады без сахара', [15026, 4997, 14971, 4991, 3456, 3457, 3455, 3408, 3407, 14263, 2628, 2629, 2630, 2631, 15019, 4853, 1760, 4677, 4978, 11540, 11541]]
    ]},
    full: { name: 'сытный бокс', warn: true, slots: [
      ['🥪 обед на вершине', 'сытно и легко', [11683, 11678, 11681, 11720, 14279]],
      ['⚡ восстановить силы', 'после подъёма', [2466, 2272, 11299, 1868, 4654, 1590, 1812, 2222, 2320, 2734, 2735, 2736, 2838, 2945, 3118, 3186, 3187, 3544, 3545, 4089, 4234, 4268, 4376, 4607, 4642, 4741, 4899, 5005, 5100, 5104, 13874, 14261, 14262, 14643, 14711, 14809, 14965]],
      ['🧇 хрустящее к чаю', 'к термосу на вершине', [14266, 14265, 2906, 3049, 2932, 2301, 2690, 2904, 3112, 3893, 3894, 4855, 14267, 14268, 14930, 14931]],
      ['🍪 сладкое без сахара', 'награда за подъём', [1602, 14205, 14206, 14207, 4320, 4897, 3356, 1860, 1973, 1975, 1563, 1972, 1634, 1974, 2831, 2872, 2871, 4064, 14639, 14642, 14911, 1671, 1801, 1647, 2182, 5015, 2183, 14967, 1893, 3342, 4270, 2312, 3985, 3263, 4051, 2707, 4747, 1930, 4820]],
      ['🥨 солёный перекус', 'держит водно-солевой баланс', [2315, 3139, 4060, 2862, 3140, 4196, 2514, 3688, 2038, 2313, 1871, 2039, 3142, 4095, 4097, 4098, 4099, 4758, 4866, 4916, 2171, 11303, 2069]],
      ['💧 глоток на привале', 'вода и лимонады без сахара', [15026, 4997, 14971, 4991, 3456, 3457, 3455, 3408, 3407, 14263, 2628, 2629, 2630, 2631, 15019, 4853, 1760, 4677, 4978, 11540, 11541]]
    ]}
  };
  var CUT = 'https://app-test-3-delta.vercel.app/assets/box/cut/';
  var COL = {
    light: [['chips', 'height:180px;left:0;top:40px;transform:rotate(-7deg)'], ['water', 'height:160px;left:250px;top:20px;transform:rotate(6deg)'], ['bar', 'width:220px;left:60px;top:170px;transform:rotate(-8deg)'], ['qwikler', 'width:180px;left:170px;top:120px;transform:rotate(9deg)'], ['frut', 'width:160px;left:20px;top:230px;transform:rotate(-3deg)']],
    full: [['pesto', 'width:190px;left:0;top:60px;transform:rotate(-10deg)'], ['shake', 'height:160px;left:150px;top:10px;transform:rotate(6deg)'], ['water', 'height:170px;left:250px;top:40px;transform:rotate(-6deg)'], ['wafers', 'width:170px;left:40px;top:190px;transform:rotate(-6deg)'], ['sticks', 'width:110px;left:210px;top:170px;transform:rotate(9deg)']]
  };
  // «добери до 2 000 ₽»: продукты домой (первые 8 в наличии)
  // «собери корзину на 2 000 ₽»: две вкладки – еда домой и БАДы для восстановления (по 8 первых в наличии)

  var MORE_SETS = { home: [], rec: [] };
  var moreTab = 'home';
  // «ещё товары»: дальше подгружаем весь ассортимент разделов магазина (запрос идёт из браузера покупателя)
  var MORE_CATS = { home: '508,207,210,503,211,193,176,197,491', rec: '233' };
  var moreVis = { home: 6, rec: 6 };
  var moreLoaded = { home: [], rec: [] }, morePage = { home: 0, rec: 0 }, moreDone = { home: false, rec: false }, moreBusy = false;
  function loadMore() {
    if (moreBusy || moreDone[moreTab]) return;
    moreBusy = true; var tab = moreTab, btn = $('hi-more-btn'); if (btn) btn.textContent = 'загружаем…';
    readStore('/wp-json/wc/store/v1/products?per_page=12&stock_status=instock&orderby=popularity&category=' + MORE_CATS[tab] + '&page=' + (morePage[tab] + 1) + '&_fields=' + PRODUCT_FIELDS)
      .then(function (list) {
        acceptProducts(list); morePage[tab]++;
        if (!Array.isArray(list) || list.length < 12) moreDone[tab] = true;
        (list || []).forEach(function (pr) { P[pr.id] = pr; if (MORE_SETS[tab].indexOf(pr.id) < 0 && moreLoaded[tab].indexOf(pr.id) < 0) moreLoaded[tab].push(pr.id); });
      })
      .catch(function () { moreDone[tab] = true; inventoryReady = false; stockNotice('не удалось проверить дополнительные товары. обнови наличие перед заказом'); syncControls(); })
      .then(function () { moreBusy = false; renderMore(); });
  }
  var MORE = MORE_SETS.home.concat(MORE_SETS.rec);
  // товары из вариантов боксов в «собери корзину» не повторяем
  var INBOX = {};
  Object.keys(BOXES).forEach(function (k) { BOXES[k].slots.forEach(function (s) { s[2].forEach(function (id) { INBOX[id] = 1; }); }); });
  var FREE = 2000, extra = {};
  var $ = function (id) { return document.getElementById(id); };
  var root = $('hi');
  var qs = new URLSearchParams(location.search);
  // Приложение всегда передаёт utm_source=intelligentsia; referrer в Telegram ненадёжен.
  var fromClubApp = qs.get('utm_source') === 'intelligentsia';
  $('hi-pitch').hidden = fromClubApp;
  var cur = qs.get('box') === 'light' ? 'light' : 'full';
  // из приложения клуба: ?hike=ГГГГ-ММ-ДД&route=Ай-Петри&box=light|full&custom=1&card=1
  if (qs.get('hike')) $('hi-date').value = qs.get('hike');
  var route = (qs.get('route') || '').trim().slice(0, 60);
  // имя приходит после # – эта часть ссылки не уходит на сервер магазина
  var hq = new URLSearchParams(location.hash.slice(1));
  function forWhom(n) {
    n = (n || '').trim().split(/\s+/)[0];
    if (!/^[А-ЯЁ][а-яё]{1,20}$/.test(n)) return '';
    var l = n.slice(-1), l2 = n.slice(-2), base = n.slice(0, -1);
    if (l2 === 'ия') return n.slice(0, -1) + 'и';
    if (l === 'а') return base + (/[гкхжшчщ]$/.test(base) ? 'и' : 'ы');
    if (l === 'я') return base + 'и';
    if (l === 'й' || l === 'ь') return base + 'я';
    if (/[бвгджзклмнпрстфхцчшщ]/.test(l)) return n + 'а';
    return '';
  }
  var who = forWhom(hq.get('name'));
  // заголовок: жёлтая наклейка «хайкинг бокс», под ней – маршрут (имя пока не показываем)
  (function () { var h1 = $('hi-h1'); h1.innerHTML = '<span class="hi-pill hi-h1-pill">хайкинг бокс</span>'; if (route) { var rs = document.createElement('span'); rs.className = 'hi-h1-route'; rs.textContent = 'на ' + route; h1.appendChild(rs); } })();
  var hasCard = qs.get('card') === '1';
  // личный подписанный ID карты из приложения (после # – не уходит в адрес запроса); скидку по нему считает магазин с сервером клуба
  var cardToken = /^dc1_\d{1,16}_[A-Za-z0-9_-]{28}$/.test(hq.get('card') || '') ? hq.get('card') : '';
  if (hasCard) { $('hi-card-note').textContent = 'у тебя есть карта – скидка применится в корзине сама'; $('hi-card-btn').hidden = true; }
  if (qs.get('custom') === '1') setTimeout(function () { $('hi-box').scrollIntoView({ behavior: 'smooth' }); }, 600);

  // в каждой категории можно выбрать несколько товаров: sel[бокс][категория] = [[id, количество], …]
  var P = {}, sel = {}, boxSum = 0;
  function got(i, id) { var l = sel[cur][i]; for (var k = 0; k < l.length; k++) if (l[k][0] === id) return l[k]; return null; }
  function allSel() { var r = []; sel[cur].forEach(function (l) { l.forEach(function (x) { r.push(x); }); }); return r; }
  function toggle(i, id) { if (pendingDefaults[cur]) pendingDefaults[cur][i] = 0; var l = sel[cur][i], g = got(i, id); if (g) l.splice(l.indexOf(g), 1); else if (canAdd(id)) l.push([id, 1]); else limitNotice(id); }

  // HI_INVENTORY_START: pure stock rules; a Store API limit is not a reservation.
  function assortmentAllowed(p) {
    if (!p) return false;
    var name = String(p.name || '').toLowerCase().replace(/ё/g, 'е');
    if (/(кокос|coconut|cocowater)/.test(name) && /(вод[аыуе]|water)/.test(name)) return false;
    var childCategory = (p.categories || []).some(function (c) { return [248, 256].indexOf(c.id) >= 0; });
    if (/(сок|нектар|сады\s*придонья|фруто.?няня|агуша)/.test(name) && (childCategory || /детск|малыш|baby|kids|фруто.?няня|агуша|сады\s*придонья|(?:0[.,]2\s*л|200\s*мл)/.test(name))) return false;
    var packaging = JSON.stringify(p.attributes || []).toLowerCase();
    if (/лимонад|lemonade|lapochka|лапочка|lemonardo|лемонардо|капли/.test(name)) {
      if (/стекл|glass/.test(name + ' ' + packaging)) return false;
      if (/lapochka|лапочка|lemonardo|лемонардо|капли/.test(name)) return false;
      // Unknown lemonade packaging is withheld rather than guessed to be non-glass.
      return /bombbar|бомббар|пэт|пластик|алюмин|жестян|\bpet\b|\bcan\b/.test(name + ' ' + packaging);
    }
    return true;
  }
  var Inventory = {
    maximum: function (p) {
      if (!assortmentAllowed(p) || !p.is_in_stock || !p.is_purchasable || p.is_on_backorder || p.type !== 'simple') return 0;
      var l = p.add_to_cart || {}, max = Number(l.maximum);
      if (!p.prices || !Number.isFinite(Number(p.prices.price)) || Number(p.prices.price) < 0) return 0;
      if (Number(l.minimum) !== 1 || Number(l.multiple_of) !== 1 || !Number.isFinite(max) || max < 1) return 0;
      if (typeof p.low_stock_remaining === 'number') max = Math.min(max, p.low_stock_remaining);
      return p.sold_individually ? Math.min(1, Math.floor(max)) : Math.floor(max);
    },
    cart: function (cart) {
      if (!cart || !Array.isArray(cart.items) || !Array.isArray(cart.coupons)) throw new Error('invalid cart');
      var quantities = {}, limits = {};
      cart.items.forEach(function (item) {
        if (!Number.isInteger(item.id) || !Number.isInteger(item.quantity) || item.quantity < 0) throw new Error('invalid cart item');
        quantities[item.id] = (quantities[item.id] || 0) + item.quantity;
        var max = item.quantity_limits && Number(item.quantity_limits.maximum);
        if (Number.isFinite(max)) limits[item.id] = limits[item.id] == null ? max : Math.min(limits[item.id], max);
      });
      return { quantities: quantities, limits: limits, coupons: cart.coupons };
    },
    capacity: function (p, cart) {
      var max = Inventory.maximum(p);
      if (!max || !cart) return 0;
      if (cart.limits[p.id] != null) max = Math.min(max, cart.limits[p.id]);
      return Math.max(0, Math.floor(max - (cart.quantities[p.id] || 0)));
    },
    aggregate: function (pairs) {
      var result = {};
      pairs.forEach(function (pair) { result[pair[0]] = (result[pair[0]] || 0) + pair[1]; });
      return result;
    }
  };
  // HI_INVENTORY_END
  // Category IDs read from the public store taxonomy on 2026-10-20.
  // Old BOXES lists are preferences only; they no longer restrict the assortment.
  var GROUP_CATS = { energy: [184, 225, 227], salty: [187, 219], crisp: [175], sweet: [174, 185, 188], water: [231, 226], lunch: [178] };
  var SLOT_GROUPS = { light: ['energy', 'salty', 'crisp', 'sweet', 'water'], full: ['lunch', 'energy', 'crisp', 'sweet', 'salty', 'water'] };
  var preferred = {}, catalogIds = [], catalogPage = 0, catalogHasMore = false;
  var rowLimits = {};
  var cartNonce = '', catalogRevision = 0, catalogRunning = false, catalogPaused = false, pendingDefaults = {};
  var PRODUCT_FIELDS = 'id,name,type,permalink,prices,images,categories,is_in_stock,is_purchasable,is_on_backorder,low_stock_remaining,sold_individually,add_to_cart';
  Object.keys(BOXES).forEach(function (box) { preferred[box] = BOXES[box].slots.map(function (slot) { return slot[2].slice(); }); });
  var cartState = null, inventoryBusy = true, inventoryReady = false, checkoutLocked = false, lastStockCheck = 0, selectionInitialized = false;
  var apiQueue = Promise.resolve(), storeReadFailed = false;
  // One read at a time, no retries and no background polling.
  function readStore(url) {
    var next = apiQueue.then(function () {
      return fetch(url, { credentials: 'include', cache: 'no-store' }).then(function (response) {
        if (!response.ok) { var error = new Error('store read failed'); error.status = response.status; throw error; }
        if (url.split('?')[0] === '/wp-json/wc/store/v1/cart') cartNonce = response.headers.get('Nonce') || '';
        return response.json();
      });
    });
    next = next.catch(function (error) { storeReadFailed = true; throw error; });
    apiQueue = next.catch(function () {});
    return next;
  }
  function stockNotice(text) { $('hi-stock-msg').textContent = text; }
  function syncControls() {
    $('hi-cta').disabled = inventoryBusy || !inventoryReady || checkoutLocked;
    $('hi-catalog-refresh').disabled = inventoryBusy || checkoutLocked;
    // Additional variants load automatically; no extra action is required.
    root.querySelectorAll('[data-q="1"]').forEach(function (button) { button.disabled = !canAdd(+button.dataset.id); button.setAttribute('aria-disabled', String(button.disabled)); if (button.disabled) button.title = 'достигнут доступный остаток'; else button.removeAttribute('title'); });
  }
  function capacity(id) { return Inventory.capacity(P[id], cartState); }
  function wanted(id) {
    var n = 0;
    if (sel[cur]) allSel().forEach(function (x) { if (x[0] === id) n += x[1]; });
    return n + (extra[id] ? 1 : 0);
  }
  function canAdd(id) { return inventoryReady && !inventoryBusy && wanted(id) < capacity(id); }
  function limitNotice(id) {
    var n = capacity(id), inCart = cartState && cartState.quantities[id] || 0;
    stockNotice('«' + short(P[id].name) + '»: можно добавить ' + n + ' шт.' + (inCart ? ' В корзине уже ' + inCart + ' шт.' : '') + ' Больше доступного количества выбрать нельзя.');
  }
  function rebuildCategories() {
    INBOX = {};
    var priority = ['lunch', 'salty', 'crisp', 'sweet', 'water', 'energy'];
    function groupFor(p) { return priority.filter(function (group) { return (p.categories || []).some(function (category) { return GROUP_CATS[group].indexOf(category.id) >= 0; }); })[0]; }
    Object.keys(BOXES).forEach(function (box) {
      BOXES[box].slots.forEach(function (slot, i) {
        var cats = GROUP_CATS[SLOT_GROUPS[box][i]];
        slot[2] = catalogIds.filter(function (id) {
          return groupFor(P[id]) === SLOT_GROUPS[box][i];
        });
        slot[2].forEach(function (id) { INBOX[id] = 1; });
      });
    });
  }
  function catalogUrl(page) {
    var cats = [];
    Object.keys(GROUP_CATS).forEach(function (group) { cats = cats.concat(GROUP_CATS[group]); });
    return '/wp-json/wc/store/v1/products?per_page=100&stock_status=instock&orderby=date&order=desc&category=' + cats.join(',') + '&page=' + page + '&_fields=' + PRODUCT_FIELDS;
  }
  function acceptProducts(list) {
    if (!Array.isArray(list) || list.some(function (p) { return !p || !Number.isInteger(p.id) || !p.prices || !Array.isArray(p.categories); })) throw new Error('invalid catalog');
    list.forEach(function (p) {
      var prior = P[p.id];
      if (prior && prior._hiDetails && p.description === undefined) { p.description = prior.description; p.short_description = prior.short_description; p.attributes = prior.attributes; p._hiDetails = true; }
      P[p.id] = p;
    });
  }
  function loadCatalogPage(revision) {
    return readStore(catalogUrl(catalogPage + 1)).then(function (list) {
      if (revision !== catalogRevision) return;
      // Background assortment must not overwrite the selected product snapshot
      // while a checkout preflight is comparing its price and stock.
      acceptProducts(list.filter(function (p) { return !P[p.id]; }));
      catalogPage++;
      list.forEach(function (p) { if (catalogIds.indexOf(p.id) < 0) catalogIds.push(p.id); });
      catalogHasMore = list.length === 100;
      rebuildCategories();
    });
  }
  function fillPendingDefaults() {
    if (inventoryBusy || !inventoryReady || checkoutLocked) return;
    Object.keys(BOXES).forEach(function (box) {
      var used = {};
      sel[box].forEach(function (list) { list.forEach(function (pair) { used[pair[0]] = (used[pair[0]] || 0) + pair[1]; }); });
      BOXES[box].slots.forEach(function (slot, index) {
        var count = pendingDefaults[box] && pendingDefaults[box][index] || 0;
        avail(slot[2]).some(function (id) {
          if (!count) return true;
          if (!used[id]) { sel[box][index].push([id, 1]); used[id] = 1; count--; }
          return false;
        });
        pendingDefaults[box][index] = count;
      });
    });
  }
  function continueCatalog() {
    if (catalogRunning || catalogPaused || inventoryBusy || !inventoryReady || checkoutLocked || !catalogHasMore) return;
    catalogRunning = true; $('hi-catalog-status').textContent = 'остальные варианты подгружаются автоматически…';
    var revision = catalogRevision;
    loadCatalogPage(revision).then(function () {
      if (revision === catalogRevision && !inventoryBusy && !checkoutLocked) { fillPendingDefaults(); render(); }
    }).catch(function () {
      if (revision !== catalogRevision) return;
      catalogHasMore = false; inventoryReady = false;
      stockNotice('не удалось обновить остальные товары. нажми «обновить наличие» перед заказом');
    }).then(function () { catalogRunning = false; if (!catalogHasMore || !inventoryReady) { $('hi-catalog-status').textContent = ''; hideLoad(); } syncControls(); continueCatalog(); });
  }
  function selectedPairs() {
    return allSel().concat(Object.keys(extra).filter(function (id) { return extra[id]; }).map(function (id) { return [+id, 1]; }));
  }
  // Changes are presented for review. Never write a substituted order in this pass.
  function reconcileSelection(box) {
    var changes = [], used = {}, shortages = [];
    sel[box].forEach(function (list, index) {
      var next = [];
      list.forEach(function (pair) {
        var id = pair[0], count = pair[1], remaining = Math.max(0, capacity(id) - (used[id] || 0));
        var kept = Math.min(count, remaining);
        if (kept) { next.push([id, kept]); used[id] = (used[id] || 0) + kept; }
        if (kept < count) { changes.push('«' + short(P[id] && P[id].name || 'товар') + '»: доступно для добавления ' + capacity(id) + ' шт.'); if (!kept) shortages.push(index); }
      });
      sel[box][index] = next;
    });
    Object.keys(extra).forEach(function (id) {
      if (!extra[id]) return;
      if ((used[id] || 0) >= capacity(+id)) { delete extra[id]; changes.push('дополнительный товар «' + short(P[id] && P[id].name || 'товар') + '» убран из выбора'); }
      else used[id] = (used[id] || 0) + 1;
    });
    shortages.forEach(function (index) {
      var fallback = BOXES[box].slots[index][2].filter(function (id) { return !(used[id] || 0) && capacity(id) > 0; })[0];
      if (fallback) { sel[box][index].push([fallback, 1]); used[fallback] = 1; changes.push('предложена замена: «' + short(P[fallback].name) + '»'); }
      else changes.push('в разделе «' + BOXES[box].slots[index][0] + '» доступной замены нет — выбери другой раздел');
    });
    return changes;
  }
  function freshSelected(cart, quiet) {
    cartState = Inventory.cart(cart);
    var ids = Object.keys(Inventory.aggregate(selectedPairs())).map(Number), oldPrices = {};
    ids.forEach(function (id) { oldPrices[id] = P[id] && P[id].prices.price; });
    var chunks = []; for (var i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
    var sequence = Promise.resolve();
    chunks.forEach(function (chunk) {
      sequence = sequence.then(function () {
        return readStore('/wp-json/wc/store/v1/products?per_page=100&include=' + chunk.join(',') + '&_fields=' + PRODUCT_FIELDS + '&_hi_stock=' + Date.now()).then(function (list) {
          acceptProducts(list);
          chunk.forEach(function (id) { if (!list.some(function (p) { return p.id === id; }) && P[id]) P[id].is_in_stock = false; });
        });
      });
    });
    return sequence.then(function () {
      var changes = reconcileSelection(cur);
      ids.forEach(function (id) { if (P[id] && oldPrices[id] !== P[id].prices.price) changes.push('обновилась цена «' + short(P[id].name) + '»'); });
      lastStockCheck = Date.now(); if (!quiet || changes.length) render();
      return changes;
    });
  }

  var TRASH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
  var price = function (p) { return Number(p.prices.price) / Math.pow(10, p.prices.currency_minor_unit); };
  var rub = function (n) { return Math.round(n).toLocaleString('ru-RU') + ' ₽'; };
  var form = function (n, a, b, c) { var x = n % 10, y = n % 100; return x === 1 && y !== 11 ? a : x >= 2 && x <= 4 && (y < 12 || y > 14) ? b : c; };
  var dec = function (s) { var t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
  // короткое название: без «ИП …», «1шт» и слова «протеиновый» – чтобы был виден вкус
  var short = function (n) { return dec(n).replace(/\s*ИП\s+[А-ЯЁ][а-яё]+,?/g, '').replace(/,?\s*1\s*шт\.?/gi, '').replace(/\s*протеинов\S*/gi, '').replace(/BOMBBAR/g, 'Bombbar').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim(); };
  var img = function (p) { return p.images && p.images[0] ? p.images[0].thumbnail : ''; };
  function escapeHTML(text) { return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function avail(arr) { return arr.filter(function (id) { return capacity(id) > 0; }); }

  // коллаж рисуем сразу, не дожидаясь каталога
  // Hidden decorative collage deliberately has no image requests.
  function hideLoad() {
    var loader = $('hi-load'); if (!loader || loader.classList.contains('is-out')) return;
    loader.classList.add('is-out'); document.documentElement.style.overflow = '';
    setTimeout(function () { loader.remove(); }, 450);
  }
  document.documentElement.style.overflow = 'hidden';
  setTimeout(hideLoad, 30000); // Escape hatch; failed reads still block ordering.
  // нижняя панель «заказать»: встаёт над закреплённым меню магазина и прячется, когда виден футер
  function placeSticky() {
    var st = root.querySelector('.hi-sticky'); if (!st) return;
    var tb = document.querySelector('.wd-toolbar, .woodmart-toolbar, .wd-sticky-nav, .mobile-nav-bar');
    var h = tb && getComputedStyle(tb).display !== 'none' ? tb.getBoundingClientRect().height : 0;
    st.style.bottom = (h ? h + 8 : 12) + 'px';
    var ft = document.querySelector('footer, .footer-container, .wd-footer');
    var hide = ft && ft.getBoundingClientRect().top < window.innerHeight - 40;
    st.classList.toggle('is-away', !!hide);
  }
  window.addEventListener('scroll', placeSticky, { passive: true });
  window.addEventListener('resize', placeSticky);
  setTimeout(placeSticky, 300); setTimeout(placeSticky, 1500);

  $('hi-slots').insertAdjacentHTML('beforebegin', '<style>.hi [data-q]:disabled{opacity:.3;cursor:not-allowed}</style><p class="hi-sub" id="hi-stock-msg" role="status" aria-live="polite"></p><div style="display:flex;gap:12px;margin:12px 0"><button type="button" class="hi-m-add" id="hi-catalog-refresh">обновить наличие</button></div><p class="hi-sub" id="hi-catalog-status" role="status"></p>');
  Object.keys(BOXES).forEach(function (box) { rowLimits[box] = []; sel[box] = BOXES[box].slots.map(function () { return []; }); });
  syncControls();
  function reloadCatalog() {
    storeReadFailed = false; catalogPaused = true; catalogRevision++;
    inventoryBusy = true; syncControls(); stockNotice('проверяем состав бокса и наличие в магазине…');
    var initial = !selectionInitialized;
    return readStore('/wp-json/wc/store/v1/cart').then(function (cart) {
      cartState = Inventory.cart(cart); catalogIds = []; catalogPage = 0; catalogHasMore = true;
      var seed = [14965, 1868, 2932, 2862, 15026];
      Object.keys(preferred).forEach(function (box) { preferred[box].forEach(function (ids) { seed = seed.concat(ids.slice(0, 2)); }); });
      if (selectionInitialized) Object.keys(sel).forEach(function (box) { sel[box].forEach(function (list) { list.forEach(function (pair) { seed.push(pair[0]); }); }); });
      Object.keys(extra).forEach(function (id) { if (extra[id]) seed.push(+id); });
      seed = seed.filter(function (id, index) { return seed.indexOf(id) === index; });
      var initialIds = seed.slice();
      return readStore('/wp-json/wc/store/v1/products?per_page=100&include=' + initialIds.join(',') + '&_fields=' + PRODUCT_FIELDS).then(function (list) {
        acceptProducts(list);
        initialIds.forEach(function (id) { if (!list.some(function (p) { return p.id === id; }) && P[id]) P[id].is_in_stock = false; });
        catalogIds = list.map(function (p) { return p.id; }); rebuildCategories();
      });
    }).then(function () {
      // Explicit current selection may include products no longer returned by the category query.
      if (!initial) return freshSelected({ items: Object.keys(cartState.quantities).map(function (id) { return { id: +id, quantity: cartState.quantities[id], quantity_limits: { maximum: cartState.limits[id] } }; }), coupons: cartState.coupons });
      var preset = { light: [14965, 1868, 2932, 2862, 15026] };
      Object.keys(BOXES).forEach(function (box) {
        pendingDefaults[box] = [];
        var used = {};
        sel[box] = BOXES[box].slots.map(function (slot, index) {
          var available = avail(slot[2]).filter(function (id) { return !used[id]; });
          var want = preset[box] ? preferred[box][index].filter(function (id) { return preset[box].indexOf(id) >= 0; }) : preferred[box][index].slice(0, 1);
          var chosen = [];
          want.forEach(function (id) {
            var pick = available.indexOf(id) >= 0 && !used[id] ? id : available.filter(function (candidate) { return !used[candidate]; })[0];
            if (pick) { used[pick] = 1; chosen.push([pick, 1]); }
          });
          pendingDefaults[box][index] = Math.max(0, want.length - chosen.length);
          return chosen;
        });
      });
      return [];
    }).then(function (changes) {
      inventoryReady = true; selectionInitialized = true; lastStockCheck = Date.now(); render();
      stockNotice(changes.length ? changes.join('. ') + '. Проверь состав и сумму перед заказом.' : 'состав бокса и наличие проверены. количество учитывает товары в твоей корзине');
    }).catch(function () {
      inventoryReady = false;
      stockNotice('не удалось проверить ассортимент и наличие. заказ недоступен до успешного обновления; товары в корзине не изменены');
    }).then(function () { inventoryBusy = false; catalogPaused = false; syncControls(); if (!inventoryReady) hideLoad(); continueCatalog(); });
  }
  reloadCatalog();
  $('hi-catalog-refresh').addEventListener('click', function () { if (!inventoryBusy && !checkoutLocked) reloadCatalog(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !inventoryReady || inventoryBusy || checkoutLocked || Date.now() - lastStockCheck < 120000) return;
    inventoryBusy = true; syncControls();
    readStore('/wp-json/wc/store/v1/cart').then(freshSelected).then(function (changes) {
      stockNotice(changes.length ? changes.join('. ') + '. Проверь обновлённый состав перед заказом.' : 'наличие выбранных товаров обновлено');
    }).catch(function () { inventoryReady = false; stockNotice('не удалось обновить наличие. нажми «обновить наличие» перед заказом'); })
      .then(function () { inventoryBusy = false; syncControls(); continueCatalog(); });
  });

  // стрелки ряда (на компьютере): левая появляется, когда пролистали вправо; правая прячется в конце
  var SHORT = /(^|[\s(«„"–—-])([а-яёА-ЯЁ]{1,2}|[0-9]+)\s+(?=\S)/g;
  function nb(node) {
    if (node.nodeType === 3) { var t = node.nodeValue, n = t.replace(SHORT, '$1$2\u00a0').replace(SHORT, '$1$2\u00a0'); if (n !== t) node.nodeValue = n; return; }
    if (node.nodeType !== 1 || /^(STYLE|SCRIPT|INPUT|TEXTAREA)$/.test(node.nodeName)) return;
    for (var c = node.firstChild; c; c = c.nextSibling) nb(c);
  }
  nb(root);
  new MutationObserver(function (ms) { ms.forEach(function (m) { [].forEach.call(m.addedNodes, nb); }); }).observe(root, { childList: true, subtree: true });
  function arrows(rw) {
    var w = rw.parentNode, max = rw.scrollWidth - rw.clientWidth;
    w.classList.toggle('has-l', rw.scrollLeft > 8);
    w.classList.toggle('has-r', rw.scrollLeft < max - 8);
  }
  function render(pop, scrollTo) {
    root.querySelectorAll('.hi-tab').forEach(function (t) { t.classList.toggle('is-on', t.dataset.box === cur); });
    var b = BOXES[cur];
    $('hi-warn').hidden = !b.warn;
    // Hidden decorative collage deliberately has no image requests.
    var html = '';
    b.slots.forEach(function (s, i) {
      var list = avail(s[2]); if (!list.length) { html += '<div class="hi-slot"><div><b>' + s[0] + '</b><p>сейчас нет доступных товаров</p></div></div>'; return; }
      var chosen = sel[cur][i], selectedIds = chosen.map(function (pair) { return pair[0]; });
      list = selectedIds.filter(function (id) { return list.indexOf(id) >= 0; }).concat(list.filter(function (id) { return selectedIds.indexOf(id) < 0; }));
      var visibleLimit = Math.max(rowLimits[cur][i] || 12, chosen.length + 8);
      html += '<div class="hi-slot"><div class="hi-slot-k"><b>' + s[0] + '</b><div class="hi-picked">'
        + (chosen.length ? chosen.slice(0, 4).map(function (x) { return '<button type="button" class="hi-pk" data-go="' + x[0] + '" data-slot="' + i + '"><img src="' + img(P[x[0]]) + '" alt="">' + (x[1] > 1 ? '<i>' + x[1] + '</i>' : '') + '</button>'; }).join('') + (chosen.length > 4 ? '<span class="hi-pk-n">+' + (chosen.length - 4) + '</span>' : '') : '<span class="hi-pk-0">не выбрано</span>')
        + '</div><small>' + s[1] + ' · ' + (catalogHasMore ? 'уточняем количество…' : list.length + ' ' + form(list.length, 'доступный вариант', 'доступных варианта', 'доступных вариантов')) + (list.length > 1 ? ' →' : '') + '</small></div><div class="hi-rw"><button type="button" class="hi-arr is-l" data-arr="-1" aria-label="назад"></button><div class="hi-row">'
        + list.slice(0, visibleLimit).map(function (id) {
            var g = got(i, id);
            return '<div class="hi-opt' + (g ? ' is-on' : '') + '" role="button" tabindex="0" data-i="' + i + '" data-id="' + id + '"><button type="button" class="hi-i" data-info="' + id + '" data-slot="' + i + '" aria-label="подробнее">i</button><div class="hi-ph"><img src="' + img(P[id]) + '" alt="" loading="lazy" decoding="async">'
              + (g ? '<div class="hi-qty"><button type="button" data-q="-1" data-id="' + id + '" data-slot="' + i + '" aria-label="' + (g[1] > 1 ? 'меньше' : 'убрать') + '">' + (g[1] > 1 ? '−' : TRASH) + '</button><span>' + g[1] + '</span><button type="button" data-q="1" data-id="' + id + '" data-slot="' + i + '" aria-label="больше"' + (canAdd(id) ? '' : ' disabled aria-disabled="true" title="достигнут доступный остаток"') + '>+</button></div>' : '')
              + '</div><span>' + escapeHTML(short(P[id].name)) + '</span><b>' + rub(price(P[id])) + '</b>' + (capacity(id) <= 5 ? '<small style="display:block;margin:4px;font-size:11px;color:var(--mut)">доступно ' + capacity(id) + ' шт.</small>' : '') + '</div>';
          }).join('') + '</div><button type="button" class="hi-arr is-r" data-arr="1" aria-label="дальше"></button></div></div>';
    });
    if (html) html = '<p class="hi-multi">в каждой категории можно выбрать несколько товаров – нажми, чтобы добавить или убрать</p>' + html;
    var keep = {};
    [].forEach.call(root.querySelectorAll('.hi-row'), function (rw) { var o = rw.querySelector('.hi-opt'); if (o) keep[o.dataset.i] = rw.scrollLeft; });
    $('hi-slots').innerHTML = html;
    [].forEach.call(root.querySelectorAll('.hi-row'), function (rw) {
      var o = rw.querySelector('.hi-opt'); if (!o) return;
      var changed = pop != null && rw.querySelector('.hi-opt[data-id="' + pop + '"]') || scrollTo != null && rw.querySelector('.hi-opt[data-id="' + scrollTo + '"]');
      rw.scrollLeft = changed ? 0 : (keep[o.dataset.i] || 0);
    });
    [].forEach.call(root.querySelectorAll('.hi-row'), function (rw) { arrows(rw); rw.addEventListener('scroll', function () { arrows(rw); var option = rw.querySelector('.hi-opt'); if (!option || inventoryBusy || checkoutLocked) return; var slot = +option.dataset.i, limit = Math.max(rowLimits[cur][slot] || 12, sel[cur][slot].length + 8); if (rw.scrollLeft + rw.clientWidth >= rw.scrollWidth - 180 && limit < avail(BOXES[cur].slots[slot][2]).length) { rowLimits[cur][slot] = limit + 12; render(); } }, { passive: true }); });
    var items = allSel();
    boxSum = items.reduce(function (a, x) { return a + price(P[x[0]]) * x[1]; }, 0);
    $('hi-thumbs').innerHTML = items.map(function (x) { return '<img src="' + img(P[x[0]]) + '" alt=""' + (pop === x[0] ? ' class="is-pop"' : '') + '>'; }).join('') + (items.length > 3 ? '<span class="hi-thumbs-n">+' + (items.length - 3) + '</span>' : '');
    if (pop != null) setTimeout(function () { var t = $('hi-thumbs').querySelector('.is-pop'); if (t) t.classList.remove('is-pop'); }, 300);
    var pk = pop != null && root.querySelector('.hi-pk[data-go="' + pop + '"]'); if (pk) { pk.classList.add('is-pop'); setTimeout(function () { pk.classList.remove('is-pop'); }, 300); }
    renderMore();
  }

  function renderMore() {
    var add = 0, extraIds = Object.keys(extra).filter(function (id) { return extra[id] && P[id]; });
    extraIds.forEach(function (id) { add += price(P[id]); });
    var total = boxSum + add, left = Math.max(0, FREE - total);
    // у владельца карты крупно – сумма со скидкой (её он и заплатит), полная – мелко и зачёркнута
    $('hi-sum').innerHTML = hasCard
      ? rub(total * 0.9) + '<em><s>' + rub(total) + '</s> <span class="hi-sp-x">по твоей карте </span>−10%</em>'
      : rub(total) + '<em>' + rub(total * 0.9) + ' с картой<span class="hi-sp-x"> интеллигента</span></em>';
    var n = allSel().reduce(function (a, x) { return a + x[1]; }, 0) + extraIds.length;
    $('hi-sumk').textContent = BOXES[cur].name + ' · ' + n + ' ' + form(n, 'продукт', 'продукта', 'продуктов');
    $('hi-left').innerHTML = left ? 'бокс и добавленное – ' + rub(total) + '. до бесплатной доставки осталось <b>' + rub(left) + '</b>' : '🎉 доставка по Ялте – бесплатно';
    $('hi-bar').style.width = Math.min(100, total / FREE * 100) + '%';
    root.querySelectorAll('.hi-mtab').forEach(function (t) { t.classList.toggle('is-on', t.dataset.m === moreTab); });
    var all = avail(MORE_SETS[moreTab]).concat(avail(moreLoaded[moreTab])).filter(function (id) { return !INBOX[id]; });
    var canMore = all.length > moreVis[moreTab] || !moreDone[moreTab];
    $('hi-more').innerHTML = all.slice(0, moreVis[moreTab]).map(function (id) {
      var p = P[id];
      return '<div class="hi-m"><div class="hi-ph"><img src="' + img(p) + '" alt=""></div><div class="hi-m-n">' + escapeHTML(short(p.name)) + '</div><div class="hi-m-p">' + rub(price(p)) + '</div>'
        + '<button type="button" class="hi-m-add' + (extra[id] ? ' is-in' : '') + '" data-add="' + id + '">' + (extra[id] ? '✓ добавлено' : '+ к заказу') + '</button></div>';
    }).join('') + (canMore ? '<button type="button" class="hi-more-btn" id="hi-more-btn">ещё товары</button>' : '');
  }

  // способ получения: «в день хайка» и «самовывоз» – в корзине сразу выбираем самовывоз магазина;
  // для хайка добавляем строку с датой и маршрутом (копируем – пока на сайте нет кода, который вставит её сам)
  var wayNow = 'hike';
  var WAY_MSG = {
    hike: 'при оформлении уже будет выбран самовывоз – бокс заберёт организатор и отдаст тебе на старте маршрута. строку с датой хайка мы скопируем – вставь её в комментарий к заказу',
    pickup: 'при оформлении уже будет выбран самовывоз – заберёшь бокс в магазине',
    home: 'товары добавятся в корзину – доставку выберешь при оформлении заказа'
  };
  function setWayMsg() { if (wayNow === 'hike' && !hikeOpen()) { $('hi-msg').textContent = hikeClosedText(); return; } $('hi-msg').textContent = fromClubApp && wayNow === 'hike' ? 'выберем «Получить на хайке», передадим дату и маршрут автоматически. оплата — через СБП' : WAY_MSG[wayNow]; }
  setWayMsg();
  // сроки заказа «на хайк» – как в плагине магазина: без готовой еды до 17:00 накануне, с готовой едой до 20:00 за два дня
  function hasReadyFood() {
    return allSel().concat(Object.keys(extra).filter(function (id) { return extra[id]; }).map(function (id) { return [+id, 1]; })).some(function (x) {
      return ((P[x[0]] && P[x[0]].categories) || []).some(function (c) { return /готов|сэндвич|сендвич|ролл|завтрак|салат|суп/i.test(c.name || ''); });
    });
  }
  function hikeOpen() {
    var d = $('hi-date').value; if (!d) return true;
    var ready = hasReadyFood(), p = d.split('-').map(Number);
    // дедлайн по Москве (UTC+3)
    var deadline = Date.UTC(p[0], p[1] - 1, p[2] - (ready ? 2 : 1), ready ? 17 : 14, 0);
    return Date.now() < deadline;
  }
  function hikeClosedText() {
    return hasReadyFood()
      ? 'готовую еду на этот хайк уже не успеют приготовить – её заказывают за 2 дня (до 20:00). убери сэндвич или ролл из бокса, либо выбери самовывоз или доставку домой'
      : 'заказ на этот хайк закрыт – боксы принимаем до 17:00 накануне. выбери самовывоз или доставку домой';
  }
  function hikeNote() {
    var d = $('hi-date').value, p = d ? d.split('-') : null;
    return 'Хайкинг бокс · заберу на старте хайка' + (p ? ' ' + p[2] + '.' + p[1] : '') + (route ? ' · ' + route : '');
  }
  function pickPickup(n, known) {
    // находим в корзине способ «самовывоз» и выбираем его; если не нашли – оставляем выбор человеку
    return (known ? Promise.resolve(known) : fetch('/wp-json/wc/store/v1/cart', { credentials: 'include' }).then(function (res) { return res.json(); })).then(function (cart) {
      var pk = (cart.shipping_rates || [])[0]; if (!pk) return;
      var rate = (pk.shipping_rates || []).filter(function (x) { return /pickup/i.test(x.method_id) || /самовывоз/i.test(x.name); })[0];
      if (!rate || rate.selected) return;
      return fetch('/wp-json/wc/store/v1/cart/select-shipping-rate', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Nonce': n }, body: JSON.stringify({ package_id: pk.package_id, rate_id: rate.rate_id }) });
    }).catch(function () {});
  }

  // карточка товара по «i»: крупное фото, цена, описание из магазина, ссылка на товар
  // состав: ищем в описании из каталога, в характеристиках, а если нет – на странице товара (один запрос по нажатию «i», запоминаем)
  var COMP = {};
  function clean(x) { return (x || '').replace(/\s+/g, ' ').replace(/^[\s:–—-]+/, '').trim(); }
  function findComp(doc) {
    var k, el, all, tx, m;
    // таблица характеристик: строка «Состав»
    all = doc.querySelectorAll('tr, .wd-attr, .woocommerce-product-attributes-item, dl');
    for (k = 0; k < all.length; k++) {
      var th = all[k].querySelector('th, .wd-attr-name, dt, .woocommerce-product-attributes-item__label');
      var td = all[k].querySelector('td, .wd-attr-term, dd, .woocommerce-product-attributes-item__value');
      if (th && td && /^\s*состав/i.test(th.textContent)) return clean(td.textContent);
    }
    // вкладка «Состав»: заголовок-ссылка ведёт на панель
    all = doc.querySelectorAll('a[href^="#"]');
    for (k = 0; k < all.length; k++) {
      if (!/^\s*состав\s*$/i.test(all[k].textContent)) continue;
      el = doc.getElementById(all[k].getAttribute('href').slice(1));
      if (el && clean(el.textContent).length > 5) return clean(el.textContent).replace(/^состав\s*/i, '');
    }
    // абзац «Состав: …» или заголовок «Состав» и текст после него
    all = doc.querySelectorAll('p, li, div, span, strong, b, h2, h3, h4, h5, h6');
    for (k = 0; k < all.length; k++) {
      el = all[k]; if (el.children.length > 3) continue;
      tx = el.textContent || '';
      m = tx.match(/^\s*состав(?:\s+продукта)?\s*[:–—-]\s*([\s\S]{5,})/i);
      if (m) return clean(m[1].split(/\n\s*\n|пищевая ценность|энергетическая ценность|кбжу|срок хранения|условия хранения/i)[0]);
      if (/^\s*состав\s*:?\s*$/i.test(tx)) {
        var nx = el.nextElementSibling || (el.parentNode && el.parentNode.nextElementSibling);
        if (nx && clean(nx.textContent).length > 5) return clean(nx.textContent);
        tx = clean(el.parentNode && el.parentNode.textContent).replace(/^состав\s*:?\s*/i, '');
        if (tx.length > 5) return tx;
      }
    }
    // «… Состав: …» посреди абзаца
    all = doc.querySelectorAll('p, li');
    for (k = 0; k < all.length; k++) {
      m = (all[k].textContent || '').match(/состав\s*[:–—-]\s*([\s\S]{5,})/i);
      if (m) return clean(m[1].split(/пищевая ценность|энергетическая ценность|кбжу|срок хранения|условия хранения|производитель/i)[0]);
    }
    return '';
  }
  function compFor(p) {
    if (COMP[p.id] != null) return Promise.resolve(COMP[p.id]);
    var dp = new DOMParser(), c = '';
    (p.attributes || []).forEach(function (a) { if (!c && /состав/i.test(a.name)) c = (a.terms || []).map(function (t) { return t.name; }).join(', '); });
    if (!c) c = findComp(dp.parseFromString('<div>' + (p.description || '') + (p.short_description || '') + '</div>', 'text/html'));
    if (c || !p.permalink) { COMP[p.id] = c; return Promise.resolve(c); }
    return fetch(p.permalink, { credentials: 'include' }).then(function (r) { return r.text(); }).then(function (h) {
      var doc = dp.parseFromString(h, 'text/html');
      var main = doc.querySelector('.single-product-page, .product.type-product, .wd-single-tabs, .woocommerce-tabs, main') || doc;
      return (COMP[p.id] = findComp(main).slice(0, 1500));
    }).catch(function () { return ''; });
  }
  function openInfo(id, slot) {
    var p = P[id]; if (!p) return;
    var infoModal = $('hi-modal');
    if (!p._hiDetails && p.description === undefined) {
      infoModal.dataset.product = String(id);
      infoModal.innerHTML = '<div class="hi-modal-c"><button type="button" class="hi-modal-x" aria-label="закрыть">✕</button><p>загружаем описание и состав…</p></div>';
      infoModal.hidden = false; document.documentElement.style.overflow = 'hidden';
      readStore('/wp-json/wc/store/v1/products/' + id).then(function (full) {
        if (!full || full.id !== id) throw new Error('invalid product');
        full._hiDetails = true; acceptProducts([full]);
        if (!infoModal.hidden && infoModal.dataset.product === String(id)) openInfo(id, slot);
      }).catch(function () { if (!infoModal.hidden && infoModal.dataset.product === String(id)) infoModal.querySelector('p').textContent = 'не удалось загрузить описание. попробуй позже'; });
      return;
    }
    infoModal.dataset.product = String(id);
    var t = document.createElement('div'); t.innerHTML = p.short_description || p.description || '';
    var d = (t.textContent || '').replace(/\s+/g, ' ').trim();
    if (d.length > 700) d = d.slice(0, 700).replace(/\s\S*$/, '') + '…';
    var big = p.images && p.images[0] ? (p.images[0].src || p.images[0].thumbnail) : '';
    var m = $('hi-modal');
    m.innerHTML = '<div class="hi-modal-c"><button type="button" class="hi-modal-x" aria-label="закрыть">✕</button>'
      + (big ? '<img src="' + big + '" alt="">' : '') + '<b>' + escapeHTML(dec(p.name)) + '</b><div class="hi-modal-p">' + rub(price(p)) + '</div>'
      + (d ? '<p class="hi-modal-d"></p>' : '') + '<div class="hi-comp"><h4>состав</h4><p>загружаем…</p></div>' + (got(slot, id) ? '<button type="button" class="hi-btn hi-modal-b is-in" data-pick="' + id + '" data-slot="' + slot + '">✓ в боксе – убрать</button>'
         : '<button type="button" class="hi-btn hi-modal-b" data-pick="' + id + '" data-slot="' + slot + '">добавить в бокс</button>') + '</div>';
    if (d) m.querySelector('.hi-modal-d').textContent = d;
    m.hidden = false; document.documentElement.style.overflow = 'hidden';
    compFor(p).then(function (c) {
      var box = m.querySelector('.hi-comp'); if (!box || m.hidden) return;
      if (!c) { box.remove(); return; }
      box.querySelector('p').textContent = c;
      // если состав был внутри описания – не повторяем его дважды
      var dd = m.querySelector('.hi-modal-d'); if (dd) { var cut = dd.textContent.search(/состав\s*[:–—-]/i); if (cut === 0) dd.remove(); else if (cut > 0) dd.textContent = dd.textContent.slice(0, cut).trim(); }
    });
  }
  function closeInfo() { $('hi-modal').hidden = true; document.documentElement.style.overflow = ''; }

  root.addEventListener('click', function (e) {
    if ((inventoryBusy || !inventoryReady || checkoutLocked) && e.target.closest('[data-q], [data-pick], [data-add], .hi-opt, .hi-tab, #hi-more-btn, .hi-mtab')) return;
    var way = e.target.closest('.hi-way');
    if (way) {
      root.querySelectorAll('.hi-way').forEach(function (w) { w.classList.toggle('is-on', w === way); });
      wayNow = way.dataset.way; setWayMsg();
      $('hi-date-row').hidden = way.dataset.way !== 'hike';
      $('hi-more-card').hidden = way.dataset.way !== 'home';
      if (way.dataset.way !== 'home') extra = {}; else if (!morePage[moreTab]) loadMore();
      renderMore();
      return;
    }
    var qb = e.target.closest('[data-q]');
    if (qb) { e.stopPropagation(); if (pendingDefaults[cur]) pendingDefaults[cur][+qb.dataset.slot] = 0; var qi = +qb.dataset.slot, qid = +qb.dataset.id, g = got(qi, qid); if (!g) return; if (+qb.dataset.q > 0 && !canAdd(qid)) { limitNotice(qid); return; } g[1] += +qb.dataset.q; if (g[1] < 1) toggle(qi, qid); render(); if (wanted(qid) >= capacity(qid)) limitNotice(qid); return; }
    var ar = e.target.closest('[data-arr]');
    if (ar) { var rr = ar.parentNode.querySelector('.hi-row'); rr.scrollBy({ left: +ar.dataset.arr * rr.clientWidth * 0.8, behavior: 'smooth' }); return; }
    var go = e.target.closest('[data-go]');
    if (go) { var gr = root.querySelectorAll('.hi-slot')[0] && root.querySelector('.hi-opt[data-id="' + go.dataset.go + '"][data-i="' + go.dataset.slot + '"]'); if (gr) { var rw = gr.parentNode; rw.scrollTo({ left: Math.max(0, gr.offsetLeft - 8), behavior: 'smooth' }); gr.classList.add('is-pop'); setTimeout(function () { gr.classList.remove('is-pop'); }, 500); } return; }
    var info = e.target.closest('[data-info]');
    if (info) { e.stopPropagation(); openInfo(+info.dataset.info, +info.dataset.slot); return; }
    var addb = e.target.closest('[data-pick]');
    if (addb) { var si = +addb.dataset.slot, pid = +addb.dataset.pick, was = !!got(si, pid); toggle(si, pid); closeInfo(); render(was ? null : pid, pid); return; }
    if (e.target.closest('.hi-modal-x') || e.target.classList.contains('hi-modal')) { closeInfo(); return; }
    if (e.target.closest('#hi-card-btn')) {
      e.preventDefault();
      var cm = $('hi-modal');
      cm.innerHTML = '<div class="hi-modal-c"><button type="button" class="hi-modal-x" aria-label="закрыть">✕</button><img class="hi-mcard" src="https://app-test-3-delta.vercel.app/assets/card-front.jpg" alt=""><b>карта интеллигента</b><p class="hi-modal-d" style="margin-top:10px!important">клубная карта, с которой хайкинги и все события клуба становятся бесплатными, а в городе и онлайне появляются скидки и привилегии. например, в «Жить здорово» по карте любой заказ – со скидкой 10% на продукты и на хайкинг бокс тоже.</p><a class="hi-btn hi-modal-b" href="https://t.me/yaltahiking_bot?startapp=buy_card" target="_blank" rel="noopener">узнать о карте больше</a></div>';
      cm.hidden = false; document.documentElement.style.overflow = 'hidden'; return;
    }
    if (e.target.closest('.hi-club-btn')) {
      var m = $('hi-modal');
      m.innerHTML = '<div class="hi-modal-c"><button type="button" class="hi-modal-x" aria-label="закрыть">✕</button><b>хайкинг интеллигенция</b><p class="hi-modal-d" style="margin-top:10px!important">хайкинг интеллигенция – клуб молодых деятельных личностей, которые проводят свободное время стильно, отдыхают продуктивно, знакомятся лично и живут свою лучшую жизнь сегодня, не откладывая на вечное завтра</p><p class="hi-modal-d" style="margin-top:10px!important">каждые выходные мы собираем хайкинг-группы в Ялте и вдоль всего южного берега на новый маршрут длительностью 3–5 часов; знакомимся в реальной жизни, а не в интернете, делаем полезные штуки для тела и разума на свежем воздухе, фотографируем всё до потери телефоном памяти, наполняемся глубоким общением, красотой озвученных смыслов и окружающих на 360° видов</p><a class="hi-btn hi-modal-b" href="https://t.me/yaltahiking_bot" target="_blank" rel="noopener">открыть приложение клуба</a></div>';
      m.hidden = false; document.documentElement.style.overflow = 'hidden'; return;
    }
    if (e.target.closest('#hi-more-btn')) {
      moreVis[moreTab] += 6;
      var have = avail(MORE_SETS[moreTab]).length + avail(moreLoaded[moreTab]).length;
      if (have < moreVis[moreTab] && !moreDone[moreTab]) loadMore(); else renderMore();
      return;
    }
    var mt = e.target.closest('.hi-mtab');
    if (mt) { moreTab = mt.dataset.m; if (!morePage[moreTab]) loadMore(); renderMore(); return; }
    var add = e.target.closest('[data-add]');
    if (add) { var aid = +add.dataset.add; if (!extra[aid] && !canAdd(aid)) { limitNotice(aid); return; } extra[aid] = !extra[aid]; renderMore(); return; }
    var tab = e.target.closest('.hi-tab');
    if (tab) { cur = tab.dataset.box; var changes = reconcileSelection(cur); render(); if (changes.length) stockNotice(changes.join('. ') + '. Проверь состав.'); return; }
    var opt = e.target.closest('.hi-opt');
    if (opt) {
      var i = +opt.dataset.i, oid = +opt.dataset.id, had = !!got(i, oid);
      toggle(i, oid);
      render(had ? null : oid);
    }
  });

  // оформить: кладём товары бокса (и добавленное) в обычную корзину магазина; владельцу карты – сразу скидка клуба
  $('hi-cta').addEventListener('click', function () {
    var btn = this, msg = $('hi-msg');
    if (inventoryBusy || !inventoryReady || checkoutLocked || moreBusy) return;
    catalogPaused = true; inventoryBusy = true; syncControls();
    var items = [];
    allSel().forEach(function (x) { items.push([x[0], x[1]]); });
    Object.keys(extra).forEach(function (id) { if (extra[id]) items.push([+id, 1]); });
    if (!items.length) { inventoryBusy = false; catalogPaused = false; syncControls(); continueCatalog(); return; }
    if (wayNow === 'hike' && $('hi-date').value && !hikeOpen()) { inventoryBusy = false; catalogPaused = false; syncControls(); continueCatalog(); msg.textContent = hikeClosedText(); $('hi-date-row').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (wayNow === 'hike' && !$('hi-date').value) { inventoryBusy = false; catalogPaused = false; syncControls(); continueCatalog(); msg.textContent = 'укажи дату хайка – соберём бокс к этому дню'; $('hi-date').focus(); $('hi-date-row').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    var note = wayNow === 'hike' ? hikeNote() : '';
    // строка для комментария: в буфер обмена (сразу, пока действует нажатие) и в cookie – для будущей вставки кодом на сайте
    document.cookie = 'hi_note=' + encodeURIComponent(note) + ';path=/;max-age=' + (note ? 7200 : 0);
    var clubPilot = fromClubApp; // Live club handoff; legacy pilot field remains internal API compatibility.
    if (note && !clubPilot && navigator.clipboard) navigator.clipboard.writeText(note).catch(function () {});
    btn.disabled = true; btn.textContent = 'собираем...';
    // D1: technical stage/status only; never display server messages, cart data or credentials.
    var diagnosticStage = 'S1';
    function diagnosticError(stage, status, apiCode) {
      var error = new Error('checkout preparation failed');
      error.hiStage = stage;
      error.hiStatus = typeof status === 'number' && status >= 100 && status <= 599 ? status : 0;
      error.hiCode = typeof apiCode === 'string' && /^(?:(?:woocommerce_rest_|rest_|wc_store_api_)[a-z0-9_]{1,65}|NO_NONCE|INVALID_JSON|EMPTY_BATCH|API_ERROR)$/.test(apiCode) ? apiCode : '';
      return error;
    }
    function rejectedResponse(response, stage) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        throw diagnosticError(stage, response.status, body && body.code);
      });
    }
    var writesStarted = false, cartCoupons = [];
    var nonce = function () {
      return (clubPilot ? pilotCart() : readStoreCart()).then(function (result) {
        cartCoupons = result.cart.coupons;
        return freshSelected(result.cart, true).then(function (changes) {
          if (changes.length) {
            var changed = new Error('review required'); changed.hiReview = true;
            stockNotice(changes.join('. ') + '. Проверь состав и сумму, затем нажми «заказать» ещё раз.');
            throw changed;
          }
          var grouped = Inventory.aggregate(selectedPairs());
          items = Object.keys(grouped).map(function (id) { return [+id, grouped[id]]; });
          if (!items.length) { var empty = new Error('empty selection'); empty.hiReview = true; throw empty; }
          if (items.length > 24) { var tooMany = new Error('review required'); tooMany.hiReview = true; stockNotice('для одного перехода выбери не больше 24 разных товаров'); throw tooMany; }
          return result.nonce;
        });
      });
    };
    function readStoreCart() {
      return fetch('/wp-json/wc/store/v1/cart', { credentials: 'include', cache: 'no-store' }).then(function (r) {
        if (!r.ok) return rejectedResponse(r, 'S1');
        var n = r.headers.get('Nonce');
        if (!n) throw diagnosticError('S1', r.status, 'NO_NONCE');
        return r.json().then(function (cart) { Inventory.cart(cart); return { nonce: n, cart: cart }; });
      });
    }
    function pilotCart() {
      var prepare = cartNonce ? Promise.resolve(cartNonce) : readStoreCart().then(function (result) { return result.nonce; });
      return prepare.then(function (n) {
        diagnosticStage = 'S2'; // Session context only; no product has been added.
        return fetch('/wp-json/wc/store/v1/cart/extensions?_fields=items,coupons', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Nonce': n },
          body: JSON.stringify({ namespace: 'hiking-club', data: {
            source: 'intelligentsia', pilot: '1', way: wayNow, date: $('hi-date').value || '', route: route, card: cardToken
          } })
        }).then(function (r) {
          if (!r.ok) return rejectedResponse(r, 'S2');
          cartNonce = r.headers.get('Nonce') || n;
          return r.json().then(function (cart) { Inventory.cart(cart); return { nonce: cartNonce, cart: cart }; });
        });
      });
    }
    var n0, reqsCount = 0;
    // Wait for at most the current catalogue page, never the rest of the assortment.
    apiQueue.then(function () { if (storeReadFailed || !inventoryReady) throw diagnosticError('S1', 0, 'API_ERROR'); return nonce(); })
      .then(function (n) {
        n0 = n;
        diagnosticStage = 'S3'; writesStarted = true;
        var reqs = items.map(function (it) {
          return { path: '/wc/store/v1/cart/add-item', method: 'POST', headers: { 'Nonce': n }, body: { id: it[0], quantity: it[1] } };
        });
        if (hasCard && !cardToken && !cartCoupons.some(function (coupon) { return String(coupon.code).toLowerCase() === atob('aW50ZWxsaWdlbnQ='); })) reqs.push({ path: '/wc/store/v1/cart/apply-coupon', method: 'POST', headers: { 'Nonce': n }, body: { code: atob('aW50ZWxsaWdlbnQ=') } });
        reqs.forEach(function (request, index) { request.path += '?_fields=' + (index === reqs.length - 1 ? 'shipping_rates' : 'items_count'); });
        reqsCount = reqs.length;
        return fetch('/wp-json/wc/store/v1/batch', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Nonce': n },
          body: JSON.stringify({ requests: reqs })
        });
      })
      .then(function (r) {
        if (!r.ok) {
          return rejectedResponse(r, 'S3');
        }
        // Always inspect item results, including ordinary store links.
        return r.json().catch(function (error) {
          if (clubPilot) throw diagnosticError('S3', r.status, 'INVALID_JSON');
          throw error;
        }).then(function (d) {
          {
            if (!d || !Array.isArray(d.responses) || d.responses.length !== reqsCount) throw diagnosticError('S3', r.status, 'EMPTY_BATCH');
            for (var index = 0; index < d.responses.length; index++) {
              var itemResponse = d.responses[index];
              if (!itemResponse || !itemResponse.status || itemResponse.status >= 400) {
                var operation = index < items.length ? 'S3-item-' + (index + 1) : 'S3-coupon';
                throw diagnosticError(operation, itemResponse && itemResponse.status, itemResponse && itemResponse.body && itemResponse.body.code);
              }
            }
          }
          if (wayNow === 'home') return;
          // последний ответ batch – свежая корзина со способами доставки, отдельный запрос за ней не нужен
          var rs = (d && d.responses) || [], cart = null;
          for (var k = rs.length - 1; k >= 0 && !cart; k--) if (rs[k].body && rs[k].body.shipping_rates) cart = rs[k].body;
          diagnosticStage = 'S4';
          return pickPickup(n0, cart);
        });
      })
      .then(function () {
        if (clubPilot || !note) { location.href = '/checkout/'; return; }
        msg.innerHTML = '✓ скопировали: <b>' + note.replace(/</g, '') + '</b> – вставь в комментарий к заказу';
        btn.textContent = 'переходим…';
        setTimeout(function () { location.href = '/checkout/'; }, 1500);
      })
      .catch(function (error) {
        inventoryBusy = false;
        if (error.hiReview) { catalogPaused = false; syncControls(); continueCatalog(); btn.textContent = 'заказать'; msg.textContent = 'состав или цена изменились — проверь обновление выше'; return; }
        if (!writesStarted) { inventoryReady = false; syncControls(); btn.textContent = 'заказать'; stockNotice('не удалось проверить наличие. товары в корзине не изменены. обнови наличие перед заказом'); return; }
        checkoutLocked = true; syncControls();
        btn.disabled = true;
        btn.textContent = 'остановлено';
        if (clubPilot) {
          var stage = error && error.hiStage || diagnosticStage;
          var label = stage === 'S1' ? 'подготовка корзины' : stage === 'S2' ? 'клубный переход' : stage === 'S3-coupon' ? 'применение скидки' : stage.indexOf('S3-item-') === 0 ? 'добавление товара' : stage === 'S4' ? 'выбор получения' : 'сборка корзины';
          var status = error && error.hiStatus ? 'HTTP ' + error.hiStatus : 'NETWORK';
          var apiCode = error && error.hiCode ? '; ' + error.hiCode : '';
          msg.textContent = 'не удалось подготовить клубный заказ: ' + label + ' [D1; ' + stage + '; ' + status + apiCode + ']. не нажимай повторно: часть товаров могла добавиться. пришли этот код поддержке';
        } else {
          msg.textContent = 'добавление остановлено. часть товаров могла добавиться — проверь корзину, повторно не нажимай';
        }
        if (error && /out_of_stock|sold_individually|quantity/.test(error.hiCode || '')) {
          msg.textContent = 'пока собирали заказ, доступное количество изменилось. часть товаров могла добавиться. проверь корзину перед следующей попыткой';
        }
        var cartLink = document.createElement('a'); cartLink.href = '/cart/'; cartLink.textContent = ' открыть корзину'; msg.appendChild(cartLink);

      });
  });
})();

})();
