// Client-only. Offline Video & Audio Download Manager (Premium & Family Tier: "Downloads where available")
export interface DownloadedItem {
  videoId: string;
  title: string;
  channelTitle: string;
  posterUrl: string;
  duration: number;
  mediaUrl: string;
  sizeBytes: number;
  downloadedAt: string;
  quality?: string;
}

const DB_NAME = "nexus_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "downloads";
const CACHE_NAME = "nx-offline-media-v1";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB is not supported in this environment"));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "videoId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function isDownloaded(videoId: string): Promise<boolean> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(videoId);
      req.onsuccess = () => resolve(Boolean(req.result));
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function getDownloadedVideos(): Promise<DownloadedItem[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function downloadVideo(
  video: {
    id: string;
    title: string;
    channelTitle: string;
    posterUrl: string;
    duration: number;
    mediaUrl: string;
    quality?: string;
  },
  onProgress?: (progressPercent: number) => void,
): Promise<DownloadedItem> {
  if (typeof window === "undefined" || !("caches" in window)) {
    throw new Error("Offline downloads are not supported by this browser.");
  }

  // 1. Fetch media with progress tracking
  const response = await fetch(video.mediaUrl);
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get("content-length");
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
  let receivedBytes = 0;

  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedBytes += value.length;
        if (totalBytes > 0 && onProgress) {
          const pct = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
          onProgress(pct);
        }
      }
    }
  }

  // 2. Combine chunks into Blob
  const blob = new Blob(chunks as BlobPart[], { type: response.headers.get("content-type") || "video/mp4" });
  const actualSize = blob.size;

  // 3. Put in CacheStorage
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = `/offline/media/${video.id}`;
  await cache.put(
    cacheKey,
    new Response(blob, {
      headers: {
        "Content-Type": blob.type,
        "Content-Length": String(actualSize),
      },
    }),
  );

  // 4. Save metadata in IndexedDB
  const item: DownloadedItem = {
    videoId: video.id,
    title: video.title,
    channelTitle: video.channelTitle,
    posterUrl: video.posterUrl,
    duration: video.duration,
    mediaUrl: cacheKey,
    sizeBytes: actualSize,
    downloadedAt: new Date().toISOString(),
    quality: video.quality || "Original",
  };

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  if (onProgress) onProgress(100);
  return item;
}

export async function removeDownload(videoId: string): Promise<boolean> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(videoId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    if ("caches" in window) {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(`/offline/media/${videoId}`);
    }

    return true;
  } catch {
    return false;
  }
}

export async function getOfflinePlaybackUrl(videoId: string): Promise<string | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null;

  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(`/offline/media/${videoId}`);
    if (!cachedResponse) return null;

    const blob = await cachedResponse.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function getTotalOfflineSize(): Promise<number> {
  const items = await getDownloadedVideos();
  return items.reduce((acc, item) => acc + (item.sizeBytes || 0), 0);
}

export async function clearAllDownloads(): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    if ("caches" in window) {
      await caches.delete(CACHE_NAME);
    }
  } catch (err) {
    console.error("Failed to clear offline downloads:", err);
  }
}
