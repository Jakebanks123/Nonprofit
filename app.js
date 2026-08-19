/* Wizard state, rendering and form wiring.

   Reads the form, runs each scheme's evaluate() rule against the answers
   (see data/schemes.js) and renders the matches. Expects data/postcodes.js
   and data/schemes.js to have loaded first. */

/* =========================================================
   WIZARD STATE + STEP DEFINITIONS
   ========================================================= */

const state = {
  step: 0,
  input: {
    postcode: "",
    council: "",
    detectedDistrict: "",
    age: null,
    adults: 1,
    children: 0,
    employment: "employed",
    monthlyIncome: null,
    highestIndividualIncome: null,
    savings: 0,
    housingCosts: 0,
    receivingUC: false,
    receivingPensionCredit: false,
    limitedCapabilityForWork: false,
    hasDisabilityOrHealthCondition: false,
    pregnantOrChildUnder4: false
  }
};

const STEPS = ["location", "household", "income", "circumstances", "results"];

/* Tailwind finds class names by plain text search, so it can never see a class
   assembled from pieces. Every state below is written out in full. */
const PROGRESS_SEG = {
  done: "h-1.5 flex-1 rounded-full bg-brand-600",
  current: "h-1.5 flex-1 rounded-full bg-accent-600",
  todo: "h-1.5 flex-1 rounded-full bg-line"
};

function renderProgress() {
  const track = document.getElementById("progressTrack");
  track.innerHTML = "";
  STEPS.slice(0, 4).forEach((_, i) => {
    const seg = document.createElement("div");
    const stateKey = i < state.step ? "done" : i === state.step ? "current" : "todo";
    seg.className = PROGRESS_SEG[stateKey];
    track.appendChild(seg);
  });
}

function announce(text) {
  document.getElementById("liveRegion").textContent = text;
}

function goTo(stepIndex) {
  state.step = stepIndex;
  render();
}

function next() {
  const error = validateStep(state.step);
  if (error) {
    clearStepError();
    showStepError(error);
    return;
  }
  clearStepError();
  state.step = Math.min(state.step + 1, STEPS.length - 1);
  render();
}

/* Announcement is deliberately single-channel. Previously this wrote to a
   role="alert" box AND pushed the same string into the live region, so every
   error was read out twice. Now focus moves to the offending field, whose
   aria-describedby points at the error text — so it is announced exactly once,
   by the same action that puts the cursor where the fix is needed.

   The box is still shown and hidden with an inline style.display rather than a
   utility class, because verify-ui.js asserts on style.display. */
