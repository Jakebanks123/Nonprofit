/* The "what if" panel and its cliff-edge chart.

   explore-core.js computes; this file renders. app.js touches it in exactly
   two places — renderResultsStep() emits renderExplorePanel(), and render()
   calls wireExplorePanel() — so the wizard does not grow a second job.

   Loaded as a classic script between explore-core.js and app.js. Nothing here
   runs in Node; the maths suites load explore-core.js only.

   WHAT THIS IS FOR. Someone reading their results has one obvious question the
   results screen cannot answer: what happens if my money changes? They ask it
   because a job is ending, or hours are being cut, or a relative has left them
   something. The honest answer is not a smooth line — support in the UK has
   edges, and £1 over one of them can cost hundreds a month. Showing where
   those edges are is the whole point of the panel.

   WHAT IT MUST NOT BECOME. It must never read as advice to be poorer. Every
   string below is written as an observation about the rules ("Universal Credit
   stops once your savings go above £16,000"), never as a suggestion about the
   reader's conduct ("you would qualify if you had less"). The difference is
   not decoration: running savings down to qualify is deprivation of capital
   under reg 50 of the UC Regs 2013 — the Department treats the money as though
   it were still held, so the claim fails anyway and the money is gone too. If
   you are editing the copy here, keep the subject of every sentence the
   scheme, not the person. */

/* Exploring must not touch the answers. state.input in app.js stays exactly as
   the user left it — this is a separate value that the slider moves, and the
   results behind the panel do not change while it does. */
const exploreState = {
  axis: "monthlyIncome",
  value: null,
  /* Compared on every rebuild so that changing an answer and coming back
     resets the slider instead of leaving it parked on a stale figure. */
  signature: null,
  announceTimer: null,
  generation: 0,
  /* The sanitised answers the panel was last built from. Held here so that
     wireExplorePanel() needs no argument and cannot be handed a second,
     separately-sanitised copy that disagrees with what is on screen. */
  input: null
};

/* sweep() and findCliffs() are cheap — a few hundred evaluateAll() calls, each
   of them plain arithmetic — but they are not free, and re-running them on
   every input event during a drag is wasted work for a result that cannot
   change: the cliffs belong to the axis, not to where the slider is. Cached
   per axis, cleared whenever the baseline answers change. */
const exploreCache = {};

/* ---------- DATA ---------- */

/* Where the thumb sits for a given answer.

   Clamped, never snapped. An earlier version rounded the answer onto the
   £25 sweep grid so that the chart could be read by array index instead of
   re-evaluated, and it put two different figures for one household on one
   screen: an income of £1,237 snapped to £1,225, the headline at the top of
   the results said £1,530 and the panel underneath said £1,540 while calling
   it "your starting point, from the answers you gave". Sixty-four per cent of
   incomes between £600 and £2,000 were off by something. Worse, £1,590 with
   two children snapped UP to £1,600, past the Warm Home Discount cut-off, so
   the panel offered to add back a scheme the same page already listed.

   The slider now has step="1" and lands on the answer exactly. Arrow keys are
   handled in wireExploreBody so that a fine step does not mean 7,000 presses
   to cross the axis.

   Clamping still happens, and still cannot be avoided: sanitiseInput allows
   savings up to £10,000,000 and the axis stops at £20,000. What has changed is
   that a clamped start is no longer described as the user's own position —
   every figure is compared against exploreBaseline() below, which is
   evaluated at the real, unclamped answer. */
function exploreStartValue(axis, value) {
  /* Clamped, NOT rounded, and the slider is step="any" so it can hold this
     exactly however many pence are in it.

     The previous version rounded to the nearest pound and then treated the
     thumb as "at the answer" whenever it was within £1, which is the same
     bug as the £25 grid wearing a smaller hat. A tolerance window is only
     safe if no rule boundary falls inside it, and rule boundaries are the
     entire subject of this panel. Savings of £16,000.50 rounded the thumb to
     £16,000 and then printed the £16,000.50 figure for it: £195 a month,
     when £16,000 is worth £1,433.41 — understated by £14,864 a year, and
     flatly contradicted by the panel's own cliff list two inches below,
     which correctly said Universal Credit is worth about £1,239 at £16,000.
     It also put every cliff a pound late.

     With step="any" the thumb sits on the answer itself and no tolerance is
     needed, so atTrue below is an exact comparison. */
  return Math.min(axis.max, Math.max(axis.min, Number(value) || 0));
}

/* One point on the curve, evaluated rather than looked up.

   The sweep is sampled every £25 or £50 for drawing; the readout has to be
   exact at whatever pound the thumb is on, and at the user's own answer, which
   is not on the sampling grid in general. evaluateAll() over six national
   schemes is plain arithmetic — building the whole panel, sweep included,
   costs about a millisecond — so this is affordable on every input event. */
function exploreEvalAt(input, axisKey, value) {
  const { national } = evaluateAll(cloneWith(input, axisKey, value));
  return {
    cashMonthly: cashMonthlyAt(national),
    /* Every scheme counted, cash or not — see the note above the "Overall"
       sentence in renderExploreReadout(). Never printed. */
    householdAnnual: householdValueAnnual(national),
    eligibleIds: national.map(r => r.scheme.id)
  };
}

