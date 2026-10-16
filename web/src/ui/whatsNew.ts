// Notes shown by "What's new" (newest first). Add an entry with every version bump.

export const WHATS_NEW: { version: string; notes: string[] }[] = [
  {
    version: '2.8.4',
    notes: [
      'Solar: a Test the LEDs button checks each LED on the board, and the LEDs now latch their colour properly so a chain of two lights up together.',
    ],
  },
  {
    version: '2.8.3',
    notes: [
      'Grid-loss pattern is now yours to set in Solar: battery colour breathing on both LEDs, red flash on both LEDs every 5 s to 1 min, short, normal or long. The settings are saved on the board and kept after restarts. Needs board firmware 1.6.6.',
    ],
  },
  {
    version: '2.8.2',
    notes: [
      'Solar battery colours follow the charge: green solid from 80 %, orange breathing from 80 % to 70 %, yellow breathing from 70 % to 30 %, red below. Needs board firmware 1.6.4.',
    ],
  },
  {
    version: '2.8.1',
    notes: [
      'Material You screens have decoration: soft glows and rings in your colours behind the controls, a gradient title, and a glow around the LED preview. Motion is reduced if your system asks for it.',
    ],
  },
  {
    version: '2.8.0',
    notes: [
      'Material You is rebuilt on mdui, a true Material Design 3 component library: buttons, switches, sliders, tabs, chips, dialogs and text fields now look and move the way Google apps do, with bigger shapes, tonal surfaces and M3 type.',
      'Solar sits right next to Solid in Modes (Wi-Fi boards), as a light mode of its own.',
    ],
  },
  {
    version: '2.7.0',
    notes: [
      'Solar mode for the Wi-Fi board: paste your FoxESS API key under Modes > Solar and the board follows your inverter by itself, even with Glow closed. LED 1 shows the grid, LED 2 the battery, with pulses and red or green blinks. Needs board firmware 1.6.0.',
      'Candle: Smooth flicker now really is smooth (it was ignored by the Wi-Fi board before).',
    ],
  },
  {
    version: '2.6.2',
    notes: [
      'No more raw board messages (STATE, CLOUD and the like) popping up as toasts. Only messages written for people are shown.',
    ],
  },
  {
    version: '2.6.1',
    notes: [
      'Fixes Wi-Fi board firmware updates failing with Could Not Activate The Firmware: Glow sent a state read in the middle of the firmware file, corrupting it. Nothing else is sent during an update now.',
    ],
  },
  {
    version: '2.6.0',
    notes: [
      'Smoother, Material-style motion: screens slide in with a shared-axis transition (deeper from the right, back from the left) and overlap instead of leaving a gap, with Material 3 emphasized easing everywhere.',
      'The blur on every appear and vanish animation is gone: it redrew the whole layer each frame and made things stutter.',
    ],
  },
  {
    version: '2.5.3',
    notes: [
      'Fixes GitHub answering 403: update checks every few seconds now share one request, remember releases they have seen, and wait a couple of minutes when GitHub asks them to slow down.',
    ],
  },
  {
    version: '2.5.2',
    notes: [
      'Glow reads the Wi-Fi board every 5 seconds (colours, mode, brightness) and shows what the board really does, so changes from another phone or the internet show up.',
      'A toast tells you when your board has newer firmware. Board firmware 1.5.0 or newer is needed for colours on a WS2812B; older firmware only switches the LED on and off.',
    ],
  },
  {
    version: '2.5.1',
    notes: [
      'Updates are looked for every few seconds, for the app and (while connected) for the board firmware.',
      'No more toast when Glow connects through the internet.',
      'ESP32 board firmware 1.5.0: drives a WS2812B chain on GPIO4 in full colour, with every mode and effect.',
    ],
  },
  {
    version: '2.5.0',
    notes: [
      'Internet access without an account or any payment: Settings > Internet access uses a free public broker, and everything is encrypted end to end so the broker only carries noise. Your own broker still works.',
      'Needs board firmware 1.4.0 (Firmware under the LED). Connect to each board once on its own Wi-Fi so it gets the key.',
    ],
  },
  {
    version: '2.4.0',
    notes: [
      'Internet access: control Wi-Fi boards from anywhere. Add a free HiveMQ Cloud broker under Settings > Internet access; boards get it when you connect to them on their Wi-Fi, and Glow switches to the internet by itself when you are away.',
      'Needs board firmware 1.3.0 (Firmware under the LED updates it over Wi-Fi).',
    ],
  },
  {
    version: '2.3.0',
    notes: [
      'Wi-Fi LED boards update their own firmware: open Firmware under the LED, and Glow downloads the new version, sends it over Wi-Fi and reconnects. A dot shows when one is available.',
      'Board settings live on the board: its name, fade time, separate LEDs and candle and rainbow options are stored in the ESP32. Glow reads them when it connects, so every phone and PC shows the same, and writes your changes back.',
    ],
  },
  {
    version: '2.2.4',
    notes: [
      'After setting up a Wi-Fi board, Glow waits until this device is back on your Wi-Fi before connecting (it used to try the board setup network and fail with ECONNABORTED).',
    ],
  },
  {
    version: '2.2.3',
    notes: [
      'A Wi-Fi board that already has Wi-Fi shows up under Add a device on every Glow on the same network, so a second phone or PC can add it without resetting it.',
    ],
  },
  {
    version: '2.2.2',
    notes: [
      'A Wi-Fi board that still needs setting up now shows in the list after Add a device, not on the home screen.',
      'A board stops showing up once it has been given a Wi-Fi network. Use Reset device to make it show up again.',
    ],
  },
  {
    version: '2.2.1',
    notes: [
      'Wi-Fi boards that are not set up yet now show in the device list by themselves, no need to press Add a device.',
      'Setting up a Wi-Fi board joins its network for you (and returns to yours afterwards), which fixes it hanging on Talking to the board.',
      'The Wi-Fi name is filled in for you, and on Windows the password too. Android does not share the password, so type it there.',
      'Nothing in the app can be selected any more, except what you type in a text field.',
    ],
  },
  {
    version: '2.2.0',
    notes: [
      'Wi-Fi LED boards: Glow now controls an ESP32 LED board over Wi-Fi. Add a device > Set up a new Wi-Fi LED board, enter your Wi-Fi once, and the board remembers it.',
      'Reset device (on the board screen and in its long-press menu) makes the board forget its Wi-Fi so it can be set up again.',
    ],
  },
  {
    version: '2.1.3',
    notes: [
      'Settings cards stay where they are: two fixed columns, so opening or closing one never moves the others.',
    ],
  },
  {
    version: '2.1.2',
    notes: [
      'Settings fill the window: four cards (Design & colour, Shape & surface, Behaviour, Updates) flow over two columns on wide windows instead of leaving half of it empty.',
    ],
  },
  {
    version: '2.1.1',
    notes: [
      'The two LED previews are circles again (they were squeezed into ovals).',
      'The LED choice is now Linked, LED 1 or LED 2: Both did the same as Linked.',
    ],
  },
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
