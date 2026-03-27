let enabled = false;
let currentPopup = null;
let requestId = 0;
let dismissTimeout = 8000;
let fetchTimeout = 5000;

chrome.storage.sync.get(["enabled", "dismissTimeout", "fetchTimeout"], (data) => {
  enabled = data.enabled || false;
  if (data.dismissTimeout) dismissTimeout = data.dismissTimeout;
  if (data.fetchTimeout) fetchTimeout = data.fetchTimeout;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    if (changes.enabled) enabled = changes.enabled.newValue;
    if (changes.dismissTimeout) dismissTimeout = changes.dismissTimeout.newValue;
    if (changes.fetchTimeout) fetchTimeout = changes.fetchTimeout.newValue;
  }
});

const japaneseRegex = /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uF900-\uFAFF]/;

// --- OJAD pitch accent parsing ---

function parseOJAD(htmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");
  const results = {};
  let activeWord = null;
  let activeHeader = [];

  doc.querySelectorAll("#search_result tr").forEach((row) => {
    if (!row.id) {
      activeHeader = [];
      row.querySelectorAll("th:not(.visible)").forEach((th) => {
        const text = th.textContent.trim();
        if (text) activeHeader.push(text);
      });
      return;
    }

    row.querySelectorAll("td:not(.visible)").forEach((td) => {
      const text = td.textContent.trim();
      if (td.classList.contains("midashi")) {
        let word = text;
        const idx = word.search(/\[|・/);
        if (idx !== -1) word = word.substring(0, idx);
        if (word.length > 2 && word.endsWith("する")) {
          word = word.substring(0, word.length - 2);
        }
        if (!results[word]) results[word] = [];
        results[word].push((activeWord = { header: activeHeader, data: [] }));
      } else {
        const accentedWords = [];
        td.querySelectorAll(".accented_word").forEach((aw) => {
          const chars = [];
          aw.querySelectorAll(".inner").forEach((inner) => {
            const parentClass = inner.parentElement.className.trim().split(/\s+/)[0];
            const type =
              parentClass === "accent_top" || parentClass === "accent_plain"
                ? parentClass
                : "";
            chars.push({ type, char: inner.textContent });
          });
          accentedWords.push(chars);
        });
        if (activeWord) activeWord.data.push(accentedWords);
      }
    });
  });

  return results;
}

// --- Popup rendering ---

function buildReadingElem(reading, pitchData, word) {
  const container = document.createElement("div");
  container.className = "kh-reading";

  const label = document.createElement("span");
  label.className = "kh-reading-label";
  label.textContent = "Reading:";
  container.appendChild(label);

  const entries = pitchData && (pitchData[word] || pitchData[reading]);
  const chars = entries && entries[0] && entries[0].data[0] && entries[0].data[0][0];

  if (!chars || !chars.length) {
    container.appendChild(document.createTextNode(reading));
    return container;
  }

  const hasDropAnywhere = chars.some((c) => c.type === "accent_top");

  chars.forEach(({ type, char }, i) => {
    const isHigh = type === "accent_plain" || type === "accent_top";
    const isDropAfter = type === "accent_top";
    const nextIsHigh =
      i + 1 < chars.length &&
      (chars[i + 1].type === "accent_plain" || chars[i + 1].type === "accent_top");
    const isStepUp = !isHigh && nextIsHigh && hasDropAnywhere;

    const span = document.createElement("span");
    span.textContent = char;
    if (isHigh) span.classList.add("kh-pitch-high");
    else if (hasDropAnywhere) span.classList.add("kh-pitch-low");
    if (isDropAfter || isStepUp) span.classList.add("kh-pitch-step");
    container.appendChild(span);
  });

  return container;
}

function buildMeaningsElem(senses) {
  const container = document.createElement("div");
  container.className = "kh-meanings";

  const maxSenses = Math.min(senses.length, 3);
  for (let i = 0; i < maxSenses; i++) {
    const sense = senses[i];
    const div = document.createElement("div");
    div.className = "kh-sense";

    if (sense.parts_of_speech && sense.parts_of_speech.length) {
      const pos = document.createElement("span");
      pos.className = "kh-pos";
      pos.textContent = sense.parts_of_speech.join(", ");
      div.appendChild(pos);
    }

    div.appendChild(document.createTextNode(sense.english_definitions.join(", ")));
    container.appendChild(div);
  }

  return container;
}

function createPopup(x, y) {
  const popup = document.createElement("div");
  popup.className = "kh-popup";
  popup.style.top = `${y + 5}px`;
  popup.style.left = `${x + 5}px`;
  popup.setAttribute("role", "tooltip");
  return popup;
}

function addCloseBtn(popup) {
  const closeBtn = document.createElement("button");
  closeBtn.className = "kh-close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    dismissPopup(popup);
  });
  popup.prepend(closeBtn);
}

function clampPopup(popup) {
  const rect = popup.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    popup.style.left = `${Math.max(0, window.innerWidth - rect.width - 10 + window.scrollX)}px`;
  }
  if (rect.bottom > window.innerHeight) {
    popup.style.top = `${Math.max(0, window.innerHeight - rect.height - 10 + window.scrollY)}px`;
  }
}

let justDismissed = false;

function dismissPopup(popup) {
  popup.remove();
  if (currentPopup === popup) currentPopup = null;
  justDismissed = true;
}

// --- Keyboard handler ---

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && currentPopup) {
    dismissPopup(currentPopup);
  }
});

// --- Click-outside dismiss ---

document.addEventListener("mousedown", (event) => {
  if (currentPopup && !currentPopup.contains(event.target)) {
    dismissPopup(currentPopup);
  }
});

// --- Main event listener ---

document.addEventListener("mouseup", (event) => {
  if (!enabled) return;

  if (justDismissed) {
    justDismissed = false;
    return;
  }

  const selection = window.getSelection().toString().trim();
  if (!selection || !japaneseRegex.test(selection)) return;

  const thisRequest = ++requestId;
  const popup = createPopup(event.pageX, event.pageY);

  const spinner = document.createElement("div");
  spinner.className = "kh-spinner";
  popup.appendChild(spinner);
  document.body.appendChild(popup);
  currentPopup = popup;

  chrome.runtime.sendMessage(
    { action: "fetchData", selection, fetchTimeout },
    (response) => {
      if (thisRequest !== requestId || currentPopup !== popup) return;
      popup.removeChild(spinner);
      addCloseBtn(popup);

      if (!response || response.error) {
        const errMsg = document.createElement("div");
        errMsg.className = "kh-error";
        errMsg.textContent = response?.error === "timeout"
          ? "Request timed out. Try again."
          : "Lookup failed. Check your connection.";
        popup.appendChild(errMsg);
        setTimeout(() => dismissPopup(popup), 3000);
        return;
      }

      if (!response.data?.data?.length) {
        popup.appendChild(document.createTextNode("No results found."));
        setTimeout(() => dismissPopup(popup), 3000);
        return;
      }

      const entry = response.data.data[0];
      const word = entry.japanese[0].word || selection;
      const reading = entry.japanese[0].reading || "";
      const pitchData = response.ojadHtml ? parseOJAD(response.ojadHtml) : null;

      const wordElem = document.createElement("div");
      wordElem.className = "kh-word";
      wordElem.textContent = word;

      popup.appendChild(wordElem);
      popup.appendChild(buildReadingElem(reading, pitchData, word));
      popup.appendChild(buildMeaningsElem(entry.senses));

      clampPopup(popup);
      setTimeout(() => dismissPopup(popup), dismissTimeout);
    }
  );
});