function showStepError(error) {
  const box = document.getElementById("stepError");
  if (box) {
    box.textContent = error.message;
    box.style.display = "block";
  }
  const field = error.field && document.getElementById(error.field);
  if (field) {
    field.setAttribute("aria-invalid", "true");
    const described = (field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    if (!described.includes("stepError")) described.unshift("stepError");
    field.setAttribute("aria-describedby", described.join(" "));
    field.focus();
  } else if (box) {
    announce(error.message);
  }
}

function clearStepError() {
  const box = document.getElementById("stepError");
  if (box) {
    box.textContent = "";
    box.style.display = "none";
  }
  document.querySelectorAll('[aria-invalid="true"]').forEach(field => {
    field.removeAttribute("aria-invalid");
    const described = (field.getAttribute("aria-describedby") || "")
      .split(/\s+/).filter(id => id && id !== "stepError");
    if (described.length) field.setAttribute("aria-describedby", described.join(" "));
    else field.removeAttribute("aria-describedby");
  });
}

function back() {
  state.step = Math.max(state.step - 1, 0);
  render();
}

/* Returns null when the step is valid, or a human-readable message naming
   what needs fixing. The message is shown inline AND announced to screen
   readers, so pressing Next never silently does nothing. */
/* Returns null, or { field, message }. The field matters: an error box on its
   own tells a screen-reader user something is wrong but not which of six
   inputs to fix. Messages say what to do rather than stating a rule —
   "A household needs at least 1 adult" is true and useless. */
function validateStep(stepIndex) {
  const s = state.input;
  const stepName = STEPS[stepIndex];
  const finite = v => typeof v === "number" && Number.isFinite(v);
  const err = (field, message) => ({ field, message });

  if (stepName === "location") {
    if (!s.council) return err("councilSearch", "We need to know your council. Type your postcode and press \"Find my council\". Or type your council's name in the box below.");
    return null;
  }
  if (stepName === "household") {
    if (!finite(s.age)) return err("age", "Enter your age.");
    if (s.age < 16 || s.age > 120) return err("age", "Enter an age between 16 and 120.");
    if (!finite(s.adults) || s.adults < 1) return err("adults", "Enter 1 or more adults. Remember to count yourself.");
    if (s.adults > 10) return err("adults", "Enter no more than 10 adults.");
    if (!finite(s.children) || s.children < 0) return err("children", "Children must be 0 or more. Enter 0 if you have none.");
    if (s.children > 15) return err("children", "Enter no more than 15 children.");
    return null;
  }
  if (stepName === "income") {
    if (!finite(s.monthlyIncome)) return err("monthlyIncome", "Enter how much money your home gets each month, after tax. Enter 0 if you get none.");
    if (s.monthlyIncome < 0) return err("monthlyIncome", "Income cannot be less than 0. Enter 0 if you have none.");
    if (s.monthlyIncome > 100000) return err("monthlyIncome", "Enter a monthly income under £100,000.");
    if (!finite(s.savings) || s.savings < 0) return err("savings", "Savings cannot be less than 0. Enter 0 if you have none.");
    if (s.savings > 10000000) return err("savings", "Enter savings under £10,000,000.");
    if (!finite(s.housingCosts) || s.housingCosts < 0) return err("housingCosts", "Rent or mortgage cannot be less than 0. Enter 0 if you pay none.");
    if (s.housingCosts > 10000) return err("housingCosts", "Enter a monthly rent or mortgage under £10,000.");
    if (s.adults >= 2 && s.highestIndividualIncome != null) {
      if (s.highestIndividualIncome < 0) return err("highestIndividualIncome", "The highest single income cannot be less than 0.");
      if (s.highestIndividualIncome > s.monthlyIncome) return err("highestIndividualIncome", "One person cannot earn more than everyone in your home put together. Please check both numbers.");
    }
    return null;
  }
  return null;
}

/* ---------- SHARED UI CLASSES ---------- */

/* Every class name is written out in full and picked from a lookup, never
   assembled by joining strings. Tailwind finds classes by plain text search,
   so a class it cannot see produces an unstyled element and no build error. */
const UI = {
  eyebrow: "mb-1.5 text-base font-medium text-brand-600 sm:text-sm",
  title: "mb-2 max-w-[40ch] text-3xl font-semibold tracking-tight text-balance text-ink",
  intro: "mb-6 max-w-[56ch] text-base text-pretty text-muted",
  group: "mb-5",
  row: "mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2",
  label: "mb-1.5 block text-base font-medium text-ink",
  hint: "mt-1.5 text-base text-pretty text-muted sm:text-sm",
  status: "mt-2 text-base text-pretty text-muted sm:text-sm",
  /* border-line-strong, not border-line: a control's boundary needs 3:1 to
     satisfy WCAG 2.2 SC 1.4.11. The soft line is for dividers only. */
  field: "block w-full rounded-field border border-line-strong bg-surface px-3 py-2.5 text-base text-ink placeholder:text-muted",
  select: "col-span-full row-start-1 w-full appearance-none rounded-field border border-line-strong bg-surface px-3 py-2.5 pr-8 text-base text-ink",
  /* Both buttons declare an explicit 1px border. Preflight is not loaded yet,
     so a <button> otherwise keeps the browser's own 2px default border and the
     two would not be the same height side by side. The primary's border
     matches its background rather than being translucent. */
  btnPrimary: "rounded-full border border-brand-600 bg-brand-600 px-4 py-2.5 text-base font-medium text-white disabled:opacity-50",
  btnSecondary: "rounded-full border border-line-strong bg-surface px-4 py-2.5 text-base font-medium text-brand-800 disabled:opacity-50"
};

const SELECT_CHEVRON = `
  <svg viewBox="0 0 8 5" width="8" height="5" fill="none"
       class="pointer-events-none col-start-2 row-start-1 place-self-center stroke-muted" aria-hidden="true">
    <path d="M.5.5 4 4 7.5.5"/>
  </svg>`;

/* ---------- STEP RENDERERS ---------- */

function renderLocationStep() {
  const datalistOptions = ALL_ENGLAND_COUNCILS.map(name => `<option value="${name}"></option>`).join("");
  const currentSearchValue = state.input.detectedDistrict || (state.input.council && state.input.council !== "other"
    ? COUNCILS.find(c => c.id === state.input.council)?.realName || ""
    : "");

  return `
    <p class="${UI.eyebrow}">Step 1 of 4</p>
    <h1 class="${UI.title}" tabindex="-1" id="stepHeading">Where are you based?</h1>
    <p class="${UI.intro}">We use this to show help from your local council, as well as UK-wide help. Not sure which council you are in? Enter your postcode and we will find it.</p>

    <div class="${UI.group}">
      <label class="${UI.label}" for="postcode">Your postcode</label>
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start">
        <input type="text" id="postcode" name="postcode" class="${UI.field} sm:flex-1"
               value="${state.input.postcode}" placeholder="e.g. E14 5AA"
               autocomplete="postal-code" autocapitalize="characters" spellcheck="false"
               aria-describedby="postcodeHint">
        <button class="${UI.btnSecondary} w-full sm:w-auto" id="lookupBtn" type="button">Find my council</button>
      </div>
      <p class="${UI.hint}" id="postcodeHint">We send only your postcode, to a free public service, so we can find your council. Nothing else you type leaves your phone or computer. If that service is down, we use a copy of the official postcode list saved in this page. England only, for now.</p>
      <div id="lookupStatus" class="${UI.status}" aria-live="polite"></div>
    </div>

    <div class="${UI.group}">
      <label class="${UI.label}" for="councilSearch">Or search for your council directly</label>
      <input type="text" id="councilSearch" name="councilSearch" class="${UI.field}"
             list="councilOptions" value="${currentSearchValue}"
             placeholder="Start typing a council name…" autocomplete="off"
             aria-describedby="councilSearchHint">
      <datalist id="councilOptions">${datalistOptions}</datalist>
      <p class="${UI.hint}" id="councilSearchHint">Covers all 296 English councils. Scotland, Wales and Northern Ireland are not covered yet.</p>
      <div id="councilSearchStatus" class="${UI.status}" aria-live="polite"></div>
    </div>
  `;
}

function renderHouseholdStep() {
  return `
    <p class="${UI.eyebrow}">Step 2 of 4</p>
    <h1 class="${UI.title}" tabindex="-1" id="stepHeading">Tell us about your household</h1>
    <p class="${UI.intro}">Rough numbers are fine. This is an estimate, not an application.</p>

    <div class="${UI.row}">
      <div>
        <label class="${UI.label}" for="age">Your age</label>
        <input type="number" id="age" name="age" class="${UI.field}" inputmode="numeric"
               min="16" max="120" value="${state.input.age ?? ""}">
      </div>
      <div>
        <label class="${UI.label}" for="adults">Adults in household</label>
        <input type="number" id="adults" name="adults" class="${UI.field}" inputmode="numeric"
               min="1" max="10" value="${state.input.adults}" aria-describedby="adultsHint">
        <p class="${UI.hint}" id="adultsHint">Count yourself.</p>
      </div>
    </div>

    <div class="${UI.group}">
      <label class="${UI.label}" for="children">Children</label>
      <input type="number" id="children" name="children" class="${UI.field}" inputmode="numeric"
             min="0" max="15" value="${state.input.children}" aria-describedby="childrenHint">
      <p class="${UI.hint}" id="childrenHint">Under 16, or under 20 and in full-time education.</p>
    </div>
  `;
}

function renderIncomeStep() {
  const opts = [
    ["employed", "Employed (full or part-time)"],
    ["self-employed", "Self-employed"],
    ["unemployed", "Unemployed, or looking for work"],
    ["retired", "Retired"],
    ["unable", "Unable to work because of health or disability"]
  ];

  return `
    <p class="${UI.eyebrow}">Step 3 of 4</p>
    <h1 class="${UI.title}" tabindex="-1" id="stepHeading">Income, savings and housing</h1>
    <p class="${UI.intro}">None of this is sent anywhere or saved. It stays in your browser for this visit only.</p>

    <div class="${UI.group}">
      <label class="${UI.label}" for="employment">Employment status</label>
      <div class="grid w-full grid-cols-[1fr_--spacing(8)]">
        <select id="employment" name="employment" class="${UI.select}">
          ${opts.map(([v, text]) => `<option value="${v}" ${state.input.employment === v ? "selected" : ""}>${text}</option>`).join("")}
        </select>
        ${SELECT_CHEVRON}
      </div>
    </div>

    <div class="${UI.row}">
      <div>
        <label class="${UI.label}" for="monthlyIncome">Household take-home income</label>
        <input type="number" id="monthlyIncome" name="monthlyIncome" class="${UI.field}" inputmode="numeric"
               min="0" value="${state.input.monthlyIncome ?? ""}" aria-describedby="monthlyIncomeHint">
        <p class="${UI.hint}" id="monthlyIncomeHint">Per month, after tax, in £.</p>
      </div>
      <div>
        <label class="${UI.label}" for="savings">Savings and investments</label>
        <input type="number" id="savings" name="savings" class="${UI.field}" inputmode="numeric"
               min="0" value="${state.input.savings}" aria-describedby="savingsHint">
        <p class="${UI.hint}" id="savingsHint">Total, in £.</p>
      </div>
    </div>

    ${state.input.adults >= 2 ? `
    <div class="${UI.group}">
      <label class="${UI.label}" for="highestIndividualIncome">Highest single income in the household</label>
      <input type="number" id="highestIndividualIncome" name="highestIndividualIncome" class="${UI.field}" inputmode="numeric"
             min="0" value="${state.input.highestIndividualIncome ?? ""}" aria-describedby="highestIndividualIncomeHint">
      <p class="${UI.hint}" id="highestIndividualIncomeHint">Per month, after tax, in £ — whichever one person earns the most. We ask because of a tax rule for Child Benefit. It looks at what one person earns, not what your whole home earns. So two people on £45,000 each are treated differently from one person on £90,000.</p>
    </div>` : ""}

    <div class="${UI.group}">
      <label class="${UI.label}" for="housingCosts">Rent or mortgage</label>
      <input type="number" id="housingCosts" name="housingCosts" class="${UI.field}" inputmode="numeric"
             min="0" value="${state.input.housingCosts}" aria-describedby="housingCostsHint">
      <p class="${UI.hint}" id="housingCostsHint">Per month, in £. Enter 0 if you pay none.</p>
    </div>
  `;
}

function renderCircumstancesStep() {
  const items = [
    ["receivingUC", "You already get Universal Credit"],
    ["receivingPensionCredit", "You already get Pension Credit"],
    ["limitedCapabilityForWork", "A health condition or disability limits how much you can work, or you have been assessed as having limited capability for work"],
    ["hasDisabilityOrHealthCondition", "You or someone in your home has a disability or a long-term health condition"],
    ["pregnantOrChildUnder4", "You are pregnant, or have a child under 4"]
  ];

  return `
    <p class="${UI.eyebrow}">Step 4 of 4</p>
    <h1 class="${UI.title}" tabindex="-1" id="stepHeading">A few more circumstances</h1>
    <p class="${UI.intro}">These help us narrow down which schemes apply to you. Skip anything that does not.</p>

    <div class="flex flex-col gap-2.5">
      ${items.map(([key, label]) => `
        <label class="flex cursor-pointer items-start gap-3 rounded-field border border-line bg-canvas p-3 has-checked:border-brand-600 has-checked:bg-brand-50" for="${key}">
          <span class="flex h-lh shrink-0 items-center text-base">
            <input type="checkbox" id="${key}" name="${key}" class="size-5 accent-brand-600 sm:size-4" ${state.input[key] ? "checked" : ""}>
          </span>
          <span class="text-base text-pretty text-ink">${label}</span>
        </label>
      `).join("")}
    </div>

    <div class="mt-6 rounded-field border border-line bg-brand-50 p-4">
      <p class="text-base text-pretty text-brand-800 sm:text-sm">
        <span class="font-medium">Your answers stay in this browser tab.</span>
        Closing or refreshing the page clears everything. Nothing is stored or sent anywhere.
      </p>
    </div>
  `;
}

/* ---------- RESULTS ---------- */

/* Defence in depth. The wizard's validation should already have stopped
   anything silly, but the scheme formulas assume sane numbers — an unguarded
   NaN or a nonsense figure would otherwise surface as "£NaN" or a headline
   figure in the billions. Clamp here too, so the display layer can never be
   fed something it can't render honestly. */
function sanitiseInput(raw) {
  const num = (v, min, max, fallback) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  return Object.assign({}, raw, {
    age: num(raw.age, 16, 120, 16),
    adults: Math.round(num(raw.adults, 1, 10, 1)),
    children: Math.round(num(raw.children, 0, 15, 0)),
    monthlyIncome: num(raw.monthlyIncome, 0, 100000, 0),
    highestIndividualIncome: raw.highestIndividualIncome == null
      ? null
      : num(raw.highestIndividualIncome, 0, 100000, 0),
    savings: num(raw.savings, 0, 10000000, 0),
    housingCosts: num(raw.housingCosts, 0, 10000, 0)
  });
}

function computeResults() {
  const input = sanitiseInput(state.input);
  const nationalResults = NATIONAL_SCHEMES
    .map(scheme => ({ scheme, result: scheme.evaluate(input) }))
    .filter(r => r.result.eligible);

  const localSchemes = LOCAL_SCHEMES[input.council] || [];
  const localResults = localSchemes
    .map(scheme => ({ scheme, result: scheme.evaluate(input) }))
    .filter(r => r.result.eligible);

  return { nationalResults, localResults };
}

/* The old version added every scheme's monthly value into one pot and
   multiplied by 12. That pot mixed things that are not the same kind of
   thing: Council Tax Support is a reduction on a bill, Healthy Start is a
   prepaid card for food, and only the rest is money that arrives in a bank
   account. Presenting the sum as one annual cash figure overstates what
   someone actually receives, which is exactly what the copycat sites do.

   Cash is now totalled on its own, and bill reductions and in-kind help are
   named separately rather than folded into the number. Local schemes are
   excluded entirely — their amounts are placeholders (see renderLocalSection)
   so they must not reach a headline figure. */
function sumEstimates(results) {
  let cashMonthly = 0;
  let oneOffCash = 0;
  const billHelp = [];
  const inKind = [];

  results.forEach(({ scheme, result }) => {
    const kind = scheme.kind || "cash";
    const amount = result.amount;

    if (kind === "bill") { billHelp.push(scheme.name); return; }
    if (kind === "in-kind") { inKind.push(scheme.name); return; }

    if (!amount || !amount.value) return;
    if (amount.period === "month") cashMonthly += amount.value;
    else if (amount.period === "year") cashMonthly += amount.value / 12;
    else if (amount.period === "one-off") oneOffCash += amount.value;
  });

  return { cashMonthly, cashAnnual: cashMonthly * 12, oneOffCash, billHelp, inKind };
}

/* A figure rounded to the nearest pound reads as a calculation someone has
   already done for you. Rounding it visibly is part of saying "estimate". */
function roundTo(value, step) {
  return Math.round(value / step) * step;
}

function annualValue(result) {
  const a = result.amount;
  if (!a || !a.value) return 0;
  if (a.period === "month") return a.value * 12;
  return a.value;
}

function formatAmount(amount) {
  if (!amount) return "";
  if (amount.display) return amount.display;
  if (!amount.value) return "";
  if (amount.period === "month") return gbp(amount.value) + " a month";
  if (amount.period === "year") return gbp(amount.value) + " a year";
  if (amount.period === "one-off") return gbp(amount.value) + " one-off";
  return "";
}

/* Reads the domain out of the scheme's own URL so the button can name where
   it is sending someone. Telling people the destination before they tap is a
   trust signal; "Learn more" is not. */
function linkHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch (e) { return "the official site"; }
}

