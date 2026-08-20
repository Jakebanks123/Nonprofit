# UK benefits: reach, value, and what Unlock Gov should do about each

Compiled 19 August 2026, tax year 2026/27. 62 schemes surveyed across six domains.

> **Read this caveat first.** Six research agents produced this; the three
> verification agents that were meant to cross-check every figure hit a usage
> limit and did not run. So **every number below is single-sourced and
> unverified.** It is good enough to decide *what to build*. It is not good
> enough to put in the app. Anything you decide to implement needs its rates
> and rules checked against primary sources first, the same way the existing
> six schemes were.

---

## The headline

The biggest opportunity is not a new benefit. It is **Council Tax Reduction**,
which the app already lists — using a formula we invented.

Policy in Practice put unclaimed Council Tax Reduction at **£3.3bn a year across
2.57 million households, averaging £1,286 each**. That is the second-largest
unclaimed pot in the UK, behind only Universal Credit. The app currently shows
a made-up figure for it, and fixing that was already Tier 1 on your priorities
list. This research says it should stay there, above every new benefit.

The picture across the whole survey: **around £24bn a year goes unclaimed**, and
it is heavily concentrated. Universal Credit (£11.1bn), Council Tax Reduction
(£3.3bn), Pension Credit (£2.5bn), Carer's Allowance (£2.35bn) and Child Benefit
(£1.48bn) are most of it. You already cover four of those five.

**The one big gap is Carer's Allowance.** Your instinct to start there was right.

---

## Tier 1 — add these

### Carer's Allowance
| | |
|---|---|
| Reach | ~2.5% of all UK adults (1.4m claimants) |
| Value | £86.45/wk = £4,495/yr, plus a UC carer element worth £2,512/yr |
| Unclaimed | **£2.354bn/yr, 553,000 people, £4,252 each — ~71% take-up** |
| New questions | 2: hours of care per week, and whether the person cared for gets a disability benefit |
| Modelable | Yes — the test is objective (35+ hours a week, earnings under the limit) |

The third-largest unclaimed benefit in the country, and unlike the disability
benefits its eligibility test is mechanical: 35 hours of care a week, the person
you care for receives a qualifying disability benefit, and you earn under the
threshold. No functional assessment, no discretion. This is the clearest
build-and-calculate case in the entire survey.

### Blue Badge
| | |
|---|---|
| Reach | ~5% of the England population |
| Value | No cash, but avoided parking costs are substantial and ongoing |
| Unclaimed | **Only 37% of automatically eligible people hold one — down from 46% in 2020. Roughly 2 million people.** |
| New questions | **None** — the automatic route keys off benefits the app already asks about |
| Modelable | Yes, for the automatic route only |

Striking find. There is an automatic-eligibility route that requires no
assessment at all, and nearly two-thirds of the people it covers do not have a
badge. Because it keys off benefit receipt the app already collects, this costs
zero new questions. Do not attempt the discretionary route.

### Free school meals — including the September 2026 expansion
| | |
|---|---|
| Reach | ~3% of all UK adults; a much larger share of families on UC |
| Value | ~£500/yr per child |
| Unclaimed | 95% take-up against the *old* threshold — but the September 2026 expansion creates **500,000+ newly eligible children whose families have never been told** |
| New questions | 0–1 (school-age children) |
| Modelable | Yes |

Timing matters here. The expansion has just happened, awareness is near zero in
the new cohort, and the app already knows income and children. This is the most
time-sensitive item in the list.

### Council Tax single person discount
| | |
|---|---|
| Reach | ~16% of UK adults (8.5m English dwellings) |
| Value | 25% off the annual bill |
| Unclaimed | No published rate; the gap is people whose circumstances changed and never told the council |
| New questions | **None** — the app already asks how many adults are in the household |
| Modelable | Yes, trivially |

Highest reach of anything not already covered, and free to implement. Not a
take-up disaster in percentage terms, but the base is enormous and the trigger
is a change of circumstances — a partner or housemate moving out — which is
exactly the moment someone might use a tool like this.

---

## Tier 2 — worth adding, but each costs something

