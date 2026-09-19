/* Edge case / robustness testing at the logic layer.
   Looking for: crashes, NaN, negative payouts, absurd payouts, silent nonsense. */

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
  + `\n;Object.assign(globalThis, { NATIONAL_SCHEMES, LOCAL_SCHEMES, COUNCIL_WIDE_SCHEMES, COUNCILS,
      CRF_DISTRICT_HOUSING_EXIT, crfDistrictHousingExitPassed, isEnglishCouncil,
      isWithheldScheme, CRF_COUNCIL_PAGES,
      WORKING_AGE_CTS_CAPITAL_SIGNPOST_LIMIT,
      ALL_ENGLAND_COUNCILS, ENGLAND_POSTCODE_DATA, matchOfflineCouncil,
      resolveCouncilByName, sanitiseInput, gbp, evaluateAll, sweep, bisect, findCliffs, findNearMiss, SWEEP_AXES });`;
vm.runInContext(combined, ctx, { filename: 'app-combined.js' });
const app = ctx;

function baseInput(over) {
  return Object.assign({
    postcode: "", council: "leeds", detectedDistrict: "", age: 35,
    adults: 1, children: 0, employment: "employed",
    monthlyIncome: 0, savings: 0, housingCosts: 0,
    receivingUC: false, receivingPensionCredit: false,
    hasDisabilityOrHealthCondition: false, pregnantOrChildUnder4: false
  }, over);
}

const problems = [];

function runAll(rawInput, label) {
  // Route through the same sanitiser the app uses before evaluating, since
  // that is the real code path. Anything that still comes out wrong here is a
  // genuine user-visible defect.
  const input = app.sanitiseInput(rawInput);
  const results = [];
  for (const s of app.NATIONAL_SCHEMES) {
    let r;
    try {
      r = s.evaluate(input);
    } catch (e) {
      problems.push(`${label} :: ${s.id} THREW: ${e.message}`);
      continue;
    }
    if (!r || !r.eligible) continue;
    const v = r.amount ? r.amount.value : 0;
    if (typeof v === 'number') {
      if (Number.isNaN(v)) problems.push(`${label} :: ${s.id} returned NaN`);
      if (v < 0) problems.push(`${label} :: ${s.id} returned NEGATIVE ${v.toFixed(2)}`);
      if (v > 20000) problems.push(`${label} :: ${s.id} returned ABSURD ${v.toFixed(2)}/mo`);
    }
    results.push(`${s.id}=${typeof v === 'number' ? v.toFixed(2) : v}`);
  }
  console.log(`${label}\n    -> ${results.join(', ') || '(none eligible)'}`);
}

console.log('=========== EDGE CASES: LOGIC LAYER ===========\n');

runAll(baseInput({ monthlyIncome: 0 }), 'Zero income, no housing');
runAll(baseInput({ monthlyIncome: 0, housingCosts: 0, adults: 0 }), 'Zero adults (impossible household)');
runAll(baseInput({ monthlyIncome: -500 }), 'NEGATIVE income -£500');
runAll(baseInput({ housingCosts: -300, monthlyIncome: 400 }), 'NEGATIVE housing costs -£300');
runAll(baseInput({ savings: -1000, monthlyIncome: 400 }), 'NEGATIVE savings -£1000');
runAll(baseInput({ children: -2, monthlyIncome: 400 }), 'NEGATIVE children -2');
runAll(baseInput({ age: 0, monthlyIncome: 400 }), 'Age 0');
runAll(baseInput({ age: 200, monthlyIncome: 400 }), 'Age 200');
runAll(baseInput({ age: -30, monthlyIncome: 400 }), 'NEGATIVE age -30');
runAll(baseInput({ monthlyIncome: 1e9 }), 'Income £1,000,000,000');
runAll(baseInput({ housingCosts: 1e9, monthlyIncome: 0 }), 'Housing costs £1,000,000,000');
runAll(baseInput({ children: 500, monthlyIncome: 0 }), '500 children');
runAll(baseInput({ monthlyIncome: 1200.756, housingCosts: 640.333 }), 'Decimal pence values');
runAll(baseInput({ monthlyIncome: NaN }), 'NaN income');
runAll(baseInput({ monthlyIncome: null }), 'null income');
runAll(baseInput({ age: null, monthlyIncome: 400 }), 'null age');
runAll(baseInput({ monthlyIncome: Infinity }), 'Infinity income');

console.log('\n=========== POSTCODE PARSER ROBUSTNESS ===========\n');
const pcTests = ['', '   ', 'X', '12345', 'LS1', 'ls1 4dy', 'L S 1 4 D Y', '!!!',
  'LS14DY', 'SW1A1AA', 'EH1 1AA', 'CF10 1AA', 'BT1 1AA', 'AAAAAAAAAAAA',
  '<script>alert(1)</script>', 'LS1 4DY extra words', '你好'];
for (const t of pcTests) {
  let out;
  try {
    out = app.matchOfflineCouncil(t);
  } catch (e) {
    problems.push(`postcode "${t}" THREW: ${e.message}`);
    out = 'THREW';
  }
  console.log(`  ${JSON.stringify(t).padEnd(34)} -> ${out === null ? '(no match)' : out}`);
}

