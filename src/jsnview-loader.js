// Match zeus_client CDN path. index.umd.js does not exist for jsnview@3.0.0 (404).
export const JSNVIEW_URL = "https://cdn.jsdelivr.net/npm/jsnview@3.0.0/dist/index.min.js";

let loadPromise = null;

/** Test helper — reset module-level cache between unit tests. */
export function __resetJsnviewLoaderForTests() {
  loadPromise = null;
}

/**
 * Load jsnview from CDN (or reuse window.jsnview).
 * Must not hang if a previous inject 404'd and left a dead script tag.
 */
export function loadJsnview() {
  if (window.jsnview) return Promise.resolve(window.jsnview);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const succeed = () => {
      if (window.jsnview) {
        resolve(window.jsnview);
        return;
      }
      loadPromise = null;
      reject(new Error("jsnview loaded but window.jsnview is missing"));
    };

    const fail = (msg) => {
      loadPromise = null;
      reject(new Error(msg || "Failed to load jsnview"));
    };

    // Drop tags that already failed so we can re-inject.
    document.querySelectorAll(`script[src="${JSNVIEW_URL}"]`).forEach((s) => {
      if (s.dataset.jsnviewFailed === "1") {
        try {
          s.remove();
        } catch {
          /* ignore */
        }
      }
    });

    const existing = document.querySelector(`script[src="${JSNVIEW_URL}"]`);
    if (existing) {
      if (window.jsnview) {
        succeed();
        return;
      }
      const onLoad = () => {
        existing.removeEventListener("error", onErr);
        succeed();
      };
      const onErr = () => {
        existing.dataset.jsnviewFailed = "1";
        existing.removeEventListener("load", onLoad);
        try {
          existing.remove();
        } catch {
          /* ignore */
        }
        fail("Failed to load jsnview");
      };
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", onErr);
      // Already finished before listeners (e.g. cached 404): no events fire → hang.
      // If the tag is already complete without a global, treat as failure.
      if (existing.dataset.loaded === "1") {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onErr);
        existing.dataset.jsnviewFailed = "1";
        try {
          existing.remove();
        } catch {
          /* ignore */
        }
        injectScript(succeed, fail);
      }
      return;
    }

    injectScript(succeed, fail);
  });

  return loadPromise;
}

function injectScript(succeed, fail) {
  const script = document.createElement("script");
  script.src = JSNVIEW_URL;
  script.async = true;
  script.onload = () => {
    script.dataset.loaded = "1";
    succeed();
  };
  script.onerror = () => {
    script.dataset.jsnviewFailed = "1";
    try {
      script.remove();
    } catch {
      /* ignore */
    }
    fail("Failed to load jsnview");
  };
  document.head.appendChild(script);
}
