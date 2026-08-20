/* Maths verification.
   Each case states what REAL DWP 2026/27 rules would produce (computed by hand,
   independently of the app's code), then compares against what the app returns.
   Purpose is to find structural modelling errors, not penny-level rate drift.

   Rates uprated 6 April 2026 (Commons Library CBP-10403). The two-child limit
   was removed from the same date by the Universal Credit (Removal of Two Child
   Limit) Act 2026, so every child attracts an element. */

// Load the split files the same way the browser does. Classic <script> tags
// share one global lexical scope, so concatenating them into a single vm
// script is the faithful equivalent — loading them separately would put each
// file's top-level `const` in its own scope, which the browser doesn't do.
const vm = require('vm');
const fs = require('fs');
const ctx = { console, setTimeout, clearTimeout, fetch: undefined,
  AbortController: function () { this.abort = () => {}; this.signal = null; } };
ctx.globalThis = ctx;
vm.createContext(ctx);
const combined = ['data/postcodes.js', 'data/schemes.js', 'explore-core.js', 'app.js']
  .map(f => fs.readFileSync(__dirname + '/' + f, 'utf8'))
  .join('\n;\n')
  + `\n;Object.assign(globalThis, { NATIONAL_SCHEMES, LOCAL_SCHEMES, COUNCILS,
      ALL_ENGLAND_COUNCILS, ENGLAND_POSTCODE_DATA, matchOfflineCouncil,
      resolveCouncilByName, sanitiseInput, gbp, evaluateAll, sweep, bisect, findCliffs, findNearMiss, SWEEP_AXES, RATES_TAX_YEAR, ukTaxYearOf, ratesStaleness });`;
vm.runInContext(combined, ctx, { filename: 'app-combined.js' });
const app = ctx;

const scheme = id => app.NATIONAL_SCHEMES.find(s => s.id === id);

function baseInput(over) {
  return Object.assign({
    postcode: "", council: "leeds", detectedDistrict: "", age: 35,
    adults: 1, children: 0, employment: "employed",
    monthlyIncome: 0, savings: 0, housingCosts: 0,
    receivingUC: false, receivingPensionCredit: false,
    hasDisabilityOrHealthCondition: false, pregnantOrChildUnder4: false
  }, over);
}

const findings = [];
function check(label, actual, expected, tolerance, note) {
  const a = actual === null ? null : Math.round(actual * 100) / 100;
  const e = expected === null ? null : Math.round(expected * 100) / 100;
  let pass;
  if (a === null || e === null) pass = (a === e);
  else pass = Math.abs(a - e) <= tolerance;
  console.log(`${pass ? 'MATCH ' : 'DIFF  '} ${label}`);
  console.log(`        app=${a}  hand-computed=${e}${note ? '  | ' + note : ''}`);
  if (!pass) findings.push({ label, app: a, expected: e, note });
  return pass;
}

function ucAmount(input) {
  const r = scheme('universal-credit').evaluate(input);
  return r.eligible ? r.amount.value : null;
}

console.log('=========== UNIVERSAL CREDIT ===========\n');

/* CASE 1 — single adult 25+, NO children, no disability, renting.
   REAL RULE: the UC work allowance is only available to claimants who have
   a child OR limited capability for work. A single childless adult with no
   health condition gets NO work allowance — every pound of earnings is
   tapered at 55%.
   Hand-computed: standard 424.90 + housing 600 = 1024.90 max award.
   Earnings 400 taper fully: 400 * 0.55 = 220. Award = 1024.90 - 220 = 804.90 */
check('UC: single childless adult, £400 earnings, £600 rent',
  ucAmount(baseInput({ age: 35, adults: 1, children: 0, monthlyIncome: 400, housingCosts: 600 })),
  804.90, 0.5,
  'no work allowance: childless and no limited capability for work');

/* CASE 2 — single parent, 2 children, renting.
   REAL RULE: has children -> work allowance applies. With housing costs the
   2026/27 lower work allowance is 427.
   Child elements 2026/27: 303.94 each, or 351.88 for a first child born before
   6 April 2017. This case leaves that flag off, so both children are 303.94. */
{
  const childRate = 303.94;
  const maxAward = 424.90 + 2 * childRate + 750;
  const expected = maxAward - Math.max(0, 1100 - 427) * 0.55;
  check('UC: single parent 2 kids, £1100 earnings, £750 rent',
    ucAmount(baseInput({ age: 29, adults: 1, children: 2, monthlyIncome: 1100, housingCosts: 750 })),
    expected, 0.5, 'work allowance correctly applied here (claimant has children)');
}

