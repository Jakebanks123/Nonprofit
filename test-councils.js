const { chromium } = require('playwright');
const path = require('path');

const newCouncils = ['Manchester','Liverpool','Sheffield','Bristol, City of','Newcastle upon Tyne','Nottingham','Westminster','Hackney','Camden','Tower Hamlets'];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('pageerror: ' + err.message));
  const fileUrl = 'file://' + path.resolve(__dirname, 'index.html');

  for (const council of newCouncils) {
    await page.goto(fileUrl);
    await page.fill('#councilSearch', council);
    await page.click('#nextBtn');
    await page.fill('#age', '35');
    await page.fill('#adults', '1');
    await page.fill('#children', '1');
    await page.click('#nextBtn');
    await page.selectOption('#employment', 'unemployed');
    await page.fill('#monthlyIncome', '500');
    await page.fill('#savings', '100');
    await page.fill('#housingCosts', '500');
    await page.click('#nextBtn');
    await page.click('#nextBtn'); // circumstances, all unchecked
    const schemeNames = await page.$$eval('.scheme-name', els => els.map(e => e.textContent));
    console.log(council + ':', schemeNames.filter(n => !['Universal Credit','Council Tax Support (Reduction)'].includes(n)));
  }

  // Now test the postcode lookup UI path (network likely restricted in this sandbox)
  await page.goto(fileUrl);
  await page.fill('#postcode', 'E14 5AA');
  await page.click('#lookupBtn');
  await page.waitForTimeout(3000);
  const statusText = await page.textContent('#lookupStatus');
  console.log('Postcode lookup status text:', statusText.trim());

  // empty postcode click
  await page.goto(fileUrl);
  await page.click('#lookupBtn');
  const emptyStatus = await page.textContent('#lookupStatus');
  console.log('Empty postcode status text:', emptyStatus.trim());

  await browser.close();

  if (errors.length) {
    console.log('ERRORS:');
    errors.forEach(e => console.log(' - ' + e));
    process.exit(1);
  } else {
    console.log('No console/page errors.');
  }
})();
