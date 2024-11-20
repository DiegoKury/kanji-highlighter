chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "kanjiLookup",
    title: "Search Kanji on Jisho.org",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "kanjiLookup") {
    const kanji = info.selectionText;
    if (kanji) {
      chrome.tabs.create({ url: `https://jisho.org/search/${encodeURIComponent(kanji)}` });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetchData") {
    const selection = message.selection;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    fetch(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(selection)}`, { signal: controller.signal })
      .then(response => response.json())
      .then(data => {
        clearTimeout(timeoutId);
        sendResponse({ data: data });
      })
      .catch(error => {
        clearTimeout(timeoutId);
        sendResponse({ error: error.toString() });
      });

    return true;
  }
});
