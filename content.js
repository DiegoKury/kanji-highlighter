let enabled = false;

chrome.storage.sync.get(["enabled"], (data) => {
  enabled = data.enabled || false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled) {
    enabled = changes.enabled.newValue;
  }
});

const japaneseRegex = /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uF900-\uFAFF]/;
let currentPopup = null;

document.addEventListener("mouseup", async (event) => {
  if (!enabled) return;

  const selection = window.getSelection().toString().trim();
  if (!selection) return;
  if (!japaneseRegex.test(selection)) return;

  if (currentPopup) {
    currentPopup.remove();
    currentPopup = null;
  }

  const popup = document.createElement("div");
  popup.style.position = "absolute";
  popup.style.background = "#f7f7f7";
  popup.style.border = "1px solid #ccc";
  popup.style.padding = "10px";
  popup.style.zIndex = "10000";
  popup.style.top = `${event.pageY + 5}px`;
  popup.style.left = `${event.pageX + 5}px`;
  popup.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
  popup.style.fontFamily = "'Helvetica Neue', Arial, sans-serif";
  popup.style.fontSize = "14px";
  popup.style.color = "#333";
  popup.style.maxWidth = "300px";
  popup.style.lineHeight = "1.4";
  popup.style.borderRadius = "4px";

  const closeButton = document.createElement("span");
  closeButton.textContent = "×";
  closeButton.style.position = "absolute";
  closeButton.style.top = "5px";
  closeButton.style.right = "5px";
  closeButton.style.cursor = "pointer";
  closeButton.style.fontSize = "16px";
  closeButton.style.fontWeight = "bold";
  closeButton.style.color = "#aaa";
  closeButton.addEventListener("click", () => {
    popup.remove();
    currentPopup = null;
  });
  popup.appendChild(closeButton);

  const spinner = document.createElement("div");
  spinner.style.border = "4px solid #f3f3f3";
  spinner.style.borderTop = "4px solid #3498db";
  spinner.style.borderRadius = "50%";
  spinner.style.width = "24px";
  spinner.style.height = "24px";
  spinner.style.animation = "spin 1s linear infinite";
  spinner.style.margin = "0 auto";

  const style = document.createElement('style');
  style.type = 'text/css';
  style.innerHTML = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  popup.appendChild(spinner);
  document.body.appendChild(popup);
  currentPopup = popup;

  try {
    chrome.runtime.sendMessage({ action: "fetchData", selection: selection }, (response) => {
      popup.removeChild(spinner);

      if (response.error) {
        popup.remove();
        currentPopup = null;
        return;
      }

      const result = response.data;

      if (!result || !result.data || !result.data.length) {
        popup.textContent = "No results found.";
        setTimeout(() => {
          popup.remove();
          currentPopup = null;
        }, 3000);
        return;
      }

      const data = result.data[0];
      const word = data.japanese[0].word || selection;
      const reading = data.japanese[0].reading || "";
      const meaningsList = data.senses[0].english_definitions;
      const meanings = meaningsList.join(", ");

      const wordElem = document.createElement("div");
      wordElem.style.fontSize = "18px";
      wordElem.style.fontWeight = "bold";
      wordElem.style.color = "#2b2b2b";
      wordElem.style.marginBottom = "5px";
      wordElem.textContent = word;

      const readingElem = document.createElement("div");
      readingElem.style.fontSize = "16px";
      readingElem.style.color = "#555";
      readingElem.style.marginBottom = "5px";
      readingElem.textContent = `Reading: ${reading}`;

      const meaningsElem = document.createElement("div");
      meaningsElem.style.marginTop = "5px";
      meaningsElem.textContent = meanings;

      popup.appendChild(wordElem);
      popup.appendChild(readingElem);
      popup.appendChild(meaningsElem);

      setTimeout(() => {
        popup.remove();
        currentPopup = null;
      }, 8000);
    });
  } catch (error) {
    popup.remove();
    currentPopup = null;
  }
});
