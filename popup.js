chrome.runtime.sendMessage({ type: "GET_STATS" }, (s) => {
  document.getElementById("total").textContent   = s?.total   ?? 0;
  document.getElementById("regions").textContent = s?.regions ?? 0;
});

chrome.runtime.sendMessage({ type: "GET_CURRENT" }, (d) => {
  if (d?.lat !== null && d?.lat !== undefined) {
    document.getElementById("currentCoord").textContent =
      `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`;
  }
});