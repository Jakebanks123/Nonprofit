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
    showStepError(error);
    return;
  }
  clearStepError();
  state.step = Math.min(state.step + 1, STEPS.length - 1);
  render();
}

function showStepError(message) {
  const box = document.getElementById("stepError");
  if (box) {
    box.textContent = message;
    box.style.display = "block";
  }
  announce(message);
}

function clearStepError() {
  const box = document.getElementById("stepError");
  if (box) {
    box.textContent = "";
    box.style.display = "none";
  }
}

function back() {
  state.step = Math.max(state.step - 1, 0);
  render();
}

/* Returns null when the step is valid, or a human-readable message naming
   what needs fixing. The message is shown inline AND announced to screen
   readers, so pressing Next never silently does nothing. */
function validateStep(stepIndex) {
  const s = state.input;
  const stepName = STEPS[stepIndex];
  const finite = v => typeof v === "number" && Number.isFinite(v);

  if (stepName === "location") {
    if (!s.council) return "Please find your council using your postcode, or pick one from the council search box.";
    return null;
  }
  if (stepName === "household") {
    if (!finite(s.age)) return "Please enter your age.";
    if (s.age < 16 || s.age > 120) return "Please enter an age between 16 and 120.";
    if (!finite(s.adults) || s.adults < 1) return "A household needs at least 1 adult.";
    if (s.adults > 10) return "Please enter no more than 10 adults.";
    if (!finite(s.children) || s.children < 0) return "Number of children can't be negative.";
    if (s.children > 15) return "Please enter no more than 15 children.";
    return null;
  }
  if (stepName === "income") {
    if (!finite(s.monthlyIncome)) return "Please enter your household income — enter 0 if you have none.";
    if (s.monthlyIncome < 0) return "Income can't be negative. Enter 0 if you have no income.";
    if (s.monthlyIncome > 100000) return "Please enter a monthly income under £100,000.";
    if (!finite(s.savings) || s.savings < 0) return "Savings can't be negative. Enter 0 if you have none.";
    if (s.savings > 10000000) return "Please enter savings under £10,000,000.";
    if (!finite(s.housingCosts) || s.housingCosts < 0) return "Rent or mortgage can't be negative. Enter 0 if you have none.";
    if (s.housingCosts > 10000) return "Please enter a monthly rent or mortgage under £10,000.";
    if (s.adults >= 2 && s.highestIndividualIncome != null) {
      if (s.highestIndividualIncome < 0) return "The highest single income can't be negative.";
      if (s.highestIndividualIncome > s.monthlyIncome) return "The highest single income can't be more than your total household income.";
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

function sumEstimates(results) {
  let monthlyOngoing = 0;
  let oneOff = 0;
  results.forEach(({ result }) => {
    if (!result.amount) return;
    if (result.amount.period === "month") monthlyOngoing += result.amount.value;
    if (result.amount.period === "year") monthlyOngoing += result.amount.value / 12;
    if (result.amount.period === "one-off") oneOff += result.amount.value;
  });
  return { annualOngoing: monthlyOngoing * 12, oneOff };
}

function formatAmount(amount) {
  if (!amount) return "";
  if (amount.display) return amount.display;
  if (amount.value === 0) return "";
  if (amount.period === "month") return gbp(amount.value) + " / month";
  if (amount.period === "year") return gbp(amount.value) + " / year";
  if (amount.period === "one-off") return gbp(amount.value) + " one-off";
  return "";
}

function renderSchemeCard({ scheme, result }) {
  const amountText = formatAmount(result.amount);
  const verifiedLine = scheme.lastVerified
    ? `<span>${scheme.lastVerified}</span>`
    : `<span>Source: GOV.UK</span>`;
  return `
    <div class="scheme-card">
      <div class="scheme-card-top">
        <div>
          <p class="scheme-name">${scheme.name}</p>
          <span class="badge ${result.confidence === "likely" ? "badge-likely" : "badge-possible"}">
            ${result.confidence === "likely" ? "Likely eligible" : "Worth checking"}
          </span>
        </div>
        ${amountText ? `<div class="scheme-amount">${amountText}</div>` : ""}
      </div>
      <p class="scheme-reason">${result.reason}${result.note ? " " + result.note : ""}</p>
      <div class="scheme-meta">
        ${verifiedLine}
        <a href="${scheme.url}" target="_blank" rel="noopener">Learn more / apply →</a>
      </div>
    </div>
  `;
}

function renderResultsStep() {
  const { nationalResults, localResults } = computeResults();
  const { annualOngoing, oneOff } = sumEstimates([...nationalResults, ...localResults]);
  const councilName = COUNCILS.find(c => c.id === state.input.council)?.name || "your area";

  let summaryHtml = `
    <div class="results-summary">
      <div class="summary-label">Estimated ongoing support, per year</div>
      <div class="summary-figure">${gbp(annualOngoing)}</div>
      ${oneOff > 0 ? `<div class="summary-sub">Plus roughly ${gbp(oneOff)} in one-off payments/grants</div>` : ""}
      <div class="summary-sub">Based on ${nationalResults.length + localResults.length} scheme${nationalResults.length + localResults.length === 1 ? "" : "s"} you may be eligible for. These are rough estimates only — always confirm the real figure on the official page.</div>
    </div>
  `;

  let nationalHtml = `<div class="section-heading">🇬🇧 Nationwide schemes</div>`;
  if (nationalResults.length === 0) {
    nationalHtml += `<div class="empty-note">No nationwide schemes matched based on what you told us. Double check your numbers, or your circumstances may simply be outside current thresholds.</div>`;
  } else {
    nationalHtml += nationalResults.map(renderSchemeCard).join("");
  }

  const localHeading = state.input.council === "other" && state.input.detectedDistrict
    ? state.input.detectedDistrict
    : councilName;
  let localHtml = `<div class="section-heading">📍 Local schemes — ${localHeading}</div>`;
  if (state.input.council === "other") {
    localHtml += `<div class="council-missing-note">We don't have local scheme data for ${state.input.detectedDistrict ? "<strong>" + state.input.detectedDistrict + "</strong>" : "your council"} in this demo yet — it currently covers 12 pilot councils as a proof of concept. In a full version, this is where council-specific grants and discounts would appear.</div>`;
  } else if (localResults.length === 0) {
    localHtml += `<div class="empty-note">No local schemes matched for ${councilName} based on what you told us.</div>`;
  } else {
    localHtml += localResults.map(renderSchemeCard).join("");
  }

  return `
    <p class="step-eyebrow">Your results</p>
    <h1 class="step-title" tabindex="-1" id="stepHeading">Here's what you may be entitled to</h1>
    ${summaryHtml}
    ${nationalHtml}
    ${localHtml}
    <div class="restart-row">
      <button class="btn-secondary" id="restartBtn" type="button">Start over</button>
    </div>
  `;
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
    document.getElementById("restartBtn").addEventListener("click", () => {
      state.step = 0;
      state.input = {
        postcode: "", council: "", detectedDistrict: "", age: null, adults: 1, children: 0,
        employment: "employed", monthlyIncome: null, highestIndividualIncome: null,
        savings: 0, housingCosts: 0,
        receivingUC: false, receivingPensionCredit: false, limitedCapabilityForWork: false,
        hasDisabilityOrHealthCondition: false, pregnantOrChildUnder4: false
      };
      render();
    });
  }

  const heading = document.getElementById("stepHeading");
  if (heading) {
    heading.focus();
  }
  announce(heading ? heading.textContent : "");
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
      const canonical = ENGLAND_COUNCIL_LOOKUP_BY_LOWER[typed.toLowerCase()];
      if (canonical) {
        const resolution = resolveCouncilByName(canonical);
        applyResolution(resolution);
        searchStatusEl.innerHTML = resolution.isPilot
          ? `✓ Selected: <strong>${COUNCILS.find(c => c.id === resolution.id)?.name}</strong>`
          : `✓ Selected: <strong>${canonical}</strong> — this demo doesn't have local schemes for that council yet, but you can still continue and see nationwide schemes.`;
      } else {
        state.input.council = "";
        state.input.detectedDistrict = "";
        searchStatusEl.textContent = typed ? "Keep typing, or pick a suggestion from the list." : "";
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
        statusEl.innerHTML = `✓ You're in <strong>${result.districtName}</strong>, which is covered by <strong>${councilName}</strong>. Not right? Search for a different council below.`;
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
            statusEl.innerHTML = `✓ You're in <strong>${matchedName}</strong>, covered by <strong>${councilName}</strong> (${reason}). Not right? Search for a different council below.`;
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
if (typeof document !== "undefined") {
  render();
}

/* Exported for the Node test suite; ignored in the browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sanitiseInput, validateStep, STEPS };
}
