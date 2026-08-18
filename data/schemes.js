/* The schemes and their eligibility rules.

   This is the main file to edit when adding or adjusting a scheme: add an
   object to NATIONAL_SCHEMES (or to a council's array in LOCAL_SCHEMES) with
   an evaluate(input) function. No other file needs to change.

   evaluate(input) returns either { eligible: false } or
   { eligible: true, confidence, amount, reason, note? }.

   Figures are illustrative approximations of 2024/25 rates. The national
   rules were checked against the governing regulations (cited inline where
   they are easy to get wrong); local council figures are placeholders. */

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
        ? (input.age < 25 ? 489.23 : 617.60)
        : (input.age < 25 ? 311.68 : 393.45);
      const childElement = input.children * 269.58;
      const housingElement = input.housingCosts || 0;
      const maxAward = standardAllowance + childElement + housingElement;

      // Reg 22, UC Regs 2013: a work allowance exists ONLY where the claimant
      // (or partner) is responsible for a child, or has limited capability for
      // work. In any other case it is nil and every pound of earnings tapers.
      const qualifiesForWorkAllowance = input.children > 0 || input.limitedCapabilityForWork;
      const workAllowance = qualifiesForWorkAllowance
        ? (input.housingCosts > 0 ? 404 : 673)
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
        reason += " Because you don't have children or a limited capability for work, there's no earnings disregard — every pound you earn reduces the award by 55p.";
      }
      if (tariffIncome > 0) {
        reason += ` Your savings above £6,000 are treated as producing about ${gbp(tariffIncome)}/month of income, which reduces the award.`;
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
    name: "Pension Credit",
    url: "https://www.gov.uk/pension-credit",
    category: "national",
    evaluate(input) {
      if (!isOverPensionAge(input)) return { eligible: false };
      const threshold = input.adults >= 2 ? 332.95 : 218.15;
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
        reason += ` Your savings above £10,000 are treated as producing about £${deemedWeekly}/week of income, which reduces the top-up.`;
      }
      return {
        eligible: true,
        confidence: "likely",
        amount: { value: (topUp * 52) / 12, period: "month" },
        reason,
        note: "Pension Credit also unlocks Warm Home Discount and other help automatically — it's worth checking even if the top-up looks small."
      };
    }
  },
  {
    id: "child-benefit",
    name: "Child Benefit",
    url: "https://www.gov.uk/child-benefit",
    category: "national",
    evaluate(input) {
      if (input.children <= 0) return { eligible: false };
      const weekly = 25.60 + Math.max(0, input.children - 1) * 16.95;
      const fullMonthly = (weekly * 52) / 12;

      // The High Income Child Benefit Charge is assessed on the HIGHEST
      // INDIVIDUAL adjusted net income, never on the household total. For a
      // single-adult household that's just their income; for a couple the user
      // tells us the higher earner's figure separately.
      const highestIndividualMonthly = input.adults >= 2
        ? (input.highestIndividualIncome != null ? input.highestIndividualIncome : input.monthlyIncome)
        : input.monthlyIncome;
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
          reason += " The highest earner in your household looks to be above £80,000/year, so the High Income Child Benefit Charge would claw all of it back. It is still usually worth claiming at a nil rate, because that protects your National Insurance credits towards the State Pension.";
        } else {
          reason += ` The highest earner in your household looks to be above £60,000/year, so roughly ${Math.round(clawbackFraction * 100)}% would be clawed back via the High Income Child Benefit Charge. The charge is based on that one person's income, not your household total.`;
        }
      } else if (input.adults >= 2) {
        reason += " The High Income Child Benefit Charge is based on the highest single income in your household, not the combined total — so two people earning under £60,000 each are not affected.";
      }

      return {
        eligible: true,
        confidence,
        amount: value > 0.5
          ? { value, period: "month" }
          : { value: 0, period: "n/a", display: "Worth claiming at nil rate (protects NI credits)" },
        reason
      };
    }
  },
  {
    id: "healthy-start",
    name: "Healthy Start",
    url: "https://www.healthystart.nhs.uk/",
    category: "national",
    evaluate(input) {
      if (!input.pregnantOrChildUnder4) return { eligible: false };
      const lowIncome = input.receivingUC || input.monthlyIncome < 1600;
      if (!lowIncome) return { eligible: false };
      return {
        eligible: true,
        confidence: input.receivingUC ? "likely" : "possible",
        amount: { value: (4.25 * 52) / 12, period: "month" },
        reason: "Being pregnant or having a child under 4 on a low income, or while on Universal Credit, typically qualifies for a Healthy Start prepaid card for food and milk."
      };
    }
  },
  {
    id: "warm-home-discount",
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
    name: "Council Tax Support (Reduction)",
    url: "https://www.gov.uk/apply-council-tax-reduction",
    category: "national",
    evaluate(input) {
      if (input.savings > 16000 && !isOverPensionAge(input)) return { eligible: false };
      const thresholdPerAdult = 1450;
      const householdThreshold = thresholdPerAdult * input.adults + input.children * 350;
      if (input.monthlyIncome >= householdThreshold) return { eligible: false };
      const shortfallRatio = 1 - (input.monthlyIncome / householdThreshold);
      const estimatedMonthlyReduction = Math.max(15, Math.min(180, shortfallRatio * 180));
      return {
        eligible: true,
        confidence: shortfallRatio > 0.4 ? "likely" : "possible",
        amount: { value: estimatedMonthlyReduction, period: "month" },
        reason: "Your council tax bill can usually be reduced based on income — the exact amount depends on your council's local scheme rules.",
        note: "Administered by your local council, so the real amount will follow their specific scheme, not just this national estimate."
      };
    }
  }
];

