/* The schemes and their eligibility rules.

   This is the main file to edit when adding or adjusting a scheme: add an
   object to NATIONAL_SCHEMES (or to a council's array in LOCAL_SCHEMES) with
   an evaluate(input) function. No other file needs to change.

   evaluate(input) returns either { eligible: false } or
   { eligible: true, confidence, amount, reason, note? }.

   Figures are 2026/27 rates (uprated 6 April 2026). When the next uprating
   lands, change the constants here AND the hand-computed expectations in
   verify-maths.cjs in the same commit — otherwise the tests will disagree with
   reality and it is ambiguous which side is wrong. The national
   rules were checked against the governing regulations (cited inline where
   they are easy to get wrong); local council figures are placeholders. */

/* The tax year these rates belong to. verify-maths.cjs fails once this is no
   longer the current tax year, so stale rates announce themselves instead of
   sitting unnoticed — which is exactly what happened between 2024/25 and
   2026/27. Update this in the same commit as the rates. */
const RATES_TAX_YEAR = "2026/27";

/* England-wide average Band D council tax bill for 2026/27: £2,392/yr
   (MHCLG "Council tax levels set by local authorities in England 2026 to
   2027" statistical release, 25 March 2026 — a 4.9%/£111 uprating on
   2025/26, cross-checked via press coverage of that release, Aug 2026).
   Used only as a fallback when someone doesn't tell us their own council tax
   bill for the Council Tax Reduction calculation below — most homes are not
   actually Band D, so this is a rough stand-in, not a real figure for any
   specific household. Update alongside RATES_TAX_YEAR each year. */
const COUNCIL_TAX_ENGLAND_AVERAGE_ANNUAL = 2392;

/* Which UK tax year a given date falls in. Tax years run 6 April to 5 April,
   so "2026/27" means 6 April 2026 to 5 April 2027. Used by the app to warn
   users when the rates above have been overtaken, and by verify-maths.cjs to
   fail the suite for the same reason — one definition, two consumers. */
function ukTaxYearOf(date) {
  const year = date.getFullYear();
  const startsThisYear = new Date(year, 3, 6); // month index 3 = April
  const startYear = date >= startsThisYear ? year : year - 1;
  return { label: `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`, startYear };
}

/* Null while the rates are current. Otherwise describes the gap, so callers
   don't each have to work it out. */
function ratesStaleness(now) {
  const current = ukTaxYearOf(now || new Date());
  if (current.label === RATES_TAX_YEAR) return null;
  return {
    declared: RATES_TAX_YEAR,
    current: current.label,
    startedOn: `6 April ${current.startYear}`
  };
}

/* THE CRISIS AND RESILIENCE FUND. Replaced two things at once in England on
   1 April 2026, which is why 22 entries in this file named schemes that no
   longer exist:

   - Discretionary Housing Payments. "DHPs will come to an end in England on
     31 March 2026. From 1 April 2026, DHPs will be replaced by the Housing
     Payment strand of the CRF" (CRF guidance, verbatim).
   - The Household Support Fund. Note the guidance does NOT say this. The
     final HSF period ran 1 April 2025 to 31 March 2026 with no successor
     period announced, and CRF took its place from 1 April 2026 — a
     well-supported inference, not a quotable fact. Recorded as an inference
     deliberately: an unsourced claim stated as fact is what this file keeps
     getting wrong.

   The fund runs 1 April 2026 to 31 March 2029 and is worth £858,004,578 for
   England in 2026-27. It has four strands — Crisis Payments, Housing
   Payments, Resilience Services and Community Coordination — but only the
   first two are things an individual can apply for. The other two are
   commissioned services (debt advice, community capacity), so they are
   deliberately not scheme cards here.

   WHICH COUNCIL RUNS WHICH STRAND. The grant determination splits the money
   by tier: "For unitary authorities – funding for crisis and resilience
   activities, housing payments and local authority housing administration
   costs; For upper tier authorities – funding for crisis and resilience
   activities; For lower tier authorities – funding for housing payments and
   local authority housing administration costs."

   So Housing Payments are run by the BILLING authority — the council that
   sends the council tax bill, which is what a postcode already resolves to
   here. Crisis Payments are run by the UPPER-TIER authority, which in a
   two-tier area is the county council and not the billing authority. The app
   cannot currently name that county, so the Crisis Payment copy below says so
   rather than naming the wrong council. */
const CRF_GUIDANCE_URL = "https://www.gov.uk/government/publications/crisis-and-resilience-fund-guidance-for-local-authorities-in-england-1-april-2026-to-31-march-2029/the-crisis-and-resilience-fund-guidance-for-local-authorities-in-england-1-april-2026-to-31-march-2029";

