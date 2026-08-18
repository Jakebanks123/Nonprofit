# Benefit Finder

Helping people make government work for them.

Benefit Finder is a simple web app where someone enters basic details about their household —
income, age, location, employment, family situation — and gets back a list of UK government
benefits and schemes they may be entitled to, with a direct link to check and apply on gov.uk.

## Status

Early MVP. Currently covers a starter set of well-known **UK-wide** benefits (see
[`data/schemes.js`](data/schemes.js)). Local council-specific schemes are planned next.

## Running it locally

No build step or dependencies required — it's a static site.

1. Clone the repo.
2. Open `index.html` directly in a browser, **or** serve the folder locally, e.g.:
   ```bash
   python3 -m http.server 8000
   ```
   then visit `http://localhost:8000`.

## How it works

- `index.html` — the form and results layout.
- `style.css` — styling.
- `data/schemes.js` — the list of schemes and the eligibility rule for each one, as a plain
  JavaScript array. This is the main file to edit when adding or adjusting a scheme.
- `app.js` — reads the form, checks each scheme's `eligible()` rule against the answers, and
  renders the matches.

Adding a new scheme is just adding an object to the `SCHEMES` array in `data/schemes.js` with an
`eligible(answers)` function — no other code needs to change.

## Important note on accuracy

The eligibility rules in this project are simplified approximations for demo purposes and are
**not** a substitute for official guidance. Thresholds and criteria should be checked against
gov.uk and updated regularly. This project is not affiliated with HM Government.

## Roadmap

- [ ] Local council scheme data (starting with a few pilot councils)
- [ ] Postcode-based lookup for council area
- [ ] Save/share results
- [ ] Expand beyond England to nation-specific schemes (Scotland, Wales, NI have some differences)
- [ ] Basic automated tests for the eligibility rules
- [ ] Deploy via GitHub Pages

## Contributing

This is an early-stage personal project. Suggestions and scheme corrections are welcome via
issues or pull requests.
