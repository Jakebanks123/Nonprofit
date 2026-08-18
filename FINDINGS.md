# Pre-feature audit — findings

Date: 2026-08-18. Against `index.html` at commit `8852182`.

Method: the app's own eligibility functions were extracted and run in Node
against figures hand-computed independently from real DWP 2024/25 rules
(`verify-maths.cjs`), plus browser-driven tests for edge cases, navigation,
accessibility and layout. Every maths finding was then put to two independent
skeptics each, instructed to refute it and to default to "refuted" if
unsupported. All eight returned "not refuted" at high confidence, citing
primary legislation.

---

## A. Calculation errors (all CONFIRMED against primary legislation)

### A1. Universal Credit work allowance given to claimants who aren't entitled to it
**Severity: highest — systematically over-promises money.**

Reg 22, Universal Credit Regulations 2013: a work allowance exists *only*
where the claimant or partner is responsible for a child/qualifying young
person, **or** has limited capability for work. Otherwise it is nil and all
net earnings are tapered at 55%.

The app applies an allowance to everyone, gated only on whether housing costs
exist:

    const workAllowance = input.housingCosts > 0 ? 404 : 673;

Worked example — single childless renter, 25+, £400/mo earnings, £600/mo rent:

| | |
|---|---|
| App output | £993.45/mo |
| Correct | £773.45/mo |
| Overestimate | **£220.00/mo (£2,640/yr)** |

Worst case is £222.20/mo for renters and £370.15/mo for non-renters. The
£404/£673 rates themselves are correct for 2024/25 and mapped the right way
round; the defect is purely the missing eligibility gate. It only bites
childless non-LCW claimants, which is why the earlier scenario tests (all of
which had children or were pensioners) missed it.

Fix requires a new input — the wizard does not currently ask about limited
capability for work at all.

### A2. Universal Credit ignores tariff income on savings
Reg 72: capital between £6,000 and £16,000 yields £4.35/month per £250 (or
part) above £6,000, deducted pound-for-pound. The app models only the
£16,000 cutoff. At £10,000 savings the award is overstated by £69.60/mo;
peak error is about £174/mo just under the cutoff.

Also: `savings >= 16000` should be `> 16000`. Reg 18 disqualifies only
*above* £16,000, so someone with exactly £16,000 is wrongly refused. Same
boundary bug appears twice (UC and Council Tax Support).

### A3. Pension Credit ignores deemed income on capital
Reg 15(6), State Pension Credit Regulations 2002: capital above £10,000 is
deemed to yield £1/week per £500 (or part), added to income before the
Guarantee Credit top-up. The app never applies it — savings appear only in a
dead conditional. Single pensioner, £600/mo income, £15,000 savings is
overstated by £43.33/mo (~12.6%); £86.67/mo at £20,000.

### A4. Child Benefit charge assessed on household instead of individual income
**This one under-states — it tells people they get nothing when they do.**

HICBC is charged on the *single individual* with the higher adjusted net
income (1% per £200 above £60,000, full clawback at £80,000 for 2024/25),
never on combined household income. A couple each earning £45,000 pays
nothing and keeps Child Benefit in full; the app returns ineligible.

Two further points: the app should never return `eligible: false` for Child
Benefit at all — entitlement survives the charge, and claiming at a nil rate
protects National Insurance credits, which matters for future State Pension.
And it compares take-home income against a threshold defined in terms of
adjusted *net* income, which are not the same measure.

---

## B. Input validation

Validation blocks negative income, age 0 and negative age. It does **not**
block, and these reach the results screen as real numbers:

| Input | Result |
|---|---|
| Housing costs −£300 | accepted, reduces award |
| Savings −£1,000 | accepted |
| Children −2 | accepted |
| Adults 0 | accepted, still awards a single-person UC allowance |
| Age 200 | accepted, awarded Pension Credit |
| Housing £1,000,000,000 | "£12,000,007,841 per year" shown to the user |
| 500 children | "£2,065,511 per year" shown to the user |

At the logic layer, `NaN` income propagates through Universal Credit and
Council Tax Support and would render as "£NaN".

---

## C. Accessibility

Working: focus moves to the step heading on navigation; `aria-live` region
announces each step; every input has an associated label; full keyboard
operation confirmed; tab order sensible; Enter in the postcode field triggers
lookup.

Two issues:

1. **Silent validation failure.** Pressing Next with nothing filled in does
   nothing at all — no message, no live-region announcement, no field
   highlight. A screen reader user gets no feedback that anything happened,
   and a sighted user just sees a dead button. Same on the household step
   with a blank age.
2. **Focus ring on the step heading.** Because focus is moved
   programmatically to an `h1[tabindex="-1"]`, a black box is drawn around
   the title on every step change, including for mouse users. Confirmed
   visually (`getComputedStyle` reports `outline: none` and misses it).

---

## D. Layout, data and links — no problems found

- No horizontal overflow at 320px, 390px or 768px.
- All 2,223 ONS outcodes and 2,304 sector overrides map to valid council
  names; no malformed keys; no orphaned sector overrides.
- All 12 pilot councils wire correctly and appear in the search list.
- 42 schemes, 42 unique ids, all with valid https URLs.
- Postcode parser handles lowercase, no-space, spaced-out and outcode-only
  input; rejects Scottish/Welsh/NI postcodes cleanly; no injection issue.

Coverage note: only 232 of 2,223 outcodes (10.4%) resolve to a council that
actually has local scheme data.

---

## E. Not testable from this environment

- **Live postcodes.io lookup.** Every postcode test to date has exercised the
  offline ONS fallback, because this sandbox cannot reach the API. The
  primary path has never been confirmed working.
- **Safari.** `<datalist>` support is historically weaker there, and the
  council search field depends on it.