/* Districts receive a Housing Payment allocation in years 1 and 2 only:
   "From Year 3 (the FYE March 2029), District Councils will no longer receive
   an allocation for The Fund. Instead, all the CRF funding will be
   distributed to Unitary Authorities (and County Councils that continue to
   operate in the FYE March 2029)."

   The financial year ending March 2029 begins on 1 April 2028, so from that
   date the answer to "which council do I apply to for a Housing Payment"
   changes from the billing authority to the upper-tier one. That is a change
   of ANSWER, not just of funding line, so it needs the same tripwire
   treatment as RATES_TAX_YEAR rather than a comment nobody reads.
   verify-maths.cjs fails once this date has passed. */
const CRF_DISTRICT_HOUSING_EXIT = "2028-04-01";

function crfDistrictHousingExitPassed(now) {
  return (now || new Date()) >= new Date(CRF_DISTRICT_HOUSING_EXIT + "T00:00:00Z");
}

/* Working-age Council Tax Support has no national capital limit — each
   council sets its own — so this is a threshold for HIDING a signpost, never
   for calculating an amount. £16,000 is the commonest working-age capital
   limit and is the one Leeds applies in its published 2026-27 scheme. Above
   it, telling someone they are "very likely" to qualify is the same
   over-claim the invented national formula made, in the other direction. */
const WORKING_AGE_CTS_CAPITAL_SIGNPOST_LIMIT = 16000;

/* CRF is England-only. A postcode outside England reaches here as council
   "other" with a detected district name from the live lookup, which covers
   the whole UK — so "we did not recognise the council" and "the council is
   not in England" have to be told apart, or a Cardiff resident is told about
   a fund that does not exist for them. */
function isEnglishCouncil(input) {
  if (input.council && input.council !== "other") return true;
  const name = (input.detectedDistrict || "").toLowerCase();
  if (!name) return false;
  return typeof ENGLAND_COUNCIL_LOOKUP_BY_LOWER !== "undefined"
    && Object.prototype.hasOwnProperty.call(ENGLAND_COUNCIL_LOOKUP_BY_LOWER, name);
}

function weeklyIncome(input) {
  return (input.monthlyIncome * 12) / 52;
}

function annualIncome(input) {
  return input.monthlyIncome * 12;
}

function isOverPensionAge(input) {
  return input.age >= 66;
}

function gbp(n) {
  return "£" + Math.round(n).toLocaleString("en-GB");
}

/* ---------- NATIONAL SCHEMES ---------- */