/* "Worth checking" was covering two unrelated situations: we trust the rule
   but not your exact figures, and a human at the council decides. Those imply
   different actions, so they get different words. */
const BADGE = {
  likely: {
    cls: "inline-block rounded-full border border-good-700/25 bg-good-50 px-2.5 py-0.5 text-base text-good-700 sm:text-sm",
    text: "You probably qualify"
  },
  possible: {
    cls: "inline-block rounded-full border border-accent-600/25 bg-accent-50 px-2.5 py-0.5 text-base text-accent-600 sm:text-sm",
    text: "You might qualify — it depends on your exact figures"
  },
  discretionary: {
    cls: "inline-block rounded-full border border-accent-600/25 bg-accent-50 px-2.5 py-0.5 text-base text-accent-600 sm:text-sm",
    text: "You have to apply and be assessed — your council decides"
  }
};

/* A bill reduction and a food card still have a pound figure, so the card
   has to say what kind of pound figure it is. Without this the summary says
   "not cash" while the card underneath shows "£105 a month" like the rest. */
const KIND_NOTE = {
  bill: "This lowers a bill you already have. It is not money paid to you.",
  "in-kind": "This comes as a card to spend on food and milk, not money paid to you."
};

function badgeKey({ scheme, result }) {
  if (result.confidence === "likely") return "likely";
  return scheme.category === "local" ? "discretionary" : "possible";
}

