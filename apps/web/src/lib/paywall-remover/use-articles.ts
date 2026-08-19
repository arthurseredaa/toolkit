'use client'

import { useEffect, useSyncExternalStore } from 'react'

import { articleStore, type StoreStatus } from './store'

const LOADING = (): StoreStatus => 'loading'

export function useArticles() {
  const store = articleStore()

  const articles = useSyncExternalStore(store.subscribe, store.all, store.all)
  const status = useSyncExternalStore(store.subscribe, store.status, LOADING)

  useEffect(() => {
    if (store.status() === 'loading') void store.load()
  }, [store])

  return { articles, status, store }
}
