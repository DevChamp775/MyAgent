// Simple offline cache for Fresh AI Agent
const CACHE_NAME = "fresh-agent-cache-v1";

// Add anything static here that you want cached
const ASSETS_TO_CACHE = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Clean up old caches if you change CACHE_NAME
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
});

// Try network first, fall back to cache for the shell
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Don't cache API requests to the AI backend
  if (request.url.includes("/api/agent")) {
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
