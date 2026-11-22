import { useCallback, useState } from 'react'

export type GalleryDesktopCols = 3 | 4 | 5

const STORAGE_KEY = 'pose_atlas_gallery_cols_v1'
const DEFAULT_COLS: GalleryDesktopCols = 5

function readSavedCols(): GalleryDesktopCols {
  if (typeof window === 'undefined') return DEFAULT_COLS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === '3') return 3
    if (raw === '4') return 4
    if (raw === '5') return 5
  } catch {
    // ignore storage errors
  }
  return DEFAULT_COLS
}

/** Persist desktop column density (3 / 4 / 5) for gallery grids. */
export function useGalleryDesktopCols(): readonly [
  GalleryDesktopCols,
  (cols: GalleryDesktopCols) => void,
] {
  const [cols, setColsState] = useState<GalleryDesktopCols>(() => readSavedCols())

  const setCols = useCallback((next: GalleryDesktopCols) => {
    setColsState(next)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // ignore storage errors
      }
    }
  }, [])

  return [cols, setCols] as const
}

/** Shared responsive grid classes matching mobile (2 cols), tablet (3-4 cols), and chosen desktop density. */
export function galleryGridClassName(desktopCols: GalleryDesktopCols): string {
  const desktopCls =
    desktopCols === 3
      ? 'lg:grid-cols-3'
      : desktopCols === 4
        ? 'lg:grid-cols-4'
        : 'lg:grid-cols-5'
  return `grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 ${desktopCls}`
}
