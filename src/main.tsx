import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

/* PWA: register the service worker only where supported — a failed
 * registration must never affect the app itself. */
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* offline-first data lives in storage regardless; the SW is an enhancement */
    });
  });
}
