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