/* The household exactly as they answered — the figure the results summary at
   the top of the same screen is showing. Everything in the panel is compared
   against this, so the two can never disagree. */
function exploreBaseline(input, axisKey) {
  return exploreEvalAt(input, axisKey, Number(input[axisKey]) || 0);
}

function exploreSignature(input) {
  return JSON.stringify(input);
}

/* Everything the panel draws for one axis. */
function exploreDataFor(input, axisKey) {
  if (exploreCache[axisKey]) return exploreCache[axisKey];
  const axis = SWEEP_AXES[axisKey];
  const data = {
    key: axisKey,
    axis,
    series: sweep(input, axisKey, axis),
    cliffs: findCliffs(input, axisKey, axis)
  };
  data.maxCash = data.series.reduce((m, p) => Math.max(m, p.cashMonthly), 0);
  exploreCache[axisKey] = data;
  return data;
}

/* ---------- FORMATTING ---------- */

/* "once your savings goes above £16,000" is wrong, and "once your monthly
   income go above £2,100" is wrong the other way. SWEEP_AXES carries a label
   for a control, not a noun for a sentence, and one of these two axes is
   plural. Written out per axis rather than derived, because deriving it means
   guessing at the next axis someone adds — and the same lookup-not-assembly
   rule the class names follow applies just as well to English.

   An axis with no entry here falls back to singular rather than throwing: bad
   grammar on a results screen is a blemish, a thrown error is a blank page. */
const EXPLORE_GRAMMAR = {
  monthlyIncome: { noun: "monthly income", goes: "goes", rise: "rises", change: "changes" },
  savings: { noun: "savings", goes: "go", rise: "rise", change: "change" }
};

function exploreGrammar(data) {
  return EXPLORE_GRAMMAR[data.key]
    || { noun: data.axis.label.toLowerCase(), goes: "goes", rise: "rises", change: "changes" };
}

/* Both axes are money today, but SWEEP_AXES carries a unit so that adding a
   non-money axis later cannot silently print "£3" for three children. */
function exploreFormatValue(axis, value) {
  if (axis.unit === "money") return gbp(value);
  return String(Math.round(value));
}

/* The results summary rounds its headline to the nearest £5 and says so by
   rounding visibly. The panel has to round the same way, or dragging the
   slider back to the start would show a figure that disagrees with the big
   number at the top of the same screen. */
function exploreCash(value) {
  return gbp(roundTo(value, 5));
}

/* ---------- THE CHART ---------- */

/* A fixed coordinate space scaled by width:100%. The alternative,
   preserveAspectRatio="none", stretches the stroke widths with it and looks
   broken at 320px.

   NOTE — no <text> in this chart, deliberately. At 320px wide the 640-unit
   viewBox renders at roughly a third scale, so a label would need to be set at
   ~40 units to reach 13px and would tower over a 172-unit-tall plot. Every
   number is HTML instead: legible at any width, it scales with the reader's
   own browser font size, and it is selectable and printable.

   NOTE — preserveAspectRatio="none", with an explicit CSS height. Scaling the
   box uniformly is the obvious choice and it is wrong here: at 320px the
   panel's content column is about 200px, so a 640x200 viewBox came out 62px
   tall and the £16,000 drop — the entire point of the chart — was a barely
   visible nick. The height is now set in CSS and the plot stretches to fill
   it, which distorts the coordinate system.

   Two consequences, both handled below and neither optional. Every stroke
   carries vector-effect="non-scaling-stroke", so line weights and dash
   patterns stay even instead of being squashed with the geometry. And there
   are no <circle> elements: a circle under a non-uniform scale renders as an
   ellipse, so the round marker dots are drawn as near-zero-length lines with
   a round cap, which non-scaling-stroke then renders as true circles at a
   constant size whatever the container is doing. */
const CHART = { w: 640, h: 200, top: 12, right: 12, bottom: 12, left: 12 };

/* A round dot that survives the non-uniform scale. A zero-length subpath can
   be dropped by a renderer, so the segment is given a hair of length. */
function chartDot(x, y, size, cls, id) {
  return `<line ${id ? `id="${id}" ` : ""}x1="${x}" y1="${y}" x2="${x}" y2="${Number(y) + 0.01}"
                class="${cls}" stroke-width="${size}" stroke-linecap="round"
                vector-effect="non-scaling-stroke"/>`;
}
CHART.plotW = CHART.w - CHART.left - CHART.right;
CHART.plotH = CHART.h - CHART.top - CHART.bottom;
CHART.baseY = CHART.top + CHART.plotH;

function chartX(axis, value) {
  const span = axis.max - axis.min;
  const t = span === 0 ? 0 : (value - axis.min) / span;
  return CHART.left + Math.min(1, Math.max(0, t)) * CHART.plotW;
}

function chartY(maxCash, cash) {
  if (maxCash <= 0) return CHART.baseY;
  return CHART.top + (1 - Math.min(1, cash / maxCash)) * CHART.plotH;
}

/* Read to a screen reader in place of the picture. The cliff list underneath
   carries the same facts as real text, so this only has to be good enough to
   decide whether reading on is worth it. */
function chartLabel(data) {
  const g = exploreGrammar(data);
  const shape = `Cash support a month, plotted as ${g.noun} ${g.rise}.`;
  if (!data.cliffs.length) return `${shape} Nothing stops within this range. The figures are listed as text below.`;
  const stops = data.cliffs
    .map(c => `${c.name} stops at ${exploreFormatValue(data.axis, c.at)}`)
    .join(", ");
  return `${shape} ${stops}. The same points are listed as text below.`;
}

