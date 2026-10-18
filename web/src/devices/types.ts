// What a kind of device is to Glow. Each type brings everything about itself: how it is found and
// connected (its Bluetooth profile today; a Wi-Fi type would bring its own transport), what its
// session does once connected, and its own control screen and settings. The rest of the app (the
// device list, scanning, connecting, saving devices, routing to the control screen) is generic
// and only knows this interface. Types are listed in registry.ts.
//
// Today there are two: the WiFiFan LED board over Bluetooth, and the ESP32 LED board over Wi-Fi
// (both glow/: the same protocol and control screen on a different link). Another type is a new
// folder with its own DeviceType and a line in the registry.

import type { ComponentType, LazyExoticComponent } from 'react'
import type { BleLink, BleProfile, BtDevice } from '../platform'

/** A device the user connected to before (kept in Settings). */
export interface SavedDevice {
  /** The transport's id (Bluetooth: the device id / address; Wi-Fi: "wifi:" + its MAC). */
  id: string
  /** Which DeviceType it is (DeviceType.id). */
  type: string
  /** The name the user gave it, or null to show the advertised one. */
  name: string | null
  /** The name it advertises. */
  advertised: string | null
  /** Wi-Fi: its address when last seen (it is looked for again on every connect). */
  host?: string
}

/** A connected device. The type's own session object is free to add whatever it needs. */
export interface DeviceSession {
  /** Ends the session (the link is closed by the connection manager). */
  close(): void
  /** Clears what the device remembers (its Wi-Fi) and sends it back to pairing. */
  reset?(): Promise<void>
}

export interface ControlScreenProps {
  device: SavedDevice
  /** Back to the device list (the device stays connected). */
  onBack(): void
  onSettings(): void
  onDisconnect(): void
  /** Opens a dialog to rename the device. */
  onRename(): void
  /** Asks, then resets the device (types whose session can reset). */
  onReset?(): void
}

/** A dialog that pairs a new device of the type (Wi-Fi boards: gives it the network's credentials). */
export interface SetupProps {
  /** The one board to set up, when it is known which (its own network's name). */
  ssid?: string
  onDone(device: SavedDevice): void
  onDismiss(): void
}

/** A screen component, or one loaded on first use with React.lazy (keeping its module off boot). */
export type ScreenComponent<P> = ComponentType<P> | LazyExoticComponent<ComponentType<P>>

export interface DeviceType {
  /** Stable id, saved with each device. */
  id: string
  /** "LED board" */
  label: string
  /** Shown on the device's tile. */
  Icon: ComponentType<{ size?: number }>
  /** How it is reached. */
  transport: 'ble' | 'wifi'
  /** Bluetooth: the GATT services and characteristics its link uses (tried in order). */
  ble: BleProfile[]
  /** Wi-Fi: the TCP port it listens on. */
  port?: number
  /**
   * How likely a device heard while scanning is of this type (0 not at all .. 1 surely), by what
   * it advertises. A scan lists every device; this picks the type to connect it as.
   */
  match(device: BtDevice): number
  /** The link is open: start the device's session on it (may load the session's module first). */
  open(link: BleLink, device: SavedDevice): DeviceSession | Promise<DeviceSession>
  /** Its control screen (fills the window; nothing on it scrolls). */
  ControlScreen: ScreenComponent<ControlScreenProps>
  /** Pairing a new one, for types that need it before they can be found ("Set up a new …"). */
  Setup?: ScreenComponent<SetupProps>
  /** Its own section in Settings, if it has options. */
  SettingsSection?: ComponentType
  /** A pretend link for trying the controls without a device, if the type offers one. */
  demoLink?(): BleLink | Promise<BleLink>
}