/* CASE 3 — savings between £6,000 and £16,000.
   REAL RULE: capital £6,000-£16,000 produces "tariff income" of £4.35 per
   month for each £250 (or part) above £6,000, deducted from the award.
   Hand-computed for £10,000 savings: (10000-6000)/250 = 16 steps
   -> 16 * 4.35 = 69.60/month deduction.
   Single parent as case 2 so the rest of the maths is identical. */
{
  const maxAward = 424.90 + 2 * 303.94 + 750;
  const afterTaper = maxAward - Math.max(0, 1100 - 427) * 0.55;
  const expected = afterTaper - 69.60;
  check('UC: as above but £10,000 savings (tariff income)',
    ucAmount(baseInput({ age: 29, adults: 1, children: 2, monthlyIncome: 1100, housingCosts: 750, savings: 10000 })),
    expected, 0.5, 'tariff income on capital £6k-£16k');
}

/* CASE 4 — reg 18 disqualifies only where capital EXCEEDS £16,000.
   Exactly £16,000 must still be eligible; £16,001 must not. */
check('UC: £16,001 savings must be ineligible',
  ucAmount(baseInput({ monthlyIncome: 400, housingCosts: 600, savings: 16001 })),
  null, 0, 'reg 18 cutoff is "exceeds", not "reaches"');

{
  // exactly £16,000: eligible, with tariff income on the full £10,000 excess
  const maxAward = 424.90 + 600;
  const tariff = Math.ceil((16000 - 6000) / 250) * 4.35; // 40 * 4.35 = 174.00
  const expected = maxAward - (400 * 0.55) - tariff;     // no work allowance: childless
  check('UC: exactly £16,000 savings must still be eligible',
    ucAmount(baseInput({ monthlyIncome: 400, housingCosts: 600, savings: 16000 })),
    expected, 0.5, 'boundary case — eligible, but heavily reduced by tariff income');
}

/* CASE 4c — first child born before 6 April 2017 attracts the higher element
   (351.88 rather than 303.94). Same household as case 2 otherwise, so the
   difference should be exactly 351.88 - 303.94 = 47.94. */
{
  const maxAward = 424.90 + 351.88 + 303.94 + 750;
  const expected = maxAward - Math.max(0, 1100 - 427) * 0.55;
  check('UC: single parent 2 kids, eldest born pre-6 Apr 2017',
    ucAmount(baseInput({ age: 29, adults: 1, children: 2, monthlyIncome: 1100,
                         housingCosts: 750, eldestChildBornBefore2017: true })),
    expected, 0.5, 'higher first-child element');
}

/* CASE 4d — the two-child limit was removed from 6 April 2026, so a third
   child must still add an element. Guards against anyone reinstating a cap. */
{
  const two = ucAmount(baseInput({ age: 29, adults: 1, children: 2, monthlyIncome: 1100, housingCosts: 750 }));
  const three = ucAmount(baseInput({ age: 29, adults: 1, children: 3, monthlyIncome: 1100, housingCosts: 750 }));
  check('UC: third child still adds an element (two-child limit removed)',
    three - two, 303.94, 0.5, 'Removal of Two Child Limit Act 2026');
}

/* CASE 5 — over State Pension age should not get UC */
check('UC: age 70 must be ineligible (pension age)',
  ucAmount(baseInput({ age: 70, monthlyIncome: 400, housingCosts: 600 })),
  null, 0, 'UC is working-age only');

console.log('\n=========== PENSION CREDIT ===========\n');

function pcAmount(input) {
  const r = scheme('pension-credit').evaluate(input);
  return r.eligible ? r.amount.value : null;
}

/* CASE 6 — couple over pension age, low income.
   REAL RULE 2026/27: Guarantee Credit tops income up to £363.25/wk (couple).
   Hand-computed: income £900/mo = 900*12/52 = £207.69/wk.
   Top-up = 363.25 - 207.69 = £155.56/wk */
{
  const wk = 900 * 12 / 52;
  const expected = (363.25 - wk) * 52 / 12;
  check('PC: couple 70, £900/mo income',
    pcAmount(baseInput({ age: 70, adults: 2, monthlyIncome: 900 })),
    expected, 0.5, 'guarantee credit top-up');
}

