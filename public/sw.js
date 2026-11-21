/* LearnProgramming PWA service worker
 *
 * Strategy:
 *  - Shell assets (/_next/static/**, /media/**, fonts, manifest, icons): cache-first (immutable, hashed).
 *  - During install, the "/" document's full dependency graph (JS/CSS/fonts) is precached so the
 *    app shell ALWAYS opens offline — even on a brand-new device that has never visited a lesson.
 *  - After activate, the worker warms the ENTIRE course from /offline-routes.json so every lesson
 *    (HTML, JS/CSS chunks, fonts, RSC payload) is available without a connection. Warming is
 *    resumable: every page load asks the worker to continue until everything is cached.
 *  - Nav / document requests: network-first with timeout, fallback to cached page → /offline → home.
 *  - RSC payload requests (App Router client-side navigation): network-first with timeout,
 *    fallback to cached flight payload (keyed by pathname, ignoring ?_rsc=) → "/" flight → error.
 */

"use strict";

const VERSION = "1.1.0";
const PREFIX = "learn-programming";
const SHELL_CACHE = `${PREFIX}-shell-${VERSION}`;
const PAGES_CACHE = `${PREFIX}-pages-${VERSION}`;
const RSC_CACHE = `${PREFIX}-rsc-${VERSION}`;
const ROUTES_URL = "/offline-routes.json";
const OFFLINE_URL = "/offline";
const NETWORK_TIMEOUT = 4000;
const WARM_CONCURRENCY = 5;

const PRECACHE = [
  "/",
  OFFLINE_URL,
  ROUTES_URL,
  "/site.webmanifest",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/apple-touch-icon.png",
  "/favicon.svg",
];

/* ---------- helpers ---------- */

function isNavigationRequest(request) {
  return request.mode === "navigate" && request.method === "GET";
}

function isSameOrigin(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin;
}

function isRscRequest(request) {
  const url = new URL(request.url);
  return (
    request.headers.get("RSC") === "1" ||
    url.searchParams.has("_rsc") ||
    request.headers.get("Accept")?.includes("text/x-component")
  );
}

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/media/") ||
    url.pathname === "/search-index.json" ||
    url.pathname === ROUTES_URL ||
    url.pathname === "/site.webmanifest" ||
    url.pathname === "/og-image.png"
  );
}

function timeoutFirst(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("SW network timeout")), ms)
    ),
  ]);
}

function pathKey(url) {
  return new URL(url).pathname;
}

function extractStaticUrls(html, baseUrl) {
  const urls = new Set();
  const re = /(?:src|href)=["'](\/_next\/static\/[^"']+?)["']/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      urls.add(new URL(m[1], baseUrl).toString());
    } catch {
      /* ignore */
    }
  }
  return [...urls];
}

function extractFontUrls(cssText, baseUrl) {
  const urls = new Set();
  const re = /url\(["']?(\/_next\/static\/media\/[^"')]+)["']?\)/g;
  let m;
  while ((m = re.exec(cssText))) {
    try {
      urls.add(new URL(m[1], baseUrl).toString());
    } catch {
      /* ignore */
    }
  }
  return [...urls];
}

