/* Browser checks for the "what if" panel and its cliff-edge chart
   (explore-ui.js, driving explore-core.js).

   Exits non-zero when it finds something. That is not automatic — the maths
   suites always exited 0 until 19 Aug 2026 and the three browser suites until
   21 Aug, which made every one of them incapable of failing. Before folding
   any new check in here, break the thing it tests on purpose and watch this
   go red.

   What this suite is FOR, so nobody trims it back to a smoke test: the panel
   makes claims about pound figures ("Universal Credit stops once your savings
   go above £16,000"). Those come from primary legislation, so they can be
   asserted exactly rather than approximately, and a check that only asserts
   "a panel appeared" would have let all four of the calculation errors found
   on 18 August through. The exact figures below are the point. */

const { chromium } = require('playwright');
const path = require('path');

const fileUrl = 'file://' + path.resolve(__dirname, 'index.html');
const problems = [];

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    problems.push(label + (detail ? ' — ' + detail : ''));
  }
}

/* Walks the wizard to the results screen. The council search resolves on
   input rather than on a native datalist pick, so the event is dispatched
   explicitly — same approach as test.js and verify-ui.js. */
async function toResults(page, o) {
  await page.goto(fileUrl);
  await page.fill('#councilSearch', o.council || 'Leeds');
  await page.dispatchEvent('#councilSearch', 'input');
  await page.click('#nextBtn');
  await page.fill('#age', String(o.age ?? 29));
  await page.fill('#adults', String(o.adults ?? 1));
  await page.fill('#children', String(o.children ?? 2));
  await page.click('#nextBtn');
  await page.fill('#monthlyIncome', String(o.income ?? 1100));
  await page.fill('#savings', String(o.savings ?? 500));
  await page.fill('#housingCosts', String(o.housing ?? 750));
  await page.click('#nextBtn');
  for (const id of (o.checks || [])) await page.check('#' + id);
  await page.click('#nextBtn');
}

/* Drives the slider through the DOM property rather than by dragging: a real
   pointer drag lands on whichever step the pixel maths happens to hit, which
   makes "is the £16,000 boundary reported exactly" untestable. Keyboard
   stepping is exercised separately, further down. */
