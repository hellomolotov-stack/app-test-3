import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
const modules = process.env.HI_PHP_RUNTIME_DIR || '/private/tmp/hi-checkout-runtime/node_modules';
const { PHP, FileLockManagerInMemory } = await import(pathToFileURL(path.join(modules, '@php-wasm/universal/index.js')));
const { loadNodeRuntime, useHostFilesystem } = await import(pathToFileURL(path.join(modules, '@php-wasm/node/index.js')));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const php = new PHP(await loadNodeRuntime('8.2', { fileLockManager: new FileLockManagerInMemory(), emscriptenOptions: { processId: 1 } }));
useHostFilesystem(php);
const result = await php.run({ scriptPath: path.join(root, 'tests/loyalty.php') });
if (result.errors) process.stderr.write(result.errors);
let report;
try { report = JSON.parse(result.text); }
catch { process.stderr.write(result.text); throw new Error('PHP did not return a successful test report'); }
if (!report.checks?.length || report.checks.some(x => !x.passed) || result.errors) throw new Error('Local tests failed');
await fs.writeFile(path.join(root, 'tests/loyalty-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`PHP ${report.engine}: ${report.checks.length} checks passed`);
for (const check of report.checks) console.log('✓ ' + check.name);
php.exit();
process.exit(0);
