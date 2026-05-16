/* Floor Plan Editor – vanilla SVG */

(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const STORAGE_KEY = "floor-plan-editor:v1";

  const SCALE = 12; // pixels per foot at zoom = 1
  const MIN_SIZE = 2; // feet
  const PALETTE = [
    "#ffffff",
    "#e6dccb",
    "#d9e6fb",
    "#fde2c2",
    "#e3f0d7",
    "#f3d9e1",
    "#d8ecec",
    "#ecdcf2",
  ];

  const state = {
    plan: null,
    selectedId: null,
    zoom: 1,
    pan: { x: 40, y: 30 },
    showGrid: true,
    showDims: true,
    isPanning: false,
    spaceDown: false,
    drag: null, // { kind: 'move'|'resize', startX, startY, room, corner? }
  };

  const svg = document.getElementById("canvas");
  const propsEl = document.getElementById("props");
  const roomListEl = document.getElementById("room-list");
  const statsEl = document.getElementById("stats");
  const zoomLabel = document.getElementById("zoom-label");

  /* -------- Init -------- */
  loadPlan();
  attachToolbar();
  attachCanvasEvents();
  attachKeyEvents();
  render();
  // Defer fit until layout has actual dimensions
  requestAnimationFrame(fitToView);

  /* -------- Persistence -------- */
  function loadPlan() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state.plan = JSON.parse(raw);
        return;
      }
    } catch (_) {}
    state.plan = deepClone(window.DEFAULT_PLAN);
  }

  function savePlan() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.plan));
    } catch (_) {}
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /* -------- Toolbar -------- */
  function attachToolbar() {
    document.getElementById("btn-add").onclick = addRoom;
    document.getElementById("btn-duplicate").onclick = duplicateSelected;
    document.getElementById("btn-delete").onclick = deleteSelected;
    document.getElementById("btn-zoom-in").onclick = () => setZoom(state.zoom * 1.2);
    document.getElementById("btn-zoom-out").onclick = () => setZoom(state.zoom / 1.2);
    document.getElementById("btn-fit").onclick = fitToView;
    document.getElementById("toggle-grid").onchange = (e) => {
      state.showGrid = e.target.checked;
      render();
    };
    document.getElementById("toggle-dims").onchange = (e) => {
      state.showDims = e.target.checked;
      render();
    };
    document.getElementById("btn-export").onclick = exportJson;
    document.getElementById("btn-import").onclick = () =>
      document.getElementById("file-import").click();
    document.getElementById("file-import").onchange = importJson;
    document.getElementById("btn-reset").onclick = () => {
      if (confirm("Reset the floor plan to the original layout?")) {
        state.plan = deepClone(window.DEFAULT_PLAN);
        state.selectedId = null;
        savePlan();
        render();
        fitToView();
      }
    };
  }

  /* -------- View transform -------- */
  function setZoom(z, anchor) {
    const newZoom = Math.max(0.2, Math.min(4, z));
    if (anchor) {
      // Keep `anchor` (screen coords) over the same plan point after zoom.
      const before = screenToPlan(anchor.x, anchor.y);
      state.zoom = newZoom;
      const after = screenToPlan(anchor.x, anchor.y);
      state.pan.x += (after.x - before.x) * SCALE * state.zoom;
      state.pan.y += (after.y - before.y) * SCALE * state.zoom;
    } else {
      state.zoom = newZoom;
    }
    render();
  }

  function fitToView() {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const padding = 50;
    const planW = state.plan.bounds.w * SCALE;
    const planH = state.plan.bounds.h * SCALE;
    const zx = (rect.width - padding * 2) / planW;
    const zy = (rect.height - padding * 2) / planH;
    state.zoom = Math.min(zx, zy);
    state.pan.x = (rect.width - planW * state.zoom) / 2;
    state.pan.y = (rect.height - planH * state.zoom) / 2;
    render();
  }

  function screenToPlan(sx, sy) {
    const rect = svg.getBoundingClientRect();
    const x = (sx - rect.left - state.pan.x) / (SCALE * state.zoom);
    const y = (sy - rect.top - state.pan.y) / (SCALE * state.zoom);
    return { x, y };
  }

  /* -------- Render -------- */
  function render() {
    zoomLabel.textContent = Math.round(state.zoom * 100) + "%";

    // Clear
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const root = el("g", {
      transform: `translate(${state.pan.x},${state.pan.y}) scale(${SCALE * state.zoom})`,
    });
    svg.appendChild(root);

    if (state.showGrid) root.appendChild(renderGrid());

    // Plan boundary
    const b = state.plan.bounds;
    const boundary = el("rect", {
      x: 0,
      y: 0,
      width: b.w,
      height: b.h,
      fill: "none",
      stroke: "#cbbf9c",
      "stroke-dasharray": "4 3",
    });
    boundary.style.strokeWidth = "1px";
    boundary.style.vectorEffect = "non-scaling-stroke";
    boundary.style.pointerEvents = "none";
    root.appendChild(boundary);

    // Sort exterior first so interior rooms render on top
    const ordered = [...state.plan.rooms].sort(
      (a, b) => (b.exterior ? 1 : 0) - (a.exterior ? 1 : 0)
    );
    for (const room of ordered) root.appendChild(renderRoom(room));

    if (state.selectedId) {
      const room = state.plan.rooms.find((r) => r.id === state.selectedId);
      if (room) root.appendChild(renderHandles(room));
    }

    svg.appendChild(renderScaleBar());

    renderProps();
    renderRoomList();
    renderStats();
    savePlan();
  }

  function renderGrid() {
    const g = el("g", { class: "grid" });
    const b = state.plan.bounds;
    for (let x = 0; x <= b.w; x++) {
      g.appendChild(
        el("line", {
          x1: x,
          y1: 0,
          x2: x,
          y2: b.h,
          class: x % 5 === 0 ? "major" : "",
        })
      );
    }
    for (let y = 0; y <= b.h; y++) {
      g.appendChild(
        el("line", {
          x1: 0,
          y1: y,
          x2: b.w,
          y2: y,
          class: y % 5 === 0 ? "major" : "",
        })
      );
    }
    return g;
  }

  function renderRoom(room) {
    const g = el("g", {
      class:
        "room" +
        (room.exterior ? " exterior" : "") +
        (state.selectedId === room.id ? " selected" : ""),
      "data-id": room.id,
    });

    const rect = el("rect", {
      class: "fill",
      x: room.x,
      y: room.y,
      width: room.w,
      height: room.h,
    });
    if (room.color) rect.style.fill = room.color;
    g.appendChild(rect);

    // Labels
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    const fontScale = 1 / (SCALE * state.zoom); // labels stay at fixed pixel size

    const baseFs = 11 * fontScale;
    const dimFs = 9 * fontScale;
    const ceilFs = 8 * fontScale;

    // Stack labels vertically — measure how many we'll show.
    const lines = [];
    lines.push({ text: room.name.toUpperCase(), size: baseFs, weight: 700 });
    if (state.showDims) {
      lines.push({
        text: formatDim(room.w) + " x " + formatDim(room.h),
        size: dimFs,
        weight: 400,
        soft: true,
      });
    }
    if (room.ceiling) {
      lines.push({
        text: `(${room.ceiling}' CEILING)`,
        size: ceilFs,
        weight: 400,
        italic: true,
        soft: true,
      });
    }
    if (room.sub) {
      lines.push({
        text: `(${room.sub})`,
        size: ceilFs,
        weight: 400,
        italic: true,
        soft: true,
      });
    }

    const totalH = lines.reduce((s, l) => s + l.size * 1.15, 0);
    let yPos = cy - totalH / 2 + lines[0].size * 0.85;

    // Only show label if room is big enough relative to the text
    const minSide = Math.min(room.w, room.h);
    const visibleLines =
      minSide < 4 ? lines.slice(0, 1) : lines;

    for (const line of visibleLines) {
      const t = el("text", {
        x: cx,
        y: yPos,
        class: line.soft ? (line.italic ? "ceiling-label" : "dim-label") : "",
        "font-size": line.size,
      });
      if (line.weight) t.setAttribute("font-weight", line.weight);
      t.textContent = line.text;
      g.appendChild(t);
      yPos += line.size * 1.15;
    }

    // Interaction
    rect.addEventListener("mousedown", (e) => startDrag(e, room, "move"));
    rect.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      promptRename(room);
    });

    return g;
  }

  function renderHandles(room) {
    const g = el("g", { class: "handles" });
    const size = 8 / (SCALE * state.zoom);
    const half = size / 2;
    const corners = [
      { name: "nw", x: room.x, y: room.y },
      { name: "ne", x: room.x + room.w, y: room.y },
      { name: "se", x: room.x + room.w, y: room.y + room.h },
      { name: "sw", x: room.x, y: room.y + room.h },
    ];
    for (const c of corners) {
      const h = el("rect", {
        class: "handle " + c.name,
        x: c.x - half,
        y: c.y - half,
        width: size,
        height: size,
      });
      h.addEventListener("mousedown", (e) => startDrag(e, room, "resize", c.name));
      g.appendChild(h);
    }
    return g;
  }

  function renderScaleBar() {
    const g = el("g", { class: "scale-bar" });
    const margin = 18;
    const rect = svg.getBoundingClientRect();
    const x0 = margin;
    const y0 = rect.height - margin;
    const lengthFt = 10;
    const lengthPx = lengthFt * SCALE * state.zoom;
    g.appendChild(
      el("line", { x1: x0, y1: y0, x2: x0 + lengthPx, y2: y0 })
    );
    g.appendChild(el("line", { x1: x0, y1: y0 - 4, x2: x0, y2: y0 + 4 }));
    g.appendChild(
      el("line", {
        x1: x0 + lengthPx,
        y1: y0 - 4,
        x2: x0 + lengthPx,
        y2: y0 + 4,
      })
    );
    const t = el("text", {
      x: x0 + lengthPx / 2,
      y: y0 - 6,
      "text-anchor": "middle",
    });
    t.textContent = lengthFt + " ft";
    g.appendChild(t);
    return g;
  }

  /* -------- Properties / list / stats -------- */
  function renderProps() {
    const room = state.plan.rooms.find((r) => r.id === state.selectedId);
    if (!room) {
      propsEl.innerHTML =
        '<p class="empty">Select a room to edit its properties.</p>';
      return;
    }
    propsEl.innerHTML = "";

    propsEl.appendChild(
      field("Name", inputEl("text", room.name, (v) => {
        room.name = v;
        render();
      }))
    );

    propsEl.appendChild(
      field(
        "Position",
        rowEl([
          numberInput(room.x, (v) => {
            room.x = v;
            render();
          }, "x"),
          numberInput(room.y, (v) => {
            room.y = v;
            render();
          }, "y"),
        ])
      )
    );

    propsEl.appendChild(
      field(
        "Size (ft)",
        rowEl([
          numberInput(
            room.w,
            (v) => {
              room.w = Math.max(MIN_SIZE, v);
              render();
            },
            "w"
          ),
          numberInput(
            room.h,
            (v) => {
              room.h = Math.max(MIN_SIZE, v);
              render();
            },
            "h"
          ),
        ])
      )
    );

    propsEl.appendChild(
      field("Ceiling (ft)", inputEl("number", room.ceiling || "", (v) => {
        const n = parseFloat(v);
        if (isNaN(n)) delete room.ceiling;
        else room.ceiling = n;
        render();
      }))
    );

    propsEl.appendChild(
      field("Sub-label", inputEl("text", room.sub || "", (v) => {
        if (v) room.sub = v;
        else delete room.sub;
        render();
      }))
    );

    const extWrap = document.createElement("div");
    extWrap.className = "field";
    extWrap.innerHTML = `<label>Exterior</label>`;
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!room.exterior;
    cb.onchange = () => {
      room.exterior = cb.checked || undefined;
      render();
    };
    extWrap.appendChild(cb);
    propsEl.appendChild(extWrap);

    // Color swatches
    const colorWrap = document.createElement("div");
    colorWrap.className = "field";
    colorWrap.innerHTML = `<label>Fill</label>`;
    const sw = document.createElement("div");
    sw.className = "swatches";
    for (const c of PALETTE) {
      const s = document.createElement("div");
      s.className = "swatch" + (room.color === c ? " active" : "");
      s.style.background = c;
      s.title = c;
      s.onclick = () => {
        if (c === "#ffffff") delete room.color;
        else room.color = c;
        render();
      };
      sw.appendChild(s);
    }
    colorWrap.appendChild(sw);
    propsEl.appendChild(colorWrap);

    const area = document.createElement("div");
    area.className = "area";
    area.textContent =
      `Area: ${(room.w * room.h).toFixed(1)} sq ft  ·  ` +
      `Perimeter: ${(2 * (room.w + room.h)).toFixed(1)} ft`;
    propsEl.appendChild(area);
  }

  function field(label, control) {
    const f = document.createElement("div");
    f.className = "field";
    const l = document.createElement("label");
    l.textContent = label;
    f.appendChild(l);
    f.appendChild(control);
    return f;
  }

  function rowEl(children) {
    const r = document.createElement("div");
    r.className = "row";
    for (const c of children) r.appendChild(c);
    return r;
  }

  function inputEl(type, value, onChange) {
    const i = document.createElement("input");
    i.type = type;
    i.value = value;
    i.oninput = () => onChange(i.value);
    return i;
  }

  function numberInput(value, onChange, placeholder) {
    const i = document.createElement("input");
    i.type = "number";
    i.step = "0.1";
    i.value = round(value);
    i.placeholder = placeholder || "";
    i.oninput = () => {
      const n = parseFloat(i.value);
      if (!isNaN(n)) onChange(n);
    };
    return i;
  }

  function renderRoomList() {
    roomListEl.innerHTML = "";
    const sorted = [...state.plan.rooms].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const room of sorted) {
      const li = document.createElement("li");
      if (room.id === state.selectedId) li.className = "active";
      const name = document.createElement("span");
      name.textContent = room.name;
      const dim = document.createElement("span");
      dim.className = "dim";
      dim.textContent = `${round(room.w)}'×${round(room.h)}'`;
      li.appendChild(name);
      li.appendChild(dim);
      li.onclick = () => {
        state.selectedId = room.id;
        render();
      };
      roomListEl.appendChild(li);
    }
  }

  function renderStats() {
    const interior = state.plan.rooms.filter((r) => !r.exterior);
    const exterior = state.plan.rooms.filter((r) => r.exterior);
    const intArea = interior.reduce((s, r) => s + r.w * r.h, 0);
    const extArea = exterior.reduce((s, r) => s + r.w * r.h, 0);
    statsEl.innerHTML = "";
    addStat("Rooms", state.plan.rooms.length);
    addStat("Interior", interior.length + ` (${Math.round(intArea)} sq ft)`);
    addStat("Exterior", exterior.length + ` (${Math.round(extArea)} sq ft)`);
    addStat("Plan bounds", `${state.plan.bounds.w} × ${state.plan.bounds.h} ft`);
  }

  function addStat(k, v) {
    const r = document.createElement("div");
    r.className = "stat-row";
    r.innerHTML = `<span>${k}</span><span>${v}</span>`;
    statsEl.appendChild(r);
  }

  /* -------- Drag / resize -------- */
  function startDrag(e, room, kind, corner) {
    if (state.spaceDown) return;
    e.preventDefault();
    e.stopPropagation();
    state.selectedId = room.id;
    const p = screenToPlan(e.clientX, e.clientY);
    state.drag = {
      kind,
      corner,
      room,
      startPlan: p,
      origin: {
        x: room.x,
        y: room.y,
        w: room.w,
        h: room.h,
      },
    };
    render();
  }

  function onMove(e) {
    if (state.isPanning) {
      const dx = e.clientX - state.panStart.x;
      const dy = e.clientY - state.panStart.y;
      state.pan.x = state.panOrigin.x + dx;
      state.pan.y = state.panOrigin.y + dy;
      render();
      return;
    }
    if (!state.drag) return;
    const p = screenToPlan(e.clientX, e.clientY);
    const dx = p.x - state.drag.startPlan.x;
    const dy = p.y - state.drag.startPlan.y;
    const o = state.drag.origin;
    const r = state.drag.room;
    if (state.drag.kind === "move") {
      r.x = snap(o.x + dx);
      r.y = snap(o.y + dy);
    } else {
      let nx = o.x,
        ny = o.y,
        nw = o.w,
        nh = o.h;
      const c = state.drag.corner;
      if (c === "nw") {
        nx = snap(o.x + dx);
        ny = snap(o.y + dy);
        nw = o.w - (nx - o.x);
        nh = o.h - (ny - o.y);
      } else if (c === "ne") {
        ny = snap(o.y + dy);
        nw = snap(o.w + dx);
        nh = o.h - (ny - o.y);
      } else if (c === "se") {
        nw = snap(o.w + dx);
        nh = snap(o.h + dy);
      } else if (c === "sw") {
        nx = snap(o.x + dx);
        nw = o.w - (nx - o.x);
        nh = snap(o.h + dy);
      }
      if (nw < MIN_SIZE) nw = MIN_SIZE;
      if (nh < MIN_SIZE) nh = MIN_SIZE;
      r.x = nx;
      r.y = ny;
      r.w = nw;
      r.h = nh;
    }
    render();
  }

  function onUp() {
    state.drag = null;
    if (state.isPanning) {
      state.isPanning = false;
      svg.classList.remove("panning");
    }
  }

  function snap(v) {
    // Half-foot snap
    return Math.round(v * 2) / 2;
  }

  /* -------- Canvas pan/zoom -------- */
  function attachCanvasEvents() {
    svg.addEventListener("mousedown", (e) => {
      // Bubbles here only when the click missed a room/handle (those
      // call stopPropagation in their own handlers).
      if (state.spaceDown || e.button === 1) {
        state.isPanning = true;
        state.panStart = { x: e.clientX, y: e.clientY };
        state.panOrigin = { x: state.pan.x, y: state.pan.y };
        svg.classList.add("panning");
      } else {
        state.selectedId = null;
        render();
      }
    });

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setZoom(state.zoom * factor, { x: e.clientX, y: e.clientY });
    }, { passive: false });

    window.addEventListener("resize", () => render());
  }

  function attachKeyEvents() {
    window.addEventListener("keydown", (e) => {
      if (
        document.activeElement &&
        ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
      )
        return;
      if (e.code === "Space") {
        state.spaceDown = true;
        svg.style.cursor = "grab";
      } else if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelected();
      } else if (e.key === "d" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === "f") {
        fitToView();
      } else if (e.key === "Escape") {
        state.selectedId = null;
        render();
      } else if (state.selectedId) {
        const r = state.plan.rooms.find((x) => x.id === state.selectedId);
        if (!r) return;
        const step = e.shiftKey ? 1 : 0.5;
        if (e.key === "ArrowLeft") r.x -= step;
        else if (e.key === "ArrowRight") r.x += step;
        else if (e.key === "ArrowUp") r.y -= step;
        else if (e.key === "ArrowDown") r.y += step;
        else return;
        e.preventDefault();
        render();
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        state.spaceDown = false;
        svg.style.cursor = "";
      }
    });
  }

  /* -------- CRUD operations -------- */
  function addRoom() {
    const id = "room-" + Date.now().toString(36);
    const center = screenToPlan(
      svg.getBoundingClientRect().width / 2,
      svg.getBoundingClientRect().height / 2
    );
    const room = {
      id,
      name: "New Room",
      x: snap(center.x - 5),
      y: snap(center.y - 4),
      w: 10,
      h: 8,
    };
    state.plan.rooms.push(room);
    state.selectedId = id;
    render();
  }

  function duplicateSelected() {
    const r = state.plan.rooms.find((x) => x.id === state.selectedId);
    if (!r) return;
    const copy = deepClone(r);
    copy.id = r.id + "-" + Date.now().toString(36);
    copy.x += 2;
    copy.y += 2;
    copy.name = r.name + " (copy)";
    state.plan.rooms.push(copy);
    state.selectedId = copy.id;
    render();
  }

  function deleteSelected() {
    if (!state.selectedId) return;
    const idx = state.plan.rooms.findIndex((r) => r.id === state.selectedId);
    if (idx >= 0) {
      state.plan.rooms.splice(idx, 1);
      state.selectedId = null;
      render();
    }
  }

  function promptRename(room) {
    const name = prompt("Rename room", room.name);
    if (name != null && name.trim()) {
      room.name = name.trim();
      render();
    }
  }

  /* -------- Import / export -------- */
  function exportJson() {
    const blob = new Blob([JSON.stringify(state.plan, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "floor-plan.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.rooms || !data.bounds) throw new Error("Invalid plan");
        state.plan = data;
        state.selectedId = null;
        render();
        fitToView();
      } catch (err) {
        alert("Could not load file: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  /* -------- Helpers -------- */
  function el(name, attrs) {
    const e = document.createElementNS(SVG_NS, name);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === "") continue;
        e.setAttribute(k, v);
      }
    }
    return e;
  }

  function formatDim(ft) {
    const whole = Math.floor(ft);
    const inches = Math.round((ft - whole) * 12);
    if (inches === 12) return `${whole + 1}'-0"`;
    return `${whole}'-${inches}"`;
  }

  function round(n) {
    return Math.round(n * 10) / 10;
  }
})();
