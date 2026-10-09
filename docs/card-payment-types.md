# Card Payment Types

Updated 2026-10-09. Existing Apps Script project: `Тест приложения клуба`,
file `Файрбейс.gs`, deployed as version 62 without changing the web-app URL.

| Request | Server amount | Receipt item |
| --- | ---: | --- |
| `ticket` | 1000 | Билет на хайк |
| `season` | 5500 | сезонная карта интеллигента – текущий и следующий сезон |
| `permanent` | 7500 | бессрочная карта интеллигента |
| `offer` | `CARD_OFFER_PRICE`, currently 5000 | бессрочная карта интеллигента – спецпредложение |
| `gift` + `gift_card_type=season` | 5500 | Подарочная сезонная карта интеллигента – текущий и следующий сезон |
| `gift` + `gift_card_type=permanent` | 7500 | Подарочная бессрочная карта интеллигента |

The server chooses prices; the client never controls the charged amount.
Before opening payment, the client checks response type, chosen amount,
Robokassa URL, receipt name, quantity and item sum. Gift plan is preserved in
the pending payment, gift record, recipient screen and administrator issuance request.
Existing gift requests without `gift_card_type` keep the historically quoted
5500 permanent gift. Previously created invoices are not repriced.

Gift activation remains the existing administrator issuance workflow.
Season validity wording: `действует начиная с текущего сезона плюс следующий`.

`appscript-card-payment.gs` is the credential-free installed helper.
`appscript-card-payment-patch.json` records exact changes to the existing script;
do not blindly reapply it to an already updated source.
Tax and payment-object settings were preserved, not reclassified.

Verification: `tests/card-payments.cjs`, `tests/gift-cards-browser.cjs`,
`tests/sold-out-card.cjs`, `tests/ticket-recovery.cjs`, `tests/ticket-credit-chat.cjs`.
No real charge or fiscal receipt issuance was performed by these tests.
