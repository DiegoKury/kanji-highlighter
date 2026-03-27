const cache = new Map();
const CACHE_TTL = 3600000; // 1 hour

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "fetchData") {
    const selection = message.selection;
    const timeout = message.fetchTimeout || 5000;

    const cached = cache.get(selection);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      sendResponse(cached.data);
      return true;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const jishoUrl = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(selection)}`;
    const ojadUrl = `http://www.gavo.t.u-tokyo.ac.jp/ojad/search/index/display:print/sortprefix:accent/narabi1:kata_asc/narabi2:accent_asc/narabi3:mola_asc/yure:visible/curve:invisible/details:invisible/limit:500/word:${encodeURIComponent(selection)}`;

    Promise.all([
      fetch(jishoUrl, { signal: controller.signal }).then(r => r.json()),
      fetch(ojadUrl, { signal: controller.signal }).then(r => r.text()).catch(() => null)
    ])
      .then(([jishoData, ojadHtml]) => {
        clearTimeout(timeoutId);
        const result = { data: jishoData, ojadHtml };
        cache.set(selection, { data: result, time: Date.now() });
        sendResponse(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        sendResponse({ error: error.name === "AbortError" ? "timeout" : error.toString() });
      });

    return true;
  }
});