function renderExploreChart(data, input, startValue) {
  const { axis, series, cliffs, maxCash } = data;

  /* No cash anywhere on the axis means a flat line along the bottom, which
     reads as a broken chart rather than as information. The cliff list still
     has something to say — a council tax reduction stopping is a real loss
     that never touches the cash figure — so drop the picture, keep the
     words. */
  if (maxCash <= 0) return "";

  const points = series.map(p =>
    `${chartX(axis, p.x).toFixed(1)},${chartY(maxCash, p.cashMonthly).toFixed(1)}`);
  const firstX = chartX(axis, series[0].x).toFixed(1);
  const lastX = chartX(axis, series[series.length - 1].x).toFixed(1);

  const cliffLines = cliffs.map(c => {
    const x = chartX(axis, c.at).toFixed(1);
    return `
      <line x1="${x}" x2="${x}" y1="${CHART.top}" y2="${CHART.baseY}"
            class="stroke-warn-700" stroke-width="1.5" stroke-dasharray="5 4"
            vector-effect="non-scaling-stroke"/>
      ${chartDot(x, CHART.top, 7, "stroke-warn-700")}`;
  }).join("");

  /* Where the user actually is. Hidden until the slider moves off it, because
     two markers on the same pixel is just a thicker line. */
  const startX = chartX(axis, startValue).toFixed(1);
  const startY = chartY(maxCash, exploreEvalAt(input, data.key, startValue).cashMonthly).toFixed(1);

  return `
    <svg viewBox="0 0 ${CHART.w} ${CHART.h}" preserveAspectRatio="none"
         class="mt-1.5 h-36 w-full sm:h-44" role="img"
         aria-label="${chartLabel(data)}" id="exploreChart">
      <path d="M${firstX},${CHART.baseY} L${points.join(" L")} L${lastX},${CHART.baseY} Z"
            class="fill-brand-50"/>
      <polyline points="${points.join(" ")}" fill="none" class="stroke-brand-600"
                stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"
                vector-effect="non-scaling-stroke"/>
      <line x1="${CHART.left}" x2="${CHART.left + CHART.plotW}"
            y1="${CHART.baseY}" y2="${CHART.baseY}" class="stroke-line-strong" stroke-width="1"
            vector-effect="non-scaling-stroke"/>
      ${cliffLines}
      <line id="exploreStartMark" x1="${startX}" x2="${startX}" y1="${CHART.top}" y2="${CHART.baseY}"
            class="stroke-muted" stroke-width="1.5" stroke-dasharray="2 3"
            vector-effect="non-scaling-stroke" style="display:none;"/>
      <g id="exploreCursor" transform="translate(${startX},0)">
        <line x1="0" x2="0" y1="${CHART.top}" y2="${CHART.baseY}" class="stroke-accent-600"
              stroke-width="2" vector-effect="non-scaling-stroke"/>
        ${chartDot(0, startY, 11, "stroke-accent-600", "exploreCursorDot")}
      </g>
    </svg>`;
}

/* ---------- THE READOUT ---------- */

/* What changes between the household's real answers and where the slider is.

   THIS FUNCTION IS WHERE THE FEATURE IS MOST DANGEROUS. An earlier version
   reported only the change in support, in the same success green used for a
   scheme someone qualifies for. Dragging savings from £17,000 down to £5,000
   read "That is about £1,415 a month more than your starting point" over a
   green line offering Universal Credit — twelve thousand pounds of capital
   given away, presented as a win. Dragging income from £1,600 to nothing read
   "£645 a month more" for a household £955 a month worse off.

   Two rules came out of that, and both are load-bearing:

   1. The reader's own money is always stated alongside the support. Support
      going up is never printed without the income or savings it cost.
   2. Nothing that reduces the reader's own money is coloured as good.

   The two figures are deliberately NOT added into one headline number, except
   for the plain warning at the end. Cash support and money coming in are both
   monthly cash and can honestly be netted; a council tax reduction and a food
   card cannot be added to either, which is the same reason sumEstimates()
   refuses to print one total and householdValueAnnual() in explore-core.js is
   documented as never being surfaced. So the net is used only to decide
   whether to say "less overall", never to print a figure. */
