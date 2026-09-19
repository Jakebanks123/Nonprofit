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

  /* VERIFICATION STATUS. `lastVerified` used to carry the string "example data
     — verify with council" on all 36 local entries and was read by nothing —
     not app.js, not explore-ui.js, not any suite — so the honesty marker never
     reached a user or a test. These checks are what make it load-bearing. The
     shape of the field is documented in data/schemes.js. */
  const VERIFICATION_STATUSES = ['unchecked', 'verified', 'disputed'];
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date().toISOString().slice(0, 10);
  const statusCounts = { unchecked: 0, verified: 0, disputed: 0 };

  Object.entries(app.LOCAL_SCHEMES).forEach(([councilId, arr]) => arr.forEach(s => {
    const where = councilId + '/' + s.id;
    const v = s.verification;
    if (!v || typeof v !== 'object') {
      problems.push(where + ': no verification field');
      return;
    }
    if (!VERIFICATION_STATUSES.includes(v.status)) {
      problems.push(where + ': verification.status is ' + JSON.stringify(v.status)
        + ', expected one of ' + VERIFICATION_STATUSES.join(', '));
      return;
    }
    statusCounts[v.status]++;
    if (v.status === 'unchecked') {
      /* A date or a source on an unchecked entry is the exact failure this
         field exists to prevent: it reads as a check that never happened. */
      if (v.date || v.source) {
        problems.push(where + ': an unchecked entry must carry no date and no source');
      }
      return;
    }
    if (!ISO_DATE.test(v.date || '') || Number.isNaN(Date.parse(v.date))) {
      problems.push(where + ': verification.date is ' + JSON.stringify(v.date) + ', expected ISO YYYY-MM-DD');
    } else if (v.date > today) {
      problems.push(where + ': verification.date ' + v.date + ' is in the future');
    }
    if (!/^https:\/\//.test(v.source || '')) {
      problems.push(where + ': verification.source is ' + JSON.stringify(v.source)
        + ' — a ' + v.status + ' entry must name the https page that was read');
    }
    if (v.status === 'disputed' && !v.note) {
      problems.push(where + ': a disputed entry must say in verification.note what was checked and what was missing');
    }
  }));

  /* Catches the old field coming back on any scheme — including a national
     one, or an entry pasted in from git history. Checked on the objects and
     not on the file text, so that data/schemes.js can still quote the old
     string in a comment to explain what this replaced. Scanning the source
     failed on that comment, which is the check marking its own documentation
     as the bug. */
  const PLACEHOLDER = 'example data — verify with council';
  allSchemes.forEach(sc => {
    const who = sc.id || sc.name;
    if ('lastVerified' in sc) {
      problems.push(who + ': still carries the old lastVerified field — use verification instead');
    }
    Object.keys(sc).forEach(k => {
      if (typeof sc[k] === 'string' && sc[k].includes(PLACEHOLDER)) {
        problems.push(who + '.' + k + ' is still the "' + PLACEHOLDER + '" placeholder');
      }
    });
  });

  console.log('local scheme verification: '
    + VERIFICATION_STATUSES.map(k => statusCounts[k] + ' ' + k).join(', '));

  console.log('\n===== KEYBOARD-ONLY NAVIGATION =====\n');
  const browser = await chromium.launch();
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
    return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, isFocused: document.activeElement === h };
  });
  console.log('Step heading focus ring:', JSON.stringify(ring));

  /* app.js moves focus to the step heading after every step change, so a
     screen reader announces the new step. The ring check below measured that
     focus but only ever complained about how it LOOKED, so removing the
     focus() call entirely left this suite green. Assert the behaviour, not
     just its styling. */
  if (!ring.isFocused) {
    problems.push('Focus is not moved to the step heading — screen readers will not announce the new step');
  }
  /* outline-style decides whether a ring is drawn; outline-width is whatever
     the stylesheet last declared and is meaningless when the style is 'none'.
     Comparing the two joined together against 'none 0px' reported a ring on
     every run, because :focus-visible leaves the width at 3px while setting
     the style to none. */
  if (ring.isFocused && ring.outlineStyle !== 'none') {
    problems.push('Visible focus outline drawn around step heading after mouse click (cosmetic: shows a box around the title)');
  }

  await browser.close();
  console.log('\n===== SUMMARY =====\n');
  if (!problems.length) {
    console.log('No problems detected.');
  } else {
    problems.forEach((p, i) => console.log(`${i + 1}. ${p}`));
    /* Exit non-zero so `npm test` can fail. Without this the suite printed its
       findings and still reported success — the same flaw the maths suites had
       until 19 Aug 2026. */
    process.exitCode = 1;
  }
})();