/* CASE 7 — single pensioner with capital above £10,000.
   REAL RULE: deemed income of £1/wk per £500 (or part) above £10,000 is
   added to income before the top-up is worked out.
   Hand-computed for £15,000 savings, £600/mo income:
   income 600*12/52 = £138.46/wk; deemed = (15000-10000)/500 = 10 -> £10/wk.
   Total assessed = £148.46/wk. Top-up = 238.00 - 148.46 = £89.54/wk. */
{
  const wk = 600 * 12 / 52;
  const deemed = 10;
  const expected = (238.00 - (wk + deemed)) * 52 / 12;
  check('PC: single 70, £600/mo income, £15,000 savings',
    pcAmount(baseInput({ age: 70, adults: 1, monthlyIncome: 600, savings: 15000 })),
    expected, 0.5, 'deemed income on capital above £10k');
}

console.log('\n=========== COUNCIL TAX SUPPORT ===========\n');

function ctsResult(input) {
  return scheme('council-tax-support').evaluate(input);
}
// Only meaningful for the pension-age branch, which is the only branch that
// ever returns an amount now. Working-age results are checked directly
// against ctsResult() below instead.
function ctsAmount(input) {
  const r = ctsResult(input);
  return (r.eligible && r.amount) ? r.amount.value : null;
}

/* CASE 9a — working-age claimants get no figure at all, on any income or
   savings: every English billing authority runs its own working-age scheme
   (checked against Shelter Legal England and several councils' 2025/26 and
   2026/27 scheme documents, Aug 2026), so there is no accurate UK-wide
   formula. This replaces the old invented national formula, which is the
   bug this whole file exists to keep from recurring. Still "eligible" (a
   scheme genuinely exists to point them at) but with no amount — a signpost,
   not an estimate. */
{
  const r = ctsResult(baseInput({ age: 35, adults: 1, monthlyIncome: 600, savings: 0 }));
  check('CTS: working-age — must be signposted (eligible with no amount), not given a figure',
    (r.eligible && !r.amount) ? 1 : 0, 1, 0, 'no accurate national formula exists for working-age schemes');
}
{
  // Same for someone clearly well off — still no false "ineligible" claim,
  // since we have no council-specific bands to test against, but the reason
  // text is conditioned on "if you're on a low income" so it doesn't
  // overclaim for them either.
  const r = ctsResult(baseInput({ age: 35, adults: 1, monthlyIncome: 20000, savings: 500000 }));
  check('CTS: working-age, high income and savings — still signposted, not a fabricated figure',
    (r.eligible && !r.amount) ? 1 : 0, 1, 0, 'no income/capital test is applied to the working-age signpost');
}

/* CASE 9b — the £16,000 capital limit applies to pension-age claimants too.
   It is NOT waived just for being over State Pension age — only actually
   receiving the guarantee element of Pension Credit disregards capital
   entirely (same combination the Warm Home Discount scheme already uses). */
check('CTS: pensioner, £50,000 savings, NOT on Pension Credit — must be ineligible',
  ctsAmount(baseInput({ age: 70, adults: 1, monthlyIncome: 600, savings: 50000, receivingPensionCredit: false })),
  null, 0, 'capital limit is not waived by age alone');

/* CASE 9c — same pensioner, but actually on Guarantee Credit: capital is
   disregarded entirely, so they remain eligible despite £50,000 saved, and
   income/savings are irrelevant — they qualify for their bill reduced to
   nil. No own bill given, so this falls back to the England average Band D
   bill: £2,392/yr ÷ 52 = £46.00/wk exactly; monthly = 46 × 52 / 12. */
{
  const expected = (46 * 52) / 12;
  check('CTS: pensioner, £50,000 savings, ON Guarantee Credit — capital disregarded, reduced to nil (average bill fallback)',
    ctsAmount(baseInput({ age: 70, adults: 1, monthlyIncome: 600, savings: 50000, receivingPensionCredit: true })),
    expected, 0.5, 'guarantee credit disregards capital and income entirely; £2,392/yr average bill ÷ 12');
}

/* CASE 9d — same as 9c but the person gave us their own bill: the estimate
   should use that instead of the England average, and come back "likely"
   rather than "possible" as a result. */
{
  const r = ctsResult(baseInput({ age: 70, adults: 1, monthlyIncome: 600, savings: 50000, receivingPensionCredit: true, councilTaxAnnual: 1800 }));
  check('CTS: pensioner on Guarantee Credit, own bill of £1,800/yr given — reduced to nil using their real bill',
    r.eligible && r.amount ? r.amount.value : null, 1800 / 12, 0.01, 'own bill used directly, no averaging needed');
  check('CTS: pensioner on Guarantee Credit, own bill given — confidence should be "likely"',
    r.confidence === 'likely' ? 1 : 0, 1, 0, 'knowing the real bill removes the biggest source of uncertainty');
}

