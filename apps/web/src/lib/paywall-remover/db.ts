// src/lib/paywall-remover/db.ts
import type { Article } from './types'

const DB_NAME = 'paywall-remover'
const DB_VERSION = 1
const STORE = 'articles'

function fail(source: { error: DOMException | null }): Error {
  return source.error ?? new Error('indexeddb')
}

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: 'id' }).createIndex(
          'savedAt',
          'savedAt'
        )
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(fail(request))
    request.onblocked = () => reject(new Error('indexeddb'))
  })
}

function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(fail(tx))
    tx.onabort = () => reject(fail(tx))
  })
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(fail(req))
  })
}

async function write(run: (store: IDBObjectStore) => void): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    run(tx.objectStore(STORE))
    await committed(tx)
  } finally {
    db.close()
  }
}

export async function readAll(): Promise<Article[]> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const all = await request(
      tx.objectStore(STORE).getAll() as IDBRequest<Article[]>
    )
    await committed(tx)
    return all
  } finally {
    db.close()
  }
}

export function put(article: Article): Promise<void> {
  return write((store) => store.put(article))
}

export function del(id: string): Promise<void> {
  return write((store) => store.delete(id))
}

export function clearAll(): Promise<void> {
  return write((store) => store.clear())
}