function renderExploreReadout(data, input, baseline, startValue, value) {
  const { axis } = data;
  const g = exploreGrammar(data);
  const here = exploreFormatValue(axis, value);
  const trueValue = Number(input[data.key]) || 0;

  /* Is the thumb on the household's real position? EXACTLY, never within a
     tolerance — see exploreStartValue(). When it is, the baseline is printed
     verbatim rather than re-evaluated, so this figure is the identical number
     the results summary is showing at the top of the screen by construction
     rather than by luck. It is false whenever the answer is off the end of
     the axis and the thumb has been clamped, which is right: £20,000 is not
     where a household holding £40,000 is standing. */
  const atTrue = value === trueValue;
  const now = atTrue ? baseline : exploreEvalAt(input, data.key, value);

  const nameOf = id => {
    const s = NATIONAL_SCHEMES.find(n => n.id === id);
    return s ? s.name : id;
  };
  const dropped = baseline.eligibleIds.filter(id => now.eligibleIds.indexOf(id) === -1).map(nameOf);
  const added = now.eligibleIds.filter(id => baseline.eligibleIds.indexOf(id) === -1).map(nameOf);

  const supportDelta = now.cashMonthly - baseline.cashMonthly;
  const ownDelta = atTrue ? 0 : value - trueValue;

  /* An axis where nothing pays cash at any point draws no chart, and must not
     print a £0 headline either. renderNoResults() exists precisely so that
     nobody is shown £0 in the largest type on the page; reproducing it two
     sections further down would undo that. */
  const noCash = data.maxCash <= 0;

  const figure = noCash
    ? `<p class="text-base text-pretty text-ink">At <span class="font-semibold tabular-nums">${here}</span>, none of the help you may be able to get is regular cash. What is listed above lowers a bill or comes as a card instead, so there is nothing to plot here — but it can still stop, and where it stops is below.</p>`
    : `<p class="text-base text-pretty text-muted">If your ${g.noun} were <span class="font-semibold tabular-nums text-ink">${here}</span>, you may be able to get about</p>
       <div class="mt-0.5 flex flex-wrap items-baseline gap-x-2">
         <p class="text-2xl font-semibold tracking-tight tabular-nums text-brand-800">${exploreCash(now.cashMonthly)}</p>
         <p class="text-base font-medium text-brand-800">a month in cash support</p>
       </div>`;

  /* "the same" rather than silence: most of a taper is flat between its steps,
     and someone dragging across one needs to be told nothing happened rather
     than left to assume the panel has stopped working. */
  /* Tested on the ROUNDED figure, not the raw one. Everything else in the
     panel is rounded to the nearest £5 to agree with the headline, so a £2
     difference came out as "about £0 a month more cash support" — a sentence
     that is nonsense, and at a glance an alarming kind of nonsense. */
  const supportRounded = roundTo(Math.abs(supportDelta), 5);
  const supportPhrase = supportRounded < 5
    ? (Math.abs(supportDelta) < 0.5
        ? "the same cash support as your answers"
        : "about the same cash support as your answers")
    : `about ${gbp(supportRounded)} a month ${supportDelta > 0 ? "more" : "less"} cash support than your answers`;

  /* IS THE HOUSEHOLD ACTUALLY WORSE OFF? Measured on householdValueAnnual(),
     which counts every scheme, and not on the cash total.

     The cash total was the first attempt and it was silent at precisely the
     cliffs this panel exists to warn about, because the schemes with income
     cliffs are the ones that never touch it. Warm Home Discount is a one-off
     credit on an electricity bill; Healthy Start is a card for food and milk.
     A household on £408 dragged to £409 lost Healthy Start — £209 a year —
     and the panel said "the same cash support as your answers, and £1 a month
     more coming in" with no warning at all. Meanwhile dragging DOWN by £1,
     which costs about 45p, did print the warning. It was tracking the
     direction of travel rather than the outcome.

     explore-core.js documents householdValueAnnual() as never to be printed,
     and it is not printed: it decides one boolean. That is the same use
     findNearMiss() puts it to, and for the same reason — it is the only
     measure with the cliff schemes in it. Do not "simplify" this back to
     cashMonthly.

     Thresholded at MATERIAL_ANNUAL_MINIMUM so that nudging the slider one
     pound, which really does leave the household about 45p worse off, does
     not produce a warning about it. */
  const netAnnual = (now.householdAnnual - baseline.householdAnnual) + ownDelta * 12;
  const worseOff = data.key === "monthlyIncome" && netAnnual < -MATERIAL_ANNUAL_MINIMUM;
  const worse = !worseOff ? ""
    : ownDelta > 0
      /* The cliff, in one sentence. Someone whose pay is going up by £1 needs
         to be told this more than anyone else who will read this panel.
         Worded to avoid following "£1 a month more coming in" with "even
         though more is coming in", which is how it read at first. */
      ? " Even so, the household would end up with less overall."
      : " Overall that would leave the household with less.";

  let comparison;
  if (ownDelta === 0) {
    /* The no-cash sentence above already opens with "At £0, none of the help
       ... is regular cash", so following it with "That is what you told us"
       reads as a reply to a question nobody asked. */
    comparison = noCash ? "" : "That is what you told us.";
  } else {
    const own = data.key === "monthlyIncome"
      ? `${gbp(Math.abs(ownDelta))} a month ${ownDelta > 0 ? "more" : "less"} coming in`
      : `${gbp(Math.abs(ownDelta))} ${ownDelta > 0 ? "more" : "less"} in savings`;
    /* On an axis with no cash anywhere, "the same cash support as your
       answers" follows a sentence that has just said there is none of it. */
    comparison = noCash
      ? `That is ${own}.${worse}`
      : `That is ${supportPhrase}, ${data.key === "monthlyIncome" ? "and" : "with"} ${own}.${worse}`;
  }

  const changes = [];
  if (dropped.length) {
    changes.push(`<p class="mt-2 text-base text-pretty text-warn-700">At ${here} you would no longer be listed for ${listToSentence(dropped)}.</p>`);
  }
  if (added.length) {
    /* Neutral, not text-good-700. Every route to this line costs the reader
       income or capital; colouring it as a success is an inducement. */
    changes.push(`<p class="mt-2 text-base text-pretty text-ink">At ${here} the list above would also include ${listToSentence(added)}.</p>`);
  }

  /* The one place the panel gives the reader a direct instruction, and it is
     an instruction NOT to act. A savings slider that can be dragged downwards
     is an invitation to do the one thing that reliably backfires, so the
     warning appears the moment it is dragged that way. findNearMiss() in
     explore-core.js refuses to probe this axis at all for the same reason. */
  /* Triggered by the thumb moving BELOW WHERE IT STARTED, not below the true
     answer. Those differ when the answer is off the end of the axis: someone
     with £20,001 in savings had ownDelta of −£1 the instant they opened the
     tab, so the panel opened by lecturing them about spending savings down
     before they had touched anything — while "Back to the start" sat greyed
     out, the panel's own admission that they had not moved. */
  const deprivation = (data.key === "savings" && value < startValue) ? `
    <div class="mt-3 rounded-field border border-warn-700/30 bg-warn-50 p-3">
      <p class="text-base text-pretty text-ink"><strong>Spending savings down on purpose does not work.</strong> If money is spent or given away in order to qualify for something, the DWP can decide the claim as though the money were still there. It is called deprivation of capital. The money is gone and the claim is refused anyway.</p>
    </div>` : "";

  return `
    ${figure}
    ${comparison ? `<p class="mt-1 text-base text-pretty text-muted">${comparison}</p>` : ""}
    ${changes.join("")}
    ${deprivation}`;
}

