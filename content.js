let enabled = false;
let spinnerStyleInjected = false;

chrome.storage.sync.get(["enabled"], (data) => {
  enabled = data.enabled || false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.enabled) {
    enabled = changes.enabled.newValue;
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
  container.style.cssText = "font-size:15px; color:#555; margin-bottom:5px;";

  const label = document.createElement("span");
  label.style.cssText = "color:#888; font-size:13px; margin-right:4px;";
  label.textContent = "Reading:";
  container.appendChild(label);

  const entries = pitchData && (pitchData[word] || pitchData[reading]);
  const chars =
    entries &&
    entries[0] &&
    entries[0].data[0] &&
    entries[0].data[0][0];

  if (!chars || !chars.length) {
    container.appendChild(document.createTextNode(reading));
    return container;
  }

  const color = "#555";
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
    if (isHigh) {
      span.style.borderTop = `2px solid ${color}`;
      span.style.paddingTop = "1px";
    } else if (hasDropAnywhere) {
      span.style.borderBottom = `2px solid ${color}`;
      span.style.paddingBottom = "1px";
    }
    if (isDropAfter || isStepUp) {
      span.style.borderRight = `2px solid ${color}`;
      span.style.paddingRight = "1px";
      span.style.marginRight = "1px";
    }
    container.appendChild(span);
  });

  return container;
}

function createPopup(x, y) {
  const popup = document.createElement("div");
  popup.style.cssText = `
    position: absolute;
    top: ${y + 5}px;
    left: ${x + 5}px;
    background: #f7f7f7;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 10px;
    max-width: 300px;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 14px;
    color: #333;
    line-height: 1.4;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    z-index: 10000;
  `;

  const closeBtn = document.createElement("span");
  closeBtn.textContent = "×";
  closeBtn.style.cssText =
    "position:absolute; top:5px; right:5px; cursor:pointer; font-size:16px; font-weight:bold; color:#aaa;";
  closeBtn.addEventListener("click", () => dismissPopup(popup));
  popup.appendChild(closeBtn);

  return popup;
}

function createSpinner() {
  if (!spinnerStyleInjected) {
    const style = document.createElement("style");
    style.innerHTML =
      "@keyframes kh-spin { 0% { transform:rotate(0deg) } 100% { transform:rotate(360deg) } }";
    document.head.appendChild(style);
    spinnerStyleInjected = true;
  }

  const spinner = document.createElement("div");
  spinner.style.cssText =
    "border:4px solid #f3f3f3; border-top:4px solid #3498db; border-radius:50%; width:24px; height:24px; animation:kh-spin 1s linear infinite; margin:0 auto;";
  return spinner;
}

let currentPopup = null;

function dismissPopup(popup) {
  popup.remove();
  if (currentPopup === popup) currentPopup = null;
}

// --- Main event listener ---

document.addEventListener("mouseup", (event) => {
  if (!enabled) return;

  const selection = window.getSelection().toString().trim();
  if (!selection || !japaneseRegex.test(selection)) return;

  if (currentPopup) dismissPopup(currentPopup);

  const popup = createPopup(event.pageX, event.pageY);
  const spinner = createSpinner();
  popup.appendChild(spinner);
  document.body.appendChild(popup);
  currentPopup = popup;

  chrome.runtime.sendMessage({ action: "fetchData", selection }, (response) => {
    if (!currentPopup) return;
    popup.removeChild(spinner);

    if (!response || response.error || !response.data?.data?.length) {
      if (!response || response.error) {
        dismissPopup(popup);
      } else {
        popup.appendChild(document.createTextNode("No results found."));
        setTimeout(() => dismissPopup(popup), 3000);
      }
      return;
    }

    const entry = response.data.data[0];
    const word = entry.japanese[0].word || selection;
    const reading = entry.japanese[0].reading || "";
    const meanings = entry.senses[0].english_definitions.join(", ");
    const pitchData = response.ojadHtml ? parseOJAD(response.ojadHtml) : null;

    const wordElem = document.createElement("div");
    wordElem.style.cssText = "font-size:18px; font-weight:bold; color:#2b2b2b; margin-bottom:5px;";
    wordElem.textContent = word;

    const meaningsElem = document.createElement("div");
    meaningsElem.style.marginTop = "5px";
    meaningsElem.textContent = meanings;

    popup.appendChild(wordElem);
    popup.appendChild(buildReadingElem(reading, pitchData, word));
    popup.appendChild(meaningsElem);

    setTimeout(() => dismissPopup(popup), 8000);
  });
});
