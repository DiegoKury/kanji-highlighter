document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("toggle");
  const dismissInput = document.getElementById("dismissTimeout");
  const fetchInput = document.getElementById("fetchTimeout");

  chrome.storage.sync.get(["enabled", "dismissTimeout", "fetchTimeout"], (data) => {
    toggle.checked = data.enabled || false;
    dismissInput.value = (data.dismissTimeout || 8000) / 1000;
    fetchInput.value = (data.fetchTimeout || 5000) / 1000;
  });

  toggle.addEventListener("change", () => {
    chrome.storage.sync.set({ enabled: toggle.checked });
  });

  dismissInput.addEventListener("change", () => {
    const val = Math.max(3, Math.min(30, parseInt(dismissInput.value) || 8));
    dismissInput.value = val;
    chrome.storage.sync.set({ dismissTimeout: val * 1000 });
  });

  fetchInput.addEventListener("change", () => {
    const val = Math.max(3, Math.min(15, parseInt(fetchInput.value) || 5));
    fetchInput.value = val;
    chrome.storage.sync.set({ fetchTimeout: val * 1000 });
  });
});