/* showAmount is false for council schemes: the figures in the data are
   placeholders, so the section says so once instead of printing a number we
   cannot stand behind. */
function renderSchemeCard({ scheme, result }, showAmount) {
  const badge = BADGE[badgeKey({ scheme, result })];
  const amountText = showAmount ? formatAmount(result.amount) : "";
  const host = linkHost(scheme.url);

  return `
    <li class="rounded-field border border-line bg-surface p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 class="scheme-name text-lg font-semibold tracking-tight text-ink">${scheme.name}</h3>
        ${amountText ? `<p class="text-lg font-semibold tabular-nums whitespace-nowrap text-brand-800">${amountText}</p>` : ""}
      </div>
      <p class="mt-2"><span class="${badge.cls}">${badge.text}</span></p>
      ${KIND_NOTE[scheme.kind] ? `<p class="mt-2.5 text-base text-pretty font-medium text-ink">${KIND_NOTE[scheme.kind]}</p>` : ""}
      <p class="mt-2.5 text-base text-pretty text-muted">${result.reason}${result.note ? " " + result.note : ""}</p>
      <p class="mt-3.5">
        <a class="block rounded-full border border-brand-600 bg-brand-600 px-4 py-2.5 text-center text-base font-medium text-white no-underline"
           href="${scheme.url}" target="_blank" rel="noopener noreferrer">Check ${scheme.name} on ${host}<span class="sr-only"> (opens in a new tab)</span></a>
      </p>
    </li>
  `;
}

