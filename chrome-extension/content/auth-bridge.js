(() => {
  if (window.__rascunhoAuthBridge) return;
  window.__rascunhoAuthBridge = true;

  function readSupabaseUserId() {
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith("sb-") || !key.includes("auth-token")) continue;
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        const user = parsed?.user || parsed?.currentSession?.user;
        if (user?.id) return String(user.id);
      }
    } catch {
      /* ignore */
    }
    return "";
  }

  function looksLikeApp() {
    const path = location.pathname || "";
    return (
      path.startsWith("/questoes") ||
      path.startsWith("/login") ||
      path.startsWith("/register") ||
      path.startsWith("/cadernos") ||
      (Boolean(document.querySelector('input[type="password"]')) && path.includes("login"))
    );
  }

  function omissasTokenFromUrl() {
    if (!location.pathname.includes("/questoes/omissas")) return "";
    const params = new URLSearchParams(location.search);
    return params.get("t") || params.get("token") || "";
  }

  async function sync() {
    const userId = readSupabaseUserId();
    const token = omissasTokenFromUrl();
    const cfg = await chrome.storage.local.get(["appUrl", "userId", "omissasToken"]);
    const patch = {};

    const origin = location.origin;
    const known = String(cfg.appUrl || "").replace(/\/$/, "");

    if (userId && (looksLikeApp() || known === origin)) {
      if (cfg.userId !== userId) patch.userId = userId;
      if (!known || known === origin) patch.appUrl = origin;
    }

    if (!userId && known === origin && cfg.userId) {
      patch.userId = "";
    }

    if (token && token !== cfg.omissasToken) patch.omissasToken = token;

    if (Object.keys(patch).length) {
      await chrome.storage.local.set(patch);
    }
  }

  sync();
  window.addEventListener("storage", sync);
  setInterval(sync, 4000);
})();
