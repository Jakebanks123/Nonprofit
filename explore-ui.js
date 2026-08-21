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

/* The slider steps by axis.step, so every value it can hold is exactly one of
   the sampled points and the chart never has to interpolate. That only holds
   if the starting point is on the grid too — an income of £1,234 is not a
   multiple of £25, and the browser would silently snap the thumb to £1,225
   while this file went on believing it was at £1,234. Snapping here, once,
   keeps the two in agreement.

   Also clamped: sanitiseInput allows savings up to £10,000,000 and the axis
   stops at £20,000, so a value off the end of the range has to land somewhere
   real. renderExploreBody says so when that happens rather than quietly
   pretending £50,000 of savings is £20,000. */
function exploreSnap(axis, value) {
  const clamped = Math.min(axis.max, Math.max(axis.min, Number(value) || 0));
  const steps = Math.round((clamped - axis.min) / axis.step);
  return axis.min + steps * axis.step;
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

/* Index straight into the sweep rather than re-evaluating. Exact, not
   approximate, because exploreSnap() guarantees the value is a sampled x. */
function explorePointAt(data, value) {
  const i = Math.round((value - data.axis.min) / data.axis.step);
  return data.series[Math.min(data.series.length - 1, Math.max(0, i))]
    || { x: value, cashMonthly: 0, eligibleIds: [] };
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

function renderExploreChart(data, startValue) {
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
  const startY = chartY(maxCash, explorePointAt(data, startValue).cashMonthly).toFixed(1);

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

/* What changes between where the slider started and where it has been dragged.

   Named schemes, not just a number: "£430 a month less" does not tell anyone
   which thing to go and read about, and the cash figure moves for two quite
   different reasons — an award tapering down, and an award stopping. */
function renderExploreReadout(data, startValue, value) {
  const { axis } = data;
  const g = exploreGrammar(data);
  const here = exploreFormatValue(axis, value);
  const now = explorePointAt(data, value);
  const start = explorePointAt(data, startValue);

  const nameOf = id => {
    const s = NATIONAL_SCHEMES.find(n => n.id === id);
    return s ? s.name : id;
  };
  const dropped = start.eligibleIds.filter(id => now.eligibleIds.indexOf(id) === -1).map(nameOf);
  const added = now.eligibleIds.filter(id => start.eligibleIds.indexOf(id) === -1).map(nameOf);

  const delta = now.cashMonthly - start.cashMonthly;
  const diff = exploreCash(Math.abs(delta));

  /* "the same" rather than silence, because on a flat stretch the sameness is
     the finding — most of a taper is flat between its steps, and someone
     dragging across one needs to be told nothing happened rather than left to
     assume the panel has stopped working. */
  let comparison;
  if (value === startValue) comparison = "That is your starting point, from the answers you gave.";
  else if (Math.abs(delta) < 0.5) comparison = "That is the same cash support as your starting point.";
  else if (delta > 0) comparison = `That is about ${diff} a month more than your starting point.`;
  else comparison = `That is about ${diff} a month less than your starting point.`;

  const changes = [];
  if (dropped.length) {
    changes.push(`<p class="mt-2 text-base text-pretty text-warn-700">At ${here} you would no longer be listed for ${listToSentence(dropped)}.</p>`);
  }
  if (added.length) {
    changes.push(`<p class="mt-2 text-base text-pretty text-good-700">At ${here} you would also be listed for ${listToSentence(added)}.</p>`);
  }

  return `
    <p class="text-base text-pretty text-muted">If your ${g.noun} were <span class="font-semibold tabular-nums text-ink">${here}</span>, you may be able to get about</p>
    <div class="mt-0.5 flex flex-wrap items-baseline gap-x-2">
      <p class="text-2xl font-semibold tracking-tight tabular-nums text-brand-800">${exploreCash(now.cashMonthly)}</p>
      <p class="text-base font-medium text-brand-800">a month in cash support</p>
    </div>
    <p class="mt-1 text-base text-pretty text-muted">${comparison}</p>
    ${changes.join("")}`;
}

/* Short enough to be worth hearing after every arrow key. The visible readout
   above says more; this is the part a screen reader gets. */
function exploreAnnouncement(data, startValue, value) {
  const now = explorePointAt(data, value);
  const start = explorePointAt(data, startValue);
  const dropped = start.eligibleIds.filter(id => now.eligibleIds.indexOf(id) === -1);
  const lost = dropped.length
    ? " No longer listed for " + listToSentence(dropped.map(id => {
        const s = NATIONAL_SCHEMES.find(n => n.id === id);
        return s ? s.name : id;
      })) + "."
    : "";
  return `${exploreFormatValue(data.axis, value)}: about ${exploreCash(now.cashMonthly)} a month in cash support.${lost}`;
}

/* ---------- THE CLIFF LIST ---------- */

/* The chart is a picture of this list. The list is the part that has to be
   right: it is what a screen reader gets, what survives printing, and what
   someone reads on a phone where a 100px-tall chart is barely legible. */
function renderExploreCliffs(data) {
  const { axis, cliffs } = data;
  const g = exploreGrammar(data);

  if (!cliffs.length) {
    return `
      <h3 class="mt-5 text-lg font-semibold tracking-tight text-ink">Where support stops</h3>
      <p class="mt-2 max-w-[56ch] text-base text-pretty text-muted">From your answers, none of the support above stops at any point on this range. That does not mean the amounts stay the same — some of them change gradually as ${g.noun} ${g.change}, which is what the chart shows.</p>`;
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
  const startValue = exploreSnap(axis, input[exploreState.axis]);
  const value = exploreState.value;
  const pct = ((value - axis.min) / (axis.max - axis.min)) * 100;

  /* Someone with £50,000 in savings has a real answer that is off the end of a
     £20,000 axis. Clamping silently would show them a starting point that is
     not theirs, so it is said out loud. */
  const trueValue = Number(input[exploreState.axis]) || 0;
  const offRange = trueValue > axis.max
    ? `<p class="mt-1.5 text-base text-pretty text-muted sm:text-sm">Your answer of ${exploreFormatValue(axis, trueValue)} is above the top of this range, so the slider starts at ${exploreFormatValue(axis, axis.max)}.</p>`
    : "";

  const chart = renderExploreChart(data, startValue);
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

  return `
    <label class="mb-1.5 block text-base font-medium text-ink" for="exploreSlider">${axis.label}</label>
    <input type="range" id="exploreSlider" name="exploreSlider" class="w-full"
           min="${axis.min}" max="${axis.max}" step="${axis.step}" value="${value}"
           style="--range-progress:${pct}%"
           aria-valuetext="${exploreFormatValue(axis, value)}"
           aria-describedby="exploreSliderHint">
    <p id="exploreSliderHint" class="mt-1.5 text-base text-pretty text-muted sm:text-sm">Drag this, or use the arrow keys. Your answers do not change.</p>
    ${offRange}
    ${chartFrame}

    <div class="mt-4 rounded-field border border-line bg-canvas p-4">
      <div id="exploreReadout">${renderExploreReadout(data, startValue, value)}</div>
      <p class="mt-3">
        <button class="rounded-full border border-line-strong bg-surface px-4 py-2 text-base font-medium whitespace-nowrap text-brand-800 disabled:opacity-50"
                id="exploreResetBtn" type="button" ${value === startValue ? "disabled" : ""}>Back to the start</button>
      </p>
    </div>

    ${renderExploreCliffs(data)}`;
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
  exploreState.value = exploreSnap(SWEEP_AXES.monthlyIncome, input.monthlyIncome);

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
      exploreState.value = exploreSnap(SWEEP_AXES[key], input[key]);
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
  const startValue = exploreSnap(data.axis, input[exploreState.axis]);

  /* A stale timer from the previous axis would otherwise read out a figure
     from a chart that is no longer on screen. */
  clearTimeout(exploreState.announceTimer);

  function apply(value, fromSlider) {
    exploreState.value = value;
    const axis = data.axis;

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
        const y = Number(chartY(data.maxCash, explorePointAt(data, value).cashMonthly).toFixed(1));
        dot.setAttribute("y1", y);
        dot.setAttribute("y2", y + 0.01);
      }
      const mark = document.getElementById("exploreStartMark");
      if (mark) mark.style.display = value === startValue ? "none" : "";
    }

    readout.innerHTML = renderExploreReadout(data, startValue, value);
    resetBtn.disabled = value === startValue;

    /* The readout itself is NOT a live region. A range input already announces
       its own aria-valuetext on every arrow key, so a live region on the same
       gesture would talk over it, and a drag would queue one announcement per
       step. Instead the app's single sr-only live region gets one short
       sentence, and only once the slider has been still for a moment. */
    clearTimeout(exploreState.announceTimer);
    exploreState.announceTimer = setTimeout(() => {
      announce(exploreAnnouncement(data, startValue, value));
    }, 400);
  }

  slider.addEventListener("input", e => apply(Number(e.target.value), true));
  resetBtn.addEventListener("click", () => {
    apply(startValue, false);
    slider.focus();
  });
}