const SECTION_HEADING = "mt-8 mb-3 text-xl font-semibold tracking-tight text-ink";
const SECTION_NOTE = "mb-3 max-w-[56ch] text-base text-pretty text-muted";

function renderGroup(heading, note, entries, showAmount) {
  if (entries.length === 0) return "";
  return `
    <h2 class="${SECTION_HEADING}">${heading}</h2>
    ${note ? `<p class="${SECTION_NOTE}">${note}</p>` : ""}
    <ul role="list" class="flex flex-col gap-3">
      ${entries.map(entry => renderSchemeCard(entry, showAmount)).join("")}
    </ul>
  `;
}

/* Nothing matched. The old code still rendered the summary panel, so this
   person saw "£0" set in the largest, heaviest type on the page. That is the
   worst moment this product can produce and it was entirely unhandled. */
function renderNoResults() {
  return `
    <p class="${UI.eyebrow}">Your results</p>
    <h1 class="${UI.title}" tabindex="-1" id="stepHeading">We didn't find anything from your answers</h1>
    <p class="${UI.intro}">That does not mean there is no help for you. It means nothing matched the few questions we asked.</p>

    <div class="results-summary rounded-field border border-line bg-canvas p-4">
      <h2 class="text-lg font-semibold tracking-tight text-ink">The most common reason</h2>
      <p class="mt-2 text-base text-pretty text-muted">People often enter a yearly income where we asked for a monthly one. It is worth checking that first.</p>
    </div>

    <h2 class="${SECTION_HEADING}">Where to get a proper check</h2>
    <p class="${SECTION_NOTE}">These are free, and a real person can look at things we cannot.</p>
    <ul role="list" class="flex flex-col gap-3">
      <li class="rounded-field border border-line bg-surface p-4">
        <h3 class="text-lg font-semibold tracking-tight text-ink">Citizens Advice</h3>
        <p class="mt-2 text-base text-pretty text-muted">Free, independent and confidential advice on benefits, debt and housing.</p>
        <p class="mt-3.5"><a class="block rounded-full border border-brand-600 bg-brand-600 px-4 py-2.5 text-center text-base font-medium text-white no-underline" href="https://www.citizensadvice.org.uk/benefits/" target="_blank" rel="noopener noreferrer">Go to citizensadvice.org.uk<span class="sr-only"> (opens in a new tab)</span></a></p>
      </li>
      <li class="rounded-field border border-line bg-surface p-4">
        <h3 class="text-lg font-semibold tracking-tight text-ink">Your council</h3>
        <p class="mt-2 text-base text-pretty text-muted">Councils run their own hardship and crisis schemes, and most have a welfare rights team.</p>
        <p class="mt-3.5"><a class="block rounded-full border border-brand-600 bg-brand-600 px-4 py-2.5 text-center text-base font-medium text-white no-underline" href="https://www.gov.uk/find-local-council" target="_blank" rel="noopener noreferrer">Find your council on gov.uk<span class="sr-only"> (opens in a new tab)</span></a></p>
      </li>
    </ul>

    ${renderResultsActions()}
  `;
}

