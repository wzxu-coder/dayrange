const CACHE_NAME = "dayrange-offline-v1";

function basePath() {
  return self.location.pathname.replace(/\/service-worker\.js$/, "");
}

function withBase(path) {
  const base = basePath();
  return `${base}${path}`;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll([
          withBase("/"),
          withBase("/index.html"),
          withBase("/manifest.webmanifest"),
          withBase("/dayrange-icon.svg"),
        ])
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(`${basePath()}/`)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(withBase("/"), copy);
            cache.put(withBase("/index.html"), response.clone());
          });
          return response;
        })
        .catch(() => caches.match(withBase("/index.html")).then((cached) => cached || caches.match(withBase("/"))))
    );
    return;
  }

  if (url.pathname.includes("/_expo/") || url.pathname.includes("/assets/") || url.pathname.endsWith(".svg")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        });
      })
    );
  }
});
