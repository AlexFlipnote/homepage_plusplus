const DB_NAME = "hpp_backgrounds"
const STORE = "images"

let _db = null

async function openDb() {
  if (_db) return _db
  _db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { autoIncrement: true })
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = e => reject(e.target.error)
  })
  return _db
}

export async function bgGetAll() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const results = []
    const req = db.transaction(STORE).objectStore(STORE).openCursor()
    req.onsuccess = e => {
      const cursor = e.target.result
      if (cursor) { results.push({ id: cursor.key, blob: cursor.value }); cursor.continue() }
      else resolve(results)
    }
    req.onerror = e => reject(e.target.error)
  })
}

export async function bgPut(blob) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).add(blob)
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = e => reject(e.target.error)
  })
}

export async function bgDelete(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id)
    req.onsuccess = () => resolve()
    req.onerror = e => reject(e.target.error)
  })
}

export async function bgClear() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).clear()
    req.onsuccess = () => resolve()
    req.onerror = e => reject(e.target.error)
  })
}
