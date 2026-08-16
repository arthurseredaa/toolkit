import { useEffect, useMemo } from 'react'

export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const url = useMemo(
    () => (blob ? URL.createObjectURL(blob) : undefined),
    [blob]
  )
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url]
  )
  return url
}
