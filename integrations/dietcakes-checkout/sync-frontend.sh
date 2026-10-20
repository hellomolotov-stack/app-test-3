#!/bin/sh
# Копирует конструктор бокса и его картинки из приложения в плагин магазина (перед выпуском новой версии плагина).
set -e
cd "$(dirname "$0")"
R=../..
cp "$R/assets/dc/hiking-box.js" hi-club-checkout/assets/hiking-box.js
cp "$R/assets/box/rock.jpg" "$R/assets/box/rock-hd.jpg" hi-club-checkout/assets/box/
cp "$R/assets/card-front.jpg" "$R/assets/logo-hiking.png" hi-club-checkout/assets/
echo "frontend synced"