async function setSlider(page, value) {
  await page.evaluate(v => {
    const el = document.getElementById('exploreSlider');
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

const text = async (page, sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => problems.push('PAGE ERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push('CONSOLE ERROR: ' + m.text()); });

  /* ---------------------------------------------------------------- */
  console.log('\n===== A. THE PANEL APPEARS WHERE IT SHOULD =====\n');

  await toResults(page, {});
  check('Panel renders on a results screen with matches', await page.$('#explorePanel') !== null);
  check('Slider renders', await page.$('#exploreSlider') !== null);
  check('Chart renders', await page.$('#exploreChart') !== null);

  /* The no-results screen is the worst moment this product can produce, and
     renderNoResults exists specifically to stop it showing a £0 headline. A
     flat £0 chart underneath would undo that. */
  await toResults(page, { income: 99000, savings: 900000, age: 40, children: 0, council: 'Reading' });
  check('Panel absent on the nothing-found screen', await page.$('#explorePanel') === null,
    'a flat £0 chart there undoes the point of renderNoResults()');

  /* ---------------------------------------------------------------- */
  console.log('\n===== B. EXPLORING DOES NOT CHANGE THE ANSWERS =====\n');

  await toResults(page, {});
  const summaryBefore = await text(page, '.results-summary');
  await setSlider(page, 4000);
  const summaryAfter = await text(page, '.results-summary');
  check('The headline results are untouched by the slider', summaryBefore === summaryAfter,
    `"${summaryBefore.slice(0, 60)}" became "${summaryAfter.slice(0, 60)}"`);

  const stateIncome = await page.evaluate(() => state.input.monthlyIncome);
  check('state.input.monthlyIncome is untouched by the slider', stateIncome === 1100,
    'got ' + stateIncome);

  /* Going back and returning must not leave the slider parked on 4000. */
  await page.click('#restartBtn');
  for (let i = 0; i < 4; i++) await page.click('#nextBtn');
  const resetOnReturn = await page.evaluate(() => document.getElementById('exploreSlider').value);
  check('Slider returns to the answers after going back through the wizard',
    Number(resetOnReturn) === 1100, 'got ' + resetOnReturn);

  /* ---------------------------------------------------------------- */
  console.log('\n===== C. THE £16,000 CAPITAL LIMIT, EXACTLY =====\n');

  /* reg 18, Universal Credit Regs 2013: capital above £16,000 ends the award
     outright. Between £6,000 and £16,000 the tariff in reg 72 steps the award
     down £4.35 at a time — forty little drops that are NOT cliffs, because
     you still qualify on both sides of every one. If this check ever reports
     a cliff at £6,000, the eligible-set test in findCliffs has been replaced
     by something that watches the cash total instead. */
  await toResults(page, {});
  await page.click('[data-explore-axis="savings"]');
  check('Savings axis renders a slider', await page.$('#exploreSlider') !== null);

  const savingsCliffs = await page.evaluate(() =>
    exploreCache.savings.cliffs.map(c => ({ at: c.at, name: c.name, exact: c.exact })));
  console.log('  cliffs found: ' + JSON.stringify(savingsCliffs));

  const uc = savingsCliffs.find(c => /Universal Credit/i.test(c.name));
  check('Universal Credit is reported as stopping on the savings axis', !!uc);
  check('It stops at exactly £16,000', uc && uc.at === 16000, uc ? 'got ' + uc.at : 'not found');
  check('That boundary is reported as exact, not "around"', uc && uc.exact === true);
  check('No cliff is reported at the £6,000 tariff threshold',
    !savingsCliffs.some(c => c.at >= 5900 && c.at <= 6100),
    'the tariff steps the award down, it does not end it');

  const cliffListText = await text(page, '#explorePanel ul');
  check('The chart and the text list agree', /£16,000/.test(cliffListText), cliffListText.slice(0, 140));
  check('The cliff is worded about the scheme, not the reader',
    /Universal Credit<\/strong> stops once your savings go above/.test(
      await page.innerHTML('#explorePanel ul')),
    'copy must never read as advice to hold less');

  /* The panel must not tell anyone to spend savings down. findNearMiss() in
     explore-core.js refuses to probe savings for exactly this reason; the UI
     must not reintroduce it in prose. */
  const panelProse = await text(page, '#explorePanel');
  check('No suggestion the reader should have less money',
    !/(you would qualify if you had|spend|reduce your savings|earn less|if you had less)/i.test(panelProse),
    'deprivation of capital, reg 50 UC Regs 2013');

  /* ---------------------------------------------------------------- */
  console.log('\n===== D. CROSSING A CLIFF SAYS WHAT IS LOST =====\n');

  await setSlider(page, 15950);
  const justUnder = await text(page, '#exploreReadout');
  await setSlider(page, 16050);
  const justOver = await text(page, '#exploreReadout');

  check('Below the limit, Universal Credit is not flagged as lost',
    !/no longer be listed/i.test(justUnder), justUnder.slice(0, 120));
  check('Above the limit, it is named as lost',
    /no longer be listed for .*Universal Credit/i.test(justOver), justOver.slice(0, 160));
  check('The two sides of the cliff show different cash figures',
    justUnder !== justOver);

  /* ---------------------------------------------------------------- */
  console.log('\n===== E. RESET =====\n');

  const resetDisabledAfterMove = await page.evaluate(() => document.getElementById('exploreResetBtn').disabled);
  check('Reset is enabled once the slider has moved', resetDisabledAfterMove === false);
  await page.click('#exploreResetBtn');
  const afterReset = await page.evaluate(() => ({
    value: Number(document.getElementById('exploreSlider').value),
    disabled: document.getElementById('exploreResetBtn').disabled
  }));
  check('Reset returns the slider to the answers', afterReset.value === 500, 'got ' + afterReset.value);
  check('Reset disables itself once back at the start', afterReset.disabled === true);

  /* ---------------------------------------------------------------- */
  console.log('\n===== F. KEYBOARD AND SCREEN READER =====\n');

  await toResults(page, {});

  const labelled = await page.evaluate(() => {
    const el = document.getElementById('exploreSlider');
    const lbl = document.querySelector('label[for="exploreSlider"]');
    return { hasLabel: !!lbl, name: el.name, valuetext: el.getAttribute('aria-valuetext'),
             describedby: el.getAttribute('aria-describedby') };
  });
  check('Slider has a <label for>', labelled.hasLabel);
  check('Slider has a name attribute', !!labelled.name);
  check('Slider announces money, not a bare number', labelled.valuetext === '£1,100',
    'got ' + labelled.valuetext);
  check('Slider points at its hint', labelled.describedby === 'exploreSliderHint');

  const chartA11y = await page.evaluate(() => {
    const el = document.getElementById('exploreChart');
    return { role: el.getAttribute('role'), label: el.getAttribute('aria-label'),
             hasText: el.querySelectorAll('text').length };
  });
  check('Chart is exposed as an image with a description',
    chartA11y.role === 'img' && (chartA11y.label || '').length > 40, chartA11y.label);
  check('Chart carries no <text> (it would render ~7px on a phone)', chartA11y.hasText === 0);

  /* Arrow keys must move it, and by a useful amount — a step of 1 on a £7,000
     axis is 7,000 presses to cross the range. */
  await page.focus('#exploreSlider');
  await page.keyboard.press('ArrowRight');
  const afterArrow = await page.evaluate(() => ({
    value: Number(document.getElementById('exploreSlider').value),
    valuetext: document.getElementById('exploreSlider').getAttribute('aria-valuetext')
  }));
  check('Arrow key steps the slider by the sweep step', afterArrow.value === 1125,
    'got ' + afterArrow.value);
  check('aria-valuetext keeps up with the arrow key', afterArrow.valuetext === '£1,125',
    'got ' + afterArrow.valuetext);

  /* The readout must NOT be a live region: a range input already announces
     its own aria-valuetext on every arrow key, so a second live region on the
     same gesture talks over it. The short summary goes to the app's single
     sr-only region instead, debounced. */
  const readoutLive = await page.evaluate(() =>
    document.getElementById('exploreReadout').getAttribute('aria-live'));
  check('The readout is not itself a live region', readoutLive === null, 'got ' + readoutLive);

  await page.waitForFunction(() => document.getElementById('liveRegion').textContent.includes('£1,125'),
    null, { timeout: 3000 }).catch(() => {});
  const announced = await text(page, '#liveRegion');
  check('The shared live region gets a short summary after the slider settles',
    /£1,125/.test(announced) && /cash support/.test(announced), 'got "' + announced + '"');

  /* ---------------------------------------------------------------- */
  console.log('\n===== G. THE SLIDER AND THE CHART CANNOT DISAGREE =====\n');

  /* An income of £1,234 is not a multiple of the £25 sweep step. The browser
     silently snaps the thumb; explore-ui.js has to snap with it, or every
     figure the panel prints is drawn from a different point than the one the
     thumb is sitting on. */
  await toResults(page, { income: 1234 });
  const snapped = await page.evaluate(() => ({
    slider: Number(document.getElementById('exploreSlider').value),
    state: exploreState.value,
    disabled: document.getElementById('exploreResetBtn').disabled
  }));
  check('An off-step income snaps the same way in both places',
    snapped.slider === snapped.state, `slider ${snapped.slider} vs state ${snapped.state}`);
  check('And still counts as the starting point', snapped.disabled === true);

  /* The headline figure at the top of the page and the panel's own figure for
     the same household are the same number, rounded the same way. Two
     different figures for one household on one screen is the single most
     damaging thing this panel could do. */
  await toResults(page, {});
  const agree = await page.evaluate(() => {
    const headline = document.querySelector('.results-summary .text-4xl').textContent.trim();
    const panel = document.querySelector('#exploreReadout .text-2xl').textContent.trim();
    return { headline, panel };
  });
  check('Panel figure matches the headline figure at the start point',
    agree.headline === agree.panel, `headline ${agree.headline} vs panel ${agree.panel}`);

  /* ---------------------------------------------------------------- */
  console.log('\n===== H. A PENSION-AGE HOUSEHOLD =====\n');

  /* Council Tax Reduction is kind "bill", so it never enters the cash total —
     which is exactly the case that broke the near-miss gate once already.
     A cliff there must still be reported even though the cash line never
     moves for it. */
  await toResults(page, { age: 70, adults: 2, children: 0, income: 900, savings: 3000,
    housing: 0, council: 'Birmingham' });
  const pensionPanel = await page.$('#explorePanel');
  if (!pensionPanel) {
    check('Pension-age household gets a panel', false, 'none rendered');
  } else {
    const savingsAxisCliffs = await page.evaluate(() => {
      document.querySelector('[data-explore-axis="savings"]').click();
      return exploreCache.savings.cliffs.map(c => ({ at: c.at, name: c.name, kind: c.kind }));
    });
    console.log('  cliffs found: ' + JSON.stringify(savingsAxisCliffs));
    check('Non-cash schemes still register as cliffs',
      savingsAxisCliffs.some(c => c.kind === 'bill' || c.kind === 'in-kind') ||
      savingsAxisCliffs.length > 0,
      'kinds: ' + savingsAxisCliffs.map(c => c.kind).join(','));

    const html = await page.innerHTML('#explorePanel');
    if (savingsAxisCliffs.some(c => c.kind === 'bill')) {
      check('A bill reduction is not described as money paid to you',
        /lowers a bill rather than being paid to you/.test(html));
    }
  }

  /* ---------------------------------------------------------------- */
  console.log('\n===== I. INCOME CLIFFS, EXACTLY =====\n');

  /* The savings axis has one famous boundary. The income axis has several
     quieter ones, and they are the ones most likely to be silently lost:
     Universal Credit and Pension Credit both TAPER to nil on income, and
     explore-core.js deliberately does not call a taper reaching nil a cliff.
     If the only schemes on this axis were those two, the income tab would
     correctly show "nothing stops" forever and nobody would notice it had
     stopped working. These three come from hard cut-offs in data/schemes.js
     and are computed, not copied — change the rule and this goes red.

     Each figure is the LAST income that still qualifies, not the first that
     does not, because that is the number bisect() is specified to return and
     the one the copy is written around ("stops once your income goes above
     £1,599"). */
  const incomeCliffs = async (o) => {
    await toResults(page, o);
    if (!(await page.$('#explorePanel'))) return null;
    return page.evaluate(() =>
      (exploreCache.monthlyIncome || { cliffs: [] }).cliffs.map(c => c.name + ' @ ' + c.at + (c.exact ? '' : ' approx')));
  };

  // Warm Home Discount: monthlyIncome < 1200 + children * 200, with UC.
  let found = await incomeCliffs({ checks: ['receivingUC'] });
  console.log('  single parent, 2 children, on UC: ' + JSON.stringify(found));
  check('Warm Home Discount stops at £1,599 for two children',
    found && found.indexOf('Warm Home Discount @ 1599') !== -1, JSON.stringify(found));

  found = await incomeCliffs({ children: 0, adults: 1, age: 45, income: 700, savings: 0, housing: 550,
    checks: ['hasDisabilityOrHealthCondition'] });
  console.log('  single adult, no children, disability: ' + JSON.stringify(found));
  check('and at £1,199 with no children',
    found && found.indexOf('Warm Home Discount @ 1199') !== -1, JSON.stringify(found));

  // Healthy Start: on UC, monthly earned income of £408 or less.
  found = await incomeCliffs({ age: 26, children: 1, income: 400, savings: 0, housing: 500,
    checks: ['receivingUC', 'pregnantOrChildUnder4'] });
  console.log('  pregnant, 1 child, on UC: ' + JSON.stringify(found));
  check('Healthy Start stops at £408', found && found.indexOf('Healthy Start @ 408') !== -1,
    JSON.stringify(found));

  /* A taper reaching nil is not a cliff. Universal Credit runs out on income
     for this household and must NOT be reported as stopping — a warning there
     would be alarming and false, because nothing is lost at the point a £0
     award stops being listed. */
  check('A Universal Credit taper reaching nil is not reported as a cliff',
    found && !found.some(f => /Universal Credit/.test(f)), JSON.stringify(found));

  await browser.close();

  console.log('\n===== SUMMARY =====\n');
  if (problems.length) {
    console.log(`${problems.length} problem(s):`);
    problems.forEach(p => console.log('  - ' + p));
    process.exit(1);
  }
  console.log('No problems found.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
