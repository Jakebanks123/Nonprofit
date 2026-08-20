# Notes for whoever picks this up next

Last updated 2026-08-20. Written for a future Claude session, but useful to a
human too.

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

- Claude's cloud container has **no general internet** — no GitHub, no npm
  registry, no postcodes.io. Files reach Jake through the device-bridge folder
  or as chat attachments.
- **`.js` downloads are blocked by his browser.** Send code as `.txt` and have
  him rename. Tell him to turn on File name extensions in Explorer first.
- Jake uses **GitHub Desktop**, not the command line, and **Git is not installed
  on his machines**. Do not hand him `git` commands. Fetch/Pull is the button at
  the top right of the GitHub Desktop toolbar.
- **Node.js is not installed either**, so he cannot run the tests or
  `npm run build` locally. Staging the repo into the container and running the
  suite there works well and has caught real bugs twice.
- Two clones: desktop at `C:\Users\janab\OneDrive\Documents\GitHub` (the repo
  root **is** that folder), laptop at `C:\Claude\Nonprofit`. The device bridge is
  bound to whichever machine the session started on.
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
