const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push('pageerror: ' + err.message));
  const fileUrl = 'file://' + path.resolve(__dirname, 'index.html');

  // Test 1: case-insensitive exact match resolves and normalizes casing
  await page.goto(fileUrl);
  await page.fill('#councilSearch', 'leeds');
  await page.waitForTimeout(100);
  let statusText = await page.textContent('#councilSearchStatus');
  let fieldValue = await page.$eval('#councilSearch', el => el.value);
  console.log('Test 1 (lowercase "leeds"): field value =', JSON.stringify(fieldValue), '| status =', statusText.trim());

  // Test 2: partial text, no exact match yet -> should NOT resolve, Next should be blocked
  await page.goto(fileUrl);
  await page.fill('#councilSearch', 'Lee');
  await page.waitForTimeout(100);
  statusText = await page.textContent('#councilSearchStatus');
  await page.click('#nextBtn');
  const stillOnLocation = await page.$('#councilSearch') !== null;
  console.log('Test 2 (partial "Lee"): status =', statusText.trim(), '| blocked from advancing:', stillOnLocation);

  // Test 3: non-pilot council typed directly (Reading) -> resolves to "other" + real name shown
  await page.goto(fileUrl);
  await page.fill('#councilSearch', 'Reading');
  await page.waitForTimeout(100);
  statusText = await page.textContent('#councilSearchStatus');
  console.log('Test 3 ("Reading"): status =', statusText.trim());

  // Test 4: gibberish text -> no match, no crash, Next still blocked
  await page.goto(fileUrl);
  await page.fill('#councilSearch', 'Not A Real Council Name');
  await page.waitForTimeout(100);
  statusText = await page.textContent('#councilSearchStatus');
  await page.click('#nextBtn');
  const stillOnLocation2 = await page.$('#councilSearch') !== null;
  console.log('Test 4 (gibberish): status =', statusText.trim(), '| blocked from advancing:', stillOnLocation2);

  // Test 5: clearing the field after a valid match clears state (Next blocked again)
  await page.goto(fileUrl);
  await page.fill('#councilSearch', 'Leeds');
  await page.waitForTimeout(100);
  await page.fill('#councilSearch', '');
  await page.waitForTimeout(100);
  statusText = await page.textContent('#councilSearchStatus');
  await page.click('#nextBtn');
  const stillOnLocation3 = await page.$('#councilSearch') !== null;
  console.log('Test 5 (cleared after match): status =', JSON.stringify(statusText.trim()), '| blocked from advancing:', stillOnLocation3);

  // Test 6: full happy path end-to-end via search field only (no postcode)
  await page.goto(fileUrl);
  await page.fill('#councilSearch', 'Sheffield');
  await page.waitForTimeout(100);
  await page.click('#nextBtn');
  const advancedToHousehold = await page.$('#age') !== null;
  console.log('Test 6 (Sheffield -> Next): advanced to household step:', advancedToHousehold);

  await browser.close();

  if (errors.length) {
    console.log('PAGE ERRORS:', errors);
    process.exit(1);
  }
  console.log('Done — no page errors.');
})();