/* Short enough to be worth hearing after every arrow key. The visible readout
   says more; this is what a screen reader gets — and it carries the same
   counterweight, because an announcement of "about £1,605 a month in cash
   support" with no mention of the twelve thousand pounds it cost is the same
   inducement read aloud. */
function exploreAnnouncement(data, input, baseline, value) {
  const trueValue = Number(input[data.key]) || 0;
  const atTrue = value === trueValue;
  const now = atTrue ? baseline : exploreEvalAt(input, data.key, value);
  const ownDelta = atTrue ? 0 : value - trueValue;

  const dropped = baseline.eligibleIds.filter(id => now.eligibleIds.indexOf(id) === -1);
  const lost = dropped.length
    ? " No longer listed for " + listToSentence(dropped.map(id => {
        const s = NATIONAL_SCHEMES.find(n => n.id === id);
        return s ? s.name : id;
      })) + "."
    : "";

  const head = data.maxCash <= 0
    ? `${exploreFormatValue(data.axis, value)}: no regular cash support.`
    : `${exploreFormatValue(data.axis, value)}: about ${exploreCash(now.cashMonthly)} a month in cash support.`;

  let cost = "";
  if (ownDelta < 0) {
    cost = data.key === "monthlyIncome"
      ? ` That is ${gbp(-ownDelta)} a month less coming in.`
      : ` That is ${gbp(-ownDelta)} less in savings.`;
  }
  return head + cost + lost;
}

/* ---------- THE CLIFF LIST ---------- */

/* The chart is a picture of this list. The list is the part that has to be
   right: it is what a screen reader gets, what survives printing, and what
   someone reads on a phone where a 100px-tall chart is barely legible. */
function renderExploreCliffs(data, hasChart) {
  const { axis, cliffs } = data;
  const g = exploreGrammar(data);

  if (!cliffs.length) {
    /* "which is what the chart shows" was printed unconditionally, including
       on the axes where maxCash is 0 and renderExploreChart() returns nothing
       — pointing the reader at a picture that is not on the page. */
    const tail = hasChart
      ? ` That does not mean the amounts stay the same — some of them change gradually as ${g.noun} ${g.change}, which is what the chart shows.`
      : ` That does not mean the amounts stay the same — some of them change gradually as ${g.noun} ${g.change}.`;
    return `
      <h3 class="mt-5 text-lg font-semibold tracking-tight text-ink">Where support stops</h3>
      <p class="mt-2 max-w-[56ch] text-base text-pretty text-muted">From your answers, none of the support above stops at any point on this range.${tail}</p>`;
  }

  const items = cliffs.map(c => {
    /* bisect() returns null when it cannot prove a single crossing, and
       findCliffs falls back to the coarse sample. Saying "around" there is the
       difference between a figure someone can act on and one that could be out
       by a full step. */
    const at = exploreFormatValue(axis, c.at);
    const where = c.exact
      ? `once your ${g.noun} ${g.goes} above <strong>${at}</strong>`
      : `at around <strong>${at}</strong> of ${g.noun}`;

    /* What the scheme is still worth at the last point it applies — the size
       of the step down, and the number that makes the warning mean anything.
       Left out when the scheme has no calculated amount: working-age Council
       Tax Reduction is signposted rather than calculated, and inventing a
       figure here would undo the whole reason it is signposted. */
    const worth = c.lostAmount ? formatAmount(c.lostAmount) : "";
    const kindNote = c.kind === "bill"
      ? " That lowers a bill rather than being paid to you."
      : c.kind === "in-kind"
        ? " That comes as a card to spend on food and milk, not money paid to you."
        : "";

    return `
      <li class="rounded-field border border-warn-700/30 bg-warn-50 p-3">
        <p class="text-base text-pretty text-ink"><strong>${c.name}</strong> stops ${where}.</p>
        ${worth ? `<p class="mt-1 text-base text-pretty text-muted">At ${at} it is still worth about ${worth}.${kindNote}</p>` : ""}
      </li>`;
  }).join("");

  return `
    <h3 class="mt-5 text-lg font-semibold tracking-tight text-ink">Where support stops</h3>
    <p class="mt-2 mb-3 max-w-[56ch] text-base text-pretty text-muted">These are points where a scheme stops altogether, rather than going down a little. They are estimates from the same few questions — the official pages are the ones that decide.</p>
    <ul role="list" class="flex flex-col gap-2">${items}</ul>`;
}

