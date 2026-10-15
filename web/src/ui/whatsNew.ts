// Notes shown by "What's new" (newest first). Add an entry with every version bump.

export const WHATS_NEW: { version: string; notes: string[] }[] = [
  {
    version: '2.1.0',
    notes: [
      'Material You is now its own design (Settings > Design): solid Material 3 surfaces, buttons, tabs, chips, sliders, dialogs and a floating button. Glass stays as the other design. Phones start with Material You.',
      'Much smoother on phones: the whole screen no longer redraws with the LED animation, and blur and WebGL are off by default there (Light effects).',
      'Every mode has its own options on the main screen, in a tab named after the mode (Candle, Rainbow, Music, Fade, Screen). The board settings section is gone; firmware moved to a button under the LED.',
      'Corners are consistent: Square makes everything square, and Small, Medium, Large and the custom size scale every card, button, chip, switch and dot together.',
      'Your own colour picker and text fields instead of the browser ones.',
      'Fixed controls overlapping on narrow screens, the desktop controls panel stretching, and the squashed mode buttons.',
      'Refraction only bends the background now (no highlights); the LED glow is fainter.',
    ],
  },
  {
    version: '2.0.0',
    notes: [
      'One app for Android and Windows: both now run the same code, so every feature lands on both at once.',
      'Material You: real Material 3 buttons, tabs, chips, switches and dialogs, coloured from your wallpaper (Android) or accent colour (Windows).',
      'Built for more kinds of devices: a device list holds every device you have, and each kind gets its own control screen.',
      'Nothing scrolls except Settings: the controls sit in tabs and long lists turn pages.',
      'Removed: the fluid and net backgrounds, solar, battery alerts and auto light. Frosted and refractive glass stay.',
    ],
  },
  {
    version: '1.13.1',
    notes: [
      'Grid fluid is now the very same fluid as the particle one (same splashes, viscosity, mouse force and window sloshing), drawn as cells of water.',
      'Every grid sits on whole rows: the cells are square and an exact number of them fills the window height, so the bottom is a cell edge.',
    ],
  },
  {
    version: '1.13.0',
    notes: [
      'Grid fluid: a new Fluid style made of cells of water that fall, spread and level out. The pointer pushes (or with Ctrl pulls) the water between cells.',
      'Grid resolution: one slider sets the cell size of the Cells net, the Dots spacing and the Grid fluid, together.',
      'The Cells net shows its colours much more strongly, and it feels the Grid fluid too.',
    ],
  },
  {
    version: '1.12.2',
    notes: [
      'Cells net: waves going up are green and going down amber, as well as red for left and blue for right.',
      'The colours fade out slowly and are averaged with the neighbouring cells, so they come out smooth.',
      'The mouse no longer touches the grid: it moves the fluid, and the fluid stirs the grid.',
    ],
  },
  {
    version: '1.12.1',
    notes: [
      'Cells net: black where nothing moves, red where a wave travels left, blue where it travels right.',
      'Waves fade out faster.',
    ],
  },
  {
    version: '1.12.0',
    notes: [
      'Net style: choose between the Dots net and a new Cells net, a grid of cells that carries waves.',
      'Cells: the mouse presses the grid down (Ctrl lifts it), moving fluid kicks the cells it enters and leaves, and the waves ride along with the fluid.',
      'Motion blur for the fluid: fast fluid leaves a soft trail. A slider sets how much (or off).',
    ],
  },
  {
    version: '1.11.3',
    notes: [
      'Reverted the sticky grab: Ctrl attracts the fluid as it did in 1.11.0 again.',
    ],
  },
  {
    version: '1.11.2',
    notes: [
      'Fixed Music, Visualizer and Screen sync getting stuck on Starting: the app stopped the sync a moment after it began.',
    ],
  },
  {
    version: '1.11.1',
    notes: [
      'Fluid grabbed with Ctrl stays grabbed until you let go: it is held to the pointer however fast you move, carried along with it and slowed around it instead of shooting through or flying off.',
    ],
  },
  {
    version: '1.11.0',
    notes: [
      'The mouse is one simple force now: it repels the fluid, and holding Ctrl makes it attract.',
      'Whole screen is the same force with a reach so large it covers everything; Nearby fluid limits it to the fluid around the pointer.',
      'The old movement push, the paddle and the steady force are gone.',
    ],
  },
  {
    version: '1.10.0',
    notes: [
      'Hold Ctrl and the pointer attracts the fluid instead of pushing it: its movement, its paddle and its steady force are all inverted.',
    ],
  },
  {
    version: '1.9.0',
    notes: [
      'The mouse pushes the fluid away all the time, not only while it moves: a steady force outwards, strongest right at the pointer.',
    ],
  },
  {
    version: '1.8.1',
    notes: [
      'Mouse movement at 100 % is a lot faster: the fluid near the pointer is dragged along at the speed of the pointer.',
    ],
  },
  {
    version: '1.8.0',
    notes: [
      'Viscosity: a new slider for the fluid, from watery to thick.',
      'Menus open on top of everything: the mode menu can no longer be covered by the cards below it, and clicking outside only closes it.',
      'Mouse movement hits harder: the pointer also pushes fluid outwards like a paddle, and fluid can move faster.',
    ],
  },
  {
    version: '1.7.1',
    notes: [
      'Mouse movement is much stronger at the top of the slider: 100 % is now eight times what it was (up to 60 % it is unchanged).',
    ],
  },
  {
    version: '1.7.0',
    notes: [
      'Mouse reach: choose in Settings whether moving the mouse moves all the fluid on screen or only the fluid near the pointer.',
    ],
  },
  {
    version: '1.6.1',
    notes: [
      'Fluid: the outline is the full-brightness colour and the fluid itself is a lot darker.',
    ],
  },
  {
    version: '1.6.0',
    notes: [
      'Fluid is a simple two-tone liquid now: the main colour with a thin lighter outline.',
      'Thin sheets, drops and spray no longer vanish: even a single drop of fluid shows.',
      'Net opacity: a new slider under Dot net, from hidden to strong.',
      'Mouse movement goes further: the top of the slider is three times as strong as before (up to 60 % it is unchanged).',
    ],
  },
  {
    version: '1.5.1',
    notes: [
      'Fluid redrawn: a clean, smooth liquid with a thin lit edge instead of a thick rim.',
      'The dot net is hidden under the fluid.',
      'Dragging the window no longer makes the fluid lag: the window speed is smoothed, the work per frame is capped, and large screens draw fewer pixels.',
    ],
  },
  {
    version: '1.5.0',
    notes: [
      'Fluid looks like water now: it deepens with depth, catches light along its surface, glints, foams where it moves fast and glows softly around its edge.',
      'Press the backslash key to switch the Demo board on or off, in any build.',
    ],
  },
  {
    version: '1.4.0',
    notes: [
      'One-click updates: Update downloads the new Glow, puts it in place of the old one (renamed to the new version) and restarts, all by itself.',
      'Shortcuts that opened the old file open the new one.',
      'The update prompt at launch has an Update now button and shows the progress.',
    ],
  },
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
