// The LED preview: a disc in the LED's colour with a soft glow (one, or two side by side for
// Separate LEDs; clicking a disc picks which LED the colour card edits).
// The ring boards have their own, different kind of preview (RingPreview.tsx).

import { hsvToRgb, clamp } from '../../lib/color'

function Disc({ hue, sat, value, onClick, selected }: { hue: number; sat: number; value: number; onClick?: () => void; selected?: boolean }) {
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
