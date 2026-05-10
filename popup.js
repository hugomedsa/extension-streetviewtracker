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

// ─── Carrega regiões no select ────────────────────────────────────────────────
 
chrome.runtime.sendMessage({ type: "GET_REGIONS" }, (regions) => {
  const sel = document.getElementById("regionSel");
  if (!regions || regions.length === 0) {
    sel.innerHTML = '<option value="">— nenhuma —</option>';
    return;
  }
  sel.innerHTML = '<option value="">— Escolha a região —</option>' +
    regions.map(r => `<option value="${r}">${r}</option>`).join("");
});
 
// ─── Teletransporte ───────────────────────────────────────────────────────────
 
document.getElementById("deleteRegionBtn").addEventListener("click", () => {
  const rid = document.getElementById("regionSel").value;
  if (!rid || !confirm(`Excluir região ${rid}?`)) return;
  chrome.runtime.sendMessage({ type: "DELETE_REGION", region_id: rid }, () => {
    chrome.runtime.sendMessage({ type: "GET_REGIONS" }, (regions) => {
      const sel = document.getElementById("regionSel");
      if (!regions || regions.length === 0) {
        sel.innerHTML = '<option value="">— nenhuma —</option>';
        return;
      }
      sel.innerHTML = '<option value="">— Escolha a região —</option>' +
        regions.map(r => `<option value="${r}">${r}</option>`).join("");
      // Redireciona para a primeira região restante
      if (regions.length > 0) {
        chrome.runtime.sendMessage({ type: "GET_COORDS", region_id: regions[0] }, (coords) => {
          if (!coords || coords.length === 0) return;
          const { latitude: lat, longitude: lng } = coords[0];
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) chrome.tabs.update(tabs[0].id, {
              url: `https://www.google.com/maps/@${lat},${lng},17z`
            });
          });
        });
      }
    });
  });
});

document.getElementById("teleportBtn").addEventListener("click", () => {
  const rid = document.getElementById("regionSel").value;
  if (!rid) return;
 
  chrome.runtime.sendMessage({ type: "GET_COORDS", region_id: rid }, (coords) => {
    if (!coords || coords.length === 0) return;
 
    // GET_COORDS retorna mais recentes primeiro, índice 0 = último registrado
    const { latitude: lat, longitude: lng } = coords[0];
 
    const url = `https://www.google.com/maps/@${lat},${lng},17z`;
 
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.update(tabs[0].id, { url });
      } else {
        chrome.tabs.create({ url });
      }
    });
  });
});