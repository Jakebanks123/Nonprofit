/* Re-evaluation engine for the explore tools.

   Every scheme's evaluate() in data/schemes.js is a pure function of the
   answers, so the whole eligibility pass can be re-run hundreds of times in
   the browser with nothing leaving the device. That is what makes sweeping a
   variable and finding the exact point where a scheme stops possible at all.

   No DOM here. app.js renders; this file only computes. Loaded as a classic
   script between data/schemes.js and app.js, and pulled into the vm context
   by verify-maths.cjs and verify-edgecases.cjs the same way. */

/* The single eligibility pass. computeResults() in app.js calls this rather
   than mapping over the schemes itself, so the results screen and the explore
   tools can never drift apart — there is one implementation, not two. */
function evaluateAll(input) {
  const national = NATIONAL_SCHEMES
    .map(scheme => ({ scheme, result: scheme.evaluate(input) }))
    .filter(r => r.result.eligible);

  const localSchemes = LOCAL_SCHEMES[input.council] || [];
  const local = localSchemes
    .map(scheme => ({ scheme, result: scheme.evaluate(input) }))
    .filter(r => r.result.eligible);

  return { national, local };
}

/* Which answers may be swept. Deliberately a whitelist and not "any numeric
   field": `children` and `adults` are numbers too, and probing those produces
   "one more child and you'd qualify for Child Benefit", which is not advice
   anyone should be given by a website.

   Ranges are chosen to clear the real boundaries rather than to look tidy.
   Income runs past £6,667/mo because that is where the Child Benefit high
   income charge reaches 100% (schemes.js, HICBC: £60,000-£80,000 a year on
   the before-tax figure). Savings runs past £16,000 because that is where
   Universal Credit stops outright. A range that stops short of a boundary
   draws a flat line that looks like a bug and hides the thing worth seeing. */
const SWEEP_AXES = {
  monthlyIncome: { label: "Monthly income", min: 0, max: 7000, step: 25, unit: "money" },
  savings: { label: "Savings", min: 0, max: 20000, step: 50, unit: "money" }
};

function cloneWith(input, variable, value) {
  const next = Object.assign({}, input);
  next[variable] = value;
  return sanitiseInput(next);
}

/* Cash total for one point on the curve.

   Mirrors sumEstimates() in app.js: national schemes only, and kind "bill" or
   "in-kind" excluded from the cash figure because a council tax reduction and
   a food card are not money arriving in a bank account. Those schemes are not
   ignored though — they are carried in the eligible set below, so losing one
   still registers as a cliff even though it never moves this number. */
function cashMonthlyAt(national) {
  let total = 0;
  national.forEach(({ scheme, result }) => {
    const kind = scheme.kind || "cash";
    if (kind === "bill" || kind === "in-kind") return;
    const amount = result.amount;
    if (!amount || !amount.value) return;
    if (amount.period === "month") total += amount.value;
    else if (amount.period === "year") total += amount.value / 12;
  });
  return total;
}

function sweep(input, variable, range) {
  const axis = range || SWEEP_AXES[variable];
  if (!axis) throw new Error("sweep: not a sweepable axis: " + variable);

  const series = [];
  for (let x = axis.min; x <= axis.max; x += axis.step) {
    const { national } = evaluateAll(cloneWith(input, variable, x));
    series.push({
      x,
      cashMonthly: cashMonthlyAt(national),
      eligibleIds: national.map(r => r.scheme.id)
    });
  }
  return series;
}

/* Exact boundary between lo and hi, to the nearest whole unit.

   Returns null when the predicate does not flip across the range, and — more
   importantly — null when it flips more than once. Bisection assumes exactly
   one crossing, and several rules here break that: Universal Credit against
   age is false at 24, true at 25 (the standard allowance steps up), and false
   again at 66 (pension age). Handing that to a naive bisection returns
   whichever half it happened to guess, stated with total confidence. Sampling
   first and refusing is the only honest option. */
function bisect(input, variable, from, to, predicate) {
  const at = v => predicate(evaluateAll(cloneWith(input, variable, v)));

  const fromVal = at(from);
  if (fromVal === at(to)) return null;

  // Confirm a single crossing before trusting the halving. 64 samples is
  // enough to catch the flips that actually exist in these rules without
  // costing more than the search it guards.
  let flips = 0;
  let prev = fromVal;
  const probes = 64;
  for (let i = 1; i <= probes; i++) {
    const cur = at(from + ((to - from) * i) / probes);
    if (cur !== prev) flips++;
    prev = cur;
  }
  if (flips > 1) return null;

  /* Returns the value nearest `to` that still behaves like `from` — the LAST
     point on the from-side, not the first point past it. That is the number a
     user can act on: "£16,000 is still fine" rather than "£16,001 is too much".
     Works in either direction, because near-miss searches downwards. */
  let lastFrom = from;
  let firstTo = to;
  while (Math.abs(firstTo - lastFrom) > 1) {
    const mid = Math.round((lastFrom + firstTo) / 2);
    if (at(mid) === fromVal) lastFrom = mid;
    else firstTo = mid;
  }
  return lastFrom;
}

