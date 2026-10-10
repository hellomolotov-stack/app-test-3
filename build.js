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

    // Один файл приложения вместо ~33 модулей (см. bundleApp ниже). Не получилось – остаются модули.
    try {
        await bundleApp();
    } catch (err) {
        console.error('✖ бандл не собран, остаются отдельные модули:', err.message);
        copyFile('index.html', path.join(outputDir, 'index.html'));
    }

    console.log('✅ Сборка завершена. Папка dist готова к деплою.');
})();

// Замеры 08–10.10: даже из кэша главная у части людей рисовалась 5–10 с – телефон при каждом
// запуске сверял с сервером ~33 модуля js/ (no-cache). Собираем их в один файл с хэшем в имени:
// он кэшируется навсегда (vercel.json, /js/b/), новая версия = новое имя, сверять нечего.
// Исходные модули в dist остаются – на случай, если кто-то откроет старую страницу.
async function bundleApp() {
    const esbuild = require('esbuild');
    const outdir = path.join(outputDir, 'js', 'b');
    fs.rmSync(outdir, { recursive: true, force: true });
    const result = await esbuild.build({
        entryPoints: { app: 'js/main.js' },
        bundle: true,
        format: 'esm',
        splitting: false,         // import() внутри кода тоже попадает в этот же файл – он и так грузится целиком
        minify: true,
        legalComments: 'none',
        outdir,
        entryNames: '[name]-[hash]',
        metafile: true,
        logLevel: 'warning'
    });
    const outputs = result.metafile.outputs;
    const entry = Object.keys(outputs).find(f => outputs[f].entryPoint === 'js/main.js');
    if (!entry) throw new Error('нет входного файла');
    const rel = f => path.relative(outputDir, f).split(path.sep).join('/');
    // всё, что входной файл тянет сразу, – качаем параллельно с ним
    const eager = outputs[entry].imports.filter(i => i.kind === 'import-statement').map(i => rel(i.path));
    const preload = [rel(entry), ...eager].map(h => `<link rel="modulepreload" href="${h}">`).join('\n    ');

    const htmlPath = path.join(outputDir, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    const block = /<!-- modulepreload:start[^>]*-->[\s\S]*?<!-- modulepreload:end -->/;
    const script = /<script type="module" src="js\/main\.js[^"]*"><\/script>/;
    if (!block.test(html) || !script.test(html)) throw new Error('index.html: не нашёл modulepreload или main.js');
    html = html.replace(block, `<!-- modulepreload:start – один файл приложения (собран build.js) -->\n    ${preload}\n    <!-- modulepreload:end -->`)
               .replace(script, `<script type="module" src="${rel(entry)}"></script>`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    const kb = Object.keys(outputs).reduce((s, f) => s + outputs[f].bytes, 0) / 1024;
    console.log(`✔ бандл: ${rel(entry)} + ${Object.keys(outputs).length - 1} файл(ов), ${kb.toFixed(0)} КБ`);
}
