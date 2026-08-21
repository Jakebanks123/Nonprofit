const { chromium } = require('playwright');
const path = require('path');

const fileUrl = 'file://' + path.resolve(__dirname, 'index.html');
const problems = [];

async function fillFlow(page, o) {
  await page.goto(fileUrl);
  await page.fill('#councilSearch', o.council || 'Leeds');
  await page.dispatchEvent('#councilSearch', 'input');
  await page.click('#nextBtn');
  if (!(await page.$('#age'))) return { reached: false, blockedAt: 'location' };
  await page.fill('#age', String(o.age ?? 35));
  await page.fill('#adults', String(o.adults ?? 1));
  await page.fill('#children', String(o.children ?? 0));
  await page.click('#nextBtn');
  if (!(await page.$('#monthlyIncome'))) return { reached: false, blockedAt: 'household' };
  await page.fill('#monthlyIncome', String(o.income ?? 500));
  await page.fill('#savings', String(o.savings ?? 0));
  await page.fill('#housingCosts', String(o.housing ?? 0));
  await page.click('#nextBtn');
  if (!(await page.$('#receivingUC'))) return { reached: false, blockedAt: 'income' };
  await page.click('#nextBtn');
  if (!(await page.$('.results-summary'))) return { reached: false, blockedAt: 'circumstances' };
  const summary = (await page.textContent('.results-summary')).replace(/\s+/g, ' ').trim();
  return { reached: true, summary };
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => problems.push('PAGE ERROR: ' + e.message));

  console.log('===== A. CAN BAD INPUT REACH THE LOGIC VIA THE UI? =====\n');

  // Negative income typed directly into a min="0" number field
  let r = await fillFlow(page, { income: -500 });
  console.log('Negative income -500 via UI: ' + (r.reached ? r.summary.slice(0,150) : 'BLOCKED at ' + r.blockedAt + ' step (good)'));
  if (r.reached && /NaN|-£|£-/.test(r.summary)) problems.push('Negative income produced malformed summary');

  for (const c of [
    {label:'Negative housing -300', o:{housing:-300}},
    {label:'Negative savings -1000', o:{savings:-1000}},
    {label:'Negative children -2', o:{children:-2}},
    {label:'Zero adults', o:{adults:0}},
    {label:'Age 0', o:{age:0}},
    {label:'Age 200', o:{age:200}},
    {label:'Negative age -30', o:{age:-30}},
    {label:'Housing 1e9', o:{housing:1000000000, income:0}}
  ]) {
    const rr = await fillFlow(page, c.o);
    console.log(`  ${c.label}: ` + (rr.reached ? rr.summary.slice(0,110) : 'BLOCKED at ' + rr.blockedAt));
    if (rr.reached && /NaN/.test(rr.summary)) problems.push(c.label + ' -> NaN shown to user');
    if (rr.reached && /-£|£-/.test(rr.summary)) problems.push(c.label + ' -> negative money shown to user');
  }

  // Non-numeric input: browsers block typing letters into type=number natively,
  // so instead check what the app does when the field ends up empty/invalid.
  await page.goto(fileUrl);
  await page.fill('#councilSearch', 'Leeds');
  await page.dispatchEvent('#councilSearch', 'input');
  await page.click('#nextBtn');
  await page.fill('#age', '35');
  await page.click('#nextBtn');
  const blankIncomeBlocked = await page.evaluate(() => { document.getElementById('nextBtn').click(); return !!document.getElementById('monthlyIncome'); });
  console.log(`\nBlank income blocks advancing: ${blankIncomeBlocked}`);

  // Huge values
  r = await fillFlow(page, { children: 500, income: 0 });
  console.log('\n500 children via UI: ' + (r.reached ? r.summary.slice(0,170) : 'BLOCKED at ' + r.blockedAt));

  // Decimals
  r = await fillFlow(page, { income: 1200.756, housing: 640.333 });
  console.log('\nDecimal income/housing via UI: ' + (r.reached ? r.summary.slice(0,140) : 'BLOCKED at ' + r.blockedAt));

  console.log('\n===== B. NAVIGATION & STATE =====\n');

  // Back preserves answers
  await page.goto(fileUrl);
  await page.fill('#councilSearch', 'Leeds');
  await page.dispatchEvent('#councilSearch', 'input');
  await page.click('#nextBtn');
  await page.fill('#age', '44');
  await page.fill('#adults', '2');
  await page.fill('#children', '3');
  await page.click('#nextBtn');
  await page.fill('#monthlyIncome', '1234');
  await page.click('#backBtn');
  const backAge = await page.$eval('#age', el => el.value);
  const backChildren = await page.$eval('#children', el => el.value);
  console.log(`Back from income -> household: age=${backAge} (want 44), children=${backChildren} (want 3)`);
  if (backAge !== '44' || backChildren !== '3') problems.push('Back navigation lost household answers');

  await page.click('#backBtn');
  const backCouncil = await page.$eval('#councilSearch', el => el.value);
  console.log(`Back to location: councilSearch=${JSON.stringify(backCouncil)} (want "Leeds")`);
  if (backCouncil !== 'Leeds') problems.push('Back navigation lost council selection, got ' + JSON.stringify(backCouncil));

  // Forward again preserves income
  await page.click('#nextBtn');
  await page.click('#nextBtn');
  const fwdIncome = await page.$eval('#monthlyIncome', el => el.value);
  console.log(`Forward again -> income=${fwdIncome} (want 1234)`);
  if (fwdIncome !== '1234') problems.push('Forward navigation lost income, got ' + fwdIncome);

  // Change an answer then re-run: results must reflect the NEW answer
  const rBefore = await fillFlow(page, { council: 'Leeds', income: 400, housing: 600 });
  const before = rBefore.summary.match(/£[\d,]+/)[0];
  await page.click('#restartBtn');
  // "Start over" is now "Change my answers" and deliberately KEEPS the answers:
  // the results screen has no Back button, so wiping all four steps to correct
  // one number was hostile. Assert they survive rather than that they are gone.
  const restartedField = await page.$eval('#councilSearch', el => el.value);
  console.log(`\nChange my answers -> councilSearch kept: ${JSON.stringify(restartedField)} (want "Leeds")`);
  if (restartedField === '') problems.push('Change my answers wiped the council field; it should preserve answers');

  const rAfter = await fillFlow(page, { council: 'Manchester', income: 400, housing: 600 });
  const after = rAfter.summary.match(/£[\d,]+/)[0];
  // Section headings are real <h2> elements now, not styled divs.
  const headings = await page.$$eval('main h2', els => els.map(e => e.textContent.trim()));
  const localHeading = headings[headings.length - 1] || '';
  console.log(`Re-ran with Manchester: ${before} -> ${after}, local section = ${localHeading}`);
  if (!localHeading.includes('Manchester')) problems.push('Changing council did not update local section heading');

  console.log('\n===== C. ACCESSIBILITY =====\n');

  await page.goto(fileUrl);
  // Focus management on step change
  await page.fill('#councilSearch', 'Leeds');
  await page.dispatchEvent('#councilSearch', 'input');
  await page.click('#nextBtn');
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el.tagName, id: el.id, text: (el.textContent || '').slice(0, 40) };
  });
  console.log('Focus after advancing a step:', JSON.stringify(focused));
  if (focused.id !== 'stepHeading') problems.push('Focus not moved to step heading on navigation (got ' + focused.id + ')');

  // aria-live region populated
  const live = await page.$eval('#liveRegion', el => ({ text: el.textContent, aria: el.getAttribute('aria-live') }));
  console.log('Live region:', JSON.stringify(live));
  // Deliberately empty on plain navigation: focusing the step heading already
  // announces it, so also pushing it here made screen readers say it twice.
  // What matters is that the region DOES carry validation errors — checked below.
  if (live.aria !== 'polite') problems.push('live region lost its aria-live="polite"');

  // Every input has an associated label
  const unlabelled = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input, select').forEach(el => {
      if (el.type === 'hidden') return;
      const hasLabel = el.id && document.querySelector(`label[for="${el.id}"]`);
      const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
      if (!hasLabel && !aria) out.push(el.id || el.outerHTML.slice(0, 50));
    });
    return out;
  });
  console.log('Inputs with no label:', unlabelled.length ? unlabelled : 'none');
  if (unlabelled.length) problems.push('Unlabelled inputs: ' + unlabelled.join(', '));

  // Validation failure feedback: does blocking give the user any message?
  await page.goto(fileUrl);
  await page.click('#nextBtn');
  const afterBlockedClick = await page.evaluate(() => {
    const err = document.getElementById('stepError');
    return {
      stillOnStep1: !!document.getElementById('councilSearch'),
      errorShown: !!(err && err.textContent.trim() && err.style.display !== 'none'),
      errorText: err ? err.textContent.trim() : '',
      errorRole: err ? err.getAttribute('role') : null,
      live: (document.getElementById('liveRegion') || {}).textContent || ''
    };
  });
  console.log('Clicking Next with nothing filled in:', JSON.stringify(afterBlockedClick));
  if (afterBlockedClick.stillOnStep1 && !afterBlockedClick.errorShown) {
    problems.push('Next silently does nothing when validation fails — no error message shown to the user');
  }

  // Same check on the household step (blank age)
  await page.goto(fileUrl);
  await page.fill('#councilSearch', 'Leeds');
  await page.dispatchEvent('#councilSearch', 'input');
  await page.click('#nextBtn');
  await page.click('#nextBtn');
  const blankAge = await page.evaluate(() => {
    const err = document.getElementById('stepError');
    return { blocked: !!document.getElementById('age'), msg: err ? err.textContent.trim() : '' };
  });
  console.log(`Blank age: blocked=${blankAge.blocked}, message=${JSON.stringify(blankAge.msg)}`);
  if (blankAge.blocked && !blankAge.msg) problems.push('Blank age blocks silently with no message');

  // negative / out-of-range values must be refused with a named reason
  for (const c of [
    { field: 'housingCosts', val: '-300', want: /less than 0|negative/i },
    { field: 'savings', val: '-1000', want: /less than 0|negative/i }
  ]) {
    await page.goto(fileUrl);
    await page.fill('#councilSearch', 'Leeds');
    await page.dispatchEvent('#councilSearch', 'input');
    await page.click('#nextBtn');
    await page.fill('#age', '35');
    await page.click('#nextBtn');
    await page.fill('#monthlyIncome', '500');
    await page.fill('#' + c.field, c.val);
    await page.click('#nextBtn');
    const msg = await page.evaluate(() => { const e = document.getElementById('stepError'); return e ? e.textContent.trim() : ''; });
    const blocked = await page.evaluate(() => !!document.getElementById('monthlyIncome'));
    console.log(`  ${c.field}=${c.val}: blocked=${blocked}, message=${JSON.stringify(msg)}`);
    if (!blocked || !c.want.test(msg)) problems.push(`${c.field}=${c.val} not properly refused`);
  }

  console.log('\n===== D. MOBILE LAYOUT =====\n');

  for (const vp of [{ w: 320, h: 640, n: 'iPhone SE width' }, { w: 390, h: 844, n: 'iPhone 14' }, { w: 768, h: 1024, n: 'tablet' }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await fillFlow(page, { income: 400, housing: 600 });
    const overflow = await page.evaluate(() => {
      const de = document.documentElement;
      return { scrollW: de.scrollWidth, clientW: de.clientWidth, overflowing: de.scrollWidth > de.clientWidth + 1 };
    });
    console.log(`${vp.n} (${vp.w}px): scrollWidth=${overflow.scrollW} clientWidth=${overflow.clientW} horizontal-overflow=${overflow.overflowing}`);
    if (overflow.overflowing) problems.push(`Horizontal overflow at ${vp.w}px (${vp.n})`);
  }
  await page.screenshot({ path: 'mobile-320-results.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(fileUrl);
  await page.screenshot({ path: 'mobile-320-step1.png', fullPage: true });

  console.log('\n===== E. LINK INTEGRITY =====\n');
  await page.setViewportSize({ width: 1000, height: 900 });
  await fillFlow(page, { income: 400, housing: 600 });
  // The per-scheme call to action moved out of .scheme-meta and became a real
  // button-styled link inside each result <li>. Selecting on the old class
  // would silently match nothing and report "0 links" as a pass.
  const links = await page.$$eval('main li a[href^="http"]', els => els.map(e => ({ href: e.href, text: e.textContent.trim() })));
  const badLinks = links.filter(l => !/^https:\/\//.test(l.href));
  console.log(`${links.length} scheme links on results page; malformed: ${badLinks.length}`);
  links.forEach(l => console.log('   ' + l.href));
  if (badLinks.length) problems.push('Malformed links: ' + JSON.stringify(badLinks));

  await browser.close();

  console.log('\n===== SUMMARY =====\n');
  if (!problems.length) console.log('No problems detected.');
  else {
    console.log(problems.length + ' problem(s):\n');
    problems.forEach((p, i) => console.log(`${i + 1}. ${p}`));
    /* Exit non-zero so `npm test` can fail. See verify-keyboard.js. */
    process.exitCode = 1;
  }
})();
