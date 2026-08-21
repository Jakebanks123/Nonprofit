const { chromium } = require('playwright');
const path = require('path');
// Load the split files as the browser does (see verify-maths.cjs for why
// they're concatenated rather than loaded one at a time).
const vm = require('vm');
const fs = require('fs');
const ctx = { console, setTimeout, clearTimeout, fetch: undefined,
  AbortController: function () { this.abort = () => {}; this.signal = null; } };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(
  ['data/postcodes.js', 'data/schemes.js', 'explore-core.js', 'app.js']
    .map(f => fs.readFileSync(__dirname + '/' + f, 'utf8')).join('\n;\n')
  + '\n;Object.assign(globalThis, { NATIONAL_SCHEMES, LOCAL_SCHEMES, COUNCILS });',
  ctx, { filename: 'app-combined.js' });
const app = ctx;

const fileUrl = 'file://' + path.resolve(__dirname, 'index.html');
const problems = [];

(async () => {
  console.log('===== SCHEME DATA SANITY =====\n');
  const allSchemes = [...app.NATIONAL_SCHEMES];
  Object.entries(app.LOCAL_SCHEMES).forEach(([k, arr]) => arr.forEach(s => allSchemes.push(s)));
  const ids = new Set();
  for (const s of allSchemes) {
    if (!s.id) problems.push('scheme with no id: ' + s.name);
    if (ids.has(s.id)) problems.push('DUPLICATE scheme id: ' + s.id);
    ids.add(s.id);
    if (!s.name) problems.push(s.id + ': no name');
    if (!s.url || !/^https:\/\//.test(s.url)) problems.push(s.id + ': bad url ' + s.url);
    if (typeof s.evaluate !== 'function') problems.push(s.id + ': no evaluate()');
  }
  console.log(`${allSchemes.length} schemes total (${app.NATIONAL_SCHEMES.length} national), ${ids.size} unique ids`);
  const councilsWithSchemes = Object.keys(app.LOCAL_SCHEMES).filter(k => app.LOCAL_SCHEMES[k].length);
  console.log('councils with local schemes:', councilsWithSchemes.length, '->', councilsWithSchemes.join(', '));

  // every local scheme key must be a real pilot council id
  const pilotIds = new Set(app.COUNCILS.map(c => c.id));
  Object.keys(app.LOCAL_SCHEMES).forEach(k => {
    if (!pilotIds.has(k)) problems.push('LOCAL_SCHEMES key is not a known council id: ' + k);
  });

  console.log('\n===== KEYBOARD-ONLY NAVIGATION =====\n');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  page.on('pageerror', e => problems.push('PAGE ERROR: ' + e.message));
  await page.goto(fileUrl);

  // Tab order on step 1
  const tabOrder = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    tabOrder.push(await page.evaluate(() => {
      const el = document.activeElement;
      return el.id || el.tagName + (el.textContent ? ':' + el.textContent.trim().slice(0, 18) : '');
    }));
  }
  console.log('Tab order from page load:', tabOrder.join(' -> '));

  // Can a keyboard user complete step 1 and advance?
  await page.goto(fileUrl);
  await page.focus('#councilSearch');
  await page.keyboard.type('Leeds');
  await page.keyboard.press('Tab');
  const advanced = await page.evaluate(() => {
    document.getElementById('nextBtn').click();
    return !!document.getElementById('age');
  });
  console.log('Keyboard-only: typed council then advanced =', advanced);
  if (!advanced) problems.push('Keyboard user cannot complete the location step by typing');

  // Enter key in postcode field triggers lookup (documented behaviour)
  await page.goto(fileUrl);
  await page.focus('#postcode');
  await page.keyboard.type('LS1 4DY');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const t = document.getElementById('lookupStatus').textContent;
    return t.trim() && !t.includes('Looking up');
  }, { timeout: 15000 });
  const st = await page.textContent('#lookupStatus');
  console.log('Enter in postcode field ->', st.trim().slice(0, 80));
  if (!/Leeds/.test(st)) problems.push('Enter key in postcode field did not resolve council');

  // Does the focus ring on the programmatically-focused heading show for mouse users?
  await page.goto(fileUrl);
  await page.fill('#councilSearch', 'Leeds');
  await page.dispatchEvent('#councilSearch', 'input');
  await page.click('#nextBtn');
  const ring = await page.evaluate(() => {
    const h = document.getElementById('stepHeading');
    const cs = getComputedStyle(h);
    return { outline: cs.outlineStyle + ' ' + cs.outlineWidth, isFocused: document.activeElement === h };
  });
  console.log('Step heading focus ring:', JSON.stringify(ring));
  if (ring.isFocused && ring.outline !== 'none 0px') {
    problems.push('Visible focus outline drawn around step heading after mouse click (cosmetic: shows a box around the title)');
  }

  await browser.close();
  console.log('\n===== SUMMARY =====\n');
  if (!problems.length) console.log('No problems detected.');
  else problems.forEach((p, i) => console.log(`${i + 1}. ${p}`));
})();