/* CASE 9e — boundary for working-age claimants: exactly £16,000 does not
   apply to them at all any more (no capital test on the signpost), so this
   now checks the pension-age boundary instead. Exactly £16,000 must still be
   eligible for the reduced-to-nil case (limit is "exceeds", not "reaches");
   £16,001 must not be. Mirrors the same boundary already enforced for
   Universal Credit, reg 18, and for Pension Credit itself. */
check('CTS: pensioner on Guarantee Credit, exactly £16,000 savings — must still be eligible',
  ctsAmount(baseInput({ age: 70, adults: 1, monthlyIncome: 600, savings: 16000, receivingPensionCredit: true })) !== null ? 1 : 0,
  1, 0, 'boundary case — eligible at exactly £16,000');
check('CTS: pensioner, NOT on Guarantee Credit, £16,001 savings — must be ineligible',
  ctsAmount(baseInput({ age: 70, adults: 1, monthlyIncome: 600, savings: 16001, receivingPensionCredit: false })),
  null, 0, 'one pound over the limit disqualifies without the guarantee-credit disregard');

/* CASE 9f — the main taper: 20p off the reduction for every £1 of weekly
   income above the Pension Credit guarantee level (Oxford City Council's
   published pensioner scheme document states this explicitly).
   Hand-computed for a single pensioner, £1,300/mo income, £2,600/yr own
   bill, no savings:
   weekly income = 1300 × 12 / 52 = 300.00 exactly.
   excess = 300 − 238.00 = 62.00; taper = 62 × 0.20 = 12.40.
   weekly bill = 2600 / 52 = 50.00 exactly.
   weekly reduction = 50.00 − 12.40 = 37.60.
   monthly = 37.60 × 52 / 12 = 162.9333... */
{
  const expected = (37.6 * 52) / 12;
  check('CTS: single pensioner, £1,300/mo income, £2,600/yr bill — taper applied',
    ctsAmount(baseInput({ age: 70, adults: 1, monthlyIncome: 1300, savings: 0, councilTaxAnnual: 2600 })),
    expected, 0.5, '20% taper on income above the applicable amount');
}

/* CASE 9g — the couple threshold (£363.25/wk) is used once there are two
   adults, same as Pension Credit itself, and the deemed-income rule on
   savings between £10,000-£16,000 stacks with the taper.
   Hand-computed for a couple, £1,300/mo income, £15,000 savings, £2,600/yr
   own bill:
   weekly income = 300.00 (as above); deemed = ceil((15000-10000)/500) = 10.
   assessed weekly income = 310.00.
   excess = 310.00 − 363.25 = negative → clamped to 0 → no taper, full bill. */
{
  const expected = (50 * 52) / 12; // no excess: full weekly bill, no taper
  check('CTS: couple pensioners, £1,300/mo income, £15,000 savings, £2,600/yr bill — below couple threshold, full reduction',
    ctsAmount(baseInput({ age: 70, adults: 2, monthlyIncome: 1300, savings: 15000, councilTaxAnnual: 2600 })),
    expected, 0.5, 'assessed income still under the £363.25/wk couple threshold, even with deemed income added');
}

/* CASE 9h — same shape as 9g but with higher income, so the deemed income
   from savings pushes them over the threshold and the taper applies too.
   Hand-computed for a couple, £2,600/mo income, £15,000 savings, £2,600/yr
   own bill:
   weekly income = 2600 × 12 / 52 = 600.00 exactly; deemed = 10.
   assessed = 610.00. excess = 610.00 − 363.25 = 246.75; taper = 49.35.
   weekly bill = 50.00. weekly reduction = 50.00 − 49.35 = 0.65.
   monthly = 0.65 × 52 / 12 = 2.8167. */
{
  const expected = (0.65 * 52) / 12;
  check('CTS: couple pensioners, £2,600/mo income, £15,000 savings, £2,600/yr bill — taper and deemed income both apply',
    ctsAmount(baseInput({ age: 70, adults: 2, monthlyIncome: 2600, savings: 15000, councilTaxAnnual: 2600 })),
    expected, 0.5, 'deemed income pushes assessed income over the couple threshold, then the 20% taper applies');
}

console.log('\n=========== HEALTHY START ===========\n');

function hsResult(input) {
  return scheme('healthy-start').evaluate(input);
}
function hsEligible(input) {
  return hsResult(input).eligible;
}

