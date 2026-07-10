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
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
}

async function processJavaScript(srcPath, destPath) {
    try {
        const code = fs.readFileSync(srcPath, 'utf8');
        const result = await minify(code, {
            compress: true,
            mangle: true,
            format: {
                comments: false,
            },
        });
        fs.writeFileSync(destPath, result.code, 'utf8');
        return true;
    } catch (err) {
        console.error(`✖ ошибка в ${srcPath}:`, err.message);
        return false;
    }
}

async function processFile(srcPath, destPath, isJs) {
    if (isJs) {
        const success = await processJavaScript(srcPath, destPath);
        if (!success) {
            copyFile(srcPath, destPath);
            console.log(`   скопирован (fallback): ${path.relative('.', destPath)}`);
        } else {
            console.log(`✔ обфусцирован: ${path.relative('.', destPath)}`);
        }
    } else {
        copyFile(srcPath, destPath);
        console.log(`   копирован: ${path.relative('.', destPath)}`);
    }
}

async function processDirectory(srcDir, outDir) {
    if (!fs.existsSync(srcDir)) {
        console.warn(`⚠️  папка не найдена: ${srcDir}, пропускаю`);
        return;
    }

    const files = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const file of files) {
        const srcPath = path.join(srcDir, file.name);
        const destPath = path.join(outDir, file.name);

        if (file.isDirectory()) {
            await processDirectory(srcPath, destPath);
        } else {
            const isJs = file.name.endsWith('.js');
            await processFile(srcPath, destPath, isJs);
        }
    }
}

(async () => {
    // Обрабатываем папки js и js/ui
    for (const dir of sourceDirs) {
        const srcDir = path.join('.', dir);
        const outDir = path.join(outputDir, dir);
        await processDirectory(srcDir, outDir);
    }

    // Копируем index.html и style.css в dist
    for (const file of ['index.html', 'style.css']) {
        if (fs.existsSync(file)) {
            copyFile(file, path.join(outputDir, file));
            console.log(`   копирован: ${file}`);
        }
    }

    // Переносим растровые ассеты Люмена в deployable output.
    if (fs.existsSync('assets')) {
        await processDirectory('assets', path.join(outputDir, 'assets'));
    }

    console.log('✅ Сборка завершена. Папка dist готова к деплою.');
})();