/* Where a scheme stops entirely.

   A cliff is a change in WHICH schemes you qualify for — not a change in how
   much one of them pays. That distinction is the whole feature, and getting
   it wrong is easy: the capital tariff (reg 72, UC Regs 2013) is
   Math.ceil((savings - 6000) / 250) * 4.35, so between £6,000 and £16,000 the
   award steps down £4.35 at a time and is perfectly flat in between. Forty
   little drops, none of them a cliff — you still qualify on either side of
   every one. At £16,000 the scheme stops. Only that last one is a cliff, and
   only the eligible-set test tells them apart.

   Detect coarsely, then bisect to pin the boundary to the pound: a £50-step
   sweep can only say the edge is somewhere in a £50 window, and a chart that
   labels a line "£16,000" from that is guessing. */
/* Below this, losing a scheme is a rounding artefact rather than a loss worth
   warning anyone about. £12 a year is £1 a month. */
const MATERIAL_ANNUAL_MINIMUM = 12;

function annualisedValue(amount) {
  if (!amount || !amount.value) return 0;
  if (amount.period === "month") return amount.value * 12;
  return amount.value; // "year" and "one-off" are already whole-sum figures
}

function findCliffs(input, variable, range) {
  const axis = range || SWEEP_AXES[variable];
  const series = sweep(input, variable, axis);
  const cliffs = [];

  /* The household's own answer, used only to mark which cliffs are behind
     them. Read from the input rather than the axis, because the answer can be
     off the end of it — savings are clamped to £20,000 for plotting while
     sanitiseInput accepts millions, and someone holding £45,000 is past every
     cliff on the chart. */
  const answer = Number(input[variable]) || 0;

  for (let i = 1; i < series.length; i++) {
    const before = series[i - 1];
    const after = series[i];
    const lost = before.eligibleIds.filter(id => after.eligibleIds.indexOf(id) === -1);
    if (!lost.length) continue;

    lost.forEach(id => {
      const scheme = NATIONAL_SCHEMES.find(s => s.id === id);
      const at = bisect(input, variable, before.x, after.x,
        ({ national }) => national.some(r => r.scheme.id === id));

      const edge = at == null ? before.x : at;
      const held = evaluateAll(cloneWith(input, variable, edge))
        .national.find(r => r.scheme.id === id);

      /* Dropping out of the list is not the same as falling off a cliff.
         A tapered award reaches nil and the scheme stops being listed, which
         is a change in the eligible set but costs the claimant nothing — at
         £700/mo income Universal Credit runs out at £8,251 of capital having
         just paid 75p, and pension-age Council Tax Reduction runs out at
         £2,027/mo having just taken 5p a week off the bill. Putting a warning
         on the chart for either would be alarming and false.

         Test the scheme's own held amount rather than the cash total, because
         "bill" and "in-kind" schemes never enter the cash total by design — a
         council tax reduction is not money in an account. A scheme with no
         amount at all is signposted rather than calculated (working-age
         Council Tax Reduction), and losing it is still meaningful, so it
         counts. */
      const kind = (scheme && scheme.kind) || "cash";
      const amount = held && held.result.amount;
      if (amount && annualisedValue(amount) < MATERIAL_ANNUAL_MINIMUM) return;

      cliffs.push({
        at: edge,
        exact: at != null,
        /* Is this behind them already? The caller MUST vary its wording on
           this. A cliff stated in the future tense to someone already past it
           is not a warning, it is an instruction: "Universal Credit stops once
           your savings go above £16,000, at £16,000 it is still worth about
           £246 a month", shown unprompted to someone holding £45,000, reads
           backwards as "spend £29,000 and collect £246 a month".

           That is deprivation of capital, and reg 50 of the UC Regs 2013
           means it does not even work — capital disposed of to secure a
           benefit is still counted as held, so the money is gone and the
           claim is refused anyway. findNearMiss() below excludes the savings
           axis "deliberately and permanently" for precisely this reason; this
           function reached the same place from the other direction and needs
           the same care. */
        alreadyPast: answer > edge,
        schemeId: id,
        name: scheme ? scheme.name : id,
        kind: (scheme && scheme.kind) || "cash",
        lostAmount: held ? held.result.amount : null,
        cashDrop: before.cashMonthly - after.cashMonthly
      });
    });
  }
  return cliffs;
}