/* CASE 10a — there is no route to Healthy Start on income alone. Every real
   pathway goes through a specific qualifying benefit (Turn2us, checked Aug
   2026). A pregnant person on a modest income but no benefit must not be
   shown as eligible, even though the old code let anyone under £1,600/month
   through regardless of benefit status. */
check('Healthy Start: pregnant, £1,000/mo income, NOT on any benefit — must be ineligible',
  hsEligible(baseInput({ pregnantOrChildUnder4: true, monthlyIncome: 1000 })) ? 1 : 0,
  0, 0, 'no income-only route exists for Healthy Start');

/* CASE 10b — on Universal Credit, the real cap is £408/month of HOUSEHOLD
   EARNED income, not a general low-income test. Someone on UC earning well
   above that must be ineligible, even though they are correctly getting some
   (tapered) Universal Credit award. */
check('Healthy Start: pregnant, on UC, £1,200/mo earnings — must be ineligible (over the £408 cap)',
  hsEligible(baseInput({ pregnantOrChildUnder4: true, receivingUC: true, monthlyIncome: 1200 })) ? 1 : 0,
  0, 0, 'real UC earnings cap is £408/month, not a general threshold');

/* CASE 10c — on Universal Credit, within the £408 cap: must be eligible. */
check('Healthy Start: pregnant, on UC, £300/mo earnings — must be eligible (within the £408 cap)',
  hsEligible(baseInput({ pregnantOrChildUnder4: true, receivingUC: true, monthlyIncome: 300 })) ? 1 : 0,
  1, 0, 'within the real UC earnings cap');

/* CASE 10d — Pension Credit has no income test layered on top of it, so a
   pensioner on Pension Credit qualifies regardless of other income. */
check('Healthy Start: child under 4, on Pension Credit, £2,000/mo other income — must be eligible',
  hsEligible(baseInput({ pregnantOrChildUnder4: true, receivingPensionCredit: true, monthlyIncome: 2000 })) ? 1 : 0,
  1, 0, 'Pension Credit carries no additional income test');

/* CASE 10e — neither pregnant nor a child under 4: ineligible regardless of
   everything else. */
check('Healthy Start: no pregnancy/child under 4, on UC, £0 income — must be ineligible',
  hsEligible(baseInput({ pregnantOrChildUnder4: false, receivingUC: true, monthlyIncome: 0 })) ? 1 : 0,
  0, 0, 'gate on pregnancy/child under 4 comes first');

console.log('\n=========== WARM HOME DISCOUNT ===========\n');

function whdResult(input) {
  return scheme('warm-home-discount').evaluate(input);
}
function whdEligible(input) {
  return whdResult(input).eligible;
}

/* CASE 11a — pension-age and on Pension Credit: automatic ("core group"). */
check('WHD: age 70, on Pension Credit — must be eligible (core group)',
  whdEligible(baseInput({ age: 70, receivingPensionCredit: true, monthlyIncome: 2000 })) ? 1 : 0,
  1, 0, 'Pension Credit guarantee group is automatic regardless of income');

/* CASE 11b — working-age, low income, but NOT on UC and NO disability flag:
   must be ineligible. Low income alone is not the gate — this mirrors the
   Council Tax Support capital-limit fix: a qualifying flag, not just a
   number, has to be present. */
check('WHD: working-age, £600/mo income, no UC, no disability flag — must be ineligible',
  whdEligible(baseInput({ age: 35, monthlyIncome: 600, receivingUC: false, hasDisabilityOrHealthCondition: false })) ? 1 : 0,
  0, 0, 'low income alone is not the gate — needs UC or a disability flag too');

/* CASE 11c — working-age, on UC, income under the household threshold. */
check('WHD: working-age, on UC, £900/mo income (threshold £1,200 for 0 kids) — must be eligible',
  whdEligible(baseInput({ age: 35, monthlyIncome: 900, receivingUC: true, children: 0 })) ? 1 : 0,
  1, 0, 'under the low-income-high-cost threshold, on UC');

/* CASE 11d — working-age, disability flag instead of UC, still qualifies. */
check('WHD: working-age, disability flag, £900/mo income, NOT on UC — must be eligible',
  whdEligible(baseInput({ age: 35, monthlyIncome: 900, receivingUC: false, hasDisabilityOrHealthCondition: true })) ? 1 : 0,
  1, 0, 'disability flag is an alternative gate to UC');

console.log('\n=========== CHILD BENEFIT ===========\n');

function cbAmount(input) {
  const r = scheme('child-benefit').evaluate(input);
  return r.eligible ? r.amount.value : null;
}

