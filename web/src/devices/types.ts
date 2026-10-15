// What a kind of device is to Glow. Each type brings everything about itself: how it is found and
// connected (its Bluetooth profile today; a Wi-Fi type would bring its own transport), what its
// session does once connected, and its own control screen and settings. The rest of the app (the
// device list, scanning, connecting, saving devices, routing to the control screen) is generic
// and only knows this interface. Types are listed in registry.ts.
//
// Today there is one type, the WiFiFan LED board (glow/). A second type, say a Wi-Fi LED strip or
// a Bluetooth speaker, is a new folder with its own DeviceType and a line in the registry.

import type { ComponentType } from 'react'
import type { BleLink, BleProfile, BtDevice } from '../platform'

/** A device the user connected to before (kept in Settings). */
export interface SavedDevice {
  /** The transport's id (Bluetooth: the device id / address). */
  id: string
  /** Which DeviceType it is (DeviceType.id). */
  type: string
  /** The name the user gave it, or null to show the advertised one. */
  name: string | null
  /** The name it advertises. */
  advertised: string | null
}

/** A connected device. The type's own session object is free to add whatever it needs. */
export interface DeviceSession {
  /** Ends the session (the link is closed by the connection manager). */
  close(): void
}

export interface ControlScreenProps {
  device: SavedDevice
  /** Back to the device list (the device stays connected). */
  onBack(): void
  onSettings(): void
  onDisconnect(): void
  /** Opens a dialog to rename the device. */
  onRename(): void
}

export interface DeviceType {
  /** Stable id, saved with each device. */
  id: string
  /** "LED board" */
  label: string
  /** Shown on the device's tile. */
  Icon: ComponentType<{ size?: number }>
  /** How it is reached. Only Bluetooth LE exists today. */
  transport: 'ble'
  /** The GATT services and characteristics its link uses (tried in order). */
  ble: BleProfile[]
  /**
   * How likely a device heard while scanning is of this type (0 not at all .. 1 surely), by what
   * it advertises. A scan lists every device; this picks the type to connect it as.
   */
  match(device: BtDevice): number
  /** The link is open: start the device's session on it. */
  open(link: BleLink, device: SavedDevice): DeviceSession
  /** Its control screen (fills the window; nothing on it scrolls). */
  ControlScreen: ComponentType<ControlScreenProps>
  /** Its own section in Settings, if it has options. */
  SettingsSection?: ComponentType
  /** A pretend link for trying the controls without a device, if the type offers one. */
  demoLink?(): BleLink
}
