// The ring board's own preview — a new kind, separate from the disc previews (LedPreview.tsx stays
// untouched): a circle of dots with one per pixel, pixel 0 at the top, each dot clickable to pick
// which one the colour controls edit. The dots carry this frame's colours: the per-pixel palette
// in Solid, the wheel rainbow, waves and flames, the Spinner's tail, or the two halves.

import { clamp, hsvToRgb } from '../../lib/color'

/** One dot of the ring, the same look as a disc (its rules live under `.ring-preview`). */
function Dot({ hue, sat, value, selected, x, y, onClick }: {
  hue: number; sat: number; value: number
  selected: boolean
  x: string; y: string
  onClick: () => void
}) {
  const level = clamp(value, 0, 1)
  const lit = clamp(level * 4, 0, 1)
  const [r, g, b] = hsvToRgb(hue, clamp(sat, 0, 1), 1)
  const mix = (0.15 + 0.85 * level) * lit
  const fill = `rgb(${26 + (r - 26) * mix} ${26 + (g - 26) * mix} ${26 + (b - 26) * mix})`
  const glow = 1 + 22 * lit * (0.35 + 0.65 * level)
  return (
    <div
      className={'led-disc clickable' + (selected ? ' selected' : '')}
      onClick={onClick}
      style={{
        background: fill,
        borderColor: `rgb(${r} ${g} ${b} / ${0.25 + 0.6 * lit})`,
        boxShadow: `0 0 ${glow * 1.6}px ${glow * 0.3}px rgb(${r} ${g} ${b} / ${0.28 * lit}), 0 0 ${glow * 4}px ${glow * 0.7}px rgb(${r} ${g} ${b} / ${0.1 * lit})`,
        left: x,
        top: y,
      }}
    />
  )
}

export function RingPreview(props: { dots: { hue: number; sat: number; val: number }[]; editing: number; onTap: (pixel: number) => void }) {
  const n = Math.max(3, props.dots.length)
  return (
    <div className="ring-preview">
      {props.dots.map((d, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2
        return (
          <Dot
            key={i}
            hue={d.hue}
            sat={d.sat}
            value={d.val}
            selected={props.editing === i}
            x={`${50 + 42 * Math.cos(angle)}%`}
            y={`${50 + 42 * Math.sin(angle)}%`}
            onClick={() => props.onTap(i)}
          />
        )
      })}
    </div>
  )
}
