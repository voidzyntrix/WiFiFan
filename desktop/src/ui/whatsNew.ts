// Notes shown by "What's new" (newest first). Add an entry with every version bump.

export const WHATS_NEW: { version: string; notes: string[] }[] = [
  {
    version: '1.3.0',
    notes: [
      'Net stiffness: a slider under Dot net sets how taut the net is, from loose and wobbly to snappy.',
    ],
  },
  {
    version: '1.2.0',
    notes: [
      'Dot net: the Particles and Fluid backgrounds now carry a net of dots joined by lines.',
      'Move the mouse through it to push dots away; each dot tugs its neighbours, so the movement travels through the net as a wave.',
      'Settings > App UI > Dot net turns it off.',
    ],
  },
  {
    version: '1.1.0',
    notes: [
      'Everything is glass: every card, button, pill, switch, slider, menu, dialog and toast either blurs or (with Refractive glass) bends what is behind it.',
      'Everything that changes now animates: screens, dialogs, menus and toasts leave as gracefully as they arrive.',
      'Settings that appear and disappear unfold and fold; swapped content cross-fades; changed text fades in.',
      'Theme, colour and corner changes glide instead of snapping; sliders slide to new values.',
      'Scenes, boards and devices slide into place when the list changes.',
      'Switching background fades through, and the Fluid and Aurora colours follow the LED smoothly.',
    ],
  },
  {
    version: '1.0.0',
    notes: [
      'Glow for Windows: everything from the phone app, at your desk.',
      'Connect over Bluetooth; boards you used before reconnect with one click.',
      'Solid, Rainbow, Candle, Breathe, Ocean, Party, Aurora and Chase, Linked or Separate LEDs.',
      'Music listens to the microphone; Visualizer plays along with everything Windows plays; Screen sync follows your monitor.',
      'Auto light follows Windows lock and idle time, or the room light seen through the webcam.',
      'Fluid background: real water that follows your mouse movements and sloshes when you drag the window.',
      'Refractive glass drawn at full resolution, with curved, light-catching edges.',
      'Built for the mouse: scenes, mode, brightness and colour sit together under the power button.',
      'Board firmware updates over Bluetooth, from GitHub or a .bin file.',
      'Keyboard shortcuts: Space power, 1-9 scenes, [ ] brightness, M modes.',
      'Keeps running in the tray while a sync or Auto light drives the LED.',
    ],
  },
]