/* ---------- THE PANEL ---------- */

const EXPLORE_TAB = {
  on: "rounded-full border border-brand-600 bg-brand-600 px-4 py-2 text-base font-medium text-white",
  off: "rounded-full border border-line-strong bg-surface px-4 py-2 text-base font-medium text-brand-800"
};

function renderExploreBody(input) {
  const data = exploreDataFor(input, exploreState.axis);
  const { axis, maxCash } = data;
  const trueValue = Number(input[exploreState.axis]) || 0;
  const startValue = exploreStartValue(axis, trueValue);
  const baseline = exploreBaseline(input, exploreState.axis);
  const value = exploreState.value;
  const pct = ((value - axis.min) / (axis.max - axis.min)) * 100;

  /* Someone with £40,000 in savings has a real answer off the end of a £20,000
     axis, and the thumb has to sit somewhere. What it must not do is claim
     that somewhere is theirs: the readout compares against exploreBaseline(),
     evaluated at the real £40,000, so the opening state reads as the
     hypothetical it is rather than as "your starting point". */
  const offRange = trueValue > axis.max
    ? `<p class="mt-1.5 text-base text-pretty text-muted sm:text-sm">Your answer of ${exploreFormatValue(axis, trueValue)} is above the top of this range, so the slider starts at ${exploreFormatValue(axis, axis.max)}. The figures below compare that against your real answer.</p>`
    : "";

  const chart = renderExploreChart(data, input, startValue);
  const chartFrame = chart ? `
    <div class="mt-4">
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 text-base text-muted sm:text-sm">
        <span>Cash support a month</span>
        <span class="tabular-nums">up to about ${exploreCash(maxCash)}</span>
      </div>
      ${chart}
      <div class="flex justify-between text-base text-muted tabular-nums sm:text-sm">
        <span>${exploreFormatValue(axis, axis.min)}</span>
        <span>${exploreFormatValue(axis, axis.max)}</span>
      </div>
      ${data.cliffs.length ? `<p class="mt-2 text-base text-pretty text-muted sm:text-sm">${data.cliffs.length === 1
          ? "The dashed red line marks where a scheme stops. It is named underneath."
          : "The dashed red lines mark where a scheme stops. Each one is named underneath."}</p>` : ""}
    </div>` : "";

  /* step="any", not axis.step — see exploreStartValue(). The thumb has to be
     able to land on the answer itself, pence and all, and no rule boundary
     may fall between where it sits and the figure printed for it.
     wireExploreBody() binds the arrow keys to axis.step so that a continuous
     slider is still a usable keyboard control. */
  return `
    <label class="mb-1.5 block text-base font-medium text-ink" for="exploreSlider">${axis.label}</label>
    <input type="range" id="exploreSlider" name="exploreSlider" class="w-full"
           min="${axis.min}" max="${axis.max}" step="any" value="${value}"
           style="--range-progress:${pct}%"
           aria-valuetext="${exploreFormatValue(axis, value)}"
           aria-describedby="exploreSliderHint">
    <p id="exploreSliderHint" class="mt-1.5 text-base text-pretty text-muted sm:text-sm">Drag this, or use the arrow keys. Your answers do not change.</p>
    ${offRange}
    ${chartFrame}

    <div class="mt-4 rounded-field border border-line bg-canvas p-4" id="exploreReadoutCard">
      <div id="exploreReadout">${renderExploreReadout(data, input, baseline, startValue, value)}</div>
      <p class="mt-3">
        <button class="rounded-full border border-line-strong bg-surface px-4 py-2 text-base font-medium whitespace-nowrap text-brand-800 disabled:opacity-50"
                id="exploreResetBtn" type="button" ${value === startValue ? "disabled" : ""}>Back to the start</button>
      </p>
    </div>

    ${renderExploreCliffs(data, !!chart)}`;
}

/* Returns "" when there is nothing worth drawing, so the results screen does
   not grow an empty box: no national scheme matched at all, or a household
   whose support neither moves nor stops anywhere on either axis. */
