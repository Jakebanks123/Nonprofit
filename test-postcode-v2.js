const { chromium } = require('playwright');
const path = require('path');

const testPostcodes = [
  { input: 'LS1 4DY', expectCouncil: 'leeds' },
  { input: 'B1 1AA', expectCouncil: 'birmingham' },
  { input: 'E14 5AA', expectCouncil: 'tower-hamlets' },
  { input: 'NW1 8AA', expectCouncil: 'camden' },
  { input: 'SW1A 1AA', expectCouncil: 'westminster' },
  { input: 'N16 5AA', expectCouncil: 'hackney' },
  { input: 'N1 6AA', expectCouncil: 'hackney' },   // sector-level override case
  { input: 'N1 1AA', expectCouncil: null },        // outcode-majority is Islington, not a pilot council
  { input: 'M1 1AA', expectCouncil: 'manchester' },
  { input: 'L1 1AA', expectCouncil: 'liverpool' },
  { input: 'S1 1AA', expectCouncil: 'sheffield' },
  { input: 'NG1 1AA', expectCouncil: 'nottingham' },
  { input: 'NE1 1AA', expectCouncil: 'newcastle' },
  { input: 'BS1 1AA', expectCouncil: 'bristol' },
  { input: 'WC1A 1AA', expectCouncil: 'camden' },
  { input: 'RG1 1AA', expectCouncil: null },        // Reading - real council, not a pilot one
  { input: 'ZZ99 9AA', expectCouncil: null },        // bogus
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const fileUrl = 'file://' + path.resolve(__dirname, 'index.html');

  for (const tc of testPostcodes) {
    await page.goto(fileUrl);
    await page.fill('#postcode', tc.input);
    await page.click('#lookupBtn');
    await page.waitForFunction(
      () => document.getElementById('lookupStatus').textContent.trim().length > 0 &&
            !document.getElementById('lookupStatus').textContent.includes('Looking up'),
      { timeout: 10000 }
    );
    const statusText = await page.textContent('#lookupStatus');
    const searchValue = await page.$eval('#councilSearch', el => el.value);
    console.log(`"${tc.input}" -> councilSearch="${searchValue}" (expected council id "${tc.expectCouncil || '(none/other)'}")`);
    console.log('     status:', statusText.trim());
  }

  await browser.close();
})();
