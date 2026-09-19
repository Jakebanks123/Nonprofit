# Notes for whoever picks this up next

Last updated 2026-09-19. Written for a future Claude session, but useful to a
human too.

Sections dated August describe what was true then and are deliberately left as
written — they are accurate statements about the past. Anything that tells you
what the code does now, or what to do next, is kept current.

## What this project is

**Unlock Gov** — a free, independent web tool that asks about a dozen questions
and tells someone which UK benefits and local council schemes they may be able
to get. England only for now. Static site: `index.html`, `app.js`,
`data/schemes.js`, `data/postcodes.js`, and a Tailwind-compiled `dist/style.css`.
No backend, no database, no stored user data.

Owner: Jake. A second contributor also pushes to this repo as of August 2026.

## The thing that matters most

**This app tells people how much money they are owed.** A plausible-looking
wrong formula is the failure mode, and it is nearly invisible on review. Four
such errors were found on 18 August by hand-computing the correct answer from
the regulations and comparing — not by reading the code.

`verify-maths.cjs` is the file that does this. It states what real DWP rules
produce for each case, computed independently, and compares. It is the reason
the errors were found and it must not be weakened. If it disagrees with the
code, do **not** "fix" the test to match — work out which is right.

Rates live in `data/schemes.js`, which also declares `RATES_TAX_YEAR`. Rates and
the hand-computed expectations in `verify-maths.cjs` must change in the same
commit, or it becomes ambiguous which side is wrong.

## Verified as of 20 August 2026

Independently re-checked against GOV.UK: UC standard allowances
£338.58 / £424.90 / £528.34 / £666.97, child element £303.94, +£47.94 for a
first child born before 6 April 2017, work allowances £427 / £710. These match
the app exactly.

## Verified as of 19 September 2026

Read directly from GOV.UK, not from a summary: the Crisis and Resilience Fund
guidance and the 2026-27 grant determination. Confirmed the fund's dates
(1 April 2026 – 31 March 2029) and England total (£858,004,578); that Housing
Payment eligibility is nationally set ("entitled to either: HB (Housing
Benefit) [or] UC (Universal Credit) with housing costs towards rental
liability"); that Crisis Payment eligibility is left to each authority; and
that "DHPs will come to an end in England on 31 March 2026".

Three things the earlier research got wrong, all corrected in the code and in
the project's council-schemes plan:

- CRF is **not** simply "administered by upper-tier authorities". The grant
  determination gives upper tier authorities crisis and resilience money and
  lower tier authorities housing payments, so **Housing Payments are run by the
  billing authority** — the one a postcode already resolves to here. Only
  Crisis Payments are upper-tier.
- CRF has **four** strands, not two. Crisis Payments, Housing Payments,
  Resilience Services and Community Coordination. Only the first two are things
  an individual can apply for, so only those two are scheme cards.
- The guidance does **not** say the Household Support Fund ended. The final HSF
  period ran to 31 March 2026 with no successor announced and CRF took its
  place — a well-supported inference, not a quotable fact, and recorded in
  `data/schemes.js` as an inference for exactly that reason.

## Council Tax Reduction — fixed 20 Aug, read this if you touch it again

The invented `thresholdPerAdult = 1450` formula is gone. It's now two
genuinely different treatments, because the underlying reality is different:

- **Working-age**: signposted only, no figure. There is no accurate national
  formula — each of ~296 councils runs its own scheme — and no current,
  complete dataset of all of them exists to calculate from either (checked;
  see `PRIORITIES.md` #5 for what was found and the two paths considered for
  fixing this properly).
- **Pension-age**: a real calculation, because this genuinely is one national
  scheme (Council Tax Reduction Schemes (Prescribed Requirements) (England)
  Regulations 2012, as amended). Applicable amount = Pension Credit guarantee
  level (£238.00 single / £363.25 couple, 2026/27), 20% taper on income above
  it, same £10,000-£16,000 deemed-income rule on savings as Pension Credit,
  Guarantee Credit recipients passported to a reduction to nil. A new
  optional question asks for the person's real council tax bill; left blank,
  it falls back to the England average Band D bill (£2,392/yr) with
  confidence downgraded.

**Not modelled, and flagged in the result rather than guessed at**: severe
disability/carer/disabled-child premiums, and non-dependant deductions for
grown-up children or other adults in the household who aren't a partner. Both
would need new questions the wizard doesn't currently ask — same reason UC
error #1 in `FINDINGS.md` was recorded rather than fixed immediately.