function renderExplorePanel(input, nationalResults) {
  exploreState.input = null;
  if (!nationalResults.length) return "";

  /* The signature only governs the cache: a sweep is valid until one of the
     answers behind it changes. */
  const signature = exploreSignature(input);
  if (exploreState.signature !== signature) {
    exploreState.signature = signature;
    Object.keys(exploreCache).forEach(k => delete exploreCache[k]);
  }

  /* The slider, though, resets on every entry to the results screen, whether
     the answers changed or not. Someone who pressed "Change my answers",
     walked the four steps and came back has just re-stated what they earn;
     finding the slider still parked on the £4,000 they were poking at before,
     under a heading comparing it to a "starting point" they can no longer
     see, is a screen that has to be un-read before it can be read.

     Safe to do here because render() rebuilds the results step exactly once
     per entry — the panel updates its own subtree afterwards and never calls
     render() again, or this would fight the slider on every drag. */
  exploreState.axis = "monthlyIncome";
  exploreState.value = exploreStartValue(SWEEP_AXES.monthlyIncome, input.monthlyIncome);
  /* Bumped on every entry to the results screen so a debounced announcement
     queued by the previous one cannot speak into this one. */
  exploreState.generation++;

  const worthShowing = Object.keys(SWEEP_AXES).some(key => {
    const d = exploreDataFor(input, key);
    if (d.cliffs.length) return true;
    return d.series.some(p => Math.abs(p.cashMonthly - d.series[0].cashMonthly) > 0.5);
  });
  if (!worthShowing) return "";
  exploreState.input = input;

  const tabs = Object.keys(SWEEP_AXES).map(key => {
    const on = key === exploreState.axis;
    return `<button class="${on ? EXPLORE_TAB.on : EXPLORE_TAB.off}" type="button"
                    data-explore-axis="${key}" aria-pressed="${on}">${SWEEP_AXES[key].label}</button>`;
  }).join("");

  return `
    <h2 class="${SECTION_HEADING}">What if your money changed?</h2>
    <p class="${SECTION_NOTE}">Support does not always go down smoothly. There are points where a scheme stops altogether, and this shows where they are. Nothing here changes your answers, and nothing is saved.</p>

    <div class="rounded-field border border-line bg-surface p-4" id="explorePanel">
      <div class="mb-4 flex flex-wrap gap-2" role="group" aria-label="Choose what to change">${tabs}</div>
      <div id="exploreBody">${renderExploreBody(input)}</div>
    </div>`;
}

/* ---------- WIRING ---------- */

/* Called from render() once the results HTML is in the document. Everything
   below updates its own subtree and never calls render(), because render()
   rebuilds the whole step and moves focus to the heading — which during a drag
   would take focus off the slider mid-gesture. */
function wireExplorePanel() {
  const panel = document.getElementById("explorePanel");
  const input = exploreState.input;
  if (!panel || !input) return;

  panel.querySelectorAll("[data-explore-axis]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-explore-axis");
      if (key === exploreState.axis) return;
      exploreState.axis = key;
      exploreState.value = exploreStartValue(SWEEP_AXES[key], input[key]);
      panel.querySelectorAll("[data-explore-axis]").forEach(other => {
        const on = other === btn;
        other.className = on ? EXPLORE_TAB.on : EXPLORE_TAB.off;
        other.setAttribute("aria-pressed", String(on));
      });
      document.getElementById("exploreBody").innerHTML = renderExploreBody(input);
      wireExploreBody(input);
    });
  });

  wireExploreBody(input);
}