/* ---------- LOCAL SCHEMES (pilot councils) ---------- */

/* Two scheme types exist in almost every English council in some form
   (Household Support Fund top-ups and Discretionary Housing Payments),
   so these factories keep new councils to a few lines each rather than
   repeating near-identical logic. */
function makeHouseholdSupportFund(councilId, label, url, incomeThreshold, amount) {
  return {
    id: councilId + "-household-support",
    name: label + " Household Support Fund grant",
    url,
    category: "local",
    lastVerified: "example data — verify with council",
    evaluate(input) {
      if (!(input.monthlyIncome < incomeThreshold || input.hasDisabilityOrHealthCondition || input.children > 0)) {
        return { eligible: false };
      }
      return {
        eligible: true,
        confidence: "possible",
        amount: { value: amount, period: "one-off" },
        reason: label + " residents on a low income, with children, or with a disability can apply for one-off crisis grants (food, energy, essentials)."
      };
    }
  };
}

function makeDiscretionaryHousingPayment(councilId, label, url) {
  return {
    id: councilId + "-dhp",
    name: label + " Discretionary Housing Payment",
    url,
    category: "local",
    lastVerified: "example data — verify with council",
    evaluate(input) {
      if (!(input.housingCosts > 0)) return { eligible: false };
      if (!(input.receivingUC || input.monthlyIncome < 1500)) return { eligible: false };
      return {
        eligible: true,
        confidence: "possible",
        amount: { value: 80, period: "month" },
        reason: "If Universal Credit or Housing Benefit doesn't fully cover your rent, " + label + " can top up housing costs on a discretionary basis."
      };
    }
  };
}

