(function () {
  "use strict";

  // Prevent double injection
  if (document.getElementById("sv-overlay-wrap")) return;

  // ─── Overlay structure ─────────────────────────────────────────────────────

  const wrap = document.createElement("div");
  wrap.id = "sv-overlay-wrap";
  Object.assign(wrap.style, {
    position: "fixed",
    top: "22px",
    left: "0",
    width: "240px",
    height: "160px",
    zIndex: "999999",
    borderRadius: "0 0 10px 10px",
    boxShadow: "0 6px 24px rgba(0,0,0,.5)",
    overflow: "visible",
    userSelect: "none"
  });

  // Title bar (drag handle)
  const titleBar = document.createElement("div");
  Object.assign(titleBar.style, {
    position: "absolute",
    top: "-22px",
    left: "0",
    width: "100%",
    height: "22px",
    background: "rgba(15,15,15,0.92)",
    borderRadius: "10px 10px 0 0",
    cursor: "grab",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 8px",
    backdropFilter: "blur(6px)",
    boxSizing: "border-box"
  });
  titleBar.innerHTML = `
    <span style="color:#bbb;font-size:11px;font-family:sans-serif;letter-spacing:1.2px;pointer-events:none">
      ⠶ STREET VIEW TRACKER
    </span>
    <button id="sv-toggle-btn" title="Minimizar" style="
      background:none;border:none;color:#666;font-size:13px;cursor:pointer;
      padding:0 2px;line-height:1;pointer-events:auto;
    ">▼</button>
  `;

  // iframe pointing to the extension page
  const iframe = document.createElement("iframe");
  iframe.id = "sv-overlay-iframe";
  iframe.src = chrome.runtime.getURL("map.html");
  Object.assign(iframe.style, {
    display: "block",
    width: "100%",
    height: "100%",
    border: "none",
    borderRadius: "0 0 10px 10px",
    pointerEvents: "auto"
  });

  // Resize handle
  const resizeHandle = document.createElement("div");
  Object.assign(resizeHandle.style, {
    position: "absolute",
    bottom: "0",
    right: "0",
    width: "18px",
    height: "18px",
    cursor: "nwse-resize",
    zIndex: "10",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    padding: "3px",
    borderBottomRightRadius: "10px"
  });
  resizeHandle.innerHTML = `
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path d="M9 1 L9 9 L1 9" stroke="rgba(130,130,130,0.5)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M9 5 L9 9 L5 9" stroke="rgba(130,130,130,0.85)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>`;

  wrap.appendChild(titleBar);
  wrap.appendChild(iframe);
  wrap.appendChild(resizeHandle);
  document.documentElement.appendChild(wrap);

  // Hide the native Google Maps minimap
  const style = document.createElement("style");
  style.textContent = ".widget-minimap { display: none !important; }";
  document.head.appendChild(style);

  // ─── Restore saved position/size ───────────────────────────────────────────

  chrome.runtime.sendMessage({ type: "GET_OVERLAY_STATE" }, (state) => {
    if (!state) return;
    if (state.left)   wrap.style.left   = state.left;
    if (state.top)    wrap.style.top    = state.top;
    if (state.width)  wrap.style.width  = state.width;
    if (state.height) wrap.style.height = state.height;
    if (state.minimized === "true") minimize(true);
  });

  function saveState(extra = {}) {
    chrome.runtime.sendMessage({
      type: "SET_OVERLAY_STATE",
      state: {
        left: wrap.style.left,
        top: wrap.style.top,
        width: wrap.style.width,
        height: wrap.style.height,
        ...extra
      }
    });
  }

  // ─── Minimize / expand ───────────────────────────────────────────────────────

  let minimized = false;
  let savedHeight = wrap.style.height;

  function minimize(silent = false) {
    minimized = true;
    savedHeight = wrap.style.height;
    iframe.style.display = "none";
    resizeHandle.style.display = "none";
    wrap.style.height = "0";
    titleBar.querySelector("#sv-toggle-btn").textContent = "▲";
    if (!silent) saveState({ minimized: "true" });
  }

  function expand() {
    minimized = false;
    iframe.style.display = "block";
    resizeHandle.style.display = "flex";
    wrap.style.height = savedHeight || "220px";
    titleBar.querySelector("#sv-toggle-btn").textContent = "▼";
    saveState({ minimized: "false" });
  }

  titleBar.querySelector("#sv-toggle-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    minimized ? expand() : minimize();
  });

  // ─── Drag ────────────────────────────────────────────────────────────────────

  titleBar.addEventListener("mousedown", (e) => {
    if (e.target.id === "sv-toggle-btn") return;
    e.preventDefault();
    iframe.style.pointerEvents = "none";

    let active = false;
    const ox = e.clientX - wrap.offsetLeft;
    const oy = e.clientY - wrap.offsetTop;
    const timer = setTimeout(() => { active = true; titleBar.style.cursor = "grabbing"; }, 120);

    function onMove(e) {
      if (!active) return;
      const l = Math.max(0, Math.min(window.innerWidth  - wrap.offsetWidth,  e.clientX - ox));
      const t = Math.max(22, Math.min(window.innerHeight - wrap.offsetHeight, e.clientY - oy));
      wrap.style.left = l + "px";
      wrap.style.top  = t + "px";
    }
    function onUp() {
      clearTimeout(timer);
      active = false;
      iframe.style.pointerEvents = "auto";
      titleBar.style.cursor = "grab";
      saveState();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });

  // ─── Resize ──────────────────────────────────────────────────────────────────

  let resizeTimer = null;

  resizeHandle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    iframe.style.pointerEvents = "none";

    let active = false;
    const sx = e.clientX, sy = e.clientY;
    const sw = wrap.offsetWidth, sh = wrap.offsetHeight;
    const timer = setTimeout(() => { active = true; }, 150);

    function onMove(e) {
      if (!active) return;
      wrap.style.width  = Math.max(120, sw + (e.clientX - sx)) + "px";
      wrap.style.height = Math.max(80, sh + (e.clientY - sy)) + "px";
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try { iframe.contentWindow?.dispatchEvent(new Event("resize")); } catch (_) {}
      }, 80);
    }
    function onUp() {
      clearTimeout(timer);
      active = false;
      iframe.style.pointerEvents = "auto";
      saveState();
      resizeHandle.removeEventListener("pointermove", onMove);
      resizeHandle.removeEventListener("pointerup",   onUp);
    }
    resizeHandle.addEventListener("pointermove", onMove);
    resizeHandle.addEventListener("pointerup",   onUp);
  });

  // ─── Forward coordinate updates from background to iframe ─────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "COORD_UPDATE") {
      iframe.contentWindow?.postMessage(msg, "*");
    }
  });

})();