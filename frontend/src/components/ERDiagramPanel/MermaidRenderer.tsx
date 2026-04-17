import { useEffect, useRef, useState, useCallback } from 'react'
import mermaid from 'mermaid'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

const MERMAID_CONFIG = {
  startOnLoad: false,
  theme: 'dark' as const,
  themeVariables: {
    background: '#1a1d27',
    primaryColor: '#252837',
    primaryTextColor: '#e2e8f0',
    primaryBorderColor: '#2e3245',
    lineColor: '#f59e0b',
    secondaryColor: '#252837',
    tertiaryColor: '#1a1d27',
  },
}

interface Props {
  source: string
  loading?: boolean
  onError?: () => void
}

let diagCounter = 0
let mermaidInitialised = false

const MIN_ZOOM = 0.1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.15

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

export default function MermaidRenderer({ source, loading = false, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)   // the panning viewport
  const contentRef = useRef<HTMLDivElement>(null)     // the scaled content

  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(0.7)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isDragging = useRef(false)
  const dragOrigin = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  // Render mermaid whenever source changes
  useEffect(() => {
    if (!source || !contentRef.current) return
    setError(null)
    if (!mermaidInitialised) {
      mermaid.initialize(MERMAID_CONFIG)
      mermaidInitialised = true
    }
    const id = `mermaid-${++diagCounter}`
    mermaid
      .render(id, source)
      .then(({ svg }) => {
        if (contentRef.current) contentRef.current.innerHTML = svg
      })
      .catch((e) => {
        setError('Diagram render error: ' + String(e).slice(0, 120))
        onError?.()
      })
  }, [source])

  // Reset pan/zoom when source changes
  useEffect(() => {
    setZoom(0.7)
    setPan({ x: 0, y: 0 })
  }, [source])

  // Ctrl+wheel to zoom toward cursor
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      setZoom((prevZoom) => {
        const nextZoom = clamp(prevZoom * (1 - e.deltaY * 0.002), MIN_ZOOM, MAX_ZOOM)
        const ratio = nextZoom / prevZoom
        setPan((p) => ({
          x: cx - ratio * (cx - p.x),
          y: cy - ratio * (cy - p.y),
        }))
        return nextZoom
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // Drag-to-pan handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    isDragging.current = true
    dragOrigin.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
    e.preventDefault()
  }, [pan])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return
    const dx = e.clientX - dragOrigin.current.mx
    const dy = e.clientY - dragOrigin.current.my
    setPan({ x: dragOrigin.current.px + dx, y: dragOrigin.current.py + dy })
  }, [])

  const onMouseUp = useCallback(() => { isDragging.current = false }, [])

  const zoomBy = useCallback((delta: number) => {
    setZoom((z) => {
      const el = containerRef.current
      if (!el) return clamp(z + delta, MIN_ZOOM, MAX_ZOOM)
      const cx = el.clientWidth / 2
      const cy = el.clientHeight / 2
      const nextZoom = clamp(z + delta, MIN_ZOOM, MAX_ZOOM)
      const ratio = nextZoom / z
      setPan((p) => ({
        x: cx - ratio * (cx - p.x),
        y: cy - ratio * (cy - p.y),
      }))
      return nextZoom
    })
  }, [])

  const zoomReset = useCallback(() => {
    setZoom(0.7)
    setPan({ x: 0, y: 0 })
  }, [])

  return (
    <div className="relative w-full h-full min-h-[400px] flex flex-col">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl z-10"
          style={{ background: 'rgba(15,17,23,0.7)' }}>
          <div className="text-sm flex items-center gap-2" style={{ color: 'var(--color-accent)' }}>
            <span className="animate-pulse">●</span> Updating diagram…
          </div>
        </div>
      )}

      {/* Zoom controls */}
      {!error && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-lg px-1 py-0.5"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <button onClick={() => zoomBy(-ZOOM_STEP)} className="p-1.5 rounded hover:opacity-80" title="Zoom out"
            style={{ color: 'var(--color-muted)' }}>
            <ZoomOut size={14} />
          </button>
          <span className="text-xs w-10 text-center select-none" style={{ color: 'var(--color-muted)' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => zoomBy(ZOOM_STEP)} className="p-1.5 rounded hover:opacity-80" title="Zoom in"
            style={{ color: 'var(--color-muted)' }}>
            <ZoomIn size={14} />
          </button>
          <div className="w-px h-4 mx-0.5" style={{ background: 'var(--color-border)' }} />
          <button onClick={zoomReset} className="p-1.5 rounded hover:opacity-80" title="Reset view"
            style={{ color: 'var(--color-muted)' }}>
            <Maximize2 size={14} />
          </button>
        </div>
      )}

      {error ? (
        <div className="p-4 rounded-lg text-sm" style={{ background: '#7f1d1d', color: '#fca5a5' }}>{error}</div>
      ) : (
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden"
          style={{ cursor: isDragging.current ? 'grabbing' : 'grab' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <div
            ref={contentRef}
            className="mermaid-container"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              display: 'inline-block',
              userSelect: 'none',
            }}
          />
        </div>
      )}

      {!error && (
        <div className="absolute bottom-2 left-2 text-xs select-none pointer-events-none"
          style={{ color: 'var(--color-muted)', opacity: 0.6 }}>
          Drag to pan · Ctrl+scroll to zoom
        </div>
      )}
    </div>
  )
}
