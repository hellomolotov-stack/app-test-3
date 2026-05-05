const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const sourceDirs = ['js', 'js/ui'];
const outputDir = 'dist';

// Создаём выходную папку
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

function copyFile(src, dest) {
    fs.copyFileSync(src, dest);
}

async function processDirectory(dir) {
    const fullDir = path.join(__dirname, dir);
    if (!fs.existsSync(fullDir)) {
        console.warn(`⚠️  папка не найдена: ${dir}, пропускаю`);
        return;
    }

    const files = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const file of files) {
        const srcPath = path.join(fullDir, file.name);
        const relativePath = path.relative(__dirname, srcPath);
        const destPath = path.join(outputDir, relativePath);

        if (file.isDirectory()) {
            if (!fs.existsSync(destPath)) {
                fs.mkdirSync(destPath, { recursive: true });
            }
            await processDirectory(path.join(dir, file.name));
        } else {
            if (file.name.endsWith('.js')) {
                try {
                    const code = fs.readFileSync(srcPath, 'utf8');
                    // Правильные опции для Terser v5
                    const result = await minify(code, {
                        compress: true,
                        mangle: true,
                        format: {
                            comments: false,
                        },
                    });
                    fs.writeFileSync(destPath, result.code, 'utf8');
                    console.log(`✔ обфусцирован: ${relativePath}`);
                } catch (err) {
                    console.error(`✖ ошибка в ${relativePath}:`, err.message);
                    // на всякий случай копируем оригинал
                    copyFile(srcPath, destPath);
                }
            } else {
                copyFile(srcPath, destPath);
            }
        }
    }
}

(async () => {
    for (const dir of sourceDirs) {
        await processDirectory(dir);
    }

    // Копируем статические файлы
    copyFile('index.html', path.join(outputDir, 'index.html'));
    copyFile('style.css', path.join(outputDir, 'style.css'));

    console.log('✅ Сборка завершена. Папка dist готова к деплою.');
})();
