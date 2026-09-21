export function setupPWA(notify) {
  const install = document.createElement("button");
  install.className = "text-button";
  install.textContent = "Install Manyhands";
  install.hidden = true;
  document.querySelector("#help-dialog").append(install);
  let prompt;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    prompt = e;
    install.hidden = false;
  });
  install.onclick = async () => {
    await prompt?.prompt();
    prompt = null;
    install.hidden = true;
  };
  if (
    /iPhone|iPad|iPod/.test(navigator.userAgent) &&
    !matchMedia("(display-mode: standalone)").matches
  ) {
    const hint = document.createElement("p");
    hint.className = "fine";
    hint.textContent =
      "On iPhone or iPad: Safari → Share → Add to Home Screen.";
    document.querySelector("#help-dialog").append(hint);
  }
  const status = () => {
    document.body.classList.toggle("offline", !navigator.onLine);
    if (!navigator.onLine)
      notify(
        "Offline. Your own island still works; shared islands need a connection.",
      );
  };
  window.addEventListener("offline", status);
  window.addEventListener("online", () => {
    document.body.classList.remove("offline");
    notify("Back online.");
  });
  status();
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + "sw.js")
      .then((reg) => {
        function ready() {
          if (!reg.waiting || document.querySelector(".update-button")) return;
          const b = document.createElement("button");
          b.textContent = "Update ready · reload";
          b.className = "update-button";
          b.onclick = () => {
            sessionStorage.setItem("manyhands-updating", "yes");
            reg.waiting?.postMessage("SKIP_WAITING");
          };
          document.body.append(b);
        }
        ready();
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            )
              ready();
          });
        });
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (sessionStorage.getItem("manyhands-updating")) {
            sessionStorage.removeItem("manyhands-updating");
            location.reload();
          }
        });
      })
      .catch(() =>
        notify(
          "Offline installation could not finish. You can still play online.",
        ),
      );
  }
}
