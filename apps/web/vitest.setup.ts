import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

export function setMatchMedia(prefersReducedMotion: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion')
        ? prefersReducedMotion
        : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    })
  })
}

beforeEach(() => {
  setMatchMedia(false)
})

afterEach(() => {
  cleanup()
})

if (typeof URL.createObjectURL !== 'function') {
  let n = 0
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    configurable: true,
    value: () => `blob:jsdom/${n++}`
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    configurable: true,
    value: () => {}
  })
}

// jsdom's Blob has no `stream()`. client-zip polyfills it as
// `new Response(this).body`, and undici's Response reads a Blob by calling
// `stream()` — the polyfill calls itself until the stack blows
// (`RangeError: Maximum call stack size exceeded`). Define a real one first,
// from `arrayBuffer()`, which jsdom does implement.
if (!('stream' in Blob.prototype)) {
  Object.defineProperty(Blob.prototype, 'stream', {
    writable: true,
    configurable: true,
    value(this: Blob) {
      return new ReadableStream({
        start: async (controller) => {
          controller.enqueue(new Uint8Array(await this.arrayBuffer()))
          controller.close()
        }
      })
    }
  })
}
