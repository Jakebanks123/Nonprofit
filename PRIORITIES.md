# What to work on next, in order

Last updated 2026-09-19. Ordered by how much harm the problem does to a real
user, not by effort.

Context that sets the ordering: **the app is not deployed.** It runs from a
local file and this repo, so nobody is currently being given wrong numbers.
That makes everything below cheap to fix now and expensive to fix later.

Items are renumbered in this revision. The old numbering had gaps where
completed items were removed, so a reference to "item 3" in an older commit
message or document may not be item 3 here.

---

## Recently completed

### September 2026

- **The Crisis and Resilience Fund replaced the dead HSF and DHP entries.**
  22 of the 36 local entries named a scheme that stopped existing on 1 April
  2026. Both factory functions and the two hand-written copies of their output
  (`leeds-dhp`, `birmingham-household-support`) are gone, replaced by two
  entries in a new `COUNCIL_WIDE_SCHEMES` list that apply to **every English
  council**, not just the pilot 12 — an unlisted English district now gets real
  cards instead of an apology. Both carry no amount.

  The tier split is not what was expected. The grant determination gives upper
  tier authorities crisis and resilience money and lower tier authorities
  housing payments, so Housing Payments are run by the billing authority a
  postcode already resolves to here — no new council field was needed. Only
  Crisis Payments are upper-tier, and that entry names no council.

  Housing Payment eligibility is national (Housing Benefit, or UC with housing
  costs towards rental liability), replacing `receivingUC || monthlyIncome <
  1500` where the income half was invented. Crisis Payments carry no criteria
  at all, deliberately — every criterion is set locally, so any threshold would
  repeat the £1,800 the old factory made up.

- **Working-age Council Tax Support no longer tells well-off households they
  qualify.** That branch returned `eligible: true` with no income or savings
  test, so £8,000/month with £200,000 saved was told it was "very likely" to
  get a reduction — the pension-age branch had the £16,000 capital limit all
  along, and this one returned before reaching it. Now hidden above £16,000,
  calculating nothing. Income is deliberately still not tested: capital limits
  are near-universal and cluster on one number, while income thresholds are the
  part that genuinely differs council to council.

- **`lastVerified` records what was actually checked.** It carried the string
  "example data — verify with council" on all 36 local entries and was read by
  nothing — not `app.js`, not any suite. Replaced by `verification`, with
  statuses `unchecked` / `verified` / `disputed`; the latter two require an ISO
  date and the https page actually read, and `unchecked` forbids both, so an
  entry cannot claim a check that never happened. Enforced in the data sanity
  pass of `verify-keyboard.js`. Standing at 12 unchecked, 3 verified,
  1 disputed.

- **Placeholder local amounts can no longer reach a total.** They were inert by
  convention only. `verify-edgecases.cjs` now wraps `cashMonthlyAt()` and
  `householdValueAnnual()` during a real near-miss and cliff run and asserts
  what they were handed; `verify-ui.js` wraps `sumEstimates()` in the page and
  asserts no local card renders an amount. Both carry vacuity guards that fail
  if the test household stops matching.

- **An England gate and a 2028 tripwire.** The live postcode lookup covers the
  whole UK, so a Cardiff postcode would otherwise have been shown an
  England-only fund. `CRF_DISTRICT_HOUSING_EXIT` fails the suite from 1 April
  2028, when districts stop receiving an allocation and Housing Payments move
  to the upper-tier authority — a change of answer, not of funding line, so it
  needs the entry rewritten rather than the date bumped.

### August 2026

