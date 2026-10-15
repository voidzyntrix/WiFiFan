// A grid that never scrolls: it measures the space it is given, fits as many items as there is room
// for, and pages through the rest (‹ › and dots, the mouse wheel, or a swipe).

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { sound } from '../sound'
import { Swap } from '../motion'

export function Pager<T>(props: {
  items: T[]
  /** Smallest width and the height of one item (px). */
  itemWidth: number
  itemHeight: number
  gap?: number
  render: (item: T) => ReactNode
  /** An item that always shows last on every page (an "Add" tile). */
  tail?: ReactNode
  className?: string
}) {
  const gap = props.gap ?? 10
  const box = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ cols: 1, rows: 1 })
  const [page, setPage] = useState(0)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight - 28   // room for the page controls
      setFit({
        cols: Math.max(1, Math.floor((w + gap) / (props.itemWidth + gap))),
        rows: Math.max(1, Math.floor((h + gap) / (props.itemHeight + gap))),
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [props.itemWidth, props.itemHeight, gap])

  const perPage = Math.max(1, fit.cols * fit.rows - (props.tail ? 1 : 0))
  const pages = Math.max(1, Math.ceil(props.items.length / perPage))
  useEffect(() => { if (page >= pages) setPage(pages - 1) }, [page, pages])
  const go = (p: number) => { const n = Math.min(pages - 1, Math.max(0, p)); if (n !== page) { sound.tap(); setPage(n) } }
  const shown = props.items.slice(page * perPage, page * perPage + perPage)

  // swipe and wheel
  const touch = useRef<number | null>(null)

  return (
    <div
      ref={box}
      className={'pager' + (props.className ? ' ' + props.className : '')}
      onWheel={(e) => { if (Math.abs(e.deltaY) + Math.abs(e.deltaX) > 20) go(page + (e.deltaY + e.deltaX > 0 ? 1 : -1)) }}
      onPointerDown={(e) => { touch.current = e.clientX }}
      onPointerUp={(e) => {
        if (touch.current == null) return
        const dx = e.clientX - touch.current
        touch.current = null
        if (Math.abs(dx) > 50) go(page + (dx < 0 ? 1 : -1))
      }}
    >
      <Swap k={page} className="pager-page-wrap">
        <div className="pager-grid" style={{ gridTemplateColumns: `repeat(${fit.cols}, minmax(0, 1fr))`, gridAutoRows: props.itemHeight, gap }}>
          {shown.map((item) => props.render(item))}
          {props.tail}
        </div>
      </Swap>
      {pages > 1 && (
        <div className="pager-controls">
          <button className="pager-arrow" aria-label="Previous page" disabled={page === 0} onClick={() => go(page - 1)}>‹</button>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} className={'pager-dot' + (i === page ? ' on' : '')} aria-label={`Page ${i + 1}`} onClick={() => go(i)} />
          ))}
          <button className="pager-arrow" aria-label="Next page" disabled={page === pages - 1} onClick={() => go(page + 1)}>›</button>
        </div>
      )}
    </div>
  )
}