const LOCAL_SCHEMES = {
  leeds: [
    {
      id: "leeds-hardship-fund",
      name: "Leeds Council Tax Hardship Fund",
      url: "https://www.leeds.gov.uk/council-tax",
      category: "local",
      lastVerified: "example data — verify with council",
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
      id: "leeds-dhp",
      name: "Leeds Discretionary Housing Payment",
      url: "https://www.leeds.gov.uk/benefits/discretionary-housing-payments",
      category: "local",
      lastVerified: "example data — verify with council",
      evaluate(input) {
        if (!(input.housingCosts > 0)) return { eligible: false };
        if (!(input.receivingUC || input.monthlyIncome < 1500)) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          amount: { value: 80, period: "month" },
          reason: "If Universal Credit or Housing Benefit doesn't fully cover your rent, Leeds can top up housing costs on a discretionary basis."
        };
      }
    },
    {
      id: "leeds-healthy-holidays",
      name: "Leeds Healthy Holidays (school holiday support)",
      url: "https://www.leeds.gov.uk/",
      category: "local",
      lastVerified: "example data — verify with council",
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
      id: "birmingham-household-support",
      name: "Birmingham Household Support Fund grant",
      url: "https://www.birmingham.gov.uk/homepage/28/household_support_fund",
      category: "local",
      lastVerified: "example data — verify with council",
      evaluate(input) {
        if (!(input.monthlyIncome < 1800 || input.hasDisabilityOrHealthCondition || input.children > 0)) return { eligible: false };
        return {
          eligible: true,
          confidence: "possible",
          amount: { value: 100, period: "one-off" },
          reason: "Birmingham residents on a low income, with children, or with a disability can apply for one-off crisis grants (food, energy, essentials)."
        };
      }
    },
    {
      id: "birmingham-energy-savers",
      name: "Birmingham Energy Savers",
      url: "https://www.birmingham.gov.uk/",
      category: "local",
      lastVerified: "example data — verify with council",
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
      lastVerified: "example data — verify with council",
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
    makeHouseholdSupportFund("manchester", "Manchester", "https://www.manchester.gov.uk/", 1800, 100),
    makeDiscretionaryHousingPayment("manchester", "Manchester", "https://www.manchester.gov.uk/"),
    {
      id: "manchester-local-assistance",
      name: "Manchester Local Assistance Scheme",
      url: "https://www.manchester.gov.uk/",
      category: "local",
      lastVerified: "example data — verify with council",
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
    makeHouseholdSupportFund("liverpool", "Liverpool", "https://liverpool.gov.uk/", 1800, 100),
    makeDiscretionaryHousingPayment("liverpool", "Liverpool", "https://liverpool.gov.uk/"),
    {
      id: "liverpool-citizens-support",
      name: "Liverpool Citizens Support Scheme",
      url: "https://liverpool.gov.uk/",
      category: "local",
      lastVerified: "example data — verify with council",
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
    makeHouseholdSupportFund("sheffield", "Sheffield", "https://www.sheffield.gov.uk/", 1800, 100),
    makeDiscretionaryHousingPayment("sheffield", "Sheffield", "https://www.sheffield.gov.uk/"),
    {
      id: "sheffield-local-assistance",
      name: "Sheffield Local Assistance Scheme",
      url: "https://www.sheffield.gov.uk/",
      category: "local",
      lastVerified: "example data — verify with council",
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
    makeHouseholdSupportFund("bristol", "Bristol", "https://www.bristol.gov.uk/", 1800, 100),
    makeDiscretionaryHousingPayment("bristol", "Bristol", "https://www.bristol.gov.uk/"),
    {
      id: "bristol-council-tax-hardship",
      name: "Bristol Council Tax Hardship Fund",
      url: "https://www.bristol.gov.uk/",
      category: "local",
      lastVerified: "example data — verify with council",
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
    makeHouseholdSupportFund("newcastle", "Newcastle", "https://www.newcastle.gov.uk/", 1800, 100),
    makeDiscretionaryHousingPayment("newcastle", "Newcastle", "https://www.newcastle.gov.uk/"),
    {
      id: "newcastle-compassionate-fund",
      name: "Newcastle Compassionate Fund",
      url: "https://www.newcastle.gov.uk/",
      category: "local",
      lastVerified: "example data — verify with council",
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
    makeHouseholdSupportFund("nottingham", "Nottingham", "https://www.nottinghamcity.gov.uk/", 1800, 100),
    makeDiscretionaryHousingPayment("nottingham", "Nottingham", "https://www.nottinghamcity.gov.uk/"),
    {
      id: "nottingham-local-welfare",
      name: "Nottingham Local Welfare Assistance",
      url: "https://www.nottinghamcity.gov.uk/",
      category: "local",
      lastVerified: "example data — verify with council",
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
    makeHouseholdSupportFund("westminster", "Westminster", "https://www.westminster.gov.uk/", 1900, 120),
    makeDiscretionaryHousingPayment("westminster", "Westminster", "https://www.westminster.gov.uk/"),
    {
      id: "westminster-emergency-support",
      name: "Westminster Emergency Support Scheme",
      url: "https://www.westminster.gov.uk/",
      category: "local",
      lastVerified: "example data — verify with council",
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
    makeHouseholdSupportFund("hackney", "Hackney", "https://hackney.gov.uk/", 1900, 120),
    makeDiscretionaryHousingPayment("hackney", "Hackney", "https://hackney.gov.uk/"),
    {
      id: "hackney-local-welfare",
      name: "Hackney Local Welfare Assistance",
      url: "https://hackney.gov.uk/",
      category: "local",
      lastVerified: "example data — verify with council",
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
    makeHouseholdSupportFund("camden", "Camden", "https://www.camden.gov.uk/", 1900, 120),
    makeDiscretionaryHousingPayment("camden", "Camden", "https://www.camden.gov.uk/"),
    {
      id: "camden-resident-support",
      name: "Camden Resident Support Scheme",
      url: "https://www.camden.gov.uk/",
      category: "local",
      lastVerified: "example data — verify with council",
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
    makeHouseholdSupportFund("tower-hamlets", "Tower Hamlets", "https://www.towerhamlets.gov.uk/", 1900, 120),
    makeDiscretionaryHousingPayment("tower-hamlets", "Tower Hamlets", "https://www.towerhamlets.gov.uk/"),
    {
      id: "tower-hamlets-resident-support",
      name: "Tower Hamlets Resident Support Scheme",
      url: "https://www.towerhamlets.gov.uk/",
      category: "local",
      lastVerified: "example data — verify with council",
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

/* Exported for the Node test suite; ignored in the browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NATIONAL_SCHEMES, LOCAL_SCHEMES, gbp,
    weeklyIncome, annualIncome, isOverPensionAge,
    makeHouseholdSupportFund, makeDiscretionaryHousingPayment };
}