function renderResultsActions() {
  return `
    <div class="mt-8 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row">
      <button class="${UI.btnSecondary} w-full sm:w-auto" id="restartBtn" type="button">Change my answers</button>
      <button class="${UI.btnSecondary} w-full sm:w-auto" id="printBtn" type="button">Print or save this page</button>
    </div>
  `;
}

function renderLocalSection(localResults) {
  const councilName = COUNCILS.find(c => c.id === state.input.council)?.name || "your council";
  const heading = state.input.council === "other" && state.input.detectedDistrict
    ? state.input.detectedDistrict
    : councilName;

  if (state.input.council === "other") {
    const named = state.input.detectedDistrict ? `<strong>${state.input.detectedDistrict}</strong>` : "your council";
    return `
      <h2 class="${SECTION_HEADING}">From your council — ${heading}</h2>
      <div class="rounded-field border border-line bg-canvas p-4">
        <p class="text-base text-pretty text-muted">We do not have ${named}'s own schemes yet. We only cover 12 councils so far. ${named} may still offer help, so it is worth checking their website. Everything above still applies to you.</p>
        <p class="mt-3.5"><a class="block rounded-full border border-brand-600 bg-brand-600 px-4 py-2.5 text-center text-base font-medium text-white no-underline" href="https://www.gov.uk/find-local-council" target="_blank" rel="noopener noreferrer">Find your council on gov.uk<span class="sr-only"> (opens in a new tab)</span></a></p>
      </div>
    `;
  }

  if (localResults.length === 0) {
    return `
      <h2 class="${SECTION_HEADING}">From your council — ${heading}</h2>
      <p class="${SECTION_NOTE}">Nothing from ${heading} matched your answers. They may still be able to help, so it is worth asking them directly.</p>
    `;
  }

  /* One honest sentence for the whole section, rather than the same
     "example data — verify with council" caveat repeated on all 18 cards
     in the slot where the national ones claimed a source. */
  return renderGroup(
    `From your council — ${heading}`,
    "We list the schemes we know your council runs. We do not show amounts, because each council sets its own and they change.",
    localResults,
    false
  );
}

function renderResultsStep() {
  const { nationalResults, localResults } = computeResults();

  if (nationalResults.length === 0 && localResults.length === 0) return renderNoResults();

  const byValue = (a, b) => annualValue(b.result) - annualValue(a.result);
  const hasAmount = entry => annualValue(entry.result) > 0;

  /* Grouped by what to do about it, not by who administers it. Within each
     group, the largest amount first — someone in crisis reads two cards. */
  const claimFirst = nationalResults.filter(r => r.result.confidence === "likely" && hasAmount(r)).sort(byValue);
  const alsoCheck = nationalResults.filter(r => r.result.confidence !== "likely" && hasAmount(r)).sort(byValue);
  const notMoney = nationalResults.filter(r => !hasAmount(r));

  const { cashMonthly, cashAnnual, oneOffCash, billHelp, inKind } = sumEstimates(nationalResults);

  /* Named as they are, not folded into a phrase — "help with your council tax
     support (reduction)" is not a sentence anyone would say. */
  const extras = billHelp.concat(inKind);

  const summaryHtml = cashMonthly > 0 ? `
    <div class="results-summary rounded-field border border-line bg-canvas p-5">
      <p class="text-base text-muted">You may be able to get about</p>
      <div class="mt-1 flex flex-wrap items-baseline gap-x-2">
        <p class="text-4xl font-semibold tracking-tight tabular-nums text-brand-800">${gbp(roundTo(cashMonthly, 5))}</p>
        <p class="text-xl font-medium text-brand-800">a month</p>
      </div>
      <p class="mt-1 text-base text-muted tabular-nums">in cash support — roughly ${gbp(roundTo(cashAnnual, 10))} a year</p>
      ${oneOffCash > 0 ? `<p class="mt-3 text-base text-pretty text-ink tabular-nums">Plus about ${gbp(roundTo(oneOffCash, 5))} in one-off payments.</p>` : ""}
      ${extras.length ? `<p class="mt-3 text-base text-pretty text-ink">You may also be able to get ${listToSentence(extras)}, listed below. ${extras.length === 1 ? "It lowers a bill or comes as a card rather than being paid to you, so it is" : "They lower a bill or come as a card rather than being paid to you, so they are"} not counted in the figure above.</p>` : ""}
      <p class="mt-3 text-base text-pretty text-muted">These are estimates based on a few questions. Check each one before you rely on it.</p>
    </div>
  ` : `
    <div class="results-summary rounded-field border border-line bg-canvas p-5">
      <p class="text-base text-pretty text-ink">We did not find any regular cash support from your answers, but the help below still applies to you.</p>
    </div>
  `;

  return `
    <p class="${UI.eyebrow}">Your results</p>
    <h1 class="${UI.title}" tabindex="-1" id="stepHeading">What you may be able to get</h1>
    ${summaryHtml}
    ${renderGroup("Claim these first", "You look likely to qualify for these, and they are worth the most.", claimFirst, true)}
    ${renderGroup("Also worth checking", "Less certain, but still worth a look.", alsoCheck, true)}
    ${renderGroup("Not money, but worth having", "", notMoney, true)}
    ${renderLocalSection(localResults)}
    ${renderResultsActions()}
  `;
}

