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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const jishoUrl = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(selection)}`;
    const ojadUrl = `http://www.gavo.t.u-tokyo.ac.jp/ojad/search/index/display:print/sortprefix:accent/narabi1:kata_asc/narabi2:accent_asc/narabi3:mola_asc/yure:visible/curve:invisible/details:invisible/limit:500/word:${encodeURIComponent(selection)}`;

    Promise.all([
      fetch(jishoUrl, { signal: controller.signal }).then(r => r.json()),
      fetch(ojadUrl, { signal: controller.signal }).then(r => r.text()).catch(() => null)
    ])
      .then(([jishoData, ojadHtml]) => {
        clearTimeout(timeoutId);
        sendResponse({ data: jishoData, ojadHtml });
      })
      .catch(error => {
        clearTimeout(timeoutId);
        sendResponse({ error: error.toString() });
      });

    return true;
  }
});
