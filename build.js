const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

// Папки с исходниками и выходная папка
const sourceDirs = ['js', 'js/ui'];
const outputDir = 'dist';

// Создаём папку dist (если её нет)
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Копирование не‑js файлов и рекурсивная обработка js
function copyFile(src, dest) {
    fs.copyFileSync(src, dest);
}

function processDirectory(dir) {
    const fullDir = path.join(__dirname, dir);
    if (!fs.existsSync(fullDir)) return;

    const files = fs.readdirSync(fullDir, { withFileTypes: true });
    files.forEach(file => {
        const srcPath = path.join(fullDir, file.name);
        // Сохраняем структуру папок в dist
        const relativePath = path.relative(__dirname, srcPath);
        const destPath = path.join(outputDir, relativePath);

        if (file.isDirectory()) {
            if (!fs.existsSync(destPath)) {
                fs.mkdirSync(destPath, { recursive: true });
            }
            // Рекурсивно обрабатываем вложенные папки
            processDirectory(path.join(dir, file.name));
        } else {
            if (file.name.endsWith('.js')) {
                const code = fs.readFileSync(srcPath, 'utf8');
                minify(code, {
                    compress: true,
                    mangle: true,       // переименование переменных
                    output: {
                        comments: false
                    }
                }).then(result => {
                    fs.writeFileSync(destPath, result.code, 'utf8');
                    console.log(`✔ обфусцирован: ${relativePath}`);
                }).catch(err => {
                    console.error(`✖ ошибка в ${relativePath}:`, err);
                    // на случай ошибки копируем оригинал
                    copyFile(srcPath, destPath);
                });
            } else {
                // остальные файлы (например, .json, .css) копируем как есть
                copyFile(srcPath, destPath);
            }
        }
    });
}

// Обрабатываем все исходные папки
sourceDirs.forEach(processDirectory);

// Копируем index.html и style.css в dist
copyFile('index.html', path.join(outputDir, 'index.html'));
copyFile('style.css', path.join(outputDir, 'style.css'));

// Заменяем пути к скриптам в dist/index.html
const htmlPath = path.join(outputDir, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
// Меняем js/main.js → js/main.js (пути остаются теми же, потому что структура сохранена)
// В нашем случае заменять ничего не нужно, так как структура папок остаётся.
// Но если бы мы объединяли файлы, пришлось бы менять. Здесь всё останется работающим.
fs.writeFileSync(htmlPath, html, 'utf8');

console.log('Сборка завершена. Папка dist готова к деплою.');