function listToSentence(items, conjunction) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(", ") + " " + (conjunction || "and") + " " + items[items.length - 1];
}

/* ---------- MAIN RENDER + EVENT WIRING ---------- */

function render() {
  renderProgress();
  const container = document.getElementById("stepContainer");
  const stepName = STEPS[state.step];

  let html = "";
  if (stepName === "location") html = renderLocationStep();
  else if (stepName === "household") html = renderHouseholdStep();
  else if (stepName === "income") html = renderIncomeStep();
  else if (stepName === "circumstances") html = renderCircumstancesStep();
  else if (stepName === "results") html = renderResultsStep();

  /* The error box is still shown and hidden with an inline style.display,
     not a utility class. verify-ui.js asserts on style.display; switching to a
     hidden class would make that assertion accidentally always true, so it
     would stop catching the bug it exists to catch. */
  const navHtml = stepName === "results" ? "" : `
    <div id="stepError" class="mt-5 rounded-field border border-warn-700/30 bg-warn-50 p-3 text-base font-medium text-warn-700" role="alert" style="display:none;"></div>
    <div class="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <button class="${UI.btnSecondary} w-full sm:w-auto" id="backBtn" type="button" ${state.step === 0 ? "disabled" : ""}>Back</button>
      <button class="${UI.btnPrimary} w-full sm:w-auto" id="nextBtn" type="button">${stepName === "circumstances" ? "See my results" : "Next"}</button>
    </div>
  `;

  container.innerHTML = html + navHtml;

  /* Scrolling the page with the pointer over a focused number input silently
     changes its value. On an income field that is data corruption the user
     never sees, so take focus away instead. */
  container.querySelectorAll('input[type="number"]').forEach(el => {
    el.addEventListener("wheel", () => {
      if (document.activeElement === el) el.blur();
    }, { passive: true });
  });

  wireStepInputs(stepName);

  if (stepName !== "results") {
    document.getElementById("backBtn").addEventListener("click", back);
    document.getElementById("nextBtn").addEventListener("click", next);
  } else {
    /* Was "Start over", which wiped all four steps with no confirmation — and
       the results screen has no Back button, so correcting one number meant
       redoing everything. state.input already survives back(), so going to
       step 1 without resetting is both simpler and what people actually want. */
    document.getElementById("restartBtn").addEventListener("click", () => goTo(0));
    document.getElementById("printBtn").addEventListener("click", () => window.print());
  }

  const heading = document.getElementById("stepHeading");
  if (heading) {
    heading.focus();
  }
  /* No announce() here. Focusing the heading already makes a screen reader
     read it; pushing the same string into the live region made every step
     change get announced twice. */
}

