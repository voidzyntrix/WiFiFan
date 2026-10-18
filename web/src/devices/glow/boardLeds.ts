// The LEDs as the board is driving them right now. The board reports the exact 8-bit colour it sends each
// LED ("leds"), so the preview shows the real colour and brightness in every mode, not an estimate.

import { useEffect, useState } from 'react'
import { rgbToHsv } from '../../lib/color'
import { board } from './board'
import type { Preview } from './preview'

export interface BoardLeds { r1: [number, number, number]; r2: [number, number, number] }

/** "LEDS,r/g/b,r/g/b" from the board. */
export function parseLeds(line: string): BoardLeds | null {
  const m = /^LEDS,(\d+)\/(\d+)\/(\d+),(\d+)\/(\d+)\/(\d+)/.exec(line)
  if (!m) return null
  const n = m.slice(1).map(Number)
  return { r1: [n[0], n[1], n[2]], r2: [n[3], n[4], n[5]] }
}

/** The preview's hue, saturation and value for each LED, from the board's colours. */
export function previewFromBoard(l: BoardLeds): Preview {
  const [hue, sat, val] = rgbToHsv(...l.r1)
  const [hue2, sat2, val2] = rgbToHsv(...l.r2)
  return { hue, sat, val, hue2, sat2, val2 }
}

/** The board's LEDs, asked for about five times a second while `on`; null when the board doesn't answer. */
export function useBoardLeds(on: boolean): BoardLeds | null {
  const [leds, setLeds] = useState<BoardLeds | null>(null)
  useEffect(() => {
    if (!on) { setLeds(null); return }
    let live = true
    let busy = false
    const timer = window.setInterval(() => {
      if (busy) return
      busy = true
      const reply = board.waitFor('LEDS,', 400).catch(() => null)
      board.sendData('leds')
      void reply.then((line) => {
        busy = false
        const v = line ? parseLeds(line) : null
        if (live) setLeds(v)
      })
    }, 200)
    return () => { live = false; window.clearInterval(timer) }
  }, [on])
  return leds
}
