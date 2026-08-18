const { chromium } = require('playwright');
const path = require('path');

const scenarios = [
  {
    name: 'Scenario A: unemployed single adult, Leeds, renting, low income',
    councilSearch: 'Leeds', age: '32', adults: '1', children: '0',
    employment: 'unemployed', monthlyIncome: '400', savings: '200', housingCosts: '600',
    checks: { receivingUC: false, receivingPensionCredit: false, hasDisabilityOrHealthCondition: false, pregnantOrChildUnder4: false }
  },
  {
    name: 'Scenario B: retired couple, Birmingham, low income',
    councilSearch: 'Birmingham', age: '70', adults: '2', children: '0',
    employment: 'retired', monthlyIncome: '900', savings: '3000', housingCosts: '0',
    checks: { receivingUC: false, receivingPensionCredit: false, hasDisabilityOrHealthCondition: false, pregnantOrChildUnder4: false }
  },
  {
    name: 'Scenario C: high income couple, no children, council not listed (Reading)',
    councilSearch: 'Reading', age: '38', adults: '2', children: '0',
    employment: 'employed', monthlyIncome: '6500', savings: '30000', housingCosts: '1400',
    checks: { receivingUC: false, receivingPensionCredit: false, hasDisabilityOrHealthCondition: false, pregnantOrChildUnder4: false }
  },
  {
    name: 'Scenario D: single parent, 2 kids, employed part-time, Leeds',
    councilSearch: 'Leeds', age: '29', adults: '1', children: '2',
    employment: 'employed', monthlyIncome: '1100', savings: '500', housingCosts: '750',
    checks: { receivingUC: true, receivingPensionCredit: false, hasDisabilityOrHealthCondition: false, pregnantOrChildUnder4: false }
  }
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('pageerror: ' + err.message));

  const fileUrl = 'file://' + path.resolve(__dirname, 'index.html');

  for (const s of scenarios) {
    await page.goto(fileUrl);
    // Step 1: location — use the council search field (type + programmatically
    // fire an input event, since datalist selection isn't a native Playwright action)
    await page.fill('#councilSearch', s.councilSearch);
    await page.dispatchEvent('#councilSearch', 'input');
    await page.click('#nextBtn');
    // Step 2: household
    await page.fill('#age', s.age);
    await page.fill('#adults', s.adults);
    await page.fill('#children', s.children);
    await page.click('#nextBtn');
    // Step 3: income
    await page.selectOption('#employment', s.employment);
    await page.fill('#monthlyIncome', s.monthlyIncome);
    await page.fill('#savings', s.savings);
    await page.fill('#housingCosts', s.housingCosts);
    await page.click('#nextBtn');
    // Step 4: circumstances
    for (const [key, val] of Object.entries(s.checks)) {
      const checked = await page.isChecked('#' + key);
      if (checked !== val) await page.click('#' + key);
    }
    await page.click('#nextBtn');

    const summary = await page.textContent('.results-summary');
    const schemeNames = await page.$$eval('.scheme-name', els => els.map(e => e.textContent));
    const councilNote = await page.$$eval('.council-missing-note', els => els.map(e => e.textContent));

    console.log('=== ' + s.name + ' ===');
    console.log('Summary:', summary.replace(/\s+/g, ' ').trim());
    console.log('Matched schemes:', schemeNames);
    if (councilNote.length) console.log('Council note shown:', councilNote[0].slice(0, 60) + '...');
    console.log('');
  }

  await browser.close();

  if (errors.length) {
    console.log('CONSOLE/PAGE ERRORS DETECTED:');
    errors.forEach(e => console.log(' - ' + e));
    process.exit(1);
  } else {
    console.log('No console or page errors across all scenarios.');
  }
})();