function wireStepInputs(stepName) {
  if (stepName === "location") {
    const statusEl = document.getElementById("lookupStatus");
    const searchInput = document.getElementById("councilSearch");
    const searchStatusEl = document.getElementById("councilSearchStatus");
    const postcodeInput = document.getElementById("postcode");
    const lookupBtn = document.getElementById("lookupBtn");

    // Applies a resolved {id, isPilot, realName} to shared state and keeps
    // both the postcode-lookup UI and the council-search field in sync,
    // whichever of the two the user actually used.
    function applyResolution(resolution) {
      state.input.council = resolution.id;
      state.input.detectedDistrict = resolution.realName;
      searchInput.value = resolution.realName;
    }

    searchInput.addEventListener("input", e => {
      const typed = e.target.value.trim();
      const canonical = matchCouncilName(typed);
      if (canonical) {
        const resolution = resolveCouncilByName(canonical);
        applyResolution(resolution);
        searchStatusEl.innerHTML = resolution.isPilot
          ? `<strong class="text-brand-800">Found:</strong> <strong>${COUNCILS.find(c => c.id === resolution.id)?.name}</strong>`
          : `<strong class="text-brand-800">Found:</strong> <strong>${canonical}</strong> — this demo doesn't have local schemes for that council yet, but you can still continue and see nationwide schemes.`;
      } else {
        state.input.council = "";
        state.input.detectedDistrict = "";
        const suggestions = councilSuggestions(typed, 4);
        if (suggestions.length > 1) {
          searchStatusEl.textContent = "Did you mean " + listToSentence(suggestions, "or") + "? Type one of those in full.";
        } else {
          searchStatusEl.textContent = typed ? "Keep typing your council's name." : "";
        }
      }
    });

    postcodeInput.addEventListener("input", e => state.input.postcode = e.target.value);
    postcodeInput.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); runLookup(); }
    });
    lookupBtn.addEventListener("click", runLookup);

    async function runLookup() {
      const pc = postcodeInput.value;
      if (!pc.trim()) {
        statusEl.textContent = "Enter a postcode first, or search for your council below.";
        return;
      }
      lookupBtn.disabled = true;
      statusEl.textContent = "Looking up your council…";
      const result = await lookupCouncilByPostcode(pc);
      lookupBtn.disabled = false;

      if (result.status === "matched") {
        const resolution = { id: result.councilId, isPilot: true, realName: result.districtName };
        applyResolution(resolution);
        const councilName = COUNCILS.find(c => c.id === result.councilId)?.name;
        statusEl.innerHTML = `<strong class="text-brand-800">Found:</strong> You are in <strong>${result.districtName}</strong>, which is covered by <strong>${councilName}</strong>. Not right? Search for a different council below.`;
      } else if (result.status === "not_covered") {
        applyResolution({ id: "other", isPilot: false, realName: result.districtName });
        statusEl.innerHTML = `You're in <strong>${result.districtName}</strong> — this demo doesn't have local schemes for that council yet, but you can still continue and see nationwide schemes.`;
      } else if (result.status === "empty") {
        statusEl.textContent = "Enter a postcode first, or search for your council below.";
      } else {
        // Live lookup didn't work (unreachable, blocked, or postcode not
        // recognised) — fall back to our bundled ONS postcode data (England
        // only, for now) instead of just giving up.
        const matchedName = matchOfflineCouncil(pc);
        if (matchedName) {
          const resolution = resolveCouncilByName(matchedName);
          applyResolution(resolution);
          const reason = result.status === "not_found" ? "the live lookup couldn't parse that postcode, so this used our bundled ONS data instead" : "the live lookup service wasn't reachable, so this used our bundled ONS data instead";
          if (resolution.isPilot) {
            const councilName = COUNCILS.find(c => c.id === resolution.id)?.name;
            statusEl.innerHTML = `<strong class="text-brand-800">Found:</strong> You are in <strong>${matchedName}</strong>, covered by <strong>${councilName}</strong> (${reason}). Not right? Search for a different council below.`;
          } else {
            statusEl.innerHTML = `You're in <strong>${matchedName}</strong> (${reason}) — this demo doesn't have local schemes for that council yet, but you can still continue and see nationwide schemes.`;
          }
        } else if (result.status === "not_found") {
          statusEl.textContent = "We couldn't recognise that postcode — please double-check it, or search for your council below.";
        } else {
          statusEl.textContent = "We couldn't reach the live postcode lookup, and don't have a match in our bundled England data either (it may be a Scotland/Wales/NI postcode, not covered yet) — please search for your council below.";
        }
      }
    }
  } else if (stepName === "household") {
    document.getElementById("age").addEventListener("input", e => state.input.age = e.target.value ? Number(e.target.value) : null);
    // Keep what the user actually typed rather than silently coercing it —
    // validateStep() gives them a named reason instead.
    document.getElementById("adults").addEventListener("input", e => state.input.adults = e.target.value === "" ? null : Number(e.target.value));
    document.getElementById("children").addEventListener("input", e => state.input.children = e.target.value === "" ? 0 : Number(e.target.value));
  } else if (stepName === "income") {
    document.getElementById("employment").addEventListener("change", e => state.input.employment = e.target.value);
    document.getElementById("monthlyIncome").addEventListener("input", e => state.input.monthlyIncome = e.target.value ? Number(e.target.value) : null);
    document.getElementById("savings").addEventListener("input", e => state.input.savings = Number(e.target.value) || 0);
    document.getElementById("housingCosts").addEventListener("input", e => state.input.housingCosts = Number(e.target.value) || 0);
    const highest = document.getElementById("highestIndividualIncome");
    if (highest) {
      highest.addEventListener("input", e => state.input.highestIndividualIncome = e.target.value ? Number(e.target.value) : null);
    }
  } else if (stepName === "circumstances") {
    ["receivingUC", "receivingPensionCredit", "limitedCapabilityForWork", "hasDisabilityOrHealthCondition", "pregnantOrChildUnder4"].forEach(key => {
      document.getElementById(key).addEventListener("change", e => state.input[key] = e.target.checked);
    });
  }
}

/* Bootstrap. Guarded so this file can also be loaded by the Node test suite,
   which exercises the eligibility logic without a DOM. */
/* A printed page is where the caveats matter most, so open the disclosure
   before printing rather than letting it print collapsed. */
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("beforeprint", () => {
    document.querySelectorAll("details").forEach(d => { d.dataset.wasOpen = d.open; d.open = true; });
  });
  window.addEventListener("afterprint", () => {
    document.querySelectorAll("details").forEach(d => { d.open = d.dataset.wasOpen === "true"; });
  });
}

if (typeof document !== "undefined") {
  render();
}

/* Exported for the Node test suite; ignored in the browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sanitiseInput, validateStep, STEPS };
}