const NATIONAL_SCHEMES = [
  {
    id: "universal-credit",
    /* Money paid to you. */
    kind: "cash",
    name: "Universal Credit",
    url: "https://www.gov.uk/universal-credit",
    category: "national",
    evaluate(input) {
      if (isOverPensionAge(input)) {
        return { eligible: false };
      }
      // Reg 18, UC Regs 2013: capital *above* £16,000 disqualifies. Exactly
      // £16,000 does not, hence ">" and not ">=".
      if (input.savings > 16000) {
        return { eligible: false };
      }
      const standardAllowance = input.adults >= 2
        ? (input.age < 25 ? 528.34 : 666.97)
        : (input.age < 25 ? 338.58 : 424.90);

      /* Child element. The higher first-child rate still applies where the
         eldest was born before 6 April 2017.
         The two-child limit was REMOVED from 6 April 2026 by the Universal
         Credit (Removal of Two Child Limit) Act 2026, so every child now gets
         an element — do not reintroduce a cap here. */
      const childElement = input.children > 0
        ? (input.eldestChildBornBefore2017 ? 351.88 : 303.94)
          + Math.max(0, input.children - 1) * 303.94
        : 0;
      const housingElement = input.housingCosts || 0;
      const maxAward = standardAllowance + childElement + housingElement;

      // Reg 22, UC Regs 2013: a work allowance exists ONLY where the claimant
      // (or partner) is responsible for a child, or has limited capability for
      // work. In any other case it is nil and every pound of earnings tapers.
      const qualifiesForWorkAllowance = input.children > 0 || input.limitedCapabilityForWork;
      const workAllowance = qualifiesForWorkAllowance
        ? (input.housingCosts > 0 ? 427 : 710)
        : 0;
      const excessIncome = Math.max(0, input.monthlyIncome - workAllowance);
      const taper = excessIncome * 0.55;

      // Reg 72: capital between £6,000 and £16,000 is treated as yielding
      // £4.35/month per £250 (or part) above £6,000. This is unearned income,
      // so it comes off the award pound-for-pound rather than being tapered.
      const tariffIncome = input.savings > 6000
        ? Math.ceil((input.savings - 6000) / 250) * 4.35
        : 0;

      const estimatedMonthly = Math.max(0, maxAward - taper - tariffIncome);

      if (estimatedMonthly <= 0) {
        return { eligible: false };
      }
      let reason = "Based on your household size, income and housing costs, you look to be under the Universal Credit threshold.";
      if (!qualifiesForWorkAllowance && input.monthlyIncome > 0) {
        reason += " You do not have children, and you have not told us a health condition limits your work. That means there is no free allowance. For every £1 you earn, your Universal Credit goes down by 55p.";
      }
      if (tariffIncome > 0) {
        reason += ` You have more than £6,000 saved. The rules count that as about ${gbp(tariffIncome)} a month of income, which lowers the amount you get.`;
      }
      return {
        eligible: true,
        confidence: input.employment === "unemployed" || input.employment === "unable" ? "likely" : "possible",
        amount: { value: estimatedMonthly, period: "month" },
        reason
      };
    }
  },
  {
    id: "pension-credit",
    /* Money paid to you. */
    kind: "cash",
    name: "Pension Credit",
    url: "https://www.gov.uk/pension-credit",
    category: "national",
    evaluate(input) {
      if (!isOverPensionAge(input)) return { eligible: false };
      const threshold = input.adults >= 2 ? 363.25 : 238.00;
      // Reg 15(6), State Pension Credit Regs 2002: the first £10,000 of capital
      // is ignored; above that, capital is deemed to yield £1/week per £500 (or
      // part), added to income before the top-up is worked out. There is no
      // upper capital limit for Pension Credit.
      const deemedWeekly = input.savings > 10000
        ? Math.ceil((input.savings - 10000) / 500)
        : 0;
      const wk = weeklyIncome(input) + deemedWeekly;
      const topUp = threshold - wk;
      if (topUp <= 0) return { eligible: false };
      let reason = "You're over State Pension age and your income looks to be below the Pension Credit guarantee level.";
      if (deemedWeekly > 0) {
        reason += ` You have more than £10,000 saved. The rules count that as about £${deemedWeekly} a week of income, which lowers the top-up.`;
      }
      return {
        eligible: true,
        confidence: "likely",
        amount: { value: (topUp * 52) / 12, period: "month" },
        reason,
        note: "Getting Pension Credit, even a small amount, also gets you the Warm Home Discount and other help. It is worth claiming even if the amount looks small."
      };
    }
  },
  {
    id: "child-benefit",
    /* Money paid to you. */
    kind: "cash",
    name: "Child Benefit",
    url: "https://www.gov.uk/child-benefit",
    category: "national",
    evaluate(input) {
      if (input.children <= 0) return { eligible: false };
      const weekly = 27.05 + Math.max(0, input.children - 1) * 17.90;
      const fullMonthly = (weekly * 52) / 12;

      // The High Income Child Benefit Charge is assessed on the HIGHEST
      // INDIVIDUAL adjusted net income — essentially gross income minus
      // pension contributions and Gift Aid, i.e. BEFORE tax and National
      // Insurance, not take-home pay (checked against LITRG, Aug 2026) —
      // and never on the household total. For a single-adult household
      // that's just their own income; for a couple, whichever one person
      // earns most. We ask for this separately from the take-home income
      // question earlier in the wizard, because the two are not the same
      // number and take-home always understates it.
      const gotBeforeTaxFigure = input.highestIndividualIncomeBeforeTax != null;
      const highestIndividualMonthly = gotBeforeTaxFigure
        ? input.highestIndividualIncomeBeforeTax
        : input.monthlyIncome; // fallback only: take-home is lower than this, so a real charge can be missed
      const highestIndividualAnnual = highestIndividualMonthly * 12;

      let confidence = "likely";
      let reason = "You have children under 20 in full-time education or under 16, which qualifies for Child Benefit.";
      let value = fullMonthly;

      if (highestIndividualAnnual > 60000) {
        // 1% of the benefit clawed back per £200 over £60,000; fully clawed
        // back at £80,000. Entitlement itself never stops.
        const clawbackFraction = Math.min(1, (highestIndividualAnnual - 60000) / 20000);
        value = fullMonthly * (1 - clawbackFraction);
        confidence = "possible";
        if (clawbackFraction >= 1) {
          reason += " The highest earner in your home looks to be over £80,000 a year before tax. A tax charge would take all of the Child Benefit back. It is still usually worth claiming and choosing to get £0. That keeps your National Insurance record going, which counts towards your State Pension.";
        } else {
          reason += ` The highest earner in your home looks to be over £60,000 a year before tax, so a tax charge would take back roughly ${Math.round(clawbackFraction * 100)}% of it. That charge looks at what one person earns before tax, not what your whole home earns.`;
        }
      } else if (input.adults >= 2) {
        reason += " The High Income Child Benefit Charge is based on the highest single income in your household before tax, not the combined total — so two people earning under £60,000 each are not affected.";
      }

      if (!gotBeforeTaxFigure) {
        reason += " We worked this out using your take-home income, because we don't have anyone's income before tax. The real test uses income before tax, which is higher than take-home, so this may understate whether a charge applies.";
      }

      return {
        eligible: true,
        confidence,
        amount: value > 0.5
          ? { value, period: "month" }
          : { value: 0, period: "n/a", display: "Worth claiming at £0 — it protects your State Pension record" },
        reason
      };
    }
  },
  {
    id: "healthy-start",
    /* A prepaid card for food and milk, not money paid to you. */
    kind: "in-kind",
    name: "Healthy Start",
    url: "https://www.healthystart.nhs.uk/",
    category: "national",
    evaluate(input) {
      if (!input.pregnantOrChildUnder4) return { eligible: false };

      // There is no route to Healthy Start on income alone — every real
      // pathway goes through a specific qualifying benefit (checked against
      // Turn2us, Aug 2026). On Universal Credit the cap is much tighter than
      // a general low-income test: the household's monthly EARNED income
      // must be £408 or less. Pension Credit carries no income test of its
      // own on top of that.
      const onPensionCredit = input.receivingPensionCredit;
      const onUCWithinEarningsCap = input.receivingUC && input.monthlyIncome <= 408;
      if (!onPensionCredit && !onUCWithinEarningsCap) return { eligible: false };

      return {
        eligible: true,
        confidence: onPensionCredit ? "likely" : "possible",
        amount: { value: (4.25 * 52) / 12, period: "month" },
        reason: onPensionCredit
          ? "Being pregnant or having a child under 4 while on Pension Credit qualifies for a Healthy Start prepaid card for food and milk."
          : "Being pregnant or having a child under 4, and on Universal Credit with low earnings from work, typically qualifies for a Healthy Start prepaid card for food and milk.",
        note: onPensionCredit ? undefined : "The real limit is your household's earnings from work (£408 a month or less), not your total income — so this may look wrong if much of your income is not from a job."
      };
    }
  },
  {
    id: "warm-home-discount",
    /* A credit on your electricity bill, not money paid to you. */
    kind: "bill",
    name: "Warm Home Discount",
    url: "https://www.gov.uk/the-warm-home-discount-scheme",
    category: "national",
    evaluate(input) {
      const onPensionCreditGuarantee = input.receivingPensionCredit && isOverPensionAge(input);
      const lowIncomeHighCost = input.monthlyIncome < (1200 + input.children * 200) && (input.receivingUC || input.hasDisabilityOrHealthCondition);
      if (!onPensionCreditGuarantee && !lowIncomeHighCost) return { eligible: false };
      return {
        eligible: true,
        confidence: onPensionCreditGuarantee ? "likely" : "possible",
        amount: { value: 150, period: "one-off" },
        reason: onPensionCreditGuarantee
          ? "Households on the Pension Credit guarantee element are usually applied automatically."
          : "On a low income with an eligible benefit or health condition, you may qualify — check with your energy supplier."
      };
    }
  },
  {
    id: "council-tax-support",
    /* A reduction on a bill you already have, not money paid to you. */
    kind: "bill",
    name: "Council Tax Support (Reduction)",
    url: "https://www.gov.uk/apply-council-tax-reduction",
    category: "national",
    evaluate(input) {
      // WORKING-AGE: every English billing authority designs its own
      // working-age scheme — income bands, taper rate, minimum payments and
      // band caps all vary council to council (checked against Shelter Legal
      // England and several councils' own 2025/26-2026/27 scheme documents,
      // Aug 2026; confirmed there is no current, complete, machine-readable
      // dataset of all ~296 schemes to calculate from either). There is no
      // accurate UK-wide formula, so — unlike every other scheme in this
      // file — we deliberately do not estimate a figure here. Doing that was
      // the original bug. Treated as a signpost instead — the same category
      // BENEFITS-SHORTLIST.md puts PIP and Attendance Allowance in: real and
      // usually worth applying for, but not something a few questions can
      // honestly price. Real per-council figures for the pilot councils are
      // a planned follow-up — see PRIORITIES.md.
      if (!isOverPensionAge(input)) {
        /* No income or savings test used to be applied here at all, so a
           working-age household on £8,000 a month with £200,000 in the bank
           was told it was "very likely" to get a reduction. The pension-age
           branch below has always applied the £16,000 capital limit; this
           branch returned before reaching it. Same bug as commit 0897f71,
           mirrored.

           This hides the signpost rather than calculating anything — see
           WORKING_AGE_CTS_CAPITAL_SIGNPOST_LIMIT. Income is deliberately not
           gated: capital limits are near-universal across council schemes and
           cluster on one number, while income thresholds are the part that
           genuinely differs council to council, so any income line here would
           be invented. */
        if (input.savings > WORKING_AGE_CTS_CAPITAL_SIGNPOST_LIMIT) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          reason: "You're very likely able to get some reduction on your council tax if you're on a low income — but working-age schemes are designed by each council individually, with different income bands and different amounts, so there's no accurate figure we can give you without knowing your specific council's rules.",
          note: "Apply directly with your council to find out what you'd actually get."
        };
      }

      // PENSION-AGE: genuinely a national scheme — the Council Tax Reduction
      // Schemes (Prescribed Requirements) (England) Regulations 2012, as
      // amended for 2026/27 — so unlike the working-age case above, a real
      // UK-wide calculation is possible. Checked against Oxford City
      // Council's and Durham County Council's published pensioner scheme
      // documents and the DWP/Age UK 2026/27 benefit rates, Aug 2026.
      //
      // The £16,000 capital limit is NOT waived just for being over State
      // Pension age — only actually receiving the guarantee element of
      // Pension Credit disregards capital entirely (same combination Warm
      // Home Discount above already uses for the same reason).
      const onGuaranteeCredit = input.receivingPensionCredit;
      if (input.savings > 16000 && !onGuaranteeCredit) return { eligible: false };

      // Maximum reduction is 100% of the person's actual weekly council tax
      // liability. We ask for their real bill; if they don't know it, fall
      // back to the England average Band D bill, which is a much rougher
      // stand-in since most homes aren't actually Band D.
      const gotOwnBill = input.councilTaxAnnual != null;
      const weeklyBill = (gotOwnBill ? input.councilTaxAnnual : COUNCIL_TAX_ENGLAND_AVERAGE_ANNUAL) / 52;
      const billCaveat = gotOwnBill
        ? ""
        : " We don't know your actual council tax bill, so this uses the England average Band D bill instead of your real one — your real amount could be higher or lower.";
      // Premiums (severe disability, caring, children in a pensioner's
      // household) and non-dependant deductions (grown-up children or other
      // non-dependent adults living with you) both change the real award,
      // and neither is modelled yet — the app doesn't currently ask what it
      // would need to work them out. Flagged rather than guessed at.
      const modellingCaveat = " This doesn't include extra amounts some households get for a severe disability, for caring for someone, or for children in a pensioner's home, or deductions for grown-up children or other non-dependent adults living with you — so your real award could be higher or lower than this.";
      const note = (billCaveat + modellingCaveat).trim();

      if (onGuaranteeCredit) {
        return {
          eligible: true,
          confidence: gotOwnBill ? "likely" : "possible",
          amount: { value: (weeklyBill * 52) / 12, period: "month" },
          reason: "Getting the guarantee part of Pension Credit means your income and savings are ignored for Council Tax Reduction, so you qualify to have your council tax reduced to nil.",
          note
        };
      }

      // Same applicable amount as the Pension Credit guarantee level — both
      // come from the DWP Standard Minimum Guarantee — and the same
      // £10,000-£16,000 tariff income rule as Pension Credit itself (Reg
      // 15(6) SPC Regs 2002): £1/wk per £500 (or part) above £10,000.
      const threshold = input.adults >= 2 ? 363.25 : 238.00;
      const deemedWeekly = input.savings > 10000 ? Math.ceil((input.savings - 10000) / 500) : 0;
      const wk = weeklyIncome(input) + deemedWeekly;
      const excess = Math.max(0, wk - threshold);
      // Main scheme taper: 20p reduction for every £1 of income above the
      // applicable amount (confirmed via Oxford City Council's published
      // 2025/26 pensioner scheme document, which states the calculation
      // explicitly).
      const weeklyReduction = Math.max(0, weeklyBill - excess * 0.20);
      if (weeklyReduction <= 0) return { eligible: false };

      let reason = "You're over State Pension age. The national pensioner Council Tax Reduction scheme reduces your bill by 20p for every £1 your income is above the Pension Credit guarantee level.";
      if (deemedWeekly > 0) {
        reason += ` You have more than £10,000 saved, which the rules count as roughly £${deemedWeekly} a week of extra income.`;
      }

      return {
        eligible: true,
        confidence: "possible",
        amount: { value: (weeklyReduction * 52) / 12, period: "month" },
        reason,
        note
      };
    }
  }
];

