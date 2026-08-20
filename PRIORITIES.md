# What to work on next, in order

Last updated 2026-08-20 (evening). Ordered by how much harm the problem does
to a real user, not by effort.

Context that sets the ordering: **the app is not deployed.** It runs from a
local file and this repo, so nobody is currently being given wrong numbers.
That makes everything below cheap to fix now and expensive to fix later.

---

## Recently completed

- **Council Tax Reduction no longer uses an invented national formula.** Split
  in two, because the honest answer is different for each half of its users:
  - **Working-age** (most users): no accurate UK-wide formula exists — each of
    England's ~296 billing authorities designs its own scheme, and there's no
    current, complete dataset of all of them to calculate from (checked, see
    "More per-council data" below). Now signposted only — a real scheme
    almost certainly exists, but no pound figure is shown. This replaces the
    `thresholdPerAdult = 1450` / `children * 350` formula entirely.
  - **Pension-age**: this genuinely IS a national scheme (the Council Tax
    Reduction Schemes (Prescribed Requirements) (England) Regulations 2012,
    as amended for 2026/27), so a real calculation is now done: Pension
    Credit guarantee level as the applicable amount, 20% taper on income
    above it, the same £10,000-£16,000 deemed-income rule on savings as
    Pension Credit itself, and Guarantee Credit recipients passported to a
    reduction to nil. A new optional question asks for the person's actual
    council tax bill (falls back to the England average Band D bill,
    £2,392/yr, with confidence downgraded when it's used). Severe disability
    /carer/child premiums and non-dependant deductions are **not** modelled
    yet — flagged in the result, not guessed at. Verified against Oxford City
    Council's and Durham County Council's published pensioner scheme
    documents and the DWP/Age UK 2026/27 rates; ten new hand-computed cases
    added to `verify-maths.cjs`.
- **Rates updated to 2026/27** and independently re-verified against GOV.UK on
  20 Aug: standard allowances £338.58 / £424.90 / £528.34 / £666.97, child
  element £303.94, +£47.94 for a first child born before 6 April 2017, work
  allowances £427 / £710. A single parent with two children went from
  £1,485/mo to £1,605/mo.
- **Higher first-child element** for a child born before 6 April 2017, which
  needed one new conditional question.
- **Two-child limit** confirmed abolished from 6 April 2026 (Universal Credit
  (Removal of Two Child Limit) Act 2026). The app was already correct; a test
  now fails if anyone reinstates a cap.
- **Staleness tripwire** — `data/schemes.js` declares `RATES_TAX_YEAR`, and
  `verify-maths.cjs` fails once that is no longer the current tax year.
- **User-facing stale-rates notice** on the results and "nothing found" screens,
  shown only when the rates have been overtaken. Shows the real old figures
  rather than extrapolating, and says which direction the error runs in.
- **`npm test` can now actually fail.** Neither `verify-maths.cjs` nor
  `verify-edgecases.cjs` ever exited non-zero, so the suite reported success
  even when the maths was wrong.
- Fixed a blocking bug where typing a council name corrupted the search box
  (`Leeds` → `Leedsds`), and corrected results headings that claimed to be
  ordered by value when they are ordered by confidence.

---

## Tier 1 — before anyone else uses it

### 1. The local council schemes are unverified
The amounts are gone, which was right. What remains is still a claim: we tell
someone their council runs a named scheme with particular eligibility. Ten of
the twelve councils' entries were generated from two factory functions on the
assumption that nearly every English council runs something like a Household
Support Fund and a Discretionary Housing Payment. Broadly true, but the names
and criteria are not checked.

Fix: verify one council end to end against its own website, see how far the
generated text was off, and let that tell you how much work the other eleven are.

---

## Tier 2 — before it goes anywhere near the public

### 2. Browser tests aren't in `npm test`
`npm test` runs the maths and edge-case suites only; Playwright isn't a dev
dependency. That is exactly why the council-name typing bug shipped — it was a
UI bug, and no UI test ran. Add Playwright and fold `verify-ui.js`,
`verify-keyboard.js` and `test.js` into `npm test`. (Also true for today's
council tax change — the new question was checked by hand-loading
`renderIncomeStep()` in Node, not with a real browser test, because Playwright
isn't installed here either.)

### 3. Agree a review step
Two people now push to `main`. The four calculation errors found on 18 August
all looked completely reasonable in the code; only the hand-computed maths suite
caught them. Worth agreeing that anything touching `data/schemes.js` runs the
full suite before merge, and ideally goes via a pull request.

### 4. Test on Safari
The council search uses a native `<datalist>`, which Safari has historically
handled poorly. Roughly a third of UK mobile traffic is Safari. If it degrades
badly, the manual council route is broken for those users and only the postcode
path works. Cheap to check on an iPhone; currently unknown.

---

## Tier 3 — when there's time

### 5. Real per-council figures for working-age Council Tax Support
Right now working-age Council Tax Support is signposted with no pound figure,
for every council (see "Recently completed" above) — the honest fix for the
invented-formula bug, but it means the app's single biggest opportunity
(£3.3bn/yr unclaimed, second only to Universal Credit — see
`BENEFITS-SHORTLIST.md`) still shows no number to most users.

Checked during today's fix: there is no current, complete, machine-readable
dataset of all ~296 councils' working-age schemes. Each council publishes its
own scheme as a separate PDF/webpage, updated annually, with genuinely
different structures (income-banded, percentage-taper, minimum payments, band
caps). The New Policy Institute/`entitledto` "rolling dataset" mentioned in
NPI's review might be licensable rather than re-researched from scratch —
worth a conversation with them before committing to manual research. Two
realistic paths, not mutually exclusive:

1. **Start with the 12 pilot councils** the app already covers locally (Leeds,
   Birmingham, Bristol, Camden, Hackney, Liverpool, Manchester, Newcastle,
   Nottingham, Sheffield, Tower Hamlets, Westminster). Extend the existing
   `LOCAL_SCHEMES` pattern (already used for Household Support Fund/DHP) with
   real, individually-verified working-age CTS figures for just these 12,
   sourced from each council's own current scheme document.
2. **Investigate licensing the NPI/entitledto dataset** rather than
   transcribing ~296 PDFs by hand — ask them directly what it would take.

Whichever path, verify each council against its own primary source the way
the pension-age fix was — a compiled-looking figure sourced from an AI
summary of a secondary page is exactly how the original invented formula
happened.

### 6. More benefits
Research complete — see `BENEFITS-SHORTLIST.md` for all 62 schemes with reach,
value and take-up, and a tiered recommendation.

Recommended order once Tier 1 is done: **Blue Badge** and **Council Tax single
person discount** (both need zero new questions), then **free school meals**
(the September 2026 expansion created 500,000+ newly eligible children whose
families have not been told), then **Carer's Allowance**.

Carer's Allowance is the clearest new-benefit candidate by unclaimed value
(£2.35bn/yr) but is **not** a simple add — see the warning in
`NEXT-SESSION.md` about the severe disability premium and the Universal Credit
offset. It can leave a household worse off if modelled naively.

Do not attempt to calculate PIP or Attendance Allowance. Both turn on functional
assessment; only 37% of new PIP claims are awarded. Signpost only.

### 7. Coverage
Only 232 of 2,223 English postcode outcodes (10.4%) resolve to a council that
has any local scheme data, so most users see "nothing for your council yet".
Scotland, Wales and Northern Ireland aren't supported at all — and their schemes
genuinely differ, so it isn't just a data-loading job.

### 8. Housekeeping
- The desktop clone lives inside **OneDrive**, a known source of git trouble
  (locked files, sync conflicts on `.git`). The laptop clone is correctly
  outside it at `C:\Claude\Nonprofit`. Worth moving the desktop one too.
- Two unmerged remote branches (`unlock-gov-rebrand`,
  `add-npm-manifest-and-ons-attribution`) — delete if finished with.
- HICBC compares take-home pay against a threshold defined in terms of adjusted
  *net* income. Different measures.
- Node.js is not installed on either machine, so the tests and `npm run build`
  cannot be run locally. Worth installing.

---

## A constraint worth remembering

`dist/style.css` is a **compiled** Tailwind build. Any class not present in the
source when it was last built does not exist at runtime — it fails silently,
rendering the element unstyled with no error. Adding new classes requires
`npm run build`. This has bitten once already (an invisible icon).

---

## Deliberately not on this list

Deploying to GitHub Pages is on the README roadmap, and it should stay there
until Tier 1 is done. Shipping a polished, official-looking tool that quietly
misstates people's entitlements is worse than shipping nothing.
