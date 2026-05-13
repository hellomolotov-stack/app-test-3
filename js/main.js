function showAnniversaryPopup() {
    const overlay = document.createElement('div');
    overlay.className = 'anniversary-overlay';

    const isCardHolder = state.userCard.status === 'active';
    const buttonText = isCardHolder ? 'подарить карту' : 'оформить карту';

    overlay.innerHTML = `
        <div class="anniversary-sheet">
            <button class="anniversary-close-btn">&times;</button>
            <div class="anniversary-content">
                <div class="anniversary-title">🎉 26 мая хайкинг интеллигенции исполнится 1 год</div>
                <div class="anniversary-text">в честь этого мы выпускаем десять бессрочных карт интеллигента по цене сезонной</div>
                <div class="anniversary-pricing">
                    <span class="anniversary-old-price">7 500₽</span>
                    <span class="anniversary-new-price">5 500₽</span>
                </div>
                <div class="anniversary-subtitle">что даёт карта?</div>
                <ul class="anniversary-benefits">
                    <li>⭐️ членство в клубе навсегда</li>
                    <li>⭐️ билет на хайк <s>1 500₽</s> 0₽</li>
                    <li>⭐️ можешь брать с собой +1</li>
                    <li>⭐️ профиль члена клуба в приложении</li>
                    <li>⭐️ сможешь смотреть, кто записан на хайк</li>
                    <li>⭐️ доступ к чтению саммари мастермайндов</li>
                    <li>⭐️ привилегии в городе и онлайне</li>
                    <li>⭐️ подключишь интеллигентные три буквы</li>
                    <li>⭐️ доступ ко всем будущим обновлениям</li>
                </ul>
                <div class="anniversary-remaining">
                    <span class="pulse-dot"></span> осталось 9 карт
                </div>
                <button class="anniversary-btn" id="anniversaryBuyBtn">${buttonText}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Конфетти сразу после вставки
    showConfetti();

    requestAnimationFrame(() => {
        overlay.classList.add('visible');
    });

    const closePopup = () => {
        overlay.classList.remove('visible');
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    };
    overlay.querySelector('.anniversary-close-btn').addEventListener('click', closePopup);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePopup();
    });

    document.getElementById('anniversaryBuyBtn').addEventListener('click', () => {
        haptic();
        openLink(SEASON_CARD_LINK, isCardHolder ? 'anniversary_gift_click' : 'anniversary_card_click', !isCardHolder);
        closePopup();
    });
}