Ten new hand-computed cases cover this in `verify-maths.cjs` — search for
"COUNCIL TAX SUPPORT". If you're extending this (e.g. adding premiums, or
real per-council working-age figures), hand-compute the expected result from
the actual regulations first, the same way these were done, rather than
trusting a secondary source's summary — an AI-summarized council PDF gave a
subtly wrong non-dependant-deduction schedule during this fix, caught only by
cross-checking two independent sources before it went anywhere near the code.

## Carer's Allowance — read before building it

It is the clearest new-benefit candidate (£2.35bn/yr unclaimed, 553,000 people,
~71% take-up) but it is **not** a simple add.

Verified from GOV.UK on 20 Aug: **£86.45/week**, 35+ hours of care a week,
earnings limit **£204/week** after tax, NI and expenses, carer must be 16+ and
not in full-time education or studying 21+ hours. The cared-for person must
already receive a qualifying disability benefit.

Two interactions that must be modelled or the app could make someone **worse
off**:

1. Claiming it usually **stops the cared-for person's severe disability
   premium**, and the Pension Credit severe disability addition (~£4,475/yr).
   For a two-person household this can be a net loss.
2. If the carer is on **Universal Credit, Carer's Allowance is deducted
   pound-for-pound**. The real gain is the **UC carer element (£209.34/month)**,
   which is available whether or not Carer's Allowance itself is claimed.

So it cannot ship as a cheerful "you could get £4,495/yr" card.

## Environment and workflow constraints

- Claude's cloud container's internet access is **inconsistent across
  sessions**. As of 19 Sep: `git clone` works, web search and fetch work, npm
  install works, but **`git push` returns 403** ("not in this session's
  authorized repository set"), so a session cannot push for you. Don't assume
  either way; test before relying on it, and fall back to the device-bridge
  folder or chat attachments.
- **`.js` downloads are blocked by his browser.** Send code as `.txt` and have
  him rename. Tell him to turn on File name extensions in Explorer first.
- Jake uses **GitHub Desktop**, not the command line, and **Git is not installed
  on his machines**. Do not hand him `git` commands. Fetch/Pull is the button at
  the top right of the GitHub Desktop toolbar.
- **Node.js is not installed on the Windows machines**, so the tests and
  `npm run build` cannot be run there.
- **Where the suites actually get run, as of 19 Sep.** The Mac clone runs the
  two Node-side suites (`verify-maths.cjs`, `verify-edgecases.cjs`) after
  `npm install`. The four browser suites cannot run there: Playwright's
  Chromium download is blocked by the egress allowlist. They run in the cloud
  container instead, where Chromium is pre-installed at `/opt/pw-browsers` —
  but the pre-installed build may not match the version the pinned Playwright
  expects, in which case point `executablePath` at it **for that run only**.
  Do not commit a hard-coded `executablePath`; that was fixed in August and is
  exactly the bug it fixed.
- Three clones: desktop at `C:\Users\janab\OneDrive\Documents\GitHub` (the repo
  root **is** that folder), laptop at `C:\Claude\Nonprofit`, and a Mac at
  `~/Documents/GitHub/Nonprofit`. The device bridge is bound to whichever
  machine the session started on, and needs a folder connected in the desktop
  app before it can reach anything.
- Git operations through the device bridge can leave a stale `.git/index.lock`,
  because deleting files in a connected folder is off by default. Until it is
  removed, every commit and branch switch fails — including in GitHub Desktop.
- `dist/style.css` is a **compiled** Tailwind build. A class not present when it
  was last built silently does not exist at runtime — the element renders
  unstyled with no error. New classes need `npm run build`, and `dist/style.css`
  must be committed in the same commit as the source change.

## Scheduled

Two annual reminders exist: **25 November** (research what is changing in the
uprating) and **16 March** (apply it before 6 April). Both notify by push.

## Where to look

- `PRIORITIES.md` — the ordered work list. Start here.
- `BENEFITS-SHORTLIST.md` — 62 UK schemes with reach, value and take-up, and a
  tiered recommendation. **Its figures are single-sourced and unverified** —
  the verification pass hit a usage limit and never ran. Good enough to decide
  what to build, not good enough to ship.
- `FINDINGS.md` — the original audit that found the four calculation errors.
- `CLAUDE.md` — working conventions. Note its stack section describes an
  intended Next.js migration that has not happened.
- The claude.ai project attached to this work carries three documents that are
  not in the repo and are more detailed than anything here on the council
  schemes: `local-council-schemes-plan.md` (what the CRF actually is and what
  it made wrong), `local-council-fix-queue.md` (the eight-item queue, six of
  them now done) and `benefits-shortlist.md`. If you are picking up the council
  work, read the fix queue first.
