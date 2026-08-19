(() => {
  if (window.__rascunhoOverlay) return;
  window.__rascunhoOverlay = true;

  const HOST_ID = "rascunho-root-host";
  const HIDE_MS = 280;
  const PANEL_W = 380;
  const MIN_W = 220;
  const MIN_H = 140;
  const HOVER_PAD = 52;
  let cachedCss = "";

  const state = {
    visible: false,
    pinned: false,
    hideTimer: 0,
    dragging: false,
    dragDx: 0,
    dragDy: 0,
    left: 24,
    top: 72,
    width: 380,
    height: 0,
    altLayout: "stack",
    resizing: false,
    userId: "",
    appUrl: "",
    omissasToken: "",
    source: "notebook",
    notebooks: [],
    notebookId: "",
    omissasQueue: [],
    omissasIndex: 0,
    answered: {},
    current: null,
    question: null,
    options: [],
    stats: null,
    selected: null,
    eliminated: new Set(),
    confidence: "seguro",
    result: null,
    resolving: false,
    loading: false,
    error: "",
    notes: [],
    noteDraft: "",
    startedAt: 0,
    elapsedMs: 0,
    timerRunning: false,
    hover: false,
    textMode: "note",
    commentDraft: "",
  };

  let host = null;
  let shadow = null;
  let shell = null;
  let wrap = null;
  let bar = null;
  let body = null;
  let resizeHandle = null;
  let tickTimer = 0;

  function nowElapsed() {
    if (!state.timerRunning || !state.startedAt) return state.elapsedMs;
    return state.elapsedMs + (Date.now() - state.startedAt);
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function updateTimerLabel() {
    const node = shadow?.querySelector?.(".timer-val");
    if (node) node.textContent = formatTime(nowElapsed());
  }

  function stopTick() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = 0;
    }
  }

  function startTick() {
    stopTick();
    tickTimer = setInterval(updateTimerLabel, 250);
    updateTimerLabel();
  }

  function pauseTimer() {
    if (!state.timerRunning) {
      updateTimerLabel();
      return;
    }
    state.elapsedMs = nowElapsed();
    state.timerRunning = false;
    state.startedAt = 0;
    stopTick();
    updateTimerLabel();
  }

  function resumeTimer() {
    if (state.result || !state.question || state.timerRunning) {
      updateTimerLabel();
      return;
    }
    state.timerRunning = true;
    state.startedAt = Date.now();
    startTick();
  }

  function resetTimer() {
    state.elapsedMs = 0;
    state.startedAt = 0;
    state.timerRunning = false;
    if (!state.result && state.question) resumeTimer();
    else {
      stopTick();
      updateTimerLabel();
    }
  }

  function durationToSend() {
    return Math.max(0, Math.round(nowElapsed()));
  }

  function toPlain(html) {
    if (!html) return "";
    const d = document.createElement("div");
    d.innerHTML = html;
    return (d.textContent || "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").trim();
  }

  function api(action, extra) {
    return chrome.runtime
      .sendMessage({ type: "API", action, ...(extra || {}) })
      .then((res) => res || { ok: false, error: "Sem resposta da extensão." })
      .catch((err) => ({
        ok: false,
        error: err?.message || "Recarregue a página após atualizar a extensão.",
      }));
  }

  function getConfig() {
    return chrome.runtime
      .sendMessage({ type: "GET_CONFIG" })
      .then((res) => res || {})
      .catch(() => ({}));
  }

  function setConfig(payload) {
    return chrome.runtime.sendMessage({ type: "SET_CONFIG", payload }).catch(() => {});
  }

  function parseRgb(str) {
    if (!str || str === "transparent") return null;
    const m = String(str).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (!m) return null;
    const a = m[4] == null ? 1 : Number(m[4]);
    if (a <= 0.08) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
  }

  function samplePageColor() {
    const w = wrap?.offsetWidth || PANEL_W;
    const x = state.left + w / 2;
    const y = state.top + 36;
    const prev = host.style.pointerEvents;
    host.style.pointerEvents = "none";
    const el = document.elementFromPoint(x, y) || document.body;
    host.style.pointerEvents = prev;
    let node = el;
    while (node && node !== document.documentElement) {
      const rgb = parseRgb(getComputedStyle(node).backgroundColor);
      if (rgb && rgb.a >= 0.45) return rgb;
      node = node.parentElement;
    }
    return (
      parseRgb(getComputedStyle(document.body).backgroundColor) ||
      parseRgb(getComputedStyle(document.documentElement).backgroundColor) ||
      { r: 255, g: 255, b: 255, a: 1 }
    );
  }

  function applyTheme() {
    if (!wrap || !host) return;
    const rgb = samplePageColor();
    const lum = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    const dark = lum < 0.52;
    wrap.classList.toggle("theme-dark", dark);
    wrap.classList.toggle("theme-light", !dark);
  }

  function saveOverlay() {
    return setConfig({
      overlay: {
        left: state.left,
        top: state.top,
        pinned: state.pinned,
        width: state.width,
        height: state.height,
      },
      altLayout: state.altLayout,
    });
  }

  function applySize() {
    if (!wrap) return;
    wrap.style.width = `${state.width}px`;
    wrap.style.height = state.height ? `${state.height}px` : "";
  }

  function placeShell() {
    if (!shell) return;
    shell.style.left = `${state.left - HOVER_PAD}px`;
    shell.style.top = `${state.top - HOVER_PAD}px`;
  }

  function clampPos() {
    const w = wrap?.offsetWidth || state.width || PANEL_W;
    const maxL = Math.max(8, window.innerWidth - w - 8);
    const maxT = Math.max(8, window.innerHeight - 48);
    state.left = Math.min(Math.max(8, state.left), maxL);
    state.top = Math.min(Math.max(8, state.top), maxT);
    if (state.width) {
      state.width = Math.min(Math.max(MIN_W, state.width), window.innerWidth - 16);
    }
    if (state.height) {
      state.height = Math.min(Math.max(MIN_H, state.height), window.innerHeight - 16);
    }
    applySize();
    placeShell();
  }

  async function loadCss() {
    if (cachedCss) return cachedCss;
    try {
      cachedCss = await (await fetch(chrome.runtime.getURL("content/overlay.css"))).text();
    } catch {
      cachedCss = "";
    }
    return cachedCss;
  }

  async function ensureDom() {
    if (host && document.documentElement.contains(host)) return;
    host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.style.all = "initial";
      (document.documentElement || document.body).appendChild(host);
    }
    shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    shadow.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = await loadCss();
    shell = document.createElement("div");
    shell.className = "shell hidden";
    wrap = document.createElement("div");
    wrap.className = "wrap theme-light";
    bar = document.createElement("div");
    bar.className = "bar";
    body = document.createElement("div");
    body.className = "body";
    wrap.appendChild(bar);
    wrap.appendChild(body);
    resizeHandle = document.createElement("div");
    resizeHandle.className = "resize";
    resizeHandle.title = "Redimensionar";
    wrap.appendChild(resizeHandle);
    shell.appendChild(wrap);
    shadow.appendChild(style);
    shadow.appendChild(shell);
    bindShell();
  }

  function bindShell() {
    shell.addEventListener("mouseenter", () => {
      state.hover = true;
      clearTimeout(state.hideTimer);
    });
    shell.addEventListener("mouseleave", () => {
      state.hover = false;
      scheduleHide();
    });
    bar.addEventListener("mousedown", onDragStart);
    resizeHandle.addEventListener("mousedown", onResizeStart);
  }

  function scheduleHide() {
    if (!state.visible || state.pinned || state.dragging) return;
    clearTimeout(state.hideTimer);
    state.hideTimer = setTimeout(() => {
      if (!state.hover && !state.pinned) hide();
    }, HIDE_MS);
  }

  function onDragStart(e) {
    if (e.button !== 0) return;
    if (e.target.closest("button")) return;
    state.dragging = true;
    state.dragDx = e.clientX - state.left;
    state.dragDy = e.clientY - state.top;
    e.preventDefault();
    document.addEventListener("mousemove", onDragMove, true);
    document.addEventListener("mouseup", onDragEnd, true);
  }

  function onDragMove(e) {
    if (!state.dragging) return;
    state.left = e.clientX - state.dragDx;
    state.top = e.clientY - state.dragDy;
    clampPos();
  }

  function onDragEnd() {
    document.removeEventListener("mousemove", onDragMove, true);
    document.removeEventListener("mouseup", onDragEnd, true);
    if (!state.dragging) return;
    state.dragging = false;
    clampPos();
    applyTheme();
    saveOverlay();
  }

  function onResizeStart(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    state.resizing = true;
    state.dragging = true;
    state.dragDx = e.clientX;
    state.dragDy = e.clientY;
    state.resizeW = wrap.offsetWidth;
    state.resizeH = wrap.offsetHeight;
    document.addEventListener("mousemove", onResizeMove, true);
    document.addEventListener("mouseup", onResizeEnd, true);
  }

  function onResizeMove(e) {
    if (!state.resizing) return;
    const maxW = window.innerWidth - state.left - 8;
    const maxH = window.innerHeight - state.top - 8;
    state.width = Math.min(maxW, Math.max(MIN_W, state.resizeW + (e.clientX - state.dragDx)));
    state.height = Math.min(maxH, Math.max(MIN_H, state.resizeH + (e.clientY - state.dragDy)));
    applySize();
    placeShell();
  }

  function onResizeEnd() {
    document.removeEventListener("mousemove", onResizeMove, true);
    document.removeEventListener("mouseup", onResizeEnd, true);
    state.resizing = false;
    state.dragging = false;
    clampPos();
    saveOverlay();
  }

  function renderBar() {
    bar.innerHTML = "";
    const title = document.createElement("span");
    title.textContent = "rascunho";
    const right = document.createElement("span");
    const pin = document.createElement("button");
    pin.type = "button";
    pin.textContent = state.pinned ? "fixo" : "solto";
    pin.title = state.pinned ? "Desafixar (some ao tirar o mouse)" : "Fixar (não some)";
    pin.addEventListener("click", (e) => {
      e.stopPropagation();
      state.pinned = !state.pinned;
      setConfig({ overlay: { left: state.left, top: state.top, pinned: state.pinned, width: state.width, height: state.height } });
      renderBar();
    });
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "fechar";
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      hide();
    });
    right.appendChild(pin);
    right.appendChild(document.createTextNode(" · "));
    right.appendChild(close);
    bar.appendChild(title);
    bar.appendChild(right);
  }

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    if (attrs) Object.assign(node, attrs);
    if (text != null) node.textContent = text;
    return node;
  }

  function render() {
    if (!body) return;
    const keepNote = shadow.activeElement && shadow.activeElement.classList?.contains("note");
    const noteVal =
      keepNote
        ? shadow.activeElement.value
        : state.textMode === "comment"
          ? state.commentDraft
          : state.noteDraft;
    const noteSel = keepNote
      ? { start: shadow.activeElement.selectionStart, end: shadow.activeElement.selectionEnd }
      : null;

    body.innerHTML = "";
    if (!state.userId) {
      const p = el("p", { className: "row muted" });
      p.textContent = "Abra o site, faça login e volte nesta aba. Atalho: Alt+Q.";
      body.appendChild(p);
      if (state.appUrl) {
        const a = el("a", { href: `${state.appUrl}/login`, target: "_blank", rel: "noreferrer" });
        a.textContent = state.appUrl;
        body.appendChild(a);
      }
      if (state.error) body.appendChild(el("p", { className: "err" }, state.error));
      return;
    }

    body.appendChild(renderSource());

    if (state.loading) {
      body.appendChild(el("p", { className: "muted" }, "carregando…"));
      return;
    }
    if (state.error) body.appendChild(el("p", { className: "err" }, state.error));

    if (!state.question) {
      body.appendChild(
        el(
          "p",
          { className: "muted" },
          state.source === "omissas"
            ? "Nada na fila. Abra omissas no site se o token ainda não sincronizou."
            : "Escolha um caderno ou não há pendentes."
        )
      );
      return;
    }

    const stmt = el("p", { className: "stmt" }, toPlain(state.question.statement));
    body.appendChild(stmt);

    const list = el("div", {
      className: `row ${state.altLayout === "inline" ? "opts-inline" : "opts-stack"}`,
    });
    state.options.forEach((opt, i) => {
      const btn = el("button", { className: "line", type: "button" });
      const prefix =
        opt.label && opt.label.trim().toLowerCase() !== opt.text.trim().toLowerCase()
          ? `${opt.label}) `
          : "";
      btn.textContent = `${prefix}${toPlain(opt.text)}`;
      if (state.eliminated.has(opt.label)) btn.classList.add("out");
      if (state.selected === opt.label) btn.classList.add("sel");
      if (state.result) {
        const correct =
          String(opt.label).toLowerCase() === String(state.result.correct_answer).toLowerCase();
        if (correct) btn.classList.add("ok");
        if (state.selected === opt.label && !state.result.is_correct) btn.classList.add("bad");
      }
      btn.addEventListener("click", () => {
        if (state.result) return;
        if (!state.eliminated.has(opt.label)) {
          state.selected = opt.label;
          render();
        }
      });
      btn.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        if (state.result) return;
        if (state.eliminated.has(opt.label)) state.eliminated.delete(opt.label);
        else {
          state.eliminated.add(opt.label);
          if (state.selected === opt.label) state.selected = null;
        }
        render();
      });
      btn.title = `${i + 1} seleciona · duplo clique risca`;
      list.appendChild(btn);
    });
    body.appendChild(list);

    const meta = el("p", { className: "meta" });
    const confLabel =
      state.confidence === "seguro"
        ? "seguro"
        : state.confidence === "inseguro"
          ? "inseguro"
          : "chute";
    meta.textContent = `selecionada: ${state.selected || "—"}   confiança: ${confLabel}`;
    body.appendChild(meta);

    const timer = el("div", { className: "timer" });
    timer.appendChild(el("span", { className: "muted" }, "tempo "));
    timer.appendChild(el("span", { className: "timer-val" }, formatTime(nowElapsed())));
    const pauseBtn = el(
      "button",
      { type: "button" },
      state.timerRunning ? "pausar" : "continuar"
    );
    pauseBtn.disabled = Boolean(state.result);
    pauseBtn.addEventListener("click", () => {
      if (state.timerRunning) pauseTimer();
      else resumeTimer();
      render();
    });
    const zeroBtn = el("button", { type: "button" }, "zerar");
    zeroBtn.disabled = Boolean(state.result);
    zeroBtn.addEventListener("click", () => {
      resetTimer();
      render();
    });
    timer.appendChild(pauseBtn);
    timer.appendChild(zeroBtn);
    body.appendChild(timer);

    const actions = el("div", { className: "actions" });
    const ins = el("button", { type: "button" }, "inseguro");
    ins.disabled = Boolean(state.result);
    if (state.confidence === "inseguro") ins.style.fontWeight = "700";
    ins.addEventListener("click", () => {
      state.confidence = state.confidence === "inseguro" ? "seguro" : "inseguro";
      render();
    });
    const ch = el("button", { type: "button" }, "chute");
    ch.disabled = Boolean(state.result);
    if (state.confidence === "chute") ch.style.fontWeight = "700";
    ch.addEventListener("click", () => {
      state.confidence = state.confidence === "chute" ? "seguro" : "chute";
      render();
    });
    const go = el(
      "button",
      { type: "button" },
      state.resolving ? "…" : state.result ? "seguinte" : "enviar"
    );
    go.disabled = state.resolving || (!state.result && !state.selected);
    go.addEventListener("click", () => {
      if (state.result) loadNext();
      else resolve();
    });
    actions.appendChild(ins);
    actions.appendChild(ch);
    actions.appendChild(go);
    const modeBtn = el(
      "button",
      { type: "button" },
      state.textMode === "comment" ? "comentário" : "nota"
    );
    modeBtn.title =
      state.textMode === "comment"
        ? "Comentário vai para o Papa Vagas junto com a resposta"
        : "Nota local. Clique para mudar para comentário (Papa Vagas)";
    if (state.textMode === "comment") modeBtn.style.fontWeight = "700";
    modeBtn.addEventListener("click", () => {
      state.textMode = state.textMode === "comment" ? "note" : "comment";
      render();
    });
    actions.appendChild(modeBtn);
    body.appendChild(actions);

    if (state.result) {
      body.appendChild(
        el(
          "p",
          { className: "meta" },
          state.result.is_correct
            ? `certo · gabarito ${state.result.correct_answer}`
            : `errado · gabarito ${state.result.correct_answer}`
        )
      );
    }

    if (state.notes.length) {
      const ul = el("ul", { className: "notes" });
      state.notes.forEach((n) => {
        const li = el("li");
        li.textContent = n.body;
        ul.appendChild(li);
      });
      body.appendChild(ul);
    }

    const ta = el("textarea", {
      className: "note",
      placeholder:
        state.textMode === "comment"
          ? "comentário papa vagas… vai com enviar"
          : "escreva aqui…  Ctrl+Enter salva nota",
    });
    ta.value = noteVal;
    ta.addEventListener("input", () => {
      if (state.textMode === "comment") state.commentDraft = ta.value;
      else state.noteDraft = ta.value;
    });
    ta.addEventListener("keydown", (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
        ev.preventDefault();
        if (state.textMode === "comment") return;
        sendNote();
      }
    });
    body.appendChild(ta);
    if (keepNote) {
      ta.focus();
      if (noteSel) {
        try {
          ta.setSelectionRange(noteSel.start, noteSel.end);
        } catch {
          /* ignore */
        }
      }
    }
  }

  function renderSource() {
    const box = el("div", { className: "src" });
    const sel = el("select");
    const optO = el("option", { value: "omissas" }, "omissas");
    sel.appendChild(optO);
    state.notebooks.forEach((nb) => {
      const pending = Math.max(0, (nb.question_count || 0) - (nb.answered_count || 0));
      const label = `${nb.name || "caderno"}${pending ? ` (${pending})` : ""}`;
      const o = el("option", { value: `nb:${nb.id}` }, label);
      sel.appendChild(o);
    });
    if (state.source === "omissas") sel.value = "omissas";
    else if (state.notebookId) sel.value = `nb:${state.notebookId}`;
    sel.addEventListener("change", async () => {
      if (sel.value === "omissas") {
        state.source = "omissas";
        await setConfig({ source: "omissas" });
      } else {
        state.source = "notebook";
        state.notebookId = sel.value.slice(3);
        await setConfig({ source: "notebook", notebookId: state.notebookId });
      }
      await loadCurrent();
    });
    box.appendChild(sel);
    const layoutBtn = el(
      "button",
      { type: "button" },
      state.altLayout === "inline" ? "linha" : "lista"
    );
    layoutBtn.title =
      state.altLayout === "inline"
        ? "Alternativas em texto corrido. Clique para empilhar."
        : "Uma alternativa por linha. Clique para colocar na mesma linha.";
    layoutBtn.addEventListener("click", async () => {
      state.altLayout = state.altLayout === "inline" ? "stack" : "inline";
      await setConfig({ altLayout: state.altLayout });
      render();
    });
    box.appendChild(layoutBtn);
    if (state.stats) {
      box.appendChild(
        el("span", { className: "muted" }, `${state.stats.pending ?? "?"} pend.`)
      );
    }
    return box;
  }

  async function loadSession() {
    const cfg = await getConfig();
    state.userId = cfg.userId || "";
    state.appUrl = (cfg.appUrl || "").replace(/\/$/, "");
    state.omissasToken = cfg.omissasToken || "";
    state.source = cfg.source === "omissas" ? "omissas" : "notebook";
    state.notebookId = cfg.notebookId || "";
    state.altLayout = cfg.altLayout === "inline" ? "inline" : "stack";
    if (cfg.overlay) {
      state.left = Number(cfg.overlay.left) || state.left;
      state.top = Number(cfg.overlay.top) || state.top;
      state.pinned = Boolean(cfg.overlay.pinned);
      if (Number(cfg.overlay.width) > 0) state.width = Number(cfg.overlay.width);
      if (Number(cfg.overlay.height) > 0) state.height = Number(cfg.overlay.height);
    }
    applySize();
  }

  async function loadNotebooks() {
    const res = await api("listNotebooks");
    if (!res.ok) {
      state.notebooks = [];
      return;
    }
    state.notebooks = Array.isArray(res.data) ? res.data : [];
    if (!state.notebookId && state.notebooks.length) {
      state.notebookId = state.notebooks[0].id;
      await setConfig({ notebookId: state.notebookId });
    }
  }

  function resetQuestionLocal() {
    state.selected = null;
    state.eliminated = new Set();
    state.confidence = "seguro";
    state.result = null;
    state.resolving = false;
    state.notes = [];
    state.noteDraft = "";
    state.commentDraft = "";
    state.textMode = "note";
    state.elapsedMs = 0;
    state.startedAt = 0;
    state.timerRunning = false;
    if (!state.result) resumeTimer();
  }

  async function loadNotes(questionId) {
    const res = await api("listNotes", { questionId });
    state.notes = res.ok && Array.isArray(res.data?.entries) ? res.data.entries : [];
  }

  async function loadCurrent(nav) {
    state.loading = true;
    state.error = "";
    render();
    try {
      if (state.source === "omissas") await loadOmissasQuestion(nav);
      else await loadNotebookQuestion(nav);
    } catch (err) {
      state.error = err.message || String(err);
      state.question = null;
    } finally {
      state.loading = false;
      render();
      clampPos();
      applyTheme();
    }
  }

  async function loadNotebookQuestion(nav) {
    const res = await api("loadQueue", { notebookId: state.notebookId, nav });
    if (!res.ok) {
      state.error = res.error || "Falha ao carregar.";
      state.question = null;
      return;
    }
    const d = res.data || {};
    state.current = d.current || null;
    state.question = d.question || null;
    state.options = Array.isArray(d.options) ? d.options : [];
    state.stats = d.stats || null;
    resetQuestionLocal();
    if (d.attempt?.selected_answer) {
      state.selected = d.attempt.selected_answer;
      state.confidence = d.attempt.confidence_level || "seguro";
      state.result = {
        is_correct: d.attempt.is_correct,
        correct_answer: state.question?.correct_answer || d.attempt.selected_answer,
      };
      pauseTimer();
    }
    if (state.question?.id) await loadNotes(state.question.id);
  }

  async function loadOmissasQuestion(nav) {
    if (!state.omissasQueue.length || nav === "reload") {
      const res = await api("loadOmissas");
      if (!res.ok) {
        state.error = res.error || "Falha ao carregar omissas.";
        state.question = null;
        state.omissasQueue = [];
        return;
      }
      state.omissasQueue = Array.isArray(res.data?.queue) ? res.data.queue : [];
      state.omissasIndex = 0;
    }
    if (nav === "next") {
      state.omissasIndex = Math.min(state.omissasQueue.length - 1, state.omissasIndex + 1);
    } else if (nav === "unsolved") {
      const from = state.omissasIndex + 1;
      let next = state.omissasQueue.findIndex(
        (q, i) => i >= from && !state.answered[q.question_id]
      );
      if (next < 0) {
        next = state.omissasQueue.findIndex((q) => !state.answered[q.question_id]);
      }
      if (next < 0) {
        state.current = null;
        state.question = null;
        state.options = [];
        state.stats = {
          total: state.omissasQueue.length,
          pending: 0,
          resolved: Object.keys(state.answered).length,
        };
        return;
      }
      state.omissasIndex = next;
    }
    const item = state.omissasQueue[state.omissasIndex];
    if (!item) {
      state.question = null;
      state.current = null;
      state.stats = {
        total: state.omissasQueue.length,
        pending: state.omissasQueue.filter((q) => !state.answered[q.question_id]).length,
      };
      return;
    }
    const qres = await api("loadQuestion", { questionId: item.question_id });
    if (!qres.ok) {
      state.error = qres.error || "Questão não encontrada.";
      state.question = null;
      return;
    }
    state.current = item;
    state.question = qres.data?.question || null;
    state.options = Array.isArray(qres.data?.options) ? qres.data.options : [];
    state.stats = {
      total: state.omissasQueue.length,
      pending: state.omissasQueue.filter((q) => !state.answered[q.question_id]).length,
      resolved: Object.keys(state.answered).length,
    };
    resetQuestionLocal();
    if (state.question?.id) await loadNotes(state.question.id);
  }

  async function resolve() {
    if (!state.question || !state.current || !state.selected || state.result || state.resolving) {
      return;
    }
    state.resolving = true;
    state.error = "";
    render();
    pauseTimer();
    const duration_ms = durationToSend();
    const payload = {
      question_id: state.question.id,
      selected_answer: state.selected,
      duration_ms,
      tec_id: state.current.tec_id,
      notebook_id: state.current.notebook_id || state.notebookId,
      confidence_level: state.confidence,
      comment: (state.commentDraft || "").trim() || null,
    };
    const res =
      state.source === "omissas"
        ? await api("solve", payload)
        : await api("answerNotebook", { ...payload, notebookId: state.notebookId });
    state.resolving = false;
    if (!res.ok) {
      state.error = res.error || "Não enviou.";
      resumeTimer();
      render();
      return;
    }
    state.result = {
      is_correct: res.data.is_correct,
      correct_answer: res.data.correct_answer,
    };
    if (state.source === "omissas") {
      state.answered[state.question.id] = true;
    }
    render();
  }

  async function loadNext() {
    if (state.source === "omissas") await loadCurrent("unsolved");
    else await loadCurrent("unsolved");
  }

  async function sendNote() {
    const text = (state.noteDraft || "").trim();
    if (!text || !state.question) return;
    const res = await api("addNote", { questionId: state.question.id, body: text });
    if (!res.ok) {
      state.error = res.error || "Nota não enviada.";
      render();
      return;
    }
    state.noteDraft = "";
    if (res.data?.entry) state.notes = [...state.notes, res.data.entry];
    render();
  }

  function optionAt(n) {
    return state.options[n] || null;
  }

  function onKey(e) {
    if (!state.visible) return;
    const t = e.target;
    const typing = t && (t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.tagName === "INPUT");
    if (e.key === "Escape") {
      e.preventDefault();
      hide();
      return;
    }
    if (typing) return;
    if (!state.hover && shadow.activeElement === body) {
      /* still allow when focused inside */
    }
    if (!state.hover && !wrap.contains(shadow.activeElement)) return;

    if (e.key >= "1" && e.key <= "9" && !state.result) {
      const opt = optionAt(Number(e.key) - 1);
      if (opt && !state.eliminated.has(opt.label)) {
        state.selected = opt.label;
        e.preventDefault();
        render();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (state.result) loadNext();
      else resolve();
    } else if (e.key === "i" || e.key === "I") {
      if (!state.result) {
        state.confidence = state.confidence === "inseguro" ? "seguro" : "inseguro";
        e.preventDefault();
        render();
      }
    } else if (e.key === "c" || e.key === "C") {
      if (!state.result) {
        state.confidence = state.confidence === "chute" ? "seguro" : "chute";
        e.preventDefault();
        render();
      }
    } else if (e.key === "n" || e.key === "N") {
      const ta = body.querySelector("textarea.note");
      if (ta) {
        e.preventDefault();
        ta.focus();
      }
    }
  }

  function onDocKey(e) {
    if (!state.visible) return;
    if (!state.hover && shadow && !wrap.contains(shadow.activeElement)) return;
    onKey(e);
  }

  async function show() {
    await ensureDom();
    await loadSession();
    state.visible = true;
    shell.classList.remove("hidden");
    wrap.tabIndex = -1;
    document.removeEventListener("keydown", onDocKey, true);
    document.addEventListener("keydown", onDocKey, true);
    renderBar();
    render();
    clampPos();
    applyTheme();
    wrap.focus({ preventScroll: true });
    const alreadyLoaded = Boolean(state.question);
    if (state.userId) {
      await loadNotebooks();
      if (alreadyLoaded) {
        render();
        if (!state.result) resumeTimer();
      } else {
        await loadCurrent();
      }
    } else {
      render();
    }
  }

  function hide() {
    pauseTimer();
    state.visible = false;
    clearTimeout(state.hideTimer);
    document.removeEventListener("keydown", onDocKey, true);
    if (shell) shell.classList.add("hidden");
  }

  async function toggle() {
    await ensureDom();
    if (state.visible) hide();
    else await show();
  }

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg?.type === "TOGGLE") {
      toggle().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg?.type === "SHOW") {
      show().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg?.type === "HIDE") {
      hide();
      sendResponse({ ok: true });
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.userId) state.userId = changes.userId.newValue || "";
    if (changes.appUrl) state.appUrl = String(changes.appUrl.newValue || "").replace(/\/$/, "");
    if (changes.omissasToken) state.omissasToken = changes.omissasToken.newValue || "";
    if (changes.altLayout) {
      state.altLayout = changes.altLayout.newValue === "inline" ? "inline" : "stack";
      if (state.visible) render();
    }
    if (state.visible && changes.userId && state.userId && !state.question) {
      loadNotebooks().then(() => loadCurrent());
    }
  });
})();