/* ---------- LOCAL SCHEMES (pilot councils) ---------- */

/* VERIFICATION STATUS. Every local entry carries `verification`, and the data
   sanity pass in verify-keyboard.js fails the build on a missing or malformed
   one.

   It replaces `lastVerified: "example data — verify with council"`, which was
   set on all 36 entries and read by nothing — not app.js, not explore-ui.js,
   not any suite. The honesty marker never reached a user or a test.

   The obvious replacement was a date on each entry. That would have been
   worse than the placeholder: 34 of the 36 have never been checked against
   anything, and a date is a claim that someone looked. So the field records
   what was actually done, and "unchecked" is a legitimate value that stays
   until someone checks:

     { status: "unchecked" }
       Nobody has verified this entry against the council. No date, no source
       — writing either would invent a check that did not happen.

     { status: "verified", date, source, note? }
       Someone read `source` on `date` and the entry matches it. `note` says
       what the source did and did not confirm.

     { status: "disputed", date, source, note }
       Someone looked and the claim was NOT supported. The entry is still
       shown; `note` says what was checked and what was missing. Acting on a
       disputed entry is a separate decision (PRIORITIES.md, local council
       schemes), not something this field makes for you.

   `date` is ISO YYYY-MM-DD and may not be in the future; `source` must be the
   https page that was actually read. Nothing in the UI reads this yet — it is
   a data-quality tripwire first, the same shape as RATES_TAX_YEAR. */