async function fetchWithBody(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed ${url} (${res.status})`);
  return { res, text: await res.clone().text() };
}

/* ---------- install / activate ---------- */

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        PRECACHE.map((u) =>
          fetch(u).then((res) => {
            if (res.ok) return shell.put(u, res);
          })
        )
      );
      await cacheShellGraph();
      await self.skipWaiting();
    })()
  );
});

async function cacheShellGraph() {
  try {
    const cache = await caches.open(SHELL_CACHE);
    const r = await fetch("/");
    if (!r.ok) return;
    await cache.put("/", r.clone());
    const html = await r.text();
    const base = self.location.href;

    await Promise.allSettled(
      extractStaticUrls(html, base).map(async (u) => {
        if (await cache.match(u, { ignoreVary: true })) return;
        const res = await fetch(u);
        if (!res.ok) return;
        await cache.put(u, res.clone());
        if (u.endsWith(".css")) {
          const cssText = await res.text();
          await Promise.allSettled(
            extractFontUrls(cssText, u).map(async (f) => {
              if (await cache.match(f, { ignoreVary: true })) return;
              const fres = await fetch(f);
              if (fres.ok) await cache.put(f, fres);
            })
          );
        }
      })
    );
  } catch {
    /* shell graph is best-effort; warm-up + runtime caching still cover it */
  }
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(PREFIX) && !k.endsWith(VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
      warmCourse();
    })()
  );
});

/* ---------- background course warm-up ---------- */

let warmRunning = false;

async function warmCourse() {
  if (warmRunning) return;
  warmRunning = true;

  try {
    const routes = await loadRoutes();
    const pages = await caches.open(PAGES_CACHE);
    const assets = await caches.open(SHELL_CACHE);
    const rsc = await caches.open(RSC_CACHE);

    let index = 0;
    const worker = async () => {
      while (index < routes.length) {
        const url = routes[index++];
        if ((await pages.match(url)) && (await rsc.match(url))) continue;
        await warmRoute(url, pages, assets, rsc);
      }
    };

    await Promise.all(Array.from({ length: WARM_CONCURRENCY }, worker));
  } catch {
    // Warming is best-effort; sw served pages still work via runtime caching.
  } finally {
    warmRunning = false;
  }
}

async function loadRoutes() {
  const routes = await fetch(ROUTES_URL).then((r) => r.json());
  return [OFFLINE_URL, ...routes.filter((r) => r !== OFFLINE_URL)];
}

async function warmRoute(url, pages, assets, rsc) {
  // 1) Full HTML document (navigation response)
  const cachedPage = await pages.match(url);
  let html = "";
  if (cachedPage) {
    html = await cachedPage.text();
  } else {
    try {
      const { res, text } = await fetchWithBody(url);
      await pages.put(url, res.clone());
      html = text;
    } catch {
      return; // unreachable now — skip
    }
  }

  // 2) JS/CSS chunk files referenced by the page
  await Promise.allSettled(
    extractStaticUrls(html, url).map(async (assetUrl) => {
      if (await assets.match(assetUrl, { ignoreVary: true })) return;
      try {
        const { res, text } = await fetchWithBody(assetUrl);
        await assets.put(assetUrl, res.clone());
        // 3) Font files referenced inside CSS
        if (assetUrl.endsWith(".css")) {
          await Promise.allSettled(
            extractFontUrls(text, assetUrl).map(async (fontUrl) => {
              if (await assets.match(fontUrl, { ignoreVary: true })) return;
              try {
                const fres = await fetch(fontUrl);
                if (fres.ok) await assets.put(fontUrl, fres);
              } catch {
                /* noop */
              }
            })
          );
        }
      } catch {
        /* noop */
      }
    })
  );

  // 4) RSC flight payload for client-side navigation offline — only store real flight,
  //    never the HTML document (guard against servers that ignore the RSC header).
  try {
    const rscRes = await fetch(url, {
      headers: { RSC: "1", Accept: "text/x-component" },
    });
    const ct = rscRes.headers.get("content-type") || "";
    if (rscRes.ok && ct.includes("text/x-component")) {
      await rsc.put(pathKey(url), rscRes);
    }
  } catch {
    /* noop */
  }
}

/* ---------- fetch ---------- */

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !isSameOrigin(request)) return;

  const url = new URL(request.url);

  // App shell & hashed assets → cache-first
  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(request, { ignoreVary: true });
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })()
    );
    return;
  }

  // App Router flight payloads → network-first, fallback cached payload → "/" flight
  if (isRscRequest(request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RSC_CACHE);
        const key = pathKey(request.url);
        try {
          const res = await timeoutFirst(fetch(request), NETWORK_TIMEOUT);
          if (res.ok) cache.put(key, res.clone());
          return res;
        } catch {
          const cached = await cache.match(key, { ignoreVary: true });
          if (cached) return cached;
          const home = await cache.match("/", { ignoreVary: true });
          return home || Response.error();
        }
      })()
    );
    return;
  }

  // Navigations → network-first, fallback cached HTML → /offline → home
  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES_CACHE);
        try {
          const res = await timeoutFirst(fetch(request), NETWORK_TIMEOUT);
          if (res.ok && res.status === 200) cache.put(request, res.clone());
          return res;
        } catch {
          const cached = await cache.match(request, { ignoreVary: true });
          if (cached) return cached;
          const shell = await caches.open(SHELL_CACHE);
          const offline = await shell.match(OFFLINE_URL, { ignoreVary: true });
          if (offline) return offline;
          const home = await shell.match("/", { ignoreVary: true });
          if (home) return home;
          return new Response("You are offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }
      })()
    );
    return;
  }

  // Other same-origin GET (e.g. search, api-less) → network-first, cache fallback
  event.respondWith(
    (async () => {
      try {
        return await timeoutFirst(fetch(request), NETWORK_TIMEOUT);
      } catch {
        const cache = await caches.open(PAGES_CACHE);
        const cached = await cache.match(request);
        return cached || Response.error();
      }
    })()
  );
});

/* ---------- messaging (trigger warm-up, report status) ---------- */

function postStatus(status) {
  self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      client.postMessage({ type: "PWA_STATUS", status });
    }
  });
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "WARM") {
    event.waitUntil(
      (async () => {
        postStatus("warming");
        await warmCourse();
        postStatus("ready");
      })()
    );
  }
  if (event.data && event.data.type === "GET_STATUS") {
    event.ports?.[0]?.postMessage({ type: "PWA_STATUS", status: warmRunning ? "warming" : "ready" });
  }
});