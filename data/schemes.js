/**
 * Sample set of well-known UK government benefits and schemes.
 *
 * This is a STARTER rule set for the Benefit Finder MVP. Thresholds and
 * criteria are simplified approximations of real published rules and
 * should be reviewed/updated periodically against gov.uk. This is not
 * financial or legal advice.
 *
 * Each scheme has:
 *  - id, name, category, description, link
 *  - eligible(answers): boolean — returns true if the household likely qualifies
 *  - answers shape (from the form):
 *      nation: 'england' | 'scotland' | 'wales' | 'northern-ireland'
 *      age: number
 *      income: number (annual household income, £)
 *      employment: 'employed' | 'self-employed' | 'unemployed' | 'retired' | 'student' | 'unable-to-work'
 *      children: number
 *      housing: 'renting-private' | 'renting-social' | 'own-mortgage' | 'own-outright' | 'living-with-family'
 *      disability: boolean
 *      pregnantOrUnder4: boolean
 *      carer: boolean
 */

const STATE_PENSION_AGE = 66;

const SCHEMES = [
  {
    id: "universal-credit",
    name: "Universal Credit",
    category: "Income support",
    description:
      "Monthly payment to help with living costs if you're on a low income, out of work, or unable to work. Available UK-wide (Northern Ireland runs its own equivalent scheme).",
    link: "https://www.gov.uk/universal-credit",
    eligible: (a) =>
      a.age >= 18 &&
      a.age < STATE_PENSION_AGE &&
      a.income < 24000 &&
      a.employment !== "retired",
  },
  {
    id: "pension-credit",
    name: "Pension Credit",
    category: "Income support",
    description:
      "Extra money for pensioners on a low income — can also unlock other help like Housing Benefit, Council Tax Reduction, and free TV licences for over-75s.",
    link: "https://www.gov.uk/pension-credit",
    eligible: (a) => a.age >= STATE_PENSION_AGE && a.income < 13500,
  },
  {
    id: "council-tax-reduction",
    name: "Council Tax Reduction (Council Tax Support)",
    category: "Housing & bills",
    description:
      "Reduces your council tax bill if you're on a low income, whether you're working, unemployed, or retired. Applied for through your local council.",
    link: "https://www.gov.uk/apply-council-tax-reduction",
    eligible: (a) => a.income < 22000,
  },
  {
    id: "housing-benefit",
    name: "Housing Benefit",
    category: "Housing & bills",
    description:
      "Help with rent for people on a low income who have reached State Pension age, or who live in supported/temporary housing. (Working-age renters are usually directed to Universal Credit instead.)",
    link: "https://www.gov.uk/housing-benefit",
    eligible: (a) =>
      (a.housing === "renting-private" || a.housing === "renting-social") &&
      a.age >= STATE_PENSION_AGE &&
      a.income < 20000,
  },
  {
    id: "child-benefit",
    name: "Child Benefit",
    category: "Family",
    description:
      "Regular payment for anyone responsible for raising a child under 16 (or under 20 in approved education/training). Paid regardless of income, though a tax charge applies above £60,000.",
    link: "https://www.gov.uk/child-benefit",
    eligible: (a) => a.children > 0,
  },
  {
    id: "free-school-meals",
    name: "Free School Meals",
    category: "Family",
    description:
      "Free meals for school-age children if your household is on a low income and receiving a qualifying benefit (e.g. Universal Credit with income below the threshold).",
    link: "https://www.gov.uk/apply-free-school-meals",
    eligible: (a) => a.children > 0 && a.income < 7400,
  },
  {
    id: "healthy-start",
    name: "Healthy Start",
    category: "Family",
    description:
      "Weekly payments (via a prepaid card) to help buy fruit, vegetables, milk, and vitamins if you're pregnant or have a child under 4, on a low income.",
    link: "https://www.healthystart.nhs.uk/",
    eligible: (a) => a.pregnantOrUnder4 && a.income < 16000,
  },
  {
    id: "sure-start-maternity-grant",
    name: "Sure Start Maternity Grant",
    category: "Family",
    description:
      "One-off £500 payment to help with costs for your first child (or if you're expecting a multiple birth), if you're on a qualifying low income.",
    link: "https://www.gov.uk/sure-start-maternity-grant",
    eligible: (a) => a.pregnantOrUnder4 && a.income < 18000 && a.children <= 1,
  },
  {
    id: "warm-home-discount",
    name: "Warm Home Discount",
    category: "Housing & bills",
    description:
      "One-off discount off your winter electricity bill for pensioners and low-income households, especially those with children, disabilities, or long-term health conditions.",
    link: "https://www.gov.uk/the-warm-home-discount-scheme",
    eligible: (a) =>
      a.income < 22000 && (a.age >= STATE_PENSION_AGE || a.disability || a.children > 0),
  },
  {
    id: "pip",
    name: "Personal Independence Payment (PIP)",
    category: "Disability",
    description:
      "Payment to help with extra costs if you have a long-term physical or mental health condition or disability that affects your daily life. Not means-tested — based on need, not income.",
    link: "https://www.gov.uk/pip",
    eligible: (a) => a.disability && a.age >= 16 && a.age < STATE_PENSION_AGE,
  },
  {
    id: "carers-allowance",
    name: "Carer's Allowance",
    category: "Caring",
    description:
      "Payment for people who spend at least 35 hours a week caring for someone with substantial care needs.",
    link: "https://www.gov.uk/carers-allowance",
    eligible: (a) => a.carer && a.income < 32000,
  },
  {
    id: "jobseekers-allowance",
    name: "New Style Jobseeker's Allowance",
    category: "Income support",
    description:
      "Fortnightly payment while you look for work, based on your National Insurance record rather than household income. Can be claimed alongside Universal Credit.",
    link: "https://www.gov.uk/jobseekers-allowance",
    eligible: (a) => a.employment === "unemployed" && a.age >= 18 && a.age < STATE_PENSION_AGE,
  },
];

// Support both browser <script> usage and CommonJS (for future testing).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { SCHEMES, STATE_PENSION_AGE };
}