console.log('\n=========== LOCAL SCHEME AMOUNTS MUST NOT REACH ANY TOTAL ===========\n');

/* The amounts on local schemes are placeholders ({ value: 100, period:
   "one-off" } and similar). They are inert today — renderLocalSection passes
   showAmount: false, and the what-if engine takes only the national results —
   but nothing enforced either, so one careless change turns £100 of
   placeholder into real money on screen, or into the gate that decides
   whether a near-miss card is worth showing at all.

   These checks watch the real CALL SITES. Re-calling cashMonthlyAt() and
   householdValueAnnual() here with hand-picked arguments would prove only
   that this file passes them national results, which is not the property at
   risk. Instead the two functions are wrapped for the duration of a real
   near-miss and cliff run, and asked what they were actually handed.

   The browser half of this guard is in verify-ui.js: sumEstimates() is called
   from renderResultsStep(), which needs a DOM, so it cannot be exercised
   here. */
{
  /* The test council is CHOSEN, not hard-coded. This guard only tests anything
     while some council has an eligible local scheme carrying a non-zero
     placeholder amount, and which council that is changes as entries are
     verified, disputed or corrected — hard-coding Leeds meant the guard went
     silently vacuous the moment its one priced entry was hidden as disputed.
     Pick whichever council still exercises the property. */
  const candidates = Object.keys(app.LOCAL_SCHEMES).filter(c => c !== 'other');
  const scored = candidates.map(council => {
    const input = app.sanitiseInput(baseInput({
      council, children: 1, monthlyIncome: 500, housingCosts: 600, receivingUC: true
    }));
    const local = app.evaluateAll(input).local;
    return {
      council,
      input,
      local,
      priced: local.filter(r => r.result.amount && r.result.amount.value > 0).length
    };
  });
  const best = scored.filter(s => s.priced).sort((a, b) => b.priced - a.priced)[0]
    || scored.filter(s => s.local.length).sort((a, b) => b.local.length - a.local.length)[0];

  if (!best) {
    problems.push('GUARD IS VACUOUS: no council has any eligible local scheme, so nothing below is being tested');
  } else if (!best.priced) {
    /* Not a failure. If no placeholder amounts survive in the data there is
       nothing left to leak, and saying so is more useful than a red suite. */
    console.log('No local scheme carries a non-zero placeholder amount any more — the leak checks below still run, but the data no longer contains the thing they guard against.');
  }

  const localHousehold = (best || scored[0]).input;

  const localIds = new Set();
  Object.values(app.LOCAL_SCHEMES).forEach(arr => arr.forEach(sc => localIds.add(sc.id)));
  app.COUNCIL_WIDE_SCHEMES.forEach(sc => localIds.add(sc.id));
  const isLocal = r => !!(r && r.scheme && (r.scheme.category === 'local' || localIds.has(r.scheme.id)));
  console.log(`Test household: ${(best || scored[0]).council}, 1 child, £500/mo, £600 rent, on UC -> ${(best || scored[0]).local.length} local scheme(s) eligible, ${(best || scored[0]).priced} carrying a non-zero placeholder amount`);

  const seen = { cashMonthlyAt: 0, householdValueAnnual: 0 };
  const leaked = new Set();
  const realCash = app.cashMonthlyAt;
  const realHousehold = app.householdValueAnnual;

  app.cashMonthlyAt = function (national) {
    seen.cashMonthlyAt++;
    (national || []).forEach(r => { if (isLocal(r)) leaked.add('cashMonthlyAt <- ' + r.scheme.id); });
    return realCash.apply(this, arguments);
  };
  app.householdValueAnnual = function (national) {
    seen.householdValueAnnual++;
    (national || []).forEach(r => { if (isLocal(r)) leaked.add('householdValueAnnual <- ' + r.scheme.id); });
    return realHousehold.apply(this, arguments);
  };

  try {
    app.findNearMiss(localHousehold);
    for (const axis of Object.keys(app.SWEEP_AXES)) {
      app.sweep(localHousehold, axis);
      app.findCliffs(localHousehold, axis);
    }
  } catch (e) {
    problems.push('what-if run THREW during the local-amount guard: ' + e.message);
  } finally {
    app.cashMonthlyAt = realCash;
    app.householdValueAnnual = realHousehold;
  }

  console.log(`  cashMonthlyAt() called ${seen.cashMonthlyAt}x, householdValueAnnual() called ${seen.householdValueAnnual}x during near-miss + cliff detection`);
  if (!seen.cashMonthlyAt || !seen.householdValueAnnual) {
    problems.push('GUARD IS VACUOUS: the wrapped totals were never called, so no leak could have been detected');
  }
  if (leaked.size) {
    leaked.forEach(l => problems.push('LOCAL SCHEME REACHED A TOTAL: ' + l));
  } else {
    console.log('  no local scheme reached either total');
  }
}

console.log('\n=========== SUMMARY ===========\n');
if (!problems.length) {
  console.log('No crashes, NaN, negative or absurd values detected.');
} else {
  console.log(problems.length + ' problem(s):\n');
  problems.forEach((p, i) => console.log(`${i + 1}. ${p}`));
  /* Exit non-zero so `npm test` actually fails. */
  process.exitCode = 1;
}