### Water company social tariffs — signpost
**£745m/yr unclaimed across 3.85m households (£194 each).** Ofwat found only 3 in
10 customers knew these existed and just **7% were receiving one**. Terrible
awareness, real money. Can't be calculated — every water company sets its own
scheme — but a signpost keyed off low income costs nothing and one question.

### Childcare: 15 hours (2-year-olds) and 30 hours (9 months to 4)
15-hour take-up is **65%, the worst of any DfE childcare entitlement**; the new
9-months-to-2 offer sits at 70%. Values are large — 1,140 funded hours a year.
Costs 2–3 new questions (ages of children under 5, working status of both
parents), so it only pays off if you want the app to serve families with very
young children well.

### Council Tax severe mental impairment disregard
Alzheimer's Society says hundreds of thousands are missing out, and
MoneySavingExpert found councils were failing to publicise it. Can be worth a
25–100% discount plus backdating. Sensitive to ask about directly — probably
better as a signpost within the council tax section than a question.

### Marriage Allowance
~4.5% of adults, £252/yr, mechanical to calculate, and the app already collects
household and highest-individual income. Cheap to add. Low value per person, and
it skews away from the lowest-income users, so it earns its place only because
it is nearly free to implement.

---

## Tier 3 — signpost only, never calculate

These matter enormously but a form cannot honestly produce a figure.

**Attendance Allowance** — Policy in Practice estimate **1.1m pensioner
households missing £5.2bn/yr**, with AA the largest component. Worth up to
£5,959/yr and it unlocks the Pension Credit severe disability addition. But
entitlement turns on a care-needs assessment. Policy in Practice explicitly
exclude it from their modelled £24bn *because it cannot be modelled reliably*.
Prompt people to check; never quote them a number.

**Personal Independence Payment** — 4.0m claimants, up to £10,119/yr. Same
problem, worse: only **37% of new claims are awarded**. Presenting PIP as a
likely win would mislead most people who saw it.

**Universal Credit health element (LCWRA)** — the failure mode is people already
on UC who never report a health condition. Two-tier from April 2026.

**Household Support Fund, Discretionary Housing Payments, Crisis and Resilience
Fund** — cash-limited pots, discretionary awards, demand already exceeds supply
(DHP spent 107% of its allocation). Signpost only.

**Priority Services Register** — no cash value, but Ofgem found only 24% of
consumers knew it existed and one water company alone counted 1.4m eligible
unregistered households. Free to signpost.

---

## Do not add

- **State Pension, Winter Fuel Payment, Cold Weather Payment, age-60 prescription exemptions** — effectively automatic. Take-up is 98–100% and a checker adds nothing.
- **Free TV licence for over-75s** — entirely gated behind Pension Credit, which you already cover. Fixing Pension Credit take-up covers this for free.
- **Budgeting Loans, Support for Mortgage Interest** — tiny and shrinking; SMI is declined by ~80% of eligible people because it is a loan secured on the property.
- **Statutory Maternity/Paternity Pay, Statutory Sick Pay** — employer-administered, not claimed through a checker.
- **Access to Work, Disabled Facilities Grant** — the constraint is supply, not awareness. Access to Work has a 66,700 backlog and a 100-day average wait against a 25-day target. Telling people to apply is not obviously a kindness.
- **Managed migration** — not a benefit, but worth knowing: ~242,000 households ignored a migration notice and lost their legacy benefits. They can still claim UC, without transitional protection. A line of copy, not a feature.

---

## What this would cost

Tier 1 in full: **3 new questions** — two for Carer's Allowance, one optional for
school-age children. Blue Badge and the single person discount need none.

Tier 2 in full: another **4–5 questions**, mostly conditional on having young
children.

So Tier 1 is nearly free and Tier 2 roughly doubles the wizard for families.
That asymmetry is the argument for doing Tier 1 now and treating Tier 2 as a
separate decision.

## The biggest risk

Adding breadth before fixing Council Tax Reduction. It is the second-largest
unclaimed pot in the country, it is already in the app, and it currently shows a
number we made up. Adding four more schemes around it would make the app look
more authoritative while leaving its largest single claim unfounded.
