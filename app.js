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

function renderProgress() {
  const track = document.getElementById("progressTrack");
  track.innerHTML = "";
  STEPS.slice(0, 4).forEach((_, i) => {
    const seg = document.createElement("div");
    seg.className = "progress-seg" + (i < state.step ? " done" : i === state.step ? " current" : "");
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

/* ---------- STEP RENDERERS ---------- */

function renderLocationStep() {
  const datalistOptions = ALL_ENGLAND_COUNCILS.map(name => `<option value="${name}"></option>`).join("");
  const currentSearchValue = state.input.detectedDistrict || (state.input.council && state.input.council !== "other"
    ? COUNCILS.find(c => c.id === state.input.council)?.realName || ""
    : "");

  return `
    <p class="step-eyebrow">Step 1 of 4</p>
    <h1 class="step-title" tabindex="-1" id="stepHeading">Where are you based?</h1>
    <p class="step-intro">This helps us show local council schemes alongside UK-wide ones. Not sure which council you're in — especially common in big cities split into lots of boroughs? Just enter your postcode and we'll work it out.</p>

    <div class="field-group">
      <label for="postcode">Your postcode</label>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <input type="text" id="postcode" value="${state.input.postcode}" placeholder="e.g. E14 5AA" style="flex:1; min-width:160px;">
        <button class="btn-primary" id="lookupBtn" type="button">Find my council</button>
      </div>
      <span class="field-hint">Only the postcode itself is sent — to postcodes.io, a free, open UK postcode lookup service — to identify your council. Nothing else you enter in this app leaves your browser. If that service can't be reached (for example inside a sandboxed preview), we fall back to real ONS postcode data bundled into this app (England only, for now).</span>
      <div id="lookupStatus" style="margin-top:10px; font-size:0.88rem;" aria-live="polite"></div>
    </div>

    <div class="field-group">
      <label for="councilSearch">Or search for your council directly</label>
      <input type="text" id="councilSearch" list="councilOptions" value="${currentSearchValue}" placeholder="Start typing a council name…" autocomplete="off">
      <datalist id="councilOptions">${datalistOptions}</datalist>
      <span class="field-hint">Covers all 296 English councils. Scotland, Wales and Northern Ireland aren't supported in this demo yet.</span>
      <div id="councilSearchStatus" style="margin-top:8px; font-size:0.88rem;" aria-live="polite"></div>
    </div>
  `;
}

function renderHouseholdStep() {
  return `
    <p class="step-eyebrow">Step 2 of 4</p>
    <h1 class="step-title" tabindex="-1" id="stepHeading">Tell us about your household</h1>
    <p class="step-intro">Just rough numbers are fine — this is an estimate, not an application.</p>

    <div class="field-row">
      <div class="field-group">
        <label for="age">Your age</label>
        <input type="number" id="age" min="16" max="110" value="${state.input.age ?? ""}">
      </div>
      <div class="field-group">
        <label for="adults">Adults in household <span class="field-hint">Including you</span></label>
        <input type="number" id="adults" min="1" max="6" value="${state.input.adults}">
      </div>
    </div>

    <div class="field-group">
      <label for="children">Children (under 16, or under 20 in full-time education)</label>
      <input type="number" id="children" min="0" max="10" value="${state.input.children}">
    </div>
  `;
}

function renderIncomeStep() {
  return `
    <p class="step-eyebrow">Step 3 of 4</p>
    <h1 class="step-title" tabindex="-1" id="stepHeading">Income, savings & housing</h1>
    <p class="step-intro">Nothing here is sent anywhere or saved — it only stays in your browser for this session.</p>

    <div class="field-group">
      <label for="employment">Employment status</label>
      <select id="employment">
        <option value="employed" ${state.input.employment === "employed" ? "selected" : ""}>Employed (full or part-time)</option>
        <option value="self-employed" ${state.input.employment === "self-employed" ? "selected" : ""}>Self-employed</option>
        <option value="unemployed" ${state.input.employment === "unemployed" ? "selected" : ""}>Unemployed / looking for work</option>
        <option value="retired" ${state.input.employment === "retired" ? "selected" : ""}>Retired</option>
        <option value="unable" ${state.input.employment === "unable" ? "selected" : ""}>Unable to work due to health/disability</option>
      </select>
    </div>

    <div class="field-row">
      <div class="field-group">
        <label for="monthlyIncome">Household take-home income <span class="field-hint">Per month, after tax, £</span></label>
        <input type="number" id="monthlyIncome" min="0" value="${state.input.monthlyIncome ?? ""}">
      </div>
      <div class="field-group">
        <label for="savings">Savings & investments <span class="field-hint">Total, £</span></label>
        <input type="number" id="savings" min="0" value="${state.input.savings}">
      </div>
    </div>

    ${state.input.adults >= 2 ? `
    <div class="field-group">
      <label for="highestIndividualIncome">Highest single income in the household <span class="field-hint">Per month, after tax, £ — whichever one person earns the most</span></label>
      <input type="number" id="highestIndividualIncome" min="0" value="${state.input.highestIndividualIncome ?? ""}">
      <span class="field-hint">Asked separately because the Child Benefit tax charge is based on one person's income, not the household total — so two people earning £45,000 each are treated very differently from one person earning £90,000.</span>
    </div>` : ""}

    <div class="field-group">
      <label for="housingCosts">Rent or mortgage <span class="field-hint">Per month, £ — leave 0 if none</span></label>
      <input type="number" id="housingCosts" min="0" value="${state.input.housingCosts}">
    </div>
  `;
}

function renderCircumstancesStep() {
  const items = [
    ["receivingUC", "Already receiving Universal Credit"],
    ["receivingPensionCredit", "Already receiving Pension Credit"],
    ["limitedCapabilityForWork", "A health condition or disability limits how much you can work, or you've been assessed as having limited capability for work"],
    ["hasDisabilityOrHealthCondition", "You or someone in your household has a disability or long-term health condition"],
    ["pregnantOrChildUnder4", "You are pregnant, or have a child under 4"]
  ];

  return `
    <p class="step-eyebrow">Step 4 of 4</p>
    <h1 class="step-title" tabindex="-1" id="stepHeading">A few more circumstances</h1>
    <p class="step-intro">These help refine which schemes are likely to apply. Skip anything that doesn't apply.</p>

    <div class="checkbox-list">
      ${items.map(([key, label]) => `
        <div class="checkbox-item">
          <input type="checkbox" id="${key}" ${state.input[key] ? "checked" : ""}>
          <label for="${key}">${label}</label>
        </div>
      `).join("")}
    </div>

    <div class="privacy-note">
      🔒 <span>Your answers stay in this browser tab only. Closing or refreshing the page clears everything — nothing is stored or sent anywhere.</span>
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

  const navHtml = stepName === "results" ? "" : `
    <div id="stepError" class="step-error" role="alert" style="display:none;"></div>
    <div class="nav-row">
      <button class="btn-secondary" id="backBtn" type="button" ${state.step === 0 ? "disabled" : ""}>← Back</button>
      <button class="btn-primary" id="nextBtn" type="button">${stepName === "circumstances" ? "See my results →" : "Next →"}</button>
    </div>
  `;

  container.innerHTML = html + navHtml;

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