/* Total annual worth of every national scheme, cash or not.

   sumEstimates() in app.js deliberately refuses to produce a number like this,
   and it is right to: a council tax reduction is not money in a bank account
   and a food card is not either, so adding them into one headline figure
   overstates what someone actually receives. That objection is about what gets
   PRINTED. This total is never printed. It exists only to answer an internal
   yes/no question — would this household be better off at that income? — and
   answering it needs the bill and in-kind schemes counted, because they are
   the only ones with income cliffs to be near. Universal Credit, Pension
   Credit and Child Benefit all taper.

   Gating on cash alone was the bug: every scheme with a cliff was worth
   exactly £0 to the gate, so no card could ever pass it. Do not "simplify"
   this back to cashMonthlyAt, and do not surface the figure. */
function householdValueAnnual(national) {
  let total = 0;
  national.forEach(({ result }) => {
    total += annualisedValue(result.amount);
  });
  return total;
}

/* Near-miss: the smallest income change that leaves the household better off
   overall.

   Only income is probed. Savings is excluded deliberately and permanently:
   every savings rule in data/schemes.js counts against the claimant, so the
   only suggestion that axis can ever generate is "spend some of it and you
   would qualify" — which is deprivation of capital (reg 50, UC Regs 2013).
   The Department treats the money as though it were still held, so the claim
   fails anyway and the money is gone too. Age is excluded for a different
   reason: it is not monotone, and reaching pension age can lose more than it
   gains — on the app's own figures a single adult on £900 a month with £600
   rent has £529.90 at 65 and £131.33 at 66.

   The gate is the HOUSEHOLD TOTAL, not the scheme's own figure. Healthy Start
   is why: its cap is £408 a month, so someone on £500 is £92 short of a £18.42
   card. Reporting the scheme's figure there recommends losing £883 a year. */
const NEAR_MISS_INCOME_LIMIT = 500;

function findNearMiss(input) {
  const base = sanitiseInput(input);
  const baseline = householdValueAnnual(evaluateAll(base).national);
  const currentIncome = base.monthlyIncome;
  const ineligible = NATIONAL_SCHEMES.filter(s => !s.evaluate(base).eligible);
  const found = [];

  ineligible.forEach(scheme => {
    /* `from` must be the END WHERE THE SCHEME APPLIES, because bisect returns
       the last value that behaves like `from`. Searching downwards from the
       user's own income returned the lowest income at which they STILL did not
       qualify — £1,400 for a one-child Warm Home Discount household whose real
       cut-off is £1,399 — and then priced the move at that same non-qualifying
       point. Searching upwards from the low end returns the highest income
       that still qualifies, which is the number a person can act on. */
    const lo = Math.max(0, currentIncome - NEAR_MISS_INCOME_LIMIT);
    const target = bisect(base, "monthlyIncome", lo, currentIncome,
      ({ national }) => national.some(r => r.scheme.id === scheme.id));
    if (target == null) return;

    const delta = currentIncome - target;
    if (delta <= 0 || delta > NEAR_MISS_INCOME_LIMIT) return;

    /* Is the household actually better off there? Usually not — you give up a
       pound of income to gain something worth less than a pound. Everything is
       annualised so a £150 one-off discount and £18.42 a month of food card
       can be weighed against £7 a month of income on the same scale.

       Where Universal Credit is in payment the true cost is lower than it
       looks, because its 55% taper hands back 55p of every pound of income
       given up. That is not a fudge; it is what the household actually
       experiences, and it is exactly why the comparison has to be made on the
       whole household rather than one scheme at a time. */
    const atTarget = householdValueAnnual(
      evaluateAll(cloneWith(base, "monthlyIncome", target)).national);
    const netGain = atTarget - baseline - delta * 12;
    if (netGain <= 0) return;

    /* delta and target are both returned so the card can be worded as an
       observation — "you are £7 a month above the limit for this" — rather
       than as an instruction to go and earn less. */
    found.push({
      schemeId: scheme.id,
      name: scheme.name,
      variable: "monthlyIncome",
      targetValue: target,
      delta,
      netGainAnnual: netGain
    });
  });

  return found.sort((a, b) => b.netGainAnnual - a.netGainAnnual);
}
