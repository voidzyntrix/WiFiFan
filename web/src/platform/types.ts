// What the app needs from the system it runs on. Glow is one web app; a thin native shell hosts it
// and provides this: Electron on Windows (desktop/), a WebView app on Android (app/), or nothing
// at all in a plain browser (for quick UI work). Everything outside src/platform talks to the
// system only through `platform` (index.ts), never to Electron or Android directly.

/** A Bluetooth LE device heard while scanning. */
export interface BtDevice { id: string; name: string | null }

/**
 * An open Bluetooth LE link to one device's serial characteristic (write + notify). Device types
 * build their protocol on this; the link only moves bytes.
 */
export interface BleLink {
  readonly id: string
  readonly name: string | null
  /** Bytes per write the link takes (ATT MTU - 3). */
  readonly chunk: number
  /** Writes one chunk (at most `chunk` bytes); resolves once it is sent. */
  write(data: Uint8Array): Promise<void>
  /** Bytes from the device, as they arrive. */
  onData(fn: (data: Uint8Array) => void): () => void
  /** Called once when the link drops (by either side). */
  onClose(fn: () => void): () => void
  close(): void
}

/** Where a device type's link lives: which GATT service and characteristics carry its bytes. */
export interface BleProfile {
  service: number | string
  write: number | string
  /** The notify characteristic; when absent (or missing on the device) the write one is used. */
  notify?: number | string
}

/** Bluetooth LE: scanning for devices and opening links. */
export interface BleCentral {
  /** Starts scanning; `onDevices` gets the whole list each time it changes. Returns stop. */
  scan(onDevices: (devices: BtDevice[]) => void, profiles: BleProfile[]): () => void
  /** Connects to a device by id (scanning for it first if needed), on the first profile it offers. */
  connect(id: string, profiles: BleProfile[]): Promise<{ link: BleLink; profile: BleProfile }>
}

/** A Wi-Fi board that answered the discovery broadcast. */
export interface WifiDevice {
  /** Its MAC, lower-case hex. */
  id: string
  name: string | null
  host: string
  version: string | null
  /** 'setup': waiting to be paired; 'joining': has a network but isn't on it yet; 'ready'. */
  state: string
}

/**
 * Wi-Fi boards on the local network: found by a UDP broadcast, driven over TCP. The link is the
 * same byte pipe a Bluetooth link is, so a device type's protocol runs on either.
 */
export interface WifiTransport {
  /** Broadcasts for boards until stopped; `onDevices` gets the whole list each time it changes. */
  discover(onDevices: (devices: WifiDevice[]) => void): () => void
  /** Opens a TCP link (through the setup network while one is joined, see joinSetup). */
  connect(host: string, port: number): Promise<BleLink>
  /**
   * Android: asks the system to join an unpaired board's own network ("Glow-…", by name prefix)
   * for this app only (Windows: joins it, and `leave` goes back to the network it was on).
   * Resolves with its name once joined.
   */
  joinSetup?(prefix: string, password: string): Promise<{ ssid: string | null; leave(): void }>
  /** The names of nearby unpaired boards' own networks (those starting with `prefix`). */
  scanSetup?(prefix: string): Promise<string[]>
  /** The network this device is on, with its password where the system lets the app read it. */
  currentNetwork?(): Promise<{ ssid: string | null; password: string | null } | null>
}

export interface UpdateChannel {
  /** Matches the release file name; the first group is the version. */
  asset: RegExp
  /** Release tags are `<kind>-v<version>`. */
  kind: string
  assetName(version: string): string
  /**
   * Downloads the release and installs it (the app restarts or Android asks to update).
   * Rejects with 'UNSUPPORTED' when this build can't update itself (the caller opens the page).
   */
  install(url: string, version: string, onProgress: (received: number, total: number) => void): Promise<void>
}

export interface Platform {
  kind: 'desktop' | 'android' | 'browser'
  /** For "Glow for Windows" style labels. */
  name: string
  ble: BleCentral | null
  /** Wi-Fi boards on the local network (not in a plain browser: it can't open sockets). */
  wifi: WifiTransport | null
  net: {
    text(url: string): Promise<string>
    bytes(url: string, limit: number): Promise<Uint8Array>
    exists(url: string): Promise<boolean>
  }
  openExternal(url: string): void
  /** The system's accent colour (Android: the wallpaper's Material You colour; Windows: the accent), if it has one. */
  accentColor(): Promise<string | null>
  /** A haptic tick on phones; desktop plays its click sounds instead (sound.ts). */
  haptic: ((kind: 'tap' | 'tick' | 'confirm' | 'long') => void) | null
  keepAwake(on: boolean): void
  /** Desktop: keep running in the tray while something drives a device. */
  keepRunning(on: boolean): void
  update: UpdateChannel | null
  /** What the system can capture, for the sync modes. */
  capture: {
    microphone: boolean
    /** Everything the system plays (desktop). */
    systemAudio: boolean
    screen: boolean
    displays?(): Promise<{ index: number; label: string }[]>
    setDisplay?(index: number): void
  }
  /** Android: light or dark system bar icons, to match the theme. */
  systemBars?(dark: boolean): void
  /** Android's back button: `handler` returns true when it handled it (otherwise the app closes). */
  onBack(handler: () => boolean): () => void
}
