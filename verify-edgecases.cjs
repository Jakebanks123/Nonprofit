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
const combined = ['data/postcodes.js', 'data/schemes.js', 'app.js']
  .map(f => fs.readFileSync(__dirname + '/' + f, 'utf8'))
  .join('\n;\n')
  + `\n;Object.assign(globalThis, { NATIONAL_SCHEMES, LOCAL_SCHEMES, COUNCILS,
      ALL_ENGLAND_COUNCILS, ENGLAND_POSTCODE_DATA, matchOfflineCouncil,
      resolveCouncilByName, sanitiseInput, gbp });`;
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

console.log('\n=========== SUMMARY ===========\n');
if (!problems.length) {
  console.log('No crashes, NaN, negative or absurd values detected.');
} else {
  console.log(problems.length + ' problem(s):\n');
  problems.forEach((p, i) => console.log(`${i + 1}. ${p}`));
  /* Exit non-zero so `npm test` actually fails. */
  process.exitCode = 1;
}
