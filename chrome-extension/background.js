const STORAGE_DEFAULTS = {
  appUrl: "",
  userId: "",
  omissasToken: "",
  source: "notebook",
  notebookId: "",
  overlay: { left: 24, top: 72, pinned: false, width: 380, height: 0 },
  altLayout: "stack",
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (cur) => {
    const patch = {};
    for (const [k, v] of Object.entries(STORAGE_DEFAULTS)) {
      if (cur[k] === undefined) patch[k] = v;
    }
    if (Object.keys(patch).length) chrome.storage.local.set(patch);
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-stealth") toggleOnActiveTab();
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) sendOrInject(tab.id, { type: "TOGGLE" });
});

async function toggleOnActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await sendOrInject(tab.id, { type: "TOGGLE" });
}

async function sendOrInject(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content/overlay.js"],
      });
      await chrome.tabs.sendMessage(tabId, message);
    } catch {
      /* chrome://, Web Store, PDF viewer, etc. */
    }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "API") {
    handleApi(msg)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }
  if (msg.type === "GET_CONFIG") {
    chrome.storage.local.get(null).then(sendResponse);
    return true;
  }
  if (msg.type === "SET_CONFIG") {
    chrome.storage.local.set(msg.payload || {}).then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function handleApi(msg) {
  const cfg = await chrome.storage.local.get([
    "appUrl",
    "userId",
    "omissasToken",
    "notebookId",
    "source",
  ]);
  const appUrl = String(cfg.appUrl || "").replace(/\/$/, "");
  const userId = String(cfg.userId || "");
  if (!appUrl) return { ok: false, error: "Configure a URL do app nas opções da extensão." };
  if (!userId && msg.action !== "ping") {
    return { ok: false, error: "Faça login no site e recarregue esta aba." };
  }

  switch (msg.action) {
    case "ping":
      return { ok: true, data: { appUrl, userId: Boolean(userId) } };
    case "listNotebooks":
      return jsonGet(appUrl, `/api/notebooks?user_id=${encodeURIComponent(userId)}`);
    case "loadQueue": {
      const notebookId = msg.notebookId || cfg.notebookId;
      if (!notebookId) return { ok: false, error: "Escolha um caderno." };
      const params = new URLSearchParams({ user_id: userId });
      if (msg.nav) params.set("nav", msg.nav);
      return jsonGet(appUrl, `/api/notebooks/${notebookId}/queue?${params}`);
    }
    case "answerNotebook": {
      const notebookId = msg.notebookId || cfg.notebookId;
      if (!notebookId) return { ok: false, error: "Escolha um caderno." };
      return jsonPost(appUrl, `/api/notebooks/${notebookId}/answer`, {
        user_id: userId,
        question_id: msg.question_id,
        selected_answer: msg.selected_answer,
        duration_ms: asDurationMs(msg.duration_ms),
        tec_id: msg.tec_id,
        confidence_level: msg.confidence_level || "seguro",
        note_draft: msg.note_draft ?? msg.comment ?? null,
      });
    }
    case "loadOmissas": {
      const token = msg.token || cfg.omissasToken;
      if (!token) {
        return {
          ok: false,
          error: "Abra as omissas no site uma vez (link com token) para sincronizar.",
        };
      }
      return jsonGet(
        appUrl,
        `/api/quiz-sync/omissas?t=${encodeURIComponent(token)}&user_id=${encodeURIComponent(userId)}`
      );
    }
    case "loadQuestion": {
      if (!msg.questionId) return { ok: false, error: "Questão ausente." };
      return jsonGet(
        appUrl,
        `/api/questions/${encodeURIComponent(msg.questionId)}?user_id=${encodeURIComponent(userId)}`
      );
    }
    case "solve":
      return jsonPost(appUrl, "/api/quiz-sync/solve", {
        user_id: userId,
        question_id: msg.question_id,
        notebook_id: msg.notebook_id || null,
        selected_answer: msg.selected_answer,
        duration_ms: asDurationMs(msg.duration_ms),
        confidence_level: msg.confidence_level || "seguro",
        note_draft: msg.note_draft ?? msg.comment ?? null,
      });
    case "listNotes": {
      if (!msg.questionId) return { ok: false, error: "Questão ausente." };
      return jsonGet(
        appUrl,
        `/api/questions/${encodeURIComponent(msg.questionId)}/notes?user_id=${encodeURIComponent(userId)}`
      );
    }
    case "addNote": {
      if (!msg.questionId) return { ok: false, error: "Questão ausente." };
      return jsonPost(appUrl, `/api/questions/${encodeURIComponent(msg.questionId)}/notes`, {
        user_id: userId,
        body: msg.body,
      });
    }
    default:
      return { ok: false, error: "Ação desconhecida." };
  }
}

function asDurationMs(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function jsonGet(appUrl, path) {
  return parseRes(
    await fetch(`${appUrl}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    })
  );
}

async function jsonPost(appUrl, path, body) {
  return parseRes(
    await fetch(`${appUrl}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

async function parseRes(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, error: data.error || `HTTP ${res.status}`, data };
  }
  return { ok: true, status: res.status, data };
}
