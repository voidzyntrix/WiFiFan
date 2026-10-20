// The LED preview: a disc in the LED's colour with a soft glow — one, two side by side for Separate
// LEDs, or the ring itself (a dot per pixel) when a ring board's Individual layout runs.
// Clicking a disc or a dot picks which LED the colour card edits.

import { hsvToRgb, clamp } from '../../lib/color'

function Disc({ hue, sat, value, onClick, selected, x, y }: {
  hue: number; sat: number; value: number
  onClick?: () => void; selected?: boolean
  /** Ring dots sit at these percentages of their (square) container; discs stay centred. */
  x?: string; y?: string
}) {
  const level = clamp(value, 0, 1)
  const lit = clamp(level * 4, 0, 1)
  const [r, g, b] = hsvToRgb(hue, clamp(sat, 0, 1), 1)
  const mix = (0.15 + 0.85 * level) * lit
  const fill = `rgb(${26 + (r - 26) * mix} ${26 + (g - 26) * mix} ${26 + (b - 26) * mix})`
  const glow = 1 + 22 * lit * (0.35 + 0.65 * level)
  return (
    <div
      className={'led-disc' + (onClick ? ' clickable' : '') + (selected ? ' selected' : '')}
      onClick={onClick}
      style={{
        background: fill,
        borderColor: `rgb(${r} ${g} ${b} / ${0.25 + 0.6 * lit})`,
        boxShadow: `0 0 ${glow * 1.6}px ${glow * 0.3}px rgb(${r} ${g} ${b} / ${0.28 * lit}), 0 0 ${glow * 4}px ${glow * 0.7}px rgb(${r} ${g} ${b} / ${0.1 * lit})`,
        ...(x != null && y != null ? { left: x, top: y } : {}),
      }}
    />
  )
}

export function LedPreview(props: { hue: number; sat: number; value: number }) {
  return (
    <div className="led-preview">
      <Disc {...props} />
    </div>
  )
}

export function LedPreviewPair(props: {
  hue1: number; sat1: number; value1: number
  hue2: number; sat2: number; value2: number
  editing: number
  onTap: (led: number) => void
}) {
  return (
    <div className="led-preview pair">
      <Disc hue={props.hue1} sat={props.sat1} value={props.value1} onClick={() => props.onTap(0)} selected={props.editing !== 1} />
      <Disc hue={props.hue2} sat={props.sat2} value={props.value2} onClick={() => props.onTap(1)} selected={props.editing !== 0} />
    </div>
  )
}

/** The ring itself: one clickable dot per pixel, pixel 0 at the top. A tail (Spinner) and waves for
 * Breathe, per-pixel flames and the wheel rainbow arrive as the dots' own colours each frame. */
export function LedPreviewRing(props: { dots: { hue: number; sat: number; val: number }[]; editing: number; onTap: (pixel: number) => void }) {
  const n = Math.max(3, props.dots.length)
  return (
    <div className="led-preview ring">
      {props.dots.map((d, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2
        return (
          <Disc
            key={i}
            hue={d.hue}
            sat={d.sat}
            value={d.val}
            x={`${50 + 39 * Math.cos(angle)}%`}
            y={`${50 + 39 * Math.sin(angle)}%`}
            onClick={() => props.onTap(i)}
            selected={props.editing === i}
          />
        )
      })}
    </div>
  )
}
