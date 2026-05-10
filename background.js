// ─── Coordinate extraction patterns ────────────────────────────────────────
const PATTERNS = [
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
  /ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
  /viewpoint=(-?\d+\.\d+),(-?\d+\.\d+)/
];

function extractCoords(url) {
  if (!url || !url.includes("google") || !url.includes("maps")) return null;
  const slice = url.substring(0, 500);
  for (const p of PATTERNS) {
    const m = slice.match(p);
    if (m) {
      const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
    }
  }
  return null;
}

function regionId(lat, lng) {
  return `${(Math.round(lat * 10) / 10).toFixed(1)}_${(Math.round(lng * 10) / 10).toFixed(1)}`;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function insertCoord(lat, lng, rid) {
  const { coords = [], regions = [] } = await chrome.storage.local.get(["coords", "regions"]);

  const alreadyExists = coords.some(c => c.latitude === lat && c.longitude === lng);
  if (!alreadyExists) {
    coords.push({ id: Date.now(), latitude: lat, longitude: lng, region_id: rid });
    if (!regions.includes(rid)) regions.push(rid);
    await chrome.storage.local.set({ coords, regions });
  }

  // Always update current coordinate
  await chrome.storage.local.set({ current: { lat, lng } });
}

async function deleteRegion(rid) {
  const { coords = [], regions = [] } = await chrome.storage.local.get(["coords", "regions"]);
  await chrome.storage.local.set({
    coords: coords.filter(c => c.region_id !== rid),
    regions: regions.filter(r => r !== rid)
  });
}

// ─── Navigation monitor ────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const coord = extractCoords(changeInfo.url);
  if (!coord) return;

  const { lat, lng } = coord;
  const rid = regionId(lat, lng);
  await insertCoord(lat, lng, rid);
  console.log(`[SVT] ✓ ${lat}, ${lng} → region ${rid}`);

  // Notify content script to update marker in real-time
  try {
    await chrome.tabs.sendMessage(tabId, { type: "COORD_UPDATE", lat, lng });
  } catch (_) {
    // Content script may not be ready yet; not a critical error
  }
});

chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  const coord = extractCoords(details.url);
  if (!coord) return;
  const { lat, lng } = coord;
  const rid = regionId(lat, lng);
  await insertCoord(lat, lng, rid);
  try {
    await chrome.tabs.sendMessage(details.tabId, { type: "COORD_UPDATE", lat, lng });
  } catch (_) {}
});

// ─── Message router ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {

      case "GET_REGIONS": {
        const { regions = [] } = await chrome.storage.local.get("regions");
        sendResponse(regions);
        break;
      }

      case "GET_COORDS": {
        const { coords = [] } = await chrome.storage.local.get("coords");
        const filtered = msg.region_id
          ? coords.filter(c => c.region_id === msg.region_id)
          : coords;
        sendResponse([...filtered].reverse()); // newest first
        break;
      }

      case "GET_CURRENT": {
        const { current = { lat: null, lng: null } } = await chrome.storage.local.get("current");
        sendResponse(current);
        break;
      }

      case "DELETE_REGION": {
        await deleteRegion(msg.region_id);
        sendResponse({ ok: true });
        break;
      }

      case "GET_OVERLAY_STATE": {
        const { overlayState = {} } = await chrome.storage.local.get("overlayState");
        sendResponse(overlayState);
        break;
      }

      case "SET_OVERLAY_STATE": {
        await chrome.storage.local.set({ overlayState: msg.state });
        sendResponse({ ok: true });
        break;
      }

      case "GET_STATS": {
        const { coords = [], regions = [] } = await chrome.storage.local.get(["coords", "regions"]);
        sendResponse({ total: coords.length, regions: regions.length });
        break;
      }

      default:
        sendResponse({ error: "unknown message type" });
    }
  })();

  return true; // mantém o canal aberto para resposta assíncrona
});