// Playwright для браузерных тестов: PLAYWRIGHT_MODULE, установленный пакет или локальный путь на Маке.
// Раньше путь к Маку был зашит в каждый тест, и в других окружениях браузерные тесты не запускались.
const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    'playwright',
    '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
].filter(Boolean);
let lastError;
for (const name of candidates) {
    try { module.exports = require(name); lastError = null; break; } catch (error) { lastError = error; }
}
if (lastError) throw new Error(`Playwright не найден – укажи PLAYWRIGHT_MODULE (${lastError.message})`);
