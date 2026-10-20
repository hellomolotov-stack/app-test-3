/* Only enqueued for a live club pilot context on the classic Dietcakes checkout. */
(function () {
    'use strict';
    var root = document.getElementById('hi-club-checkout');
    var switcher = document.getElementById('eco-fulfillment-switch');
    var mode = document.getElementById('eco_fulfillment_type');
    if (!root || !switcher || !mode || !window.jQuery) return;
    var hike = document.getElementById('hi-club-hike-button');
    var choice = document.getElementById('hi_club_way');
    var date = document.getElementById('hi_club_date');
    var details = document.getElementById('hi-club-hike-details');
    var pickup = switcher.querySelector('[data-mode="pickup"]');
    if (!hike || !choice || !details || !pickup) return;
    var choosingHike = false;
    switcher.appendChild(hike);

    function sync() {
        var onHike = mode.value === 'pickup' && choice.value === 'hike';
        document.body.classList.add('hi-club-checkout');
        document.body.classList.toggle('hi-club-on-hike', onHike);
        var state = document.getElementById('hi-club-discount-state');
        var showDiscount = mode.value === 'pickup' && !onHike && state && state.getAttribute('data-card') === '0';
        document.body.classList.toggle('hi-club-show-pickup-discount', Boolean(showDiscount));
        ['billing_eco_delivery_date', 'billing_eco_delivery_time'].forEach(function (id) {
            var input = document.getElementById(id);
            if (!input) return;
            // These two native ECO fields are normally required; PHP relaxes them for initial hike renders.
            input.required = !onHike;
            input.disabled = onHike;
        });
        hike.classList.toggle('is-active', onHike);
        hike.setAttribute('aria-pressed', String(onHike));
        if (onHike) pickup.classList.remove('is-active');
        details.hidden = !onHike;
    }

    // Capture runs before the existing theme's delegated click/update_checkout handler.
    switcher.addEventListener('click', function (event) {
        var button = event.target.closest('button');
        if (!button || !switcher.contains(button)) return;
        if (button === hike) {
            event.preventDefault();
            event.stopImmediatePropagation();
            choice.value = 'hike';
            choosingHike = true;
            pickup.click(); // Reuse the current theme's mode switch and its single recalculation.
            choosingHike = false;
        } else if (!choosingHike) {
            var target = button.getAttribute('data-mode');
            if (target === 'pickup' || target === 'delivery') choice.value = target === 'delivery' ? 'home' : 'pickup';
        }
        setTimeout(sync, 0);
    }, true);

    date.addEventListener('change', function () {
        if (choice.value === 'hike') window.jQuery(document.body).trigger('update_checkout');
    });
    window.jQuery(document.body).on('updated_checkout.hiClub', function () { setTimeout(sync, 0); });
    window.jQuery(function () { setTimeout(sync, 0); });
    sync();
})();
