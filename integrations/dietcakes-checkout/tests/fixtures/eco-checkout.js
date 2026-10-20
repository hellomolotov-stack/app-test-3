// assets/checkout.js
jQuery(function ($) {
  if (typeof ECO_DeliveryRules === "undefined") return;

  const rules = ECO_DeliveryRules;
  const dateId = rules.fieldDateId;
  const timeId = rules.fieldTimeId;

  const SELECTOR_DATE = "#" + dateId;
  const SELECTOR_TIME = "#" + timeId;

  boot();
  $(document.body).on("updated_checkout", boot);

  function boot() {
    const $date = $(SELECTOR_DATE);
    const $time = $(SELECTOR_TIME);
    if (!$date.length || !$time.length) return;

    const $host = $("#eco-delivery-ui-mount");

    if ($host.length) {
      if ($host.find(".eco-delivery-ui").length) return;
      init($date, $time, $host);
      return;
    }

    if ($date.data("eco-modern-ui")) return;
    $date.data("eco-modern-ui", true);

    init($date, $time, null);
  }

  function init($date, $time, $host) {
    document.body.classList.add("eco-delivery-mounted");

    const $dateField = $("#" + dateId + "_field");
    const $timeField = $("#" + timeId + "_field");

    $dateField.addClass("eco-hide-native");
    $timeField.addClass("eco-hide-native");

    $date.attr("min", rules.todayYmd);

    const $mount = $('<div class="eco-delivery-ui"></div>');

    if ($host && $host.length) {
      $host.empty().append($mount);
    } else {
      $dateField.before($mount);
    }

    const $modal = $(`
      <div class="eco-delivery-modal" aria-hidden="true">
        <div class="eco-delivery-backdrop"></div>
        <div class="eco-delivery-sheet" role="dialog" aria-modal="true">
          <div class="eco-delivery-sheet__header">
            <div class="eco-delivery-sheet__title">
              Выберите интервал <span class="eco-delivery-sheet__subtitle"></span>
            </div>
            <button type="button" class="eco-delivery-sheet__close" aria-label="Закрыть">×</button>
          </div>
          <div class="eco-delivery-sheet__content">
            <div class="eco-delivery-sheet__slots"></div>
          </div>
        </div>
      </div>
    `);

    const $card = $(`
      <div class="eco-delivery-card">
        <div class="eco-delivery-card__top">
          <div class="eco-delivery-card__label">Доставка на <span class="eco-delivery-card__day">сегодня</span></div>
          <button type="button" class="eco-delivery-card__chev" aria-label="Открыть">▾</button>
        </div>

        <div class="eco-delivery-card__tabs">
          <button type="button" class="eco-delivery-pill" data-day="today">Сегодня</button>
          <button type="button" class="eco-delivery-pill" data-day="tomorrow">Завтра</button>
          <button type="button" class="eco-delivery-pill" data-day="other">Другая дата</button>
        </div>

        <div class="eco-delivery-card__summary">
          <div class="eco-delivery-card__time">Интервал: <strong class="eco-delivery-card__picked">не выбран</strong></div>
          <button type="button" class="eco-delivery-card__choose eco-is-primary">Выбрать интервал</button>
        </div>

        <div class="eco-delivery-card__otherdate" style="display:none;">
          <div class="eco-delivery-card__otherrow">
            <div class="eco-delivery-card__otherlabel">Дата:</div>

            <div class="eco-date-proxy-wrap" aria-label="Выбрать дату">
              <div class="eco-date-proxy-btn">
                <span class="eco-date-proxy-btn__text"></span>
                <span class="eco-date-proxy-btn__icon" aria-hidden="true">📅</span>
              </div>
              <input type="date" class="eco-date-proxy" />
            </div>
          </div>
        </div>
      </div>
    `);

    $mount.append($card);
    $mount.append($modal);

    const $dayLabel = $card.find(".eco-delivery-card__day");
    const $picked = $card.find(".eco-delivery-card__picked");
    const $chooseBtn = $card.find(".eco-delivery-card__choose");
    const $otherWrap = $card.find(".eco-delivery-card__otherdate");
    const $slotsWrap = $modal.find(".eco-delivery-sheet__slots");
    const $modalSubtitle = $modal.find(".eco-delivery-sheet__subtitle");

    const $dateProxyInput = $card.find(".eco-date-proxy");
    const $dateProxyBtnText = $card.find(".eco-date-proxy-btn__text");
    const $dateProxyWrap = $card.find(".eco-date-proxy-wrap");

    function getFulfillmentMode() {
      const input = document.getElementById("eco_fulfillment_type");
      if (input && (input.value === "pickup" || input.value === "delivery")) {
        return input.value;
      }
      return "delivery";
    }

    function getModeText(mode) {
      if (mode === "pickup") {
        return {
          noun: "самовывоз",
          nounCaps: "Самовывоз",
          dateLabel: "Дата самовывоза",
          timeLabel: "Время самовывоза",
          choose: "Выбрать время",
          change: "Изменить время",
          interval: "Время:",
          cardPrefix: "Самовывоз на",
          modalTitle: "Выберите время",
          notChosen: "не выбрано",
        };
      }

      return {
        noun: "доставка",
        nounCaps: "Доставка",
        dateLabel: "Дата доставки",
        timeLabel: "Время доставки",
        choose: "Выбрать интервал",
        change: "Изменить интервал",
        interval: "Интервал:",
        cardPrefix: "Доставка на",
        modalTitle: "Выберите интервал",
        notChosen: "не выбран",
      };
    }

    function applyModeTexts() {
      const mode = getFulfillmentMode();
      const t = getModeText(mode);

      $card.find(".eco-delivery-card__label").html(
        t.cardPrefix + ' <span class="eco-delivery-card__day">' + ($dayLabel.text() || "сегодня") + "</span>"
      );

      $card.find(".eco-delivery-card__time").html(
        t.interval + ' <strong class="eco-delivery-card__picked">' + ($picked.text() || t.notChosen) + "</strong>"
      );

      $modal.find(".eco-delivery-sheet__title").html(
        t.modalTitle + ' <span class="eco-delivery-sheet__subtitle"></span>'
      );

      $("#" + dateId + "_field label").html(
        t.dateLabel + '&nbsp;<span class="required" aria-hidden="true">*</span>'
      );

      $("#" + timeId + "_field label").html(
        t.timeLabel + '&nbsp;<span class="required" aria-hidden="true">*</span>'
      );

      if ($time.val()) {
        $chooseBtn.text(t.change);
      } else {
        $chooseBtn.text(t.choose);
      }
    }

    function pad2(n) { return (n < 10 ? "0" : "") + n; }

    function ymdToDate(ymd) {
      const [Y, M, D] = ymd.split("-").map(Number);
      return new Date(Y, M - 1, D);
    }
    function dateToYmd(d) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
    function addDaysYmd(ymd, days) {
      const d = ymdToDate(ymd);
      d.setDate(d.getDate() + days);
      return dateToYmd(d);
    }
    function formatRuDate(ymd) {
      if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
      const [Y, M, D] = ymd.split("-");
      return `${D}.${M}.${Y}`;
    }

    const todayYmd = rules.todayYmd;
    const tomorrowYmd = addDaysYmd(todayYmd, 1);

    function dayModeFromDate(ymd) {
      if (ymd === todayYmd) return "today";
      if (ymd === tomorrowYmd) return "tomorrow";
      return "other";
    }

    function headerLabelFromDate(ymd) {
      const mode = dayModeFromDate(ymd);
      if (mode === "today") return "сегодня";
      if (mode === "tomorrow") return "завтра";
      return formatRuDate(ymd);
    }

    function toMinutes(hhmm) {
      const [h, m] = hhmm.split(":").map(Number);
      return h * 60 + m;
    }
    function tsToMinutesOfDay(ts) {
      const d = new Date(ts * 1000);
      return d.getHours() * 60 + d.getMinutes();
    }
    function minutesToHHMM(min) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return `${pad2(h)}:${pad2(m)}`;
    }
    function declHour(h) { return h === 1 ? "час" : "часа"; }

    const PICKUP_ASAP_CUTOFF_MIN = toMinutes("18:01");

    function canShowAsapForMode(isToday) {
      if (!isToday) return false;

      const mode = getFulfillmentMode();
      if (mode !== "pickup") return true;

      const nowMin = tsToMinutesOfDay(rules.nowTs);

      // Для самовывоза быстрая сборка доступна только до 18:00 включительно.
      // Начиная с 18:01 — скрываем группу «В ближайшее время».
      return nowMin < PICKUP_ASAP_CUTOFF_MIN;
    }

    function startAllowed(min, isToday, earliestMinToday, workStartMin, workEndMin, lastStartMin) {
      if (min < workStartMin) return false;
      if (min > lastStartMin) return false;
      if (min >= workEndMin) return false;
      if (isToday && min < earliestMinToday) return false;
      return true;
    }

    function buildGroups(selectedYmd) {
      const groups = [];

      const workStartMin = toMinutes(rules.workStart);
      const workEndMin = toMinutes(rules.workEnd);
      const lastStartMin = toMinutes(rules.lastStart);

      const isToday = selectedYmd === rules.todayYmd;
      const nowMin = tsToMinutesOfDay(rules.nowTs);
      const earliestMinToday = nowMin + Number(rules.prepMin);

      if (canShowAsapForMode(isToday)) {
        const asapItems = [];

        (rules.asapHours || []).forEach((h) => {
          const start = nowMin + Number(h) * 60;

          if (startAllowed(start, true, earliestMinToday, workStartMin, workEndMin, lastStartMin)) {
            const s = minutesToHHMM(start);
            const e = minutesToHHMM(start + 60);

            asapItems.push({
              value: `ASAP_${h}H_${s}`,
              label: `Через ${h} ${declHour(Number(h))} (${s}–${e})`,
            });
          }
        });

        if (asapItems.length) groups.push({ label: rules.i18n.asap, items: asapItems });
      }

const slotItems = [];
const mode = getFulfillmentMode();

(rules.slots || []).forEach(([s, e]) => {
  if (mode === "pickup" && s === "19:00" && e === "20:00") {
    return;
  }

  const slotStartMin = toMinutes(s);
        if (!isToday) {
          slotItems.push({ value: `SLOT_${s}_${e}`, label: `${s}–${e}` });
        } else if (startAllowed(slotStartMin, true, earliestMinToday, workStartMin, workEndMin, lastStartMin)) {
          slotItems.push({ value: `SLOT_${s}_${e}`, label: `${s}–${e}` });
        }
      });
      if (slotItems.length) groups.push({ label: rules.i18n.slots, items: slotItems });

      return groups;
    }

    function saveToSession() {
      const mode = getFulfillmentMode();
      $.post(rules.ajaxUrl, {
        date: $date.val() || "",
        time: $time.val() || "",
        mode: mode,
      });
    }

    function updateCheckout() {
      $(document.body).trigger("update_checkout");
    }

    function openModal() {
      applyModeTexts();
      $modalSubtitle.text("— " + headerLabelFromDate($date.val() || todayYmd));
      $modal.attr("aria-hidden", "false").addClass("is-open");
    }
    function closeModal() {
      $modal.attr("aria-hidden", "true").removeClass("is-open");
    }

    $modal.find(".eco-delivery-backdrop").on("click", closeModal);
    $modal.find(".eco-delivery-sheet__close").on("click", closeModal);

    $dateProxyInput.attr("min", rules.todayYmd);
    if ($date.val()) $dateProxyInput.val($date.val());

    $dateProxyWrap.on("click", function () {
      const el = $dateProxyInput.get(0);
      if (!el) return;

      if (typeof el.showPicker === "function") {
        try { el.showPicker(); } catch (e) {}
      } else {
        $dateProxyInput.trigger("focus").trigger("click");
      }
    });

    function ensureSelectOptionsForDate(selectedYmd) {
      const groups = buildGroups(selectedYmd);

      $time.empty();

      if (!groups.length) {
        $time.append(new Option(rules.i18n.noOptionsToday, ""));
        $time.prop("disabled", true);
        return groups;
      }

      $time.append(new Option(rules.i18n.chooseTime, ""));
      groups.forEach((g) => {
        const $og = $("<optgroup>").attr("label", g.label);
        g.items.forEach((it) => $og.append($("<option>").attr("value", it.value).text(it.label)));
        $time.append($og);
      });

      $time.prop("disabled", false);
      return groups;
    }

    function setHiddenDate(ymd) {
      $date.val(ymd).trigger("change");
      $dateProxyInput.val(ymd);
      $dateProxyBtnText.text(formatRuDate(ymd));
      $dayLabel.text(headerLabelFromDate(ymd));
    }

    function setHiddenTime(val, labelIfMissing) {
      if (val && $time.find(`option[value="${val}"]`).length === 0) {
        const label = labelIfMissing || val;
        $time.append($("<option>").attr("value", val).text(label));
      }
      $time.val(val).trigger("change");
    }

    function renderSlots() {
      const selectedYmd = $date.val();
      const groups = ensureSelectOptionsForDate(selectedYmd);

      $slotsWrap.empty();

      if (!groups.length) {
        $slotsWrap.append(`<div class="eco-empty">${rules.i18n.noOptionsToday}</div>`);
        return;
      }

      groups.forEach((g) => {
        $slotsWrap.append(`<div class="eco-slots-group"><div class="eco-slots-title">${g.label}</div></div>`);
        const $g = $slotsWrap.find(".eco-slots-group").last();
        const $grid = $("<div class=\"eco-slots-grid\"></div>");
        $g.append($grid);

        g.items.forEach((it) => {
          const $btn = $("<button type=\"button\" class=\"eco-slot\"></button>")
            .text(it.label)
            .attr("data-value", it.value)
            .attr("data-label", it.label);

          if (it.value === $time.val()) $btn.addClass("is-active");
          $grid.append($btn);
        });
      });
    }

    $slotsWrap.on("click", ".eco-slot", function () {
      const val = $(this).attr("data-value");
      const label = $(this).attr("data-label");

      setHiddenTime(val, label);
      saveToSession();
      updateCheckout();

      $slotsWrap.find(".eco-slot").removeClass("is-active");
      $(this).addClass("is-active");

      syncSummary();
      closeModal();
    });

    function syncSummary() {
      const chosen = $time.val();
      const mode = getFulfillmentMode();
      const t = getModeText(mode);

      if (chosen) {
        const $opt = $time.find(`option[value="${chosen}"]`);
        $picked.text($opt.length ? $opt.text() : chosen);
        $chooseBtn.text(t.change);
        $chooseBtn.removeClass("eco-is-primary").addClass("eco-is-secondary");
      } else {
        $picked.text(t.notChosen);
        $chooseBtn.text(t.choose);
        $chooseBtn.removeClass("eco-is-secondary").addClass("eco-is-primary");
      }

      const ymd = $date.val() || "";
      $dayLabel.text(headerLabelFromDate(ymd || todayYmd));
      $dateProxyBtnText.text(formatRuDate(ymd));
      if (ymd) $dateProxyInput.val(ymd);

      applyModeTexts();
    }

    function setDayMode(mode) {
      $card.find(".eco-delivery-pill").removeClass("is-active");
      $card.find(`.eco-delivery-pill[data-day="${mode}"]`).addClass("is-active");

      if (mode === "today") {
        $otherWrap.hide();
        setHiddenDate(todayYmd);
      } else if (mode === "tomorrow") {
        $otherWrap.hide();
        setHiddenDate(tomorrowYmd);
      } else {
        $otherWrap.show();
        const cur = $date.val();
        if (!cur || cur === todayYmd || cur === tomorrowYmd) {
          setHiddenDate(addDaysYmd(todayYmd, 2));
        }
      }

      ensureSelectOptionsForDate($date.val() || todayYmd);
      setHiddenTime("");
      saveToSession();
      updateCheckout();

      renderSlots();
      syncSummary();
    }

    $card.find(".eco-delivery-pill").on("click", function () {
      setDayMode($(this).data("day"));
    });

    $card.find(".eco-delivery-card__choose, .eco-delivery-card__chev").on("click", function () {
      renderSlots();
      openModal();
    });

    $dateProxyInput.on("change", function () {
      const ymd = $(this).val() || "";
      if (!ymd) return;
      $date.val(ymd).trigger("change");
    });

    $date.on("change.eco", function () {
      const mode = dayModeFromDate($date.val());
      $card.find(".eco-delivery-pill").removeClass("is-active");
      $card.find(`.eco-delivery-pill[data-day="${mode}"]`).addClass("is-active");

      $otherWrap.toggle(mode === "other");

      $dateProxyInput.val($date.val() || "");
      $dateProxyBtnText.text(formatRuDate($date.val() || ""));

      ensureSelectOptionsForDate($date.val());
      setHiddenTime("");
      saveToSession();
      updateCheckout();

      renderSlots();
      syncSummary();
    });

    $time.on("change.eco", function () {
      saveToSession();
      syncSummary();
    });

const currentDate = $date.val() || "";
let initialDate = todayYmd;

if (currentDate && currentDate >= todayYmd) {
  initialDate = currentDate;
}

setHiddenDate(initialDate);

if (!currentDate || currentDate < todayYmd) {
  setHiddenTime("");
}

const initMode = dayModeFromDate(initialDate);
    $card.find(".eco-delivery-pill").removeClass("is-active");
    $card.find(`.eco-delivery-pill[data-day="${initMode}"]`).addClass("is-active");
    $otherWrap.toggle(initMode === "other");

    ensureSelectOptionsForDate(initialDate);
    renderSlots();
    syncSummary();

    $(document).off("change.ecoFulfillmentSlots", "#eco_fulfillment_type");
    $(document).on("change.ecoFulfillmentSlots", "#eco_fulfillment_type", function () {
      applyModeTexts();

      ensureSelectOptionsForDate($date.val() || todayYmd);

      const current = $time.val();
      if (current && $time.find(`option[value="${current}"]`).length === 0) {
        setHiddenTime("");
      }

      renderSlots();
      syncSummary();
    });

    $(document).off("click.ecoFulfillmentSlots", "#eco-fulfillment-switch .eco-fulfillment-btn");
    $(document).on("click.ecoFulfillmentSlots", "#eco-fulfillment-switch .eco-fulfillment-btn", function () {
      setTimeout(function () {
        applyModeTexts();

        ensureSelectOptionsForDate($date.val() || todayYmd);

        const current = $time.val();
        if (current && $time.find(`option[value="${current}"]`).length === 0) {
          setHiddenTime("");
        }

        renderSlots();
        syncSummary();
      }, 0);
    });

    applyModeTexts();
    saveToSession();
  }
});