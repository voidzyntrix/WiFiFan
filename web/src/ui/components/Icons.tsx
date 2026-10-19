// The Android app's vector icons, as inline SVG.

type P = { size?: number; className?: string }

export const PowerIcon = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 960 960" fill="currentColor" aria-hidden>
    <path d="M480,880q-83,0 -156,-31.5T197,763q-54,-54 -85.5,-127T80,480q0,-84 31.5,-156.5T197,197l56,56q-44,44 -68.5,102T160,480q0,134 93,227t227,93q134,0 227,-93t93,-227q0,-67 -24.5,-125T707,253l56,-56q54,54 85.5,126.5T880,480q0,83 -31.5,156T763,763q-54,54 -127,85.5T480,880ZM440,520v-440h80v440h-80Z" />
  </svg>
)

export const SettingsIcon = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M19.14,12.94c0.04,-0.3 0.06,-0.61 0.06,-0.94c0,-0.32 -0.02,-0.64 -0.07,-0.94l2.03,-1.58c0.18,-0.14 0.23,-0.41 0.12,-0.61l-1.92,-3.32c-0.12,-0.22 -0.37,-0.29 -0.59,-0.22l-2.39,0.96c-0.5,-0.38 -1.03,-0.7 -1.62,-0.94L14.4,2.81c-0.04,-0.24 -0.24,-0.41 -0.48,-0.41h-3.84c-0.24,0 -0.43,0.17 -0.47,0.41L9.25,5.35C8.66,5.59 8.12,5.92 7.63,6.29L5.24,5.33c-0.22,-0.08 -0.47,0 -0.59,0.22L2.74,8.87C2.62,9.08 2.66,9.34 2.86,9.48l2.03,1.58C4.84,11.36 4.8,11.69 4.8,12s0.02,0.64 0.07,0.94l-2.03,1.58c-0.18,0.14 -0.23,0.41 -0.12,0.61l1.92,3.32c0.12,0.22 0.37,0.29 0.59,0.22l2.39,-0.96c0.5,0.38 1.03,0.7 1.62,0.94l0.36,2.54c0.05,0.24 0.24,0.41 0.48,0.41h3.84c0.24,0 0.44,-0.17 0.47,-0.41l0.36,-2.54c0.59,-0.24 1.13,-0.56 1.62,-0.94l2.39,0.96c0.22,0.08 0.47,0 0.59,-0.22l1.92,-3.32c0.12,-0.22 0.07,-0.47 -0.12,-0.61L19.14,12.94zM12,15.6c-1.98,0 -3.6,-1.62 -3.6,-3.6s1.62,-3.6 3.6,-3.6s3.6,1.62 3.6,3.6S13.98,15.6 12,15.6z" />
  </svg>
)

export const BackIcon = ({ size = 20, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
    <path d="M20,11H7.83l5.59,-5.59L12,4l-8,8 8,8 1.41,-1.41L7.83,13H20v-2z" />
  </svg>
)

export const EditIcon = ({ size = 13 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M3,17.25V21h3.75L17.81,9.94l-3.75,-3.75L3,17.25zM20.71,7.04c0.39,-0.39 0.39,-1.02 0,-1.41l-2.34,-2.34c-0.39,-0.39 -1.02,-0.39 -1.41,0l-1.83,1.83 3.75,3.75 1.83,-1.83z" />
  </svg>
)

export const AddIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M19,13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
  </svg>
)

export const BulbIcon = ({ size = 28 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M9,21c0,0.55 0.45,1 1,1h4c0.55,0 1,-0.45 1,-1v-1H9v1zM12,2C8.14,2 5,5.14 5,9c0,2.38 1.19,4.47 3,5.74V17c0,0.55 0.45,1 1,1h6c0.55,0 1,-0.45 1,-1v-2.26c1.81,-1.27 3,-3.36 3,-5.74 0,-3.86 -3.14,-7 -7,-7z" />
  </svg>
)

/* Material's palette (the colour dot circles are islands on the tilted disc) */
export const PaletteIcon = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12,2C6.49,2 2,6.49 2,12s4.49,10 10,10c1.38,0 2.5,-1.12 2.5,-2.5c0,-0.61 -0.23,-1.2 -0.64,-1.67c-0.08,-0.1 -0.13,-0.21 -0.13,-0.33c0,-0.28 0.22,-0.5 0.5,-0.5H16c3.31,0 6,-2.69 6,-6C22,6.05 17.51,2 12,2z M6.5,12C5.67,12 5,11.33 5,10.5S5.67,9 6.5,9S8,9.67 8,10.5S7.33,12 6.5,12z M9.5,8C8.67,8 8,7.33 8,6.5S8.67,5 9.5,5S11,5.67 11,6.5S10.33,8 9.5,8z M14.5,8C13.67,8 13,7.33 13,6.5S13.67,5 14.5,5S16,5.67 16,6.5S15.33,8 14.5,8z M17.5,12C16.67,12 16,11.33 16,10.5S16.67,9 17.5,9S19,9.67 19,10.5S18.33,12 17.5,12z" />
  </svg>
)

/* Material's auto_awesome (sparkles): the modes / effects */
export const ModesIcon = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M19,9l1.25,-2.75L23,5l-2.75,-1.25L19,1l-1.25,2.75L15,5l2.75,1.25L19,9z M11.5,9.5L9,4L6.5,9.5L1,12l5.5,2.5L9,20l2.5,-5.5L17,12L11.5,9.5z M19,15l-1.25,2.75L15,19l2.75,1.25L19,23l1.25,-2.75L23,19l-2.75,-1.25L19,15z" />
  </svg>
)

/* Material's star: the scenes */
export const ScenesIcon = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12,17.27L18.18,21l-1.64,-7.03L22,9.24l-7.19,-0.61L12,2 9.19,8.63 2,9.24l5.46,4.73L5.82,21z" />
  </svg>
)

/* Three sliders with staggered knobs: the current mode's own options */
export const TuneIcon = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M3,5.2h4.2v1.6H3z" /><circle cx="9.4" cy="6" r="2.2" /><path d="M11.8,5.2H21v1.6h-9.2z" />
    <path d="M3,11.2h8.2v1.6H3z" /><circle cx="13.4" cy="12" r="2.2" /><path d="M15.8,11.2H21v1.6h-5.2z" />
    <path d="M3,17.2h2.8v1.6H3z" /><circle cx="8" cy="18" r="2.2" /><path d="M10.4,17.2H21v1.6h-10.6z" />
  </svg>
)
