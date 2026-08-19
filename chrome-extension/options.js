const appUrl = document.getElementById("appUrl");
const source = document.getElementById("source");
const altLayout = document.getElementById("altLayout");
const status = document.getElementById("status");
const saved = document.getElementById("saved");

chrome.storage.local.get(["appUrl", "source", "userId", "omissasToken", "altLayout"], (cfg) => {
  appUrl.value = cfg.appUrl || "";
  source.value = cfg.source === "omissas" ? "omissas" : "notebook";
  altLayout.value = cfg.altLayout === "inline" ? "inline" : "stack";
  const bits = [];
  bits.push(cfg.userId ? "sessão ok" : "ainda sem login");
  bits.push(cfg.omissasToken ? "token de omissas ok" : "sem token de omissas");
  status.textContent = bits.join(" · ");
});

document.getElementById("save").addEventListener("click", () => {
  const url = appUrl.value.trim().replace(/\/$/, "");
  chrome.storage.local.set(
    {
      appUrl: url,
      source: source.value === "omissas" ? "omissas" : "notebook",
      altLayout: altLayout.value === "inline" ? "inline" : "stack",
    },
    () => {
      saved.hidden = false;
      setTimeout(() => {
        saved.hidden = true;
      }, 1500);
    }
  );
});