function wireExploreBody(input) {
  const slider = document.getElementById("exploreSlider");
  if (!slider) return;
  const resetBtn = document.getElementById("exploreResetBtn");
  const readout = document.getElementById("exploreReadout");
  const data = exploreDataFor(input, exploreState.axis);
  const axis = data.axis;
  const startValue = exploreStartValue(axis, input[exploreState.axis]);
  /* Computed once. It is the household as answered, so it cannot move while
     the slider does, and re-evaluating it per input event would be waste. */
  const baseline = exploreBaseline(input, exploreState.axis);

  clearTimeout(exploreState.announceTimer);

  function apply(value, fromSlider) {
    /* This closure outlives its slider. Switch axis mid-gesture and the
       browser still delivers the cancel to the detached income slider, whose
       listener then wrote an income figure into exploreState and read it
       aloud over the savings tab — the stale-announcement bug from the second
       review pass, back through a different door. One guard closes the whole
       class: if this slider is no longer in the document, this closure is not
       in charge of anything. */
    if (!slider.isConnected) return;
    exploreState.value = value;

    const pct = ((value - axis.min) / (axis.max - axis.min)) * 100;
    slider.style.setProperty("--range-progress", pct + "%");
    slider.setAttribute("aria-valuetext", exploreFormatValue(axis, value));
    if (!fromSlider) slider.value = String(value);

    const cursor = document.getElementById("exploreCursor");
    if (cursor) {
      cursor.setAttribute("transform", `translate(${chartX(axis, value).toFixed(1)},0)`);
      const dot = document.getElementById("exploreCursorDot");
      if (dot) {
        /* A round-capped near-zero-length line, not a circle — see the note on
           preserveAspectRatio above. It moves by its endpoints. */
        const cash = exploreEvalAt(input, data.key, value).cashMonthly;
        const y = Number(chartY(data.maxCash, cash).toFixed(1));
        dot.setAttribute("y1", y);
        dot.setAttribute("y2", y + 0.01);
      }
      const mark = document.getElementById("exploreStartMark");
      if (mark) mark.style.display = value === startValue ? "none" : "";
    }

    readout.innerHTML = renderExploreReadout(data, input, baseline, startValue, value);
    resetBtn.disabled = value === startValue;

    /* The readout itself is NOT a live region. A range input already announces
       its own aria-valuetext on every arrow key, so a live region on the same
       gesture would talk over it, and a drag would queue one announcement per
       step. Instead the app's single sr-only live region gets one short
       sentence, and only once the slider has been still for a moment.

       The generation check is not belt-and-braces. Move the slider and press
       "Change my answers" inside the debounce window and the timer used to
       fire onto step 1, telling a screen reader user they had lost Universal
       Credit while they were looking at the postcode question. */
    clearTimeout(exploreState.announceTimer);
    const generation = exploreState.generation;
    exploreState.announceTimer = setTimeout(() => {
      if (generation !== exploreState.generation) return;
      if (!document.getElementById("exploreSlider")) return;
      announce(exploreAnnouncement(data, input, baseline, value));
    }, 400);
  }

  slider.addEventListener("input", e => apply(Number(e.target.value), true));

  /* A native range commits a new value the moment a touch starts moving on it
     — it jumps to wherever the finger is, before anyone knows whether that
     finger is going sideways or down the page. touch-action:pan-y hands the
     vertical pan back to the browser, which is why the page scrolls again,
     but it cannot un-commit that jump: somebody flicking past the panel
     arrived further down the page with the readout quietly showing a
     hypothetical they never asked for.

     When the browser takes a gesture over it cancels the POINTER on this
     element — Chromium fires pointercancel and then keeps delivering
     touchmove, so touchcancel is the wrong thing to listen for; that was
     tried first and never fired. A cancel is the signal that the finger was
     scrolling rather than dragging, so the value goes back to where it was.
     A real sideways drag never cancels and is untouched by any of this.

     Armed for touch only. A mouse press on the track is SUPPOSED to jump to
     the click — that is how every slider on the web behaves. */
  /* Armed on the FIRST touch only. Arming unconditionally on every
     pointerdown meant the second finger of a pinch-zoom recorded the value
     the first finger had already knocked the control to, so the guard
     restored 3500 instead of 1100 and a two-finger zoom on the slider moved
     the value by four thousand pounds with nothing to undo it. Counting the
     touches down again is what keeps the recorded value alive until the whole
     gesture is over. */
  const livePointers = new Set();
  let valueBeforeTouch = null;

  const forgetTouch = () => { livePointers.clear(); valueBeforeTouch = null; };
  const undoTouchJump = () => {
    if (valueBeforeTouch !== null && Number(slider.value) !== valueBeforeTouch) {
      slider.value = String(valueBeforeTouch);
      apply(valueBeforeTouch, true);
    }
  };

  slider.addEventListener("pointerdown", e => {
    if (e.pointerType !== "touch") return;
    if (livePointers.size === 0) valueBeforeTouch = Number(slider.value);
    livePointers.add(e.pointerId);
  }, { passive: true });
  slider.addEventListener("pointerup", e => {
    if (e.pointerType !== "touch") return;
    livePointers.delete(e.pointerId);
    if (livePointers.size === 0) valueBeforeTouch = null;
  }, { passive: true });
  slider.addEventListener("pointercancel", e => {
    if (e.pointerType !== "touch") return;
    undoTouchJump();
    livePointers.delete(e.pointerId);
    if (livePointers.size === 0) valueBeforeTouch = null;
  }, { passive: true });

  /* Tracked by id rather than counted, and hard-reset the moment no finger is
     left on the glass. A bare counter drifts if an engine ever drops a
     pointerup — and a drifted counter is not a harmless miscount, it is a
     recorded value that never expires, waiting for some later cancel to
     restore a figure from a gesture minutes ago. touchend is the one event
     that can say authoritatively that the hand has gone. */
  slider.addEventListener("touchend", e => {
    if (!e.touches || e.touches.length === 0) forgetTouch();
  }, { passive: true });
  /* Belt and braces for an engine that cancels the touch instead of the
     pointer. A touch event carries no pointerType to test against, so the
     whole gesture is torn down.

     WORDING NOTE, and it is not pedantry: Tailwind's scanner reads these
     comments as well as the code, and an ordinary English word that happens
     to also be a utility name gets compiled into dist/style.css as a real
     rule. One word in the sentence above did exactly that on the way in.
     Nothing breaks — it is inert CSS — but this project's worst documented
     footgun is the gap between the classes in the source and the classes in
     the build, and prose quietly widening that gap is worth knowing about. */
  slider.addEventListener("touchcancel", () => {
    undoTouchJump();
    forgetTouch();
  }, { passive: true });

  /* step="any" is what lets the thumb land on the user's own answer to the
     penny, but a continuous slider has no useful keyboard step at all. The
     arrows are therefore bound to the sweep step. Home and End are left to
     the browser: they already go to the ends and fire input. */
  slider.addEventListener("keydown", e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    let delta = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = axis.step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -axis.step;
    else if (e.key === "PageUp") delta = axis.step * 10;
    else if (e.key === "PageDown") delta = -axis.step * 10;
    else return;
    e.preventDefault();
    /* Snapped to the sweep grid rather than added to whatever pence the thumb
       is sitting on, so that a household answering £1,200.756 gets £1,225 and
       £1,250 from repeated presses instead of £1,225.756 and £1,250.756. */
    const raw = Number(slider.value) + delta;
    const snapped = Math.round(raw / axis.step) * axis.step;
    const next = Math.min(axis.max, Math.max(axis.min, snapped));
    slider.value = String(next);
    apply(next, true);
  });

  resetBtn.addEventListener("click", () => {
    apply(startValue, false);
    slider.focus();
  });
}
