import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await fs.readFile(process.env.HI_CONSTRUCTOR_SOURCE || path.join(root, 'integration/hiking-box.candidate.js'), 'utf8');
const start = source.indexOf("  $('hi-cta').addEventListener('click'");
const end = source.indexOf('\n})();', start);
assert.ok(start > 0 && end > start);
const code = source.slice(start, end);
const checks = [];
function check(name, condition) { assert.ok(condition, name); checks.push({ name, passed: true }); }
async function scenario({ pilot = true, club = true, contextStatus = 200, batchStatus = 200, itemStatus = 200 } = {}) {
  let click;
  const calls = [];
  const button = { disabled: false, textContent: '', addEventListener: (name, fn) => { click = fn; } };
  const fields = { 'hi-cta': button, 'hi-msg': { textContent: '' }, 'hi-date': { value: '2026-10-25' } };
  const location = { href: '' };
  const sandbox = {
    $: id => fields[id], allSel: () => [[123, 1]], extra: {}, wayNow: 'pickup',
    fromClubApp: club, qs: new URLSearchParams(pilot ? 'hi_club_test=1' : ''),
    hasCard: true, route: 'Ай-Петри', hikeNote: () => '', document: { cookie: '' }, navigator: {},
    location, atob: s => Buffer.from(s, 'base64').toString(), setTimeout: fn => fn(),
    pickPickup: async () => {},
    fetch: async (url, options = {}) => {
      calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
      const status = url.endsWith('/extensions') ? contextStatus : url.endsWith('/batch') ? batchStatus : 200;
      return { ok: status < 400, status, headers: { get: () => 'local-test-nonce' }, json: async () => ({ responses: [{ status: itemStatus, body: { shipping_rates: [] } }] }) };
    },
  };
  vm.runInNewContext(code, sandbox);
  click.call(button);
  for (let i = 0; i < 25; i++) await new Promise(resolve => setImmediate(resolve));
  return { calls, button, location, message: fields['hi-msg'].textContent };
}
let run = await scenario({ pilot: false });
check('Ordinary link sends no new context request', run.calls.length === 2 && run.calls.every(c => !c.url.endsWith('/extensions')));
check('Ordinary link keeps checkout navigation', run.location.href === '/checkout/');
run = await scenario({ club: false });
check('Pilot marker without club source does not enable new integration', run.calls.length === 2);
run = await scenario();
check('Pilot uses one context request before one batch', run.calls.map(c => c.url.split('/').pop()).join(',') === 'cart,extensions,batch');
check('Pilot passes explicit pickup/date/route to server', run.calls[1].body.data.way === 'pickup' && run.calls[1].body.data.date === '2026-10-25' && run.calls[1].body.data.route === 'Ай-Петри');
check('Pilot leaves existing coupon operation in cart batch', run.calls[2].body.requests.some(r => r.path.endsWith('/apply-coupon')));
check('Successful pilot navigates to ordinary checkout', run.location.href === '/checkout/');
run = await scenario({ contextStatus: 403 });
check('Blocked context does not proceed to adding products', run.calls.length === 2 && run.location.href === '');
check('Blocked context disables repeated click and gives stop message', run.button.disabled && run.message.includes('не нажимай повторно'));
run = await scenario({ itemStatus: 400 });
check('Partial batch failure does not navigate to checkout', run.calls.length === 3 && run.location.href === '' && run.button.disabled);
run = await scenario({ batchStatus: 429 });
check('Rate limited batch is never retried', run.calls.length === 3 && run.location.href === '' && run.button.disabled);
await fs.writeFile(path.join(root, 'tests/integration-results.json'), JSON.stringify({ kind: 'VM tests of actual candidate CTA handler with stubbed HTTP; no real network', checks }, null, 2) + '\n');
console.log(`${checks.length} integration checks passed`);
for (const c of checks) console.log('✓ ' + c.name);
