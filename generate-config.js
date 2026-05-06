const fs = require('fs');
const path = require('path');

// Читаем шаблон
const template = fs.readFileSync(path.join(__dirname, 'js', 'config.template.js'), 'utf8');

// Заменяем все плейсхолдеры на значения из переменных окружения
let result = template;
for (const [key, value] of Object.entries(process.env)) {
    if (key.endsWith('_PLACEHOLDER')) continue;   // не заменяем имена переменных
    result = result.replace(new RegExp(key, 'g'), value);
}

// Записываем реальный конфиг
fs.writeFileSync(path.join(__dirname, 'js', 'config.js'), result, 'utf8');
console.log('config.js успешно сгенерирован из переменных окружения');