const LOCAL_SCHEMES = {
  leeds: [
    {
      id: "leeds-hardship-fund",
      name: "Leeds Council Tax Hardship Fund",
      url: "https://www.leeds.gov.uk/council-tax",
      category: "local",
      verification: {
        status: "disputed",
        date: "2026-08-21",
        source: "https://www.leeds.gov.uk/council-tax",
        note: "Leeds' own Council Tax Support page does not mention this fund, which is where it would most obviously sit. Every billing authority holds the s13A(1)(c) discretionary reduction power, so something may exist under another name — but the app's specific claim is unsupported by the page that would most obviously carry it."
      },
      evaluate(input) {
        if (input.monthlyIncome >= 1700) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          amount: { value: 100, period: "one-off" },
          reason: "Leeds residents already getting Council Tax Support who are struggling can apply to this discretionary top-up fund."
        };
      }
    },
    {
      id: "leeds-healthy-holidays",
      name: "Leeds Healthy Holidays (school holiday support)",
      url: "https://www.leeds.gov.uk/",
      category: "local",
      verification: {
        status: "verified",
        date: "2026-09-19",
        source: "https://moneyinformationcentre.leeds.gov.uk/healthy-holidays",
        note: "Leeds City Council's own page describes free activities with a hot meal for children eligible for income-related free school meals, at Easter, summer and Christmas, funded through the DfE Holiday Activities and Food programme. The page does not name a funding year, so the scheme running in 2026 is inferred from the page being current rather than stated on it."
      },
      evaluate(input) {
        if (input.children <= 0) return { eligible: false };
        if (!(input.receivingUC || input.monthlyIncome < 1600)) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          amount: { value: 0, period: "n/a", display: "Free holiday activities & food" },
          reason: "Free holiday clubs, activities and food during school holidays for children in low-income Leeds households."
        };
      }
    }
  ],
  birmingham: [
    {
      id: "birmingham-energy-savers",
      name: "Birmingham Energy Savers",
      url: "https://www.birmingham.gov.uk/",
      category: "local",
      verification: { status: "unchecked" },
      evaluate(input) {
        if (!(input.monthlyIncome < 2000)) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          amount: { value: 0, period: "n/a", display: "Free home energy advice & possible grants" },
          reason: "Free energy efficiency advice, and possible grants for insulation or heating improvements, for lower-income Birmingham households."
        };
      }
    },
    {
      id: "birmingham-free-leisure",
      name: "Birmingham free leisure access (under 18 / 60+)",
      url: "https://www.birmingham.gov.uk/",
      category: "local",
      verification: { status: "unchecked" },
      evaluate(input) {
        if (!(input.children > 0 || input.age >= 60)) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          amount: { value: 0, period: "n/a", display: "Free/discounted leisure centre access" },
          reason: "Free or discounted swimming and leisure centre access for under-18s and over-60s living in Birmingham."
        };
      }
    }
  ],
  manchester: [
    {
      id: "manchester-local-assistance",
      name: "Manchester Local Assistance Scheme",
      url: "https://www.manchester.gov.uk/",
      category: "local",
      verification: { status: "unchecked" },
      evaluate(input) {
        if (!(input.monthlyIncome < 1600 || input.hasDisabilityOrHealthCondition)) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          amount: { value: 0, period: "n/a", display: "Crisis support (furniture, food, essentials)" },
          reason: "In-kind crisis support for Manchester residents facing an emergency, such as white goods, furniture or food vouchers."
        };
      }
    }
  ],
  liverpool: [
    {
      id: "liverpool-citizens-support",
      name: "Liverpool Citizens Support Scheme",
      url: "https://liverpool.gov.uk/",
      category: "local",
      verification: { status: "unchecked" },
      evaluate(input) {
        if (!(input.monthlyIncome < 1600 || input.hasDisabilityOrHealthCondition || input.children > 0)) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          amount: { value: 0, period: "n/a", display: "Crisis grants & essential items" },
          reason: "Liverpool's local welfare scheme for residents facing a crisis, covering essential items, food and emergency costs."
        };
      }
    }
  ],
  sheffield: [
    {
      id: "sheffield-local-assistance",
      name: "Sheffield Local Assistance Scheme",
      url: "https://www.sheffield.gov.uk/",
      category: "local",
      verification: { status: "unchecked" },
      evaluate(input) {
        if (!(input.monthlyIncome < 1600 || input.hasDisabilityOrHealthCondition)) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          amount: { value: 0, period: "n/a", display: "Crisis support (goods & vouchers)" },
          reason: "Short-term crisis support for Sheffield residents, such as food vouchers or essential household items."
        };
      }
    }
  ],
  bristol: [
    {
      id: "bristol-council-tax-hardship",
      name: "Bristol Council Tax Hardship Fund",
      url: "https://www.bristol.gov.uk/",
      category: "local",
      verification: { status: "unchecked" },
      evaluate(input) {
        if (input.monthlyIncome >= 1700) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          amount: { value: 100, period: "one-off" },
          reason: "Bristol residents already getting Council Tax Support who are struggling can apply to this discretionary top-up fund."
        };
      }
    }
  ],
  newcastle: [
    {
      id: "newcastle-compassionate-fund",
      name: "Newcastle Compassionate Fund",
      url: "https://www.newcastle.gov.uk/",
      category: "local",
      verification: { status: "unchecked" },
      evaluate(input) {
        if (!(input.monthlyIncome < 1600 || input.hasDisabilityOrHealthCondition || input.children > 0)) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          amount: { value: 0, period: "n/a", display: "Emergency grants (food, energy, essentials)" },
          reason: "Newcastle's discretionary hardship fund for residents facing an unexpected financial crisis."
        };
      }
    }
  ],
  nottingham: [
    {
      id: "nottingham-local-welfare",
      name: "Nottingham Local Welfare Assistance",
      url: "https://www.nottinghamcity.gov.uk/",
      category: "local",
      verification: { status: "unchecked" },
      evaluate(input) {
        if (!(input.monthlyIncome < 1600 || input.hasDisabilityOrHealthCondition)) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          amount: { value: 0, period: "n/a", display: "Crisis support (goods & vouchers)" },
          reason: "Emergency support for Nottingham residents without enough money to meet short-term needs."
        };
      }
    }
  ],
  westminster: [
    {
      id: "westminster-emergency-support",
      name: "Westminster Emergency Support Scheme",
      url: "https://www.westminster.gov.uk/",
      category: "local",
      verification: { status: "unchecked" },
      evaluate(input) {
        if (!(input.monthlyIncome < 1700 || input.hasDisabilityOrHealthCondition || input.children > 0)) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          amount: { value: 0, period: "n/a", display: "Emergency grants & essential items" },
          reason: "Westminster's local welfare scheme for residents in a financial emergency, covering essentials and crisis costs."
        };
      }
    }
  ],
  hackney: [
    {
      id: "hackney-local-welfare",
      name: "Hackney Local Welfare Assistance",
      url: "https://hackney.gov.uk/",
      category: "local",
      verification: { status: "unchecked" },
      evaluate(input) {
        if (!(input.monthlyIncome < 1700 || input.hasDisabilityOrHealthCondition)) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          amount: { value: 0, period: "n/a", display: "Crisis support (food, energy, essentials)" },
          reason: "Hackney's discretionary scheme for residents facing hardship or an unexpected crisis."
        };
      }
    }
  ],
  camden: [
    {
      id: "camden-resident-support",
      name: "Camden Resident Support Scheme",
      url: "https://www.camden.gov.uk/",
      category: "local",
      verification: { status: "unchecked" },
      evaluate(input) {
        if (!(input.monthlyIncome < 1700 || input.hasDisabilityOrHealthCondition || input.children > 0)) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          amount: { value: 0, period: "n/a", display: "Crisis grants & essential items" },
          reason: "Camden's own hardship scheme, on top of national benefits, for residents struggling to cover essential costs."
        };
      }
    }
  ],
  "tower-hamlets": [
    {
      id: "tower-hamlets-resident-support",
      name: "Tower Hamlets Resident Support Scheme",
      url: "https://www.towerhamlets.gov.uk/",
      category: "local",
      verification: { status: "unchecked" },
      evaluate(input) {
        if (!(input.monthlyIncome < 1700 || input.hasDisabilityOrHealthCondition || input.children > 0)) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          amount: { value: 0, period: "n/a", display: "Crisis grants & essential items" },
          reason: "Tower Hamlets' local welfare scheme for residents facing a financial crisis or unexpected hardship."
        };
      }
    }
  ],
  other: []
};

