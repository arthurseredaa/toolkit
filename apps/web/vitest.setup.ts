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
