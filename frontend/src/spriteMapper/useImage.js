import { useEffect, useState } from 'react'

// Load an HTMLImageElement from a src (path, object URL, or data URL) and
// return it once decoded. Returns null until ready / when src is empty.
export function useImage(src) {
  const [img, setImg] = useState(null)
  useEffect(() => {
    if (!src) {
      setImg(null)
      return undefined
    }
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (!cancelled) setImg(image)
    }
    image.src = src
    return () => {
      cancelled = true
    }
  }, [src])
  return img
}