/* ---------- SCHEMES EVERY ENGLISH COUNCIL RUNS ---------- */

/* LOCAL_SCHEMES is keyed by council, so it can only ever say something about
   the 12 councils researched by hand. These two are different: the Crisis and
   Resilience Fund is a funded national programme every English authority
   receives an allocation from, so "your council runs one" is a fact about the
   funding settlement rather than an assumption about an individual council.
   That is why these can cover all of England while the entries above cannot —
   and it is the whole reason the factories that used to live here were wrong.
   A factory guesses that a council runs something; this knows it does.

   Both carry no amount. Crisis Payment amounts are set locally and Housing
   Payment awards are discretionary, so any figure would be invented. They are
   category "local" so they render in the council section without amounts and
   stay out of every total — verify-edgecases.cjs and verify-ui.js fail if
   that stops being true. */
const COUNCIL_WIDE_SCHEMES = [
  {
    id: "crf-housing-payment",
    name: "Crisis and Resilience Fund Housing Payment",
    url: "https://www.gov.uk/find-local-council",
    category: "local",
    verification: {
      status: "verified",
      date: "2026-09-19",
      source: CRF_GUIDANCE_URL,
      note: "Eligibility quoted from the CRF guidance: payments \"can be made to claimants who are entitled to either: HB (Housing Benefit) [or] UC (Universal Credit) with housing costs towards rental liability\". Unlike everything else in the council section, this rule is set nationally, so it is the same in every English council."
    },
    evaluate(input) {
      if (!isEnglishCouncil(input)) return { eligible: false };
      /* The national rule is entitlement to Housing Benefit, OR to Universal
         Credit including housing costs towards RENTAL liability. Two known
         gaps, both deliberate and both stated on the card rather than hidden:

         - The app does not ask about Housing Benefit, so legacy HB claimants
           who are not on UC are missed. Under-inclusive.
         - The app asks for "Rent or mortgage" as one figure, so a UC claimant
           paying a mortgage passes this gate but cannot qualify — a mortgage
           is not a rental liability, and UC helps with it through Support for
           Mortgage Interest loans instead. Over-inclusive.

         The previous rule here was `receivingUC || monthlyIncome < 1500`,
         where the income half was invented outright. This is narrower and
         sourced, and the note tells the reader the condition to check. */
      if (!(input.receivingUC && input.housingCosts > 0)) return { eligible: false };
      return {
        eligible: true,
        confidence: "possible",
        reason: "If your Universal Credit includes housing costs for rent and it doesn't cover all of it, your council can pay towards the shortfall. This replaced Discretionary Housing Payments on 1 April 2026.",
        note: "This one is only for rent — if what you pay is a mortgage, it won't apply. It is discretionary, so your council decides the amount and how long it runs for. If you get Housing Benefit rather than Universal Credit you can apply too; we didn't ask about that."
      };
    }
  },
  {
    id: "crf-crisis-payment",
    name: "Crisis and Resilience Fund Crisis Payment",
    url: "https://www.gov.uk/find-local-council",
    category: "local",
    verification: {
      status: "verified",
      date: "2026-09-19",
      source: CRF_GUIDANCE_URL,
      note: "The guidance leaves eligibility to each authority: \"Authorities have flexibility within The Fund to apply their own discretion when determining eligibility for their Crisis Payment schemes, including what constitutes a low-income in their area.\" So there is no national criterion to test against, and this entry signposts rather than assessing."
    },
    evaluate(input) {
      if (!isEnglishCouncil(input)) return { eligible: false };
      /* No criteria, deliberately. Every criterion is set locally, so any
         income or savings line here would be invented — the same mistake the
         old Household Support Fund factory made with its £1,800 threshold.
         Shown to everyone instead, with copy that describes the scheme rather
         than making a claim about the reader. */
      return {
        eligible: true,
        confidence: "possible",
        reason: "Every council in England runs a Crisis Payment scheme for people hit by a sudden financial shock — help with food, energy, other essentials, or replacing something you can't manage without. It replaced the Household Support Fund on 1 April 2026.",
        note: "Each council sets its own rules for this, including what counts as a low income in their area, so we can't tell you whether you'd qualify. Outside the cities and London boroughs it is usually run by the county council rather than the council that sends your council tax bill."
      };
    }
  }
];

/* Exported for the Node test suite; ignored in the browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NATIONAL_SCHEMES, LOCAL_SCHEMES, gbp, RATES_TAX_YEAR,
    ukTaxYearOf, ratesStaleness,
    weeklyIncome, annualIncome, isOverPensionAge,
    COUNCIL_WIDE_SCHEMES, isEnglishCouncil,
    CRF_GUIDANCE_URL, CRF_DISTRICT_HOUSING_EXIT, crfDistrictHousingExitPassed,
    WORKING_AGE_CTS_CAPITAL_SIGNPOST_LIMIT };
}
