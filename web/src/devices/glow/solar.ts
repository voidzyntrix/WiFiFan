// Solar runs ON the ESP32 board (firmware 1.6.0+): it asks the FoxESS Cloud itself with the user's
// API key, every few minutes, and shows the grid on LED 1 and the home battery on LED 2, with no
// app connected. This file is the app's side of it: what the board reports and a line of words for it.
//
//   app -> board   solar                   ->  SOLAR,{status json}
//   app -> board   solar={"key":"...","on":true,"poll":5,"low":20,"bri":100}   (any of them)

export interface SolarStatus {
  on: number
  /** The board has an API key. */
  key: number
  sn: string
  name: string
  poll: number
  low: number
  bri: number
  /** At least one reading came in. */
  have: number
  /** kW; positive imports from the grid. */
  grid: number
  soc: number
  pv: number
  load: number
  off: number
  fault: number
  /** Seconds since the last reading, -1 for none. */
  age: number
  busy: number
  err: string
}

/** True while the Solar tab is asking for the API key, so a state read doesn't pull the app out of Solar. */
export const solarFlags = { setup: false }

export function parseSolar(line: string): SolarStatus | null {
  try { return JSON.parse(line.slice('SOLAR,'.length)) as SolarStatus } catch { return null }
}

/** "Grid importing 0.3 kW · battery 82 % · solar 2.4 kW · house 1.1 kW" */
export function describeSolar(s: SolarStatus): string {
  const grid = s.off ? 'is down' : s.grid <= -0.05 ? `exporting ${Math.abs(s.grid).toFixed(1)} kW` : s.grid >= 0.05 ? `importing ${s.grid.toFixed(1)} kW` : 'balanced'
  const parts = [`Grid ${grid}`]
  if (s.soc >= 0) parts.push(`battery ${s.soc} %`)
  parts.push(`solar ${s.pv.toFixed(1)} kW`, `house ${s.load.toFixed(1)} kW`)
  if (s.fault) parts.push('inverter fault')
  return parts.join(' · ')
}

export const solarCommand = (patch: Record<string, unknown>) => `solar=${JSON.stringify(patch)}`
