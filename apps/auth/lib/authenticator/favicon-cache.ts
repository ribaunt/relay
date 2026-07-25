const DB_NAME = "relay-favicons"
const STORE_NAME = "favicons"
const CACHE_SIZE_LIMIT = 100

function extractDomain(site: string): string | null {
  const domain = site.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim()
  return domain || null
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getFromDb(domain: string): Promise<string | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(domain)
    req.onsuccess = () => {
      resolve(req.result ?? undefined)
      db.close()
    }
    req.onerror = () => {
      reject(req.error)
      db.close()
    }
  })
}

async function setInDb(domain: string, dataUrl: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    store.put(dataUrl, domain)
    tx.oncomplete = () => {
      pruneCache(store)
      resolve()
      db.close()
    }
    tx.onerror = () => {
      reject(tx.error)
      db.close()
    }
  })
}

async function pruneCache(store: IDBObjectStore): Promise<void> {
  const countReq = store.count()
  countReq.onsuccess = () => {
    if (countReq.result > CACHE_SIZE_LIMIT) {
      store.clear()
    }
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

const memoryCache = new Map<string, string>()
const pendingFetches = new Map<string, Promise<string | null>>()

export async function getCachedFavicon(site: string | null): Promise<string | null> {
  if (!site) return null
  const domain = extractDomain(site)
  if (!domain) return null

  const cached = memoryCache.get(domain)
  if (cached) return cached

  const stored = await getFromDb(domain)
  if (stored) {
    memoryCache.set(domain, stored)
    return stored
  }

  const pending = pendingFetches.get(domain)
  if (pending) return pending

  const fetchPromise = fetchAndCache(domain)
  pendingFetches.set(domain, fetchPromise)
  return fetchPromise
}

async function fetchAndCache(domain: string): Promise<string | null> {
  try {
    const url = `https://favicon.vemetric.com/${encodeURIComponent(domain)}?size=64`
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    const dataUrl = await blobToDataUrl(blob)
    memoryCache.set(domain, dataUrl)
    await setInDb(domain, dataUrl)
    return dataUrl
  } catch {
    return null
  } finally {
    pendingFetches.delete(domain)
  }
}
