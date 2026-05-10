"use strict";

// ─── Mapa ─────────────────────────────────────────────────────────────────────

let map;
window.addEventListener("load", () => {
    map = L.map("map", { zoomControl: false }).setView([0, 0], 2); 

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
    }).addTo(map);

    markers = L.layerGroup().addTo(map);

    // Garante que o Leaflet redesenha ao resize do container
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(document.documentElement); 
});


window.addEventListener("load",   () => setTimeout(() => map?.invalidateSize(), 300));
window.addEventListener("resize", () => map.invalidateSize());

// ─── Estado ───────────────────────────────────────────────────────────────────

let autoFollow = true;
let lastHash   = null;
let gpsMarker  = null;
let prevCoord  = null;
let prevAngle  = 0;
let panelOpen  = false;
let markers = null;

// ─── UI helpers ───────────────────────────────────────────────────────────────

function togglePanel() {
  panelOpen = !panelOpen;
  document.getElementById("ctrl").classList.toggle("open", panelOpen);
  document.getElementById("toggle-btn").textContent = panelOpen ? "▶" : "◀";
}

function toggleFollow() {
  autoFollow = !autoFollow;
  const btn = document.getElementById("btnFollow");
  btn.classList.toggle("active", autoFollow);
  btn.textContent = autoFollow ? "● Auto-Follow" : "○ Manual";
}

// ─── Regiões ──────────────────────────────────────────────────────────────────

function saveRegion() {
  chrome.storage.local.set({ lastRegion: document.getElementById("regionSel").value});
  fetchCoords();
}

async function loadRegions() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "GET_REGIONS" }, (regions) => {
      const sel = document.getElementById("regionSel");
      if (!regions || regions.length === 0) {
        sel.innerHTML = '<option value="">— nenhuma —</option>';
        resolve();
        return;
      }
      sel.innerHTML = regions.map(r => `<option value="${r}">${r}</option>`).join("");
      chrome.storage.local.get("lastRegion", ({ lastRegion: saved }) => {
        if (saved && regions.includes(saved)) sel.value = saved;
      resolve();
      });
    });
  });
}

async function deleteRegion() {
  const rid = document.getElementById("regionSel").value;
  if (!rid || !confirm(`Deletar região ${rid} e todos os seus pontos?`)) return;
  chrome.runtime.sendMessage({ type: "DELETE_REGION", region_id: rid }, async () => {
    await loadRegions();
    fetchCoords();
  });
}

// ─── Marcadores ───────────────────────────────────────────────────────────────

function updateMarkers(coords) {
  const hash = JSON.stringify(coords);
  if (hash === lastHash) return;
  lastHash = hash;

  markers.clearLayers();
  const zs = map.getZoomScale(map.getZoom());

  coords.forEach(c => {
    L.circleMarker([c.latitude, c.longitude], {
      radius: 8 / zs,
      fillColor: "#22c55e",
      color: "#16a34a",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9
    })
    .bindPopup(`<strong>Localização</strong><br>Lat: ${c.latitude.toFixed(5)}<br>Lng: ${c.longitude.toFixed(5)}`)
    .addTo(markers);
  });

  document.getElementById("count").textContent = coords.length;
}

let lastFetchTime = 0;
let coordCache    = null;

function fetchCoords() {
  const now = Date.now();
  if (coordCache && now - lastFetchTime < 800) {
    updateMarkers(coordCache);
    return;
  }
  const rid = document.getElementById("regionSel").value;
  chrome.runtime.sendMessage({ type: "GET_COORDS", region_id: rid }, (data) => {
    if (!data) return;
    coordCache = data;
    lastFetchTime = Date.now();
    updateMarkers(data);
  });
}

// ─── Marcador de posição atual (seta brasileira) ──────────────────────────────

function makeArrowIcon(angle) {
  return L.divIcon({
    className: "",
    html: `<svg viewBox="0 0 300 260" width="32" height="28" xmlns="http://www.w3.org/2000/svg"
             style="transform:rotate(${angle}deg);transform-origin:50% 50%;display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">
      <path d="M 0 260 L 300 260 L 150 0 Z" fill="#002776"/>
      <path d="M 150 0 L 105 78 L 195 78 Z" fill="#FFDF00"/>
      <path d="M 0 260 L 300 260 L 150 0 Z" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="6"/>
    </svg>`,
    iconSize:   [32, 28],
    iconAnchor: [16, 14]
  });
}

function updateCurrentMarker(lat, lng) {
  let angle = prevAngle;
  if (prevCoord && (prevCoord.lat !== lat || prevCoord.lng !== lng)) {
    angle = Math.atan2(lng - prevCoord.lng, lat - prevCoord.lat) * (180 / Math.PI);
    prevAngle = angle;
  }
  prevCoord = { lat, lng };

  const icon = makeArrowIcon(angle);
  if (gpsMarker) {
    gpsMarker.setLatLng([lat, lng]);
    gpsMarker.setIcon(icon);
  } else {
    gpsMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
  }

  if (autoFollow) {
    map.setView([lat, lng], 16, { animate: true });
  }

  // Dot verde = ativo
  document.getElementById("live-dot").classList.remove("inactive");
}

function fetchCurrent() {
  chrome.runtime.sendMessage({ type: "GET_CURRENT" }, (d) => {
    if (!d || d.lat === null) return;
    updateCurrentMarker(d.lat, d.lng);
  });
}

// ─── Recebe atualizações em tempo real vindas do content.js via postMessage ───
//    (dispara antes do polling, para feedback instantâneo)

window.addEventListener("message", (ev) => {
  if (ev.data?.type === "COORD_UPDATE") {
    const { lat, lng } = ev.data;
    updateCurrentMarker(lat, lng);
    // Invalida cache para forçar recarga dos marcadores
    coordCache    = null;
    lastFetchTime = 0;
    fetchCoords();
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

(async () => {
  await loadRegions();
  fetchCoords();
  fetchCurrent();

  setInterval(fetchCoords,  1500);
  setInterval(fetchCurrent, 1000);
})();