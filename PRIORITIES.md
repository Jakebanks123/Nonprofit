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

## How coverage works

The local layer is the point of this app. National benefits are already well
served by Turn2us, entitledto and Citizens Advice; what they do not do is tell
someone what their own council runs. "Cover fewer councils" is therefore not a
cautious version of this product — it is a different and worse one.

But "add a council" means three different things with completely different
economics, and keeping them apart is what stops the coverage question going
round in circles.

**1. Routing — which council a postcode belongs to.** Done for England: all 296
billing authorities resolve from a postcode, via the live postcodes.io lookup
and the bundled ONS data behind it. Not done at all for Scotland, Wales or
Northern Ireland, which are absent from the council list entirely — a Cardiff
postcode currently gets UK-wide benefits and nothing else.

**2. Schemes with national rules that councils deliver.** The Crisis and
Resilience Fund, Council Tax Support, the single person discount, Blue Badge,
free school meals, and the s13A(1)(c) discretionary reduction power every
billing authority holds. The rules come from one place, so one piece of
research covers every council at near-zero marginal cost. CRF went England-wide
in a single step on 19 September for exactly this reason.

**3. Bespoke council inventions.** Leeds Healthy Holidays, Birmingham Energy
Savers, Newcastle Compassionate Fund. No list, no dataset, no common shape.
One council at a time, forever.

### What follows from that

**Breadth is already solved for England.** Every English postcode resolves to a
council, and since 19 September every one of them returns real content. There
is no English postcode that gets nothing — so there is no countrywide gap left
to close, and "countrywide coverage" should not be written down as a goal. It
implies a finish line that does not exist and a gap that is already shut.

**Depth is per-scheme, and open-ended.** Each category 2 scheme lands for all
296 councils at once. It deepens what every council's page says rather than
extending the map. There is no finish line here either, just schemes we have
and schemes we do not.

**So the completion criterion is per-scheme, never per-council**: *this scheme
is live for every council it applies to.* CRF meets it. Council Tax Support
meets it as a signpost, and will not meet it as a figure until item 6 is
solved.

**Category 3 stays partial on purpose.** Twelve councils covered properly, with
the UI saying so, beats 296 covered badly. The argument is value before
maintenance: a holiday activities scheme matters less to a household than
getting their Council Tax Support right, and it costs more per entry to find
and keep current.

**The one genuine sequence is the rest of the UK.** Routing has to exist before
anything can be shown there, so it is category 1 then category 2, in that
order. It is probably not much work: the devolved schemes are mostly national
rather than per-council — the Scottish Welfare Fund, the Welsh Discretionary
Assistance Fund, and Council Tax Reduction, which unlike England is a national
scheme in both Scotland and Wales. Roughly a dozen entries for three nations,
if that holds up. **It has not been verified yet, and must be before it is
planned** — a plausible-sounding summary of another nation's benefit system is
the same failure mode as the invented council tax formula.

### What a user actually sees today

Concrete, as of 19 September 2026. Worth keeping current, because the
"twelve pilot councils" framing has stopped being accurate.

| where the user is | what they get |
|---|---|
| any English postcode | 6 national schemes + 2 Crisis and Resilience Fund cards |
| Leeds, Liverpool, Sheffield, Bristol, Tower Hamlets | the above, plus **one** verified council-specific scheme each |
| Manchester, Nottingham, Westminster, Hackney, Camden | the above, plus a direct link to their own council's CRF page |
| Birmingham, Newcastle | the above, and nothing council-specific — both their entries are withheld |
| Scotland, Wales, Northern Ireland | national UK benefits only; no routing, no local layer |

**So the pilot set is effectively five councils, not twelve.** The verification
pass on 19 Sep was mostly subtraction: five councils' entries turned out to be
duplicates of CRF Crisis Payments and were deleted, and four more entries were
withheld as disputed or unsupported.

That is not a loss of real coverage — the deleted entries said nothing the CRF
card does not say, and the withheld ones were not supported by their own
councils. But the local layer is thinner than "twelve pilot councils" implies,
and anything describing this app should say five. Nine of the twelve pilot
councils now show exactly what a council with no local data at all shows.

---

## Recently completed

### September 2026

- **Every council scheme entry has now been checked against its council's own
  website.** Twelve entries went in unchecked; none came out unchecked. Five
  were deleted as duplicates — Manchester, Nottingham, Westminster, Camden and
  Hackney all turned out to be their council's delivery of CRF Crisis Payments,
  which every English user already sees as one card, so the CRF entry now
  carries each council's own page instead. Two were withheld as `unsupported`,
  a new status meaning a proper search found nothing (Newcastle Compassionate
  Fund returns no match on any domain at all). One more was withheld as
  disputed. Four were verified with corrected names and deep links.

  Disputed and unsupported entries are now filtered out of results in
  `evaluateAll()`, so the results screen and the what-if tools cannot disagree
  about what exists. They stay in the data with their note, because deleting
  them invites someone re-adding the same claim from the same bad source.

  Camden's entry is the clearest evidence none of these were ever researched:
  "Resident Support Scheme" is **Islington's** scheme name, and Tower Hamlets'.

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

