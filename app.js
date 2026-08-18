(function () {
  "use strict";

  const form = document.getElementById("eligibility-form");
  const resultsSection = document.getElementById("results");
  const resultsList = document.getElementById("results-list");
  const noResults = document.getElementById("no-results");

  function readAnswers(formEl) {
    const data = new FormData(formEl);
    return {
      nation: data.get("nation"),
      age: Number(data.get("age")),
      income: Number(data.get("income")),
      employment: data.get("employment"),
      children: Number(data.get("children")),
      housing: data.get("housing"),
      disability: formEl.querySelector("#disability").checked,
      pregnantOrUnder4: formEl.querySelector("#pregnant-or-under4").checked,
      carer: formEl.querySelector("#carer").checked,
    };
  }

  function renderResults(matches) {
    resultsList.innerHTML = "";

    if (matches.length === 0) {
      noResults.hidden = false;
      return;
    }

    noResults.hidden = true;

    matches.forEach((scheme) => {
      const card = document.createElement("article");
      card.className = "scheme-card";
      card.innerHTML = `
        <span class="category">${scheme.category}</span>
        <h3>${scheme.name}</h3>
        <p>${scheme.description}</p>
        <a class="apply-link" href="${scheme.link}" target="_blank" rel="noopener">
          Check &amp; apply on gov.uk &rarr;
        </a>
      `;
      resultsList.appendChild(card);
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    const answers = readAnswers(form);
    const matches = SCHEMES.filter((scheme) => {
      try {
        return scheme.eligible(answers);
      } catch (err) {
        console.error(`Error evaluating scheme "${scheme.id}"`, err);
        return false;
      }
    });

    renderResults(matches);
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
