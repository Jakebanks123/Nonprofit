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
const combined = ['data/postcodes.js', 'data/schemes.js', 'app.js']
  .map(f => fs.readFileSync(__dirname + '/' + f, 'utf8'))
  .join('\n;\n')
  + `\n;Object.assign(globalThis, { NATIONAL_SCHEMES, LOCAL_SCHEMES, COUNCILS,
      ALL_ENGLAND_COUNCILS, ENGLAND_POSTCODE_DATA, matchOfflineCouncil,
      resolveCouncilByName, sanitiseInput, gbp });`;
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
check('CB: couple, 2 kids, £7,500/mo household, highest earner £3,750/mo (£45k)',
  cbAmount(baseInput({ adults: 2, children: 2, monthlyIncome: 7500, highestIndividualIncome: 3750 })),
  (27.05 + 17.90) * 52 / 12, 0.5,
  'both under £60k individually -> no charge, full Child Benefit');

/* CASE 10 — single earner on £70,000 (£5,833/mo): HICBC tapers 50% away.
   Hand-computed: (70000-60000)/20000 = 0.5 clawback -> 184.38 * 0.5 = 92.19 */
check('CB: single earner £70k, 2 kids (50% clawback)',
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
}