Item numbering is unchanged from the 19 Sep revision; the content of items 1
and 2 has moved on because the verification pass closed the old versions of
both.

### 1. The eligibility rules on council schemes are invented
The verification pass on 19 Sep checked all twelve outstanding entries against
their councils' own websites. Every scheme that survived is real — and **not one
of the app's eligibility rules matches what its council publishes.**

The monthly income thresholds (£1,600, £1,700, £2,000) appear on no council
page anywhere. They are the same class of error as the `monthlyIncome < 1500`
removed from the Housing Payment factory earlier that day, and they are still
live:

- **Liverpool** publishes no income threshold at all; the app applies £1,600.
- **Sheffield** publishes "insufficient income to meet their needs" and an age
  16+ condition. The app applies £1,600 and does not model the age condition.
- **Bristol** is Council Tax Discretionary Relief under s13A(1)(c), and its
  policy requires "severe financial hardship". The app applies £1,700 and also
  claims you must already receive Council Tax Support, which the policy does
  not say.
- **Tower Hamlets** publishes no figure; the app applies £1,700.

Fix: decide, per scheme, between dropping the gate to a signpost (the shape
working-age Council Tax Support already uses) and modelling the published rule
where the app has the answers for it. Hand-computed cases in
`verify-maths.cjs` either way. This is the largest remaining correctness gap in
the council data and it changes who sees what, so it wants its own review.

### 2. Two withheld entries need replacing, and two links are still weak
Four entries are in the data but not shown, and two of them need real work
before they can come back:

- **Birmingham Be Active** (`disputed`). A free leisure offer is real, but the
  council's own pages disagree about its terms — one says free activities "for
  all Birmingham residents", another says the free offer now applies to direct
  debit customers and that free paid-for classes "has now ceased". No council
  page offers free leisure specifically to under-18s. Needs the current terms
  confirmed with the council, and probably becomes two entries: Be Active, and
  Passport to Leisure, which is a **paid** discount card.
- **Birmingham Energy Savers** (`unsupported`). A 2012 Green Deal programme,
  long closed. The two live council offers cannot be modelled with the
  questions the app asks: free advice through Act on Energy has no gate at all,
  and the Warm Homes Local Grant needs EPC band, tenure, and income *after*
  housing costs — three fields the app does not have.
- **Leeds Council Tax Hardship Fund** (`disputed`) and **Newcastle
  Compassionate Fund** (`unsupported`) need no work: the first is unsupported
  by Leeds' own Council Tax Support page, and the second returns no match on
  any domain at all and is almost certainly invented.

**And five pilot councils now have nothing of their own.** Manchester,
Nottingham, Westminster, Hackney and Camden lost every entry as a CRF
duplicate. That does not mean they run nothing beyond CRF — it means nobody has
ever looked. The original entries were not research, so their absence is not
evidence of absence. Finding whatever those five actually run is the same
one-council-at-a-time job as Birmingham, now starting from an accurate picture
rather than an invented one.

Remaining link problems, down from 33: **Bristol** points at a policy PDF
because no user-facing page for discretionary relief was found, and **Leeds
Healthy Holidays** still points at the Leeds homepage.

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

1. **Start with the pilot councils** — nominally twelve, though only five
   currently carry any local data of their own (see "What a user actually sees
   today"). Leeds publishes its scheme in
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

**This is the awkward case in the coverage model above**, and worth pulling
forward from Tier 3 for that reason. It has category 3 shape — 296 genuinely
different schemes — and category 2 value, being the single biggest unclaimed
sum in the app. Licensing a maintained dataset is not a shortcut, it is the
only route that converts this into category 2 work: bought data stays current,
where hand-researched figures decay the moment nobody is checking them. The
question to answer first is whether a sustainable source exists at all, because
the answer shapes how far the local layer can ever go.

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

### 9. Coverage — the rest of the UK
Read "How coverage works" above first; this item is only what is left after it.

England is done for breadth and open-ended for depth, so there is nothing to do
here for England that is not already item 6 or item 8.

What is genuinely missing is **Scotland, Wales and Northern Ireland**, which
are absent from the council list and the postcode data entirely. That is the
one part of coverage that is a sequence: routing first, then the national
schemes. Start by verifying what those schemes actually are — the expectation
is that they are mostly national rather than per-council, which would make
three nations cheaper than a dozen more English councils, but that expectation
is unverified.

The old framing of this item — "only 232 of 2,223 English outcodes (10.4%)
reach a council with local scheme data" — is retired. It counted
hand-researched bespoke schemes as if they were the whole local layer. Since
19 September every English outcode reaches a council with real local content.
The 10.4% figure still describes category 3 coverage, which is deliberately
partial, so it is not a number to drive work from.

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