/* CASE 8 — 2 children, modest income.
   REAL RULE 2026/27: £27.05/wk eldest + £17.90/wk each additional.
   Hand-computed: (27.05 + 17.90) = £44.95/wk = 44.95*52/12 = £194.78/mo */
check('CB: 2 children, low income',
  cbAmount(baseInput({ children: 2, monthlyIncome: 1500 })),
  (27.05 + 17.90) * 52 / 12, 0.5, 'standard rate');

/* CASE 9 — COUPLE each earning £45k (household £90k take-home-ish).
   REAL RULE: the High Income Child Benefit Charge is assessed on the
   HIGHEST INDIVIDUAL adjusted net income, not household income. Two people
   on £45k each are both below the £60,000 threshold, so NO charge applies
   and Child Benefit is payable in full.
   Hand-computed: full entitlement, £184.38/mo for 2 children. */
check('CB: couple, 2 kids, £7,500/mo household, highest earner £3,750/mo before tax (£45k)',
  cbAmount(baseInput({ adults: 2, children: 2, monthlyIncome: 7500, highestIndividualIncomeBeforeTax: 3750 })),
  (27.05 + 17.90) * 52 / 12, 0.5,
  'both under £60k individually -> no charge, full Child Benefit');

/* CASE 10 — single earner on £70,000 before tax (£5,833/mo): HICBC tapers
   50% away. No before-tax figure given here on purpose, so this also checks
   the take-home fallback path still does the maths correctly.
   Hand-computed: (70000-60000)/20000 = 0.5 clawback -> 184.38 * 0.5 = 92.19 */
check('CB: single earner £70k, 2 kids (50% clawback), via take-home fallback',
  cbAmount(baseInput({ adults: 1, children: 2, monthlyIncome: 70000 / 12 })),
  ((27.05 + 17.90) * 52 / 12) * 0.5, 0.5, 'partial taper, not all-or-nothing');

/* CASE 11 — single earner above £80,000: fully clawed back, but entitlement
   survives; app should still surface it (nil rate protects NI credits). */
{
  const r = scheme('child-benefit').evaluate(baseInput({ adults: 1, children: 2, monthlyIncome: 90000 / 12 }));
  const ok = r.eligible && r.amount && r.amount.value === 0;
  console.log(`${ok ? 'MATCH ' : 'DIFF  '} CB: single earner £90k still surfaced at nil rate`);
  console.log(`        eligible=${r.eligible}  display=${r.amount && r.amount.display}`);
  if (!ok) findings.push({ label: 'CB nil-rate surfacing', app: JSON.stringify(r), expected: 'eligible with £0 + NI-credits note' });
}

/* CASE 12 — the High Income Child Benefit Charge is based on adjusted net
   income, essentially income BEFORE tax, not take-home pay (checked against
   LITRG, Aug 2026). A single adult with take-home comfortably under £60k/yr
   but income before tax over it must still see a charge, once they give us
   the before-tax figure — take-home alone would have hidden this charge
   entirely under the old logic.
   Take-home £3,000/mo (£36k/yr): no charge if used directly.
   Before tax £5,500/mo (£66k/yr): 30% over the £60k-£80k taper band. */
{
  const beforeTaxAnnual = 5500 * 12;
  const clawback = Math.min(1, (beforeTaxAnnual - 60000) / 20000);
  const expected = ((27.05 + 17.90) * 52 / 12) * (1 - clawback);
  check('CB: £3,000/mo take-home but £5,500/mo before tax — charge must use the before-tax figure',
    cbAmount(baseInput({ adults: 1, children: 2, monthlyIncome: 3000, highestIndividualIncomeBeforeTax: 5500 })),
    expected, 0.5, 'adjusted net income is before tax, not take-home');
}

/* CASE 13 — without a before-tax figure at all, the app must still answer
   (better an approximate answer with a caveat than none) by falling back to
   take-home, but must say so in plain language, since take-home understates
   this and a real charge could be missed. */
{
  const r = scheme('child-benefit').evaluate(baseInput({ adults: 1, children: 2, monthlyIncome: 3000 }));
  const flags = /before tax/i.test(r.reason) && /take-home/i.test(r.reason);
  console.log(`${flags ? 'MATCH ' : 'DIFF  '} CB: no before-tax figure given — reason must flag the take-home fallback`);
  console.log(`        reason="${r.reason}"`);
  if (!flags) findings.push({ label: 'CB take-home fallback caveat', app: r.reason, expected: 'reason mentions falling back to take-home income' });
}