- **A "what if" panel on the results screen** (`explore-core.js`,
  `explore-ui.js`, PR #4). A slider moves monthly income or savings while the
  answers stay put, and every point where a scheme stops is named in plain
  text. A cliff is a change in *which* schemes qualify, not a big drop in
  amount, and the panel deliberately refuses to price spend-your-savings-down
  scenarios (deprivation of capital, reg 50 UC Regs 2013). New sixth suite
  `verify-explore.js`, 131 checks.
- **All six suites run from `npm test`** (~5s). Three things had to be fixed to
  make that mean anything:
  - The browser suites hard-coded `executablePath: '/opt/pw-browsers/chromium'`,
    a path from the container they were written in. They now let Playwright
    resolve its own browser, which honours `PLAYWRIGHT_BROWSERS_PATH`.
  - None set a non-zero exit code, so they could not fail — the same flaw the
    maths suites had until 19 Aug.
  - `verify-keyboard.js` reported a phantom focus-ring problem on every run: it
    compared `outlineStyle + ' ' + outlineWidth` against `'none 0px'` and got
    `'none 3px'`, because `:focus-visible` leaves the width set while the style
    is `none`. No ring was ever drawn. It also measured whether focus moved to
    the step heading without asserting it, so deleting that `focus()` call left
    the suite green; it now asserts it.
  Each suite was verified to fail on a deliberately introduced regression.
- **Council Tax Reduction no longer uses an invented national formula.** Split
  in two, because the honest answer is different for each half of its users:
  - **Working-age** (most users): no accurate UK-wide formula exists — each of
    England's ~296 billing authorities designs its own scheme, and there's no
    current, complete dataset of all of them to calculate from. Signposted
    only. This replaced the `thresholdPerAdult = 1450` / `children * 350`
    formula entirely.
  - **Pension-age**: this genuinely IS a national scheme (the Council Tax
    Reduction Schemes (Prescribed Requirements) (England) Regulations 2012,
    as amended for 2026/27), so a real calculation is done: Pension Credit
    guarantee level as the applicable amount, 20% taper on income above it,
    the same £10,000-£16,000 deemed-income rule on savings as Pension Credit
    itself, and Guarantee Credit recipients passported to a reduction to nil.
    A new optional question asks for the person's actual council tax bill
    (falls back to the England average Band D bill, £2,392/yr, with confidence
    downgraded when it's used). Severe disability/carer/child premiums and
    non-dependant deductions are **not** modelled yet — flagged in the result,
    not guessed at. Verified against Oxford City Council's and Durham County
    Council's published pensioner scheme documents and the DWP/Age UK 2026/27
    rates; ten new hand-computed cases added to `verify-maths.cjs`.
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

### 1. Fourteen hand-written council schemes are still unverified
The wrong half of this problem is fixed: the 22 generated entries that named
dead schemes are gone. What remains is 14 hand-written entries — Leeds Healthy
Holidays, Birmingham Energy Savers, Newcastle Compassionate Fund, Westminster
Emergency Support Scheme and the rest — of which 12 have never been checked
against anything, 1 is verified and 1 is disputed.

This is still a claim: we tell someone their council runs a named scheme with
particular eligibility. Two have been spot-checked, with mixed results. Leeds
Healthy Holidays is real and running. The Leeds Council Tax Hardship Fund is
not mentioned on Leeds' own Council Tax Support page, where it would most
obviously sit — every billing authority holds the s13A(1)(c) discretionary
reduction power, so something may exist under another name, but the app's
specific claim is unsupported by the obvious source. That one is marked
`disputed` in the data and still shown; whether to keep showing a disputed
entry is a separate decision nobody has made yet.

Fix: one council at a time. Find the real scheme page, check the scheme exists,
record the result in `verification`. There is no shortcut and it does not
generalise — these are each one council's own invention.

### 2. Most scheme links point at a council homepage, not the scheme
Of the entries that remain, most still link to a council homepage, so the
"find out more" button drops the reader on a front page and leaves them to
search. The two CRF entries point at gov.uk's "find your local council" rather
than at each council's own CRF page.

No logic, no maths — just finding the right page. Worth doing in the same pass
as item 1, since verifying a scheme means being on its page anyway.

---

## Tier 2 — before it goes anywhere near the public

### 3. Nobody has opened the what-if panel by hand
Every check on it is a Playwright assertion written by the same person who
wrote the feature. That is a genuinely strong suite — 131 checks, each verified
able to fail — but it has never been dragged on a real phone, and four of the
six adversarial passes found faults a suite alone had not. Worth half an hour
with a real device before it is treated as done.

### 4. Agree a review step
Two people now push to `main`. The four calculation errors found on 18 August
all looked completely reasonable in the code; only the hand-computed maths suite
caught them. Worth agreeing that anything touching `data/schemes.js` runs the
full suite before merge, and ideally goes via a pull request.

Note the two contributors currently work differently: Quinn uses branches and
PRs (#1–#4), Jake commits straight to `main`. Picking one is the decision, and
it is now the oldest open item on this list.

### 5. Test on Safari
The council search uses a native `<datalist>`, which Safari has historically
handled poorly. Roughly a third of UK mobile traffic is Safari. If it degrades
badly, the manual council route is broken for those users and only the postcode
path works. Cheap to check on an iPhone; currently unknown.

---

## Tier 3 — when there's time

### 6. Real per-council figures for working-age Council Tax Support
Working-age Council Tax Support is signposted with no pound figure, for every
council — the honest fix for the invented-formula bug, but it means the app's
single biggest opportunity (£3.3bn/yr unclaimed, second only to Universal
Credit — see `BENEFITS-SHORTLIST.md`) still shows no number to most users. The
September change narrowed *who* sees the signpost; it did not add a figure.

There is no current, complete, machine-readable dataset of all ~296 councils'
working-age schemes. Each council publishes its own scheme as a separate
PDF/webpage, updated annually, with genuinely different structures
(income-banded, percentage-taper, minimum payments, band caps). The New Policy
Institute/`entitledto` "rolling dataset" might be licensable rather than
re-researched from scratch. Two realistic paths, not mutually exclusive:

1. **Start with the 12 pilot councils.** Leeds publishes its scheme in
   computable detail — four classes of UC claimant, 75% of maximum reduction
   for most, a £16,000 capital limit, and a surplus income deduction of 15% of
   income above the applicant's CTS personal allowance — which suggests this is
   more tractable than it looked, at least where a council publishes a
   structured document rather than prose.
2. **Investigate licensing the NPI/entitledto dataset** rather than
   transcribing ~296 PDFs by hand.

Whichever path, verify each council against its own primary source the way the
pension-age fix was — a compiled-looking figure sourced from an AI summary of a
secondary page is exactly how the original invented formula happened.

### 7. Name the county for Crisis Payments
Crisis Payments are run by the upper-tier authority, which in a two-tier area
is the county council rather than the council that sends the council tax bill.
The entry currently says so in words rather than naming it. postcodes.io
already returns `admin_county` in the same response `data/postcodes.js` reads
`admin_district` from, so naming it on the postcode path is cheap. It does not
help the manual council-search path, which has no county to go on.

### 8. More benefits
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

### 9. Coverage
Every English council now gets the two Crisis and Resilience Fund cards, so
"nothing for your council yet" is no longer the whole story outside the pilot
12. What is still thin is councils' *own* schemes: only 232 of 2,223 English
postcode outcodes (10.4%) resolve to a council with any hand-researched local
scheme data. Scotland, Wales and Northern Ireland aren't supported at all — and
their schemes genuinely differ, so it isn't just a data-loading job. CRF is
England-only and gated accordingly.

### 10. Housekeeping
- The desktop clone lives inside **OneDrive**, a known source of git trouble
  (locked files, sync conflicts on `.git`). The laptop clone is correctly
  outside it at `C:\Claude\Nonprofit`. Worth moving the desktop one too.
- Two unmerged remote branches (`unlock-gov-rebrand`,
  `add-npm-manifest-and-ons-attribution`) — delete if finished with.
- HICBC compares take-home pay against a threshold defined in terms of adjusted
  *net* income. Different measures.
- Node.js is still not installed on either Windows machine. The Mac clone can
  run the two Node-side suites after `npm install`; the four browser suites
  cannot run there, because Playwright's Chromium download is blocked. See
  `NEXT-SESSION.md` for how the suites get run in practice.
- `BENEFITS-SHORTLIST.md` still lists the Household Support Fund and
  Discretionary Housing Payments among the schemes to signpost. That is August
  research and true as written at the time, but both were replaced on 1 April
  2026 — worth a note in that file if anyone touches it.

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
