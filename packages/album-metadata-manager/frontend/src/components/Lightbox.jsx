import { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, X, ExternalLink, ZoomIn, ZoomOut } from 'lucide-react'

// items: [{ source: 'musicbrainz'|'redacted', url: string }]
export default function Lightbox({ items, initialIndex = 0, onClose }) {
  const containerRef = useRef(null)
  const [index, setIndex] = useState(initialIndex)
  const [zoom, setZoom] = useState('fit') // 'fit' | '1:1'
  const [showUI, setShowUI] = useState(true)
  const [dims, setDims] = useState({ width: null, height: null })
  const hideTimerRef = useRef(null)

  const current = items[index]

  // Attempt fullscreen when mounted; ignore if denied
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) return
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {})
    }
    return () => {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {})
      }
    }
  }, [])

  // Key handlers
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setIndex((i) => (i < items.length - 1 ? i + 1 : i))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setIndex((i) => (i > 0 ? i - 1 : i))
      }
      setShowUI(true)
      scheduleHide()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, onClose])

  // Auto-hide controls
  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setShowUI(false), 3000)
  }, [])

  useEffect(() => {
    setShowUI(true)
    scheduleHide()
    return () => clearTimeout(hideTimerRef.current)
  }, [index, scheduleHide])

  const onMouseMove = () => {
    if (!showUI) setShowUI(true)
    scheduleHide()
  }

  // Reset dims on image change
  useEffect(() => setDims({ width: null, height: null }), [current])

  // Preload neighbors
  useEffect(() => {
    const preload = (idx) => {
      if (idx < 0 || idx >= items.length) return
      const img = new Image()
      img.src = items[idx].url
    }
    preload(index + 1)
    preload(index - 1)
  }, [index, items])

  const canPrev = index > 0
  const canNext = index < items.length - 1

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/95 text-white"
      onMouseMove={onMouseMove}
      role="dialog"
      aria-modal="true"
    >
      {/* Image area */}
      <div className="absolute inset-0 overflow-auto flex items-center justify-center select-none">
        {/* Fit mode uses object-contain; 1:1 removes constraints and allows scroll */}
        <img
          src={current.url}
          alt={`${current.source} artwork`}
          onLoad={(e) => {
            const img = e.currentTarget
            setDims({ width: img.naturalWidth, height: img.naturalHeight })
          }}
          onDoubleClick={() => setZoom((z) => (z === 'fit' ? '1:1' : 'fit'))}
          className={zoom === 'fit' ? 'max-w-full max-h-full object-contain' : ''}
          style={zoom === 'fit' ? {} : {}}
        />
      </div>

      {/* Top bar */}
      {showUI && (
        <div className="absolute top-0 left-0 right-0 p-3 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
          <div className="text-sm capitalize opacity-90">{current.source}</div>
          <div className="flex items-center gap-2">
            <a
              href={current.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Open original
            </a>
            <button
              onClick={() => onClose?.()}
              className="text-sm px-2 py-1 rounded bg-white/10 hover:bg-white/20 flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Close
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      {showUI && (
        <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent text-xs">
          <div className="opacity-90">
            {dims.width && dims.height ? `${dims.width}×${dims.height}` : 'Loading…'}
          </div>
          <button
            onClick={() => setZoom((z) => (z === 'fit' ? '1:1' : 'fit'))}
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 flex items-center gap-1"
          >
            {zoom === 'fit' ? (
              <>
                <ZoomIn className="w-3 h-3" />
                Zoom 100%
              </>
            ) : (
              <>
                <ZoomOut className="w-3 h-3" />
                Fit to screen
              </>
            )}
          </button>
        </div>
      )}

      {/* Nav buttons */}
      {showUI && (
        <>
          <button
            onClick={() => canPrev && setIndex(index - 1)}
            disabled={!canPrev}
            aria-label="Previous"
            className={`absolute left-2 top-1/2 -translate-y-1/2 px-3 py-2 rounded bg-white/10 hover:bg-white/20 ${
              !canPrev ? 'opacity-30 cursor-not-allowed' : ''
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => canNext && setIndex(index + 1)}
            disabled={!canNext}
            aria-label="Next"
            className={`absolute right-2 top-1/2 -translate-y-1/2 px-3 py-2 rounded bg-white/10 hover:bg-white/20 ${
              !canNext ? 'opacity-30 cursor-not-allowed' : ''
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  )
}

