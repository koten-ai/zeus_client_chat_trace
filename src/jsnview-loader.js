const JSNVIEW_URL = "https://cdn.jsdelivr.net/npm/jsnview@3.0.0/dist/index.umd.js";

let loadPromise = null;

export function loadJsnview() {
  if (window.jsnview) return Promise.resolve(window.jsnview);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${JSNVIEW_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.jsnview));
      existing.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = JSNVIEW_URL;
    script.async = true;
    script.onload = () => resolve(window.jsnview);
    script.onerror = () => reject(new Error("Failed to load jsnview"));
    document.head.appendChild(script);
  }).catch((err) => {
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}