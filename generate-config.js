const fs = require('fs');
const path = require('path');

// Собираем конфиг из переменных окружения
const config = {
  GUEST_API_URL: process.env.GUEST_API_URL || '',
  REGISTRATION_API_URL: process.env.REGISTRATION_API_URL || '',
  ROBOKASSA_LINK: process.env.ROBOKASSA_LINK || '',
  SEASON_CARD_LINK: process.env.SEASON_CARD_LINK || '',
  PERMANENT_CARD_LINK: process.env.PERMANENT_CARD_LINK || '',
  GISMETEO_TOKEN: process.env.GISMETEO_TOKEN || '',
  FIREBASE_CONFIG: {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    databaseURL: process.env.FIREBASE_DB_URL || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MSG_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
  }
};

// Формируем итоговый код config.js
const content = `export const GUEST_API_URL = '${config.GUEST_API_URL}';
export const REGISTRATION_API_URL = '${config.REGISTRATION_API_URL}';
export const ROBOKASSA_LINK = '${config.ROBOKASSA_LINK}';
export const SEASON_CARD_LINK = '${config.SEASON_CARD_LINK}';
export const PERMANENT_CARD_LINK = '${config.PERMANENT_CARD_LINK}';
export const GISMETEO_TOKEN = '${config.GISMETEO_TOKEN}';
export const FIREBASE_CONFIG = ${JSON.stringify(config.FIREBASE_CONFIG, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, 'js', 'config.js'), content.trim(), 'utf8');
console.log('✅ config.js успешно сгенерирован из переменных окружения');
