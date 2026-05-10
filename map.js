"use strict";

// ─── State ──────────────────────────────────────────────────────────────────

let autoFollow  = true;
let lastHash    = null;
let gpsMarker   = null;
let prevCoord   = null;
let prevAngle   = 0;
let lastFetchTime = 0;
let coordCache    = null;

// ─── Map — direct initialization (does not depend on "load" event) ──────────

const map = L.map("map", { zoomControl: false }).setView([0, 0], 2);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap"
}).addTo(map);

const markers = L.layerGroup().addTo(map);

// Redraw when container is resized
const ro = new ResizeObserver(() => map.invalidateSize());
ro.observe(document.documentElement);
window.addEventListener("resize", () => map.invalidateSize());
setTimeout(() => map.invalidateSize(), 300);

// ─── UI helpers ───────────────────────────────────────────────────────────────

function toggleFollow() {
  autoFollow = !autoFollow;
  const btn = document.getElementById("btnFollow");
  btn.classList.toggle("active", autoFollow);
  btn.textContent = autoFollow ? "● Auto-Follow" : "○ Manual";
}

// ─── Regions ────────────────────────────────────────────────────────────────

function saveRegion() {
  chrome.storage.local.set({ lastRegion: document.getElementById("regionSel").value });
  fetchCoords();
}

async function loadRegions() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "GET_REGIONS" }, (regions) => {
      const sel = document.getElementById("regionSel");
      if (!regions || regions.length === 0) {
        sel.innerHTML = '<option value="">— none —</option>';
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
  if (!rid || !confirm(`Delete region ${rid} and all its points?`)) return;
  chrome.runtime.sendMessage({ type: "DELETE_REGION", region_id: rid }, async () => {
    await loadRegions();
    fetchCoords();
  });
}

// ─── Markers ─────────────────────────────────────────────────────────────────

function updateMarkers(coords) {
  const hash = JSON.stringify(coords);
  if (hash === lastHash) return;
  lastHash = hash;

  markers.clearLayers();

  coords.forEach(c => {
    L.circleMarker([c.latitude, c.longitude], {
      radius: 6,
      fillColor: "#22c55e",
      color: "#16a34a",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9
    })
    .bindPopup(`<strong>Location</strong><br>Lat: ${c.latitude.toFixed(5)}<br>Lng: ${c.longitude.toFixed(5)}`)
    .addTo(markers);
  });

  const countEl = document.getElementById("count");
  if (countEl) countEl.textContent = coords.length;
}

function fetchCoords() {
  const now = Date.now();
  if (coordCache && now - lastFetchTime < 800) {
    updateMarkers(coordCache);
    return;
  }
  const ridEl = document.getElementById("regionSel");
  const rid = ridEl ? ridEl.value : "";
  chrome.runtime.sendMessage({ type: "GET_COORDS", region_id: rid }, (data) => {
    if (!data) return;
    coordCache = data;
    lastFetchTime = Date.now();
    updateMarkers(data);
  });
}

// ─── Current position marker ──────────────────────────────────────────────────

function makeArrowIcon(angle) {
  return L.divIcon({
    className: "",
    html: `<svg viewBox="0 0 300 260" width="22" height="20" xmlns="http://www.w3.org/2000/svg"
             style="transform:rotate(${angle}deg);transform-origin:50% 50%;display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">
      <path d="M 0 260 L 300 260 L 150 0 Z" fill="#002776"/>
      <path d="M 150 0 L 105 78 L 195 78 Z" fill="#FFDF00"/>
      <path d="M 0 260 L 300 260 L 150 0 Z" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="6"/>
    </svg>`,
    iconSize:   [22, 20],
    iconAnchor: [11, 10]
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

  if (autoFollow) map.setView([lat, lng], 16, { animate: true });

  const dot = document.getElementById("live-dot");
  if (dot) dot.classList.remove("inactive");
}

function fetchCurrent() {
  chrome.runtime.sendMessage({ type: "GET_CURRENT" }, (d) => {
    if (!d || d.lat === null) return;
    updateCurrentMarker(d.lat, d.lng);
  });
}

// ─── Real-time messages from content.js ─────────────────────────────────────

window.addEventListener("message", (ev) => {
  if (ev.data?.type === "COORD_UPDATE") {
    const { lat, lng } = ev.data;
    updateCurrentMarker(lat, lng);
    coordCache    = null;
    lastFetchTime = 0;
    fetchCoords();
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

(async () => {
  document.getElementById("regionSel")?.addEventListener("change", saveRegion);
  document.getElementById("deleteRegionBtn")?.addEventListener("click", deleteRegion);

  await loadRegions();
  fetchCoords();
  fetchCurrent();

  setInterval(fetchCoords,  1500);
  setInterval(fetchCurrent, 1000);
})();