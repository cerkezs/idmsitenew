const CACHE_NAME = 'idm-teklif-v2';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './firebase.js',
  './html2pdf.bundle.min.js',
  './logo.png',
  './kase.png',
  './simza.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Eski cache'leri temizle
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
});

self.addEventListener('fetch', event => {
  // Firebase ve Firestore isteklerini cache'e alma (bunlar HTTPS api istekleridir)
  if (event.request.url.includes('firestore.googleapis.com') || event.request.url.includes('firebase')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Gelen güncel yanıtı cache'e de kaydet
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        return response; // İnternetten güncel sürümü döndür
      })
      .catch(() => {
        return caches.match(event.request); // İnternet yoksa cache'den döndür
      })
  );
});