/* ---------- STALENESS TRIPWIRE ----------
   Benefit rates are uprated every 6 April. This app went two tax years without
   an update because nothing complained. This fails the suite the moment the
   rates are out of date, so it surfaces in `npm test` instead of waiting for
   somebody to notice. Rule changes land on the same date as rate changes, so
   read this as "go and check the uprating notes", not "swap some numbers". */
{
  /* ukTaxYearOf/ratesStaleness live in data/schemes.js, next to the rates they
     describe, so the app's user-facing warning and this test agree by
     construction rather than by two copies staying in step. */
  const stale = app.ratesStaleness(new Date());
  const ok = !stale;
  console.log(`${ok ? 'MATCH ' : 'DIFF  '} Rates are current for this tax year`);
  console.log(`        rates declare ${app.RATES_TAX_YEAR}  |  today falls in ${app.ukTaxYearOf(new Date()).label}`);
  if (!ok) {
    findings.push({
      label: 'Rates are out of date',
      app: `data/schemes.js declares RATES_TAX_YEAR = "${stale.declared}"`,
      expected: `${stale.current} rates`,
      note: 'Uprating happens every 6 April. Update the constants in data/schemes.js AND the '
          + 'hand-computed expectations in this file in the same commit, then set RATES_TAX_YEAR. '
          + 'Check for STRUCTURAL rule changes too, not just new numbers — the two-child limit was '
          + 'abolished on the same day as the April 2026 uprating.'
    });
  }
}

console.log('\n=========== CLIFF EDGES ===========\n');

/* A "cliff" here means a point where a scheme STOPS APPLYING — not a point
   where its amount steps down. The distinction is the whole feature and it is
   easy to get backwards.

   REAL RULE (reg 72, UC Regs 2013): capital between £6,000 and £16,000 is
   converted to "tariff income" of £4.35 a month per £250 or part thereof.
   Because of the "or part thereof" it is a staircase, not a slope: the award
   is identical at £6,001 and £6,250, then drops £4.35 at £6,251. That is forty
   drops between £6,000 and £16,000 and NOT ONE OF THEM is a cliff — the
   claimant still qualifies on both sides of every one.

   REAL RULE (reg 18, UC Regs 2013): capital ABOVE £16,000 disqualifies
   outright. That IS a cliff, and it is the only one on this axis. */

function cliffsOn(input, variable) {
  return app.findCliffs(app.sanitiseInput(input), variable);
}

/* CASE A — the cliff exists and sits at exactly £16,000.
   Hand-computed, single childless adult 25+, no income, no rent:
   max award = standard allowance 424.90 only.
   At £16,000 capital: tariff = ceil((16000-6000)/250) * 4.35 = 40 * 4.35
   = 174.00. Award = 424.90 - 174.00 = 250.90.
   At £16,001: reg 18 disqualifies. Award = nil. So the drop is £250.90. */
{
  const cliffs = cliffsOn(baseInput({ age: 35, monthlyIncome: 0, savings: 0 }), 'savings');
  const uc = cliffs.filter(c => c.schemeId === 'universal-credit');
  check('CLIFF: UC savings cliff count (£0 income)', uc.length, 1, 0,
    'reg 18 is the only place UC eligibility ends on the savings axis');
  check('CLIFF: UC savings cliff position (£0 income)', uc.length ? uc[0].at : null, 16000, 0,
    'reg 18: capital ABOVE £16,000 disqualifies, so £16,000 itself still qualifies');
  check('CLIFF: UC savings cliff size (£0 income)', uc.length ? uc[0].cashDrop : null, 250.90, 0.5,
    'standard allowance 424.90 minus tariff income 40 * 4.35 = 174.00');
}

/* CASE B — the SAME cliff is much smaller once earnings taper the award.
   Hand-computed, same household with £400/mo earnings and no work allowance
   (childless, no LCW): 424.90 - (400 * 0.55) - 174.00 = 30.90.
   A test that hardcodes one drop figure would be testing its fixture, not the
   regulations. */
{
  const uc = cliffsOn(baseInput({ age: 35, monthlyIncome: 400, savings: 0 }), 'savings')
    .filter(c => c.schemeId === 'universal-credit');
  check('CLIFF: UC savings cliff size (£400/mo income)', uc.length ? uc[0].cashDrop : null, 30.90, 0.5,
    '424.90 - 220.00 taper - 174.00 tariff = 30.90');
}

