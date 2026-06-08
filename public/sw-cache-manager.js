const LEGACY_AUDIO_PATTERNS = ["sounds", "audio", "media"];

async function clearLegacyAudioCaches() {
  const cacheNames = await caches.keys();
  const matchedCacheNames = cacheNames.filter((cacheName) =>
    LEGACY_AUDIO_PATTERNS.some((pattern) => cacheName.toLowerCase().includes(pattern)),
  );

  await Promise.all(matchedCacheNames.map((cacheName) => caches.delete(cacheName)));

  const remainingCacheNames = await caches.keys();
  await Promise.all(
    remainingCacheNames.map(async (cacheName) => {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      await Promise.all(
        requests
          .filter((request) => /\.mp3(\?.*)?$/i.test(request.url) || request.url.includes("/sounds/"))
          .map((request) => cache.delete(request)),
      );
    }),
  );
}

self.addEventListener("activate", (event) => {
  event.waitUntil(clearLegacyAudioCaches());
});