/* CASE C — above about £700/mo the award is already nil at £16,000, so there
   is NOTHING LEFT TO LOSE and no cliff should be reported at all.
   Hand-computed: 424.90 - (700 * 0.55 = 385.00) - 174.00 = -134.10, floored to
   nil by Math.max(0, ...). Reporting a cliff here would tell someone they are
   about to lose money they are not receiving. */
{
  const uc = cliffsOn(baseInput({ age: 35, monthlyIncome: 700, savings: 0 }), 'savings')
    .filter(c => c.schemeId === 'universal-credit' && c.cashDrop > 0.005);
  check('CLIFF: no UC cash cliff at £700/mo income', uc.length, 0, 0,
    'award already nil at £16,000, so crossing it loses nothing');
}

/* CASE D — the forty tariff steps are NOT cliffs.
   This is the regression guard for the staircase. If anyone reimplements
   cliff detection as "a big drop between samples", the £4.35 steps start
   being reported and this fails. */
{
  const inRange = cliffsOn(baseInput({ age: 35, monthlyIncome: 0, savings: 0 }), 'savings')
    .filter(c => c.at >= 6000 && c.at < 16000);
  check('CLIFF: no cliffs between £6,000 and £16,000', inRange.length, 0, 0,
    'reg 72 tariff income steps the AMOUNT down 40 times; eligibility is unbroken throughout');
}

/* CASE E — cliffs in schemes that pay nothing into a bank account still count.
   Warm Home Discount is kind:"bill", so it contributes £0 to the cash total
   and is invisible to any cash-only detector. Its income test is £1,200/mo.
   Hand-computed: eligible at £1,199, not at £1,200 — so the boundary the
   bisection should pin is £1,199. */
{
  const whd = cliffsOn(
    baseInput({ age: 35, monthlyIncome: 0, hasDisabilityOrHealthCondition: true, receivingUC: true }),
    'monthlyIncome'
  ).filter(c => c.schemeId === 'warm-home-discount');
  check('CLIFF: Warm Home Discount income cliff found', whd.length, 1, 0,
    'kind:"bill" — worth £150 but adds £0 to the cash line, so a cash-only sweep misses it');
  check('CLIFF: Warm Home Discount income cliff position', whd.length ? whd[0].at : null, 1199, 1,
    'last qualifying pound of monthly income');
}

/* CASE F — bisection must refuse a non-monotone predicate rather than guess.
   REAL RULE: UC eligibility against AGE flips twice — the standard allowance
   steps up at 25 (schemes.js), and pension age ends UC entirely at 66. A
   bisection assumes exactly one crossing; given two it returns whichever half
   it happened to halve into, stated with full confidence. It must return null. */
{
  const boundary = app.bisect(
    app.sanitiseInput(baseInput({ age: 35, monthlyIncome: 620, savings: 0 })),
    'age', 16, 120,
    ({ national }) => national.some(r => r.scheme.id === 'universal-credit')
  );
  check('CLIFF: bisect refuses non-monotone UC-vs-age', boundary, null, 0,
    'eligibility flips at 25 and again at 66 — no single boundary exists to return');
}

/* CASE G — near-miss must be gated on the HOUSEHOLD TOTAL, not one scheme.
   REAL RULE: Healthy Start cuts off at £408/mo. Someone on £500/mo with a
   child under 4 on UC is £92 short of a card worth £18.42/mo. Recommending a
   £92/mo income cut to gain £18.42/mo is a £883/yr net LOSS, so no card may
   be produced for it. */
{
  const misses = app.findNearMiss(baseInput({
    age: 30, children: 1, monthlyIncome: 500, receivingUC: true, pregnantOrChildUnder4: true
  }));
  const hs = misses.filter(m => m.schemeId === 'healthy-start');
  check('NEAR-MISS: no Healthy Start card for a net-negative income cut', hs.length, 0, 0,
    'losing £92/mo of income to gain a £18.42/mo card is £883/yr worse off');
  check('NEAR-MISS: every card shown is a net gain',
    misses.filter(m => m.netGain <= 0).length, 0, 0,
    'a card may only appear when the household total at the target beats the total now');
}

console.log('\n=========== SUMMARY ===========\n');
if (!findings.length) {
  console.log('No differences found.');
} else {
  console.log(findings.length + ' difference(s) between app output and hand-computed real rules:\n');
  findings.forEach((f, i) => {
    console.log(`${i + 1}. ${f.label}`);
    console.log(`   app returned ${f.app}, real rules give ${f.expected}`);
    if (f.note) console.log(`   -> ${f.note}`);
  });
  /* Exit non-zero so `npm test` actually fails. Without this the script printed
     its findings and still reported success, which made the whole suite
     incapable of failing. */
  process.exitCode = 1;
}
