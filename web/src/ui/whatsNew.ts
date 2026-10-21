// Notes shown by "What's new" (newest first). Add an entry with every version bump.

export const WHATS_NEW: { version: string; notes: string[] }[] = [
  {
    version: '2.13.63',
    notes: [
      'Cursors work how they should on desktop again: grab, grabbing and future custom cursors keep their alpha - the app no longer enters the Windows overlay mode that washed them half-transparent.',
    ],
  },

  {
    version: '2.13.62',
    notes: [
      'Desktop windows use their full width now: the app fills the real window size instead of stopping at a 1080px centred strip.',
    ],
  },

  {
    version: '2.13.61',
    notes: [
      'Going from Linked to Individual keeps the ring the one colour it was showing - it no longer splits into two colours when switching the layout.',
      'Spinner updated for firmware 2.1.2 and newer: brightness changes keep the arc turning, colour changes end it like a normal colour change; on a 2.1.1 board live recolouring still works.',
      'The firmware check finds the real newest release (2.1.4) even when versions.json is behind.',
    ],
  },

  {
    version: '2.13.60',
    notes: [
      'Firmware update offers work again: the app checks the real newest firmware release now, so boards on older firmware get offered the 2.1.1 flash.',
      'App update offers work again for Android: the app version the updater compares against had been frozen, so no new version was ever offered.',
      'The demo board always reports the newest released firmware and never falls back below what it already knows.',
    ],
  },

  {
    version: '2.13.59',
    notes: [
      'Spinner colour and brightness changes no longer restart the arc on firmware 2.1.1: dragging a colour recolours it live while it keeps turning (older firmware keeps the old behaviour).',
      'The spinner preview now shows the flat 8-pixel arc the board draws, instead of a tapering tail.',
      'A scene saved in Spinner mode starts the spinner on the board when you apply it.',
    ],
  },

  {
    version: '2.13.58',
    notes: [
      'The ring preview is bigger: it fills the panel now, with a visible gap between the pixels instead of overlapping dots.',
      'Per-pixel colours no longer reset to the two halves when you leave the controls and come back (Settings, the device list).',
      'The ring has its own preview component - the two-LED disc previews are untouched.',
      'The demo board always reports the newest released firmware (live from versions.json, like the update checks).',
    ],
  },

  {
    version: '2.13.57',
    notes: [
      'Individual now edits just the dot you tapped: the preview always keeps the ring\'s per-pixel picture (2.0.0 boards still follow per half until the per-pixel firmware).',
      'The ring draws as a circle again - it no longer stretched into an ellipse in tall preview areas.',
    ],
  },

  {
    version: '2.13.56',
    notes: [
      'The ring is here: Colour gets a Linked / Individual switcher and the preview draws the 24-dot ring, one clickable dot per pixel.',
      'New Spinner board mode (firmware 2.0.0+) with hue, saturation, brightness and a seconds-per-turn slider.',
      'Rainbow speed is a slider now (2-120 s a turn); the wheel rainbow needs firmware 2.0.0+.',
      'The candle style choice is hidden on firmware 2.0.0+: every flame is its own.',
      'Fixed the update dialog flipping back to Check for Updates one second after finding an update.',
      'The demo board now speaks virtual firmware 2.0.0.',
    ],
  },

  {
    version: '2.13.55',
    notes: [
      'The device name now opens a menu with Firmware and Reset (the pencil lives in the menu\'s title)',
      'Rename moved into that menu: tap the title - the name with the pencil and firmware version beside it',
    ],
  },

  {
    version: '2.13.54',
    notes: [
      'Scene buttons no longer replay their fade-in after the deck settles',
      'The brightness handle grows to 24px on hover (base stays 16px, press goes further)',
    ],
  },

  {
    version: '2.13.53',
    notes: [
      'The deck\'s settle flicker after a tab switch is gone',
      'The brightness handle now rests smaller, at 16px',
    ],
  },

  {
    version: '2.13.52',
    notes: [
      'Deck tabs now switch exactly like the screens: the old card leaves on its own (0.12 s), then the new one slides in',
      'The brightness handle is smaller than the colour strips\'',
      'FoxESS errors clear themselves as soon as the board reports everything fine',
    ],
  },

  {
    version: '2.13.51',
    notes: [
      'The switched pill grows just a little now instead of taking the whole middle — the other segments only shift by a few pixels when it opens.',
    ],
  },

  {
    version: '2.13.50',
    notes: [
      'The deck switcher now keeps every segment in place — the active one only lights up with its label.',
      'The brightness card is a bit slimmer.',
      'Mode tiles and scene tiles are the same compact size and style now (scenes use the modes\' buttons).',
      'The solar card is the height of the other cards and scrolls inside, so the bottom preview buttons stay reachable.',
    ],
  },

  {
    version: '2.13.49',
    notes: [
      'The brightness bar is now a slim 8px gauge — the other sliders keep their 12px tracks.',
    ],
  },

  {
    version: '2.13.48',
    notes: [
      'The slider handle now follows the Shapes setting exactly like every other control: circular from Medium corners up, gently squared below — the special Large-only threshold is gone.',
    ],
  },

  {
    version: '2.13.47',
    notes: [
      'Tab switches: the outgoing panel now fades away as quickly as when screens change, so it no longer lingers under the incoming one.',
    ],
  },

  {
    version: '2.13.46',
    notes: [
      'Switching Colour / Modes / Scenes / the mode options now slides the deck along the tab order — the same shared-axis motion as screen navigation, forward when moving right and back when moving left.',
    ],
  },

  {
    version: '2.13.45',
    notes: [
      'The switcher\'s icons now sit exactly in the middle of their buttons.',
      'Material slider: the track is a much slimmer 12px.',
    ],
  },

  {
    version: '2.13.44',
    notes: [
      'The Colour, Modes, Scenes and mode-options tabs are now a bottom switcher: round icon buttons, the chosen one grows into a labelled pill (keys C / M / S / T too).',
      'Material slider: slimmer 16px track, and the handle is a full circle from the Large corner setting up.',
    ],
  },

  {
    version: '2.13.43',
    notes: [
      'Material slider handle: every grab flips a coin for which way the diamond turns, +45 or -45',
    ],
  },

  {
    version: '2.13.42',
    notes: [
      'The material slider strip now joins the rubber band at half the handle\'s pull, and the handle gained a small shadow beneath it',
    ],
  },

  {
    version: '2.13.41',
    notes: [
      'The material slider handle is a rubber band now: drag it past either end and it drifts a little outward, springing back home on release',
    ],
  },

  {
    version: '2.13.40',
    notes: [
      'Removed the springy lean experiment from the material slider strip - the track stays steady, the diamond handle keeps all its spring',
    ],
  },

  {
    version: '2.13.39',
    notes: [
      'The material slider lean is calmer now: half the lean on jumps, and it slides on its spring instead of snapping into the clamp',
    ],
  },

  {
    version: '2.13.38',
    notes: [
      'The material slider strip now leans slightly toward sudden handle moves and springs back into place on the same material spring',
    ],
  },

  {
    version: '2.13.37',
    notes: [
      'Material slider handle is 26px, springs up to 30px and turns 45 degrees like a diamond while held; its colour now lifts slightly lighter than the track beneath for contrast',
    ],
  },

  {
    version: '2.13.36',
    notes: [
      'Material slider handle is a lot smaller now: a 24px square that grows to 28px held',
    ],
  },

  {
    version: '2.13.35',
    notes: [
      'Material slider handle is a square tile now, growing to 40px while held',
    ],
  },

  {
    version: '2.13.34',
    notes: [
      'Slider grabs no longer snap: the pebble keeps wherever you held it, and its edge is a darker shade of the colour under it',
    ],
  },

  {
    version: '2.13.33',
    notes: [
      'Material slider pebble edge is the darker primary again (2px), and the handle stays inside the cards at every value',
    ],
  },

  {
    version: '2.13.32',
    notes: [
      'Material slider pebble edge is now the secondary colour, constant while the fill follows the gradient',
    ],
  },

  {
    version: '2.13.31',
    notes: [
      'Material slider handle now picks up the gradient colour beneath it, with a same-colour 2px edge',
    ],
  },

  {
    version: '2.13.30',
    notes: [
      'Material slider pebble got a thin darker-primary outline and a little extra size',
    ],
  },

  {
    version: '2.13.29',
    notes: [
      'Material slider handle is now 4px taller than the track',
    ],
  },

  {
    version: '2.13.28',
    notes: [
      'Material slider: a bigger pebble handle riding a continuous track - no gap opens beneath it',
    ],
  },

  {
    version: '2.13.27',
    notes: [
      'Material slider handle is a pebble lying along the track now - it squares off and rises while pressed',
    ],
  },

  {
    version: '2.13.26',
    notes: [
      'Material slider handle restyled: a rounded tile in your shape setting that grows, squares off and rises while pressed, with the track springing open around it',
    ],
  },

  {
    version: '2.13.25',
    notes: [
      'Slider thumbs keep their colour while pressed and only grow taller, not wider',
    ],
  },

  {
    version: '2.13.24',
    notes: [
      'Material slider thumbs stretch to 40px while pressed',
    ],
  },

  {
    version: '2.13.23',
    notes: [
      'Grabbing cursor no longer upside down: the bitmap\'s rows were decoded wrong',
    ],
  },

  {
    version: '2.13.22',
    notes: [
      'The app starts a quarter faster: screens, What\'s new, glass effects and extra fonts now load only when needed',
      'Sliders drag with the real grabbing hand, shipped as a bitmap so it stays opaque',
    ],
  },

  {
    version: '2.13.21',
    notes: [
      'Dragging a slider shows a solid grabbing hand instead of a see-through one',
    ],
  },

  {
    version: '2.13.20',
    notes: [
      'Slider drags show the normal solid pointer again: the system\'s hand cursor renders half-see-through',
    ],
  },

  {
    version: '2.13.19',
    notes: [
      'Material sliders dim their handle to a grey while dragging; the pointer is back to normal',
    ],
  },

  {
    version: '2.13.18',
    notes: [
      'Material slider handles quiet down to a grey while you drag, with a matching grey pointer',
      'Tooling: node tools/release.mjs runs the whole app+desktop release at once',
    ],
  },

  {
    version: '2.13.17',
    notes: [
      'Material sliders stay in one piece: the gap around the handle and the fill level now glide exactly with the thumb, so they no longer pull ahead of it — not in rainbow mode, not on preset clicks.',
    ],
  },
  {
    version: '2.13.16',
    notes: [
      'Mode labels are now truly centred inside their tiles, both across and down.',
    ],
  },
  {
    version: '2.13.15',
    notes: [
      'Unavailable Modes now fade to the standard disabled chip look — a solid tile with a faint outline and greyed-out text — instead of vanishing.',
    ],
  },
  {
    version: '2.13.14',
    notes: [
      'Modes that the board can’t run are now clearly greyed out, instead of looking ready to use.',
    ],
  },
  {
    version: '2.13.13',
    notes: [
      'Modes are buttons again: solid Material tiles like the rest of the theme, with the chosen one filling in the colour — no outline and no check mark.',
    ],
  },
  {
    version: '2.13.12',
    notes: [
      'Material You settings cards have more room: the title rides a little higher and the text inside sits further from the edges.',
    ],
  },
  {
    version: '2.13.11',
    notes: [
      'Material You sliders: a taller handle (32 px, 38 px while dragging), and its corners follow the app’s Shapes setting — square with Square chosen, fully round from Medium up.',
    ],
  },
  {
    version: '2.13.10',
    notes: [
      'Material You sliders: the handle is a little taller (28 px, 34 px while dragging), still centred on the track.',
    ],
  },
  {
    version: '2.13.9',
    notes: [
      'Material You sliders: the handle sits centred on the track again, and is back to the brighter primary colour.',
      'Check for updates works now: tapping it skips Glow’s cached answers and asks GitHub straight away, so a fresh release is offered immediately instead of after a restart.',
      'Glow reads the version file without GitHub’s CDN copy, so it notices a new release within about a minute of it being published.',
    ],
  },
  {
    version: '2.13.8',
    notes: [
      'Material You sliders: the thumb sits properly centred on the track, is shorter, and is drawn in the lighter primary-container colour.',
    ],
  },
  {
    version: '2.13.7',
    notes: [
      'Material You sliders are redrawn to match the Material 3 style: a slim bar handle over a rounded track, with a visible nudge to a new value.',
      'Sliders show a grab cursor over the handle and a grabbing cursor while you drag.',
    ],
  },
  {
    version: '2.13.6',
    notes: [
      'Solar: “What you see” closes with the same fade as the other dialogs.',
    ],
  },
  {
    version: '2.13.5',
    notes: [
      'Solar: “What you see” now opens as a proper dialog over the whole screen instead of inside the card.',
    ],
  },
  {
    version: '2.13.4',
    notes: [
      'Leaving Settings closes all its cards, so they start folded next time.',
      'Solar: “What you see” opens in its own dialog from a button, laid out like What’s new.',
    ],
  },
  {
    version: '2.13.2',
    notes: [
      'Material You settings cards are smaller: less padding, and smaller headings.',
    ],
  },
  {
    version: '2.13.1',
    notes: [
      'Solar export colours: sky blue replaced, so turquoise, violet and magenta are clearly different (firmware 2.3.4).',
    ],
  },
  {
    version: '2.13.0',
    notes: [
      'The LED preview simulates the board’s modes with the same formulas and gamma, so the colours and brightness match the LEDs (solid, breathe, rainbow, candle). Sound and Solar still use an estimate.',
      'Sliders are redrawn: a thick filled track with a round handle that grows while you drag.',
    ],
  },
  {
    version: '2.12.2',
    notes: [
      'Material You: the ripple click effect is gone from every button, chip, switch, tab and card; keyboard focus still shows a ring.',
    ],
  },
  {
    version: '2.12.1',
    notes: [
      'The LED preview no longer asks the board for its colours: nothing extra runs on the board. The Solar card’s “What you see” is in its own panel.',
    ],
  },
  {
    version: '2.11.3',
    notes: [
      'Solar export colours are now distinct: green, lime, turquoise, sky blue, then violet from 5 kW (firmware 2.3.2).',
    ],
  },
  {
    version: '2.11.2',
    notes: [
      'The Solar card’s “What you see” now describes every LED state: grid, battery and alerts.',
      'Alerts (fault, low battery, battery full) pulse smoothly instead of blinking (firmware 2.3.1).',
    ],
  },
  {
    version: '2.11.1',
    notes: [
      'Solar grid light: export shows green, teal, then cyan in 1 kW steps up to 6 kW, pulsing faster with more power (firmware 2.3.0).',
    ],
  },
  {
    version: '2.11.0',
    notes: [
      'Solar: LED 1 now shows how much you import in steps: yellow, orange, then red, pulsing faster as the import rises (firmware 2.2.0).',
      'Import levels can be set to Small home, Medium or Large, and are saved on the board.',
    ],
  },
  {
    version: '2.10.2',
    notes: [
      'Solar grid light: yellow while importing, pulsing smoothly from 0.5 kW, red pulsing from 1 kW (firmware 2.1.1).',
    ],
  },
  {
    version: '2.10.0',
    notes: [
      'Ocean, Party, Aurora and Chase are removed (the board no longer runs them). A scene that used one becomes Solid.',
      'Solar: shorter text; the sign-in fields hide once you are signed in, and the card shows when it was last updated.',
      'Removed leftover code that nothing used.',
    ],
  },
  {
    version: '2.9.6',
    notes: [
      'Shorter text on the Solar card.',
    ],
  },
  {
    version: '2.9.5',
    notes: [
      'Solar: the username and password fields hide once you are signed in (only the account name and Sign out remain), and the card shows when it was last updated.',
    ],
  },
  {
    version: '2.9.4',
    notes: [
      'While Solar live data is running, the API settings (how often to ask FoxESS, Change key) are hidden, since they do not apply.',
      'The Solar card now refreshes its figures every 5 seconds.',
    ],
  },
  {
    version: '2.9.3',
    notes: [
      'Fixes the Solar tab: the live-data sign-in and the settings below it were squeezed into thin vertical strips. They now stack normally and scroll inside the card.',
    ],
  },
  {
    version: '2.9.2',
    notes: [
      'Dialogs open in the centre of the screen again (they had slid to the left), and the device and sleep menus no longer clip their rows or show a scrollbar.',
      'Scrollbars are gone from the layout: they no longer take space or shift the page. Scrolling still works with the wheel, touch and keys.',
      'Fixes the Solar tab being cut off: its card now scrolls inside itself, with a fade at the bottom when there is more.',
    ],
  },
  {
    version: '2.9.2',
    notes: [
      'Fixes the Solar tab being cut off: its card now scrolls inside itself, and is taller (a little on phones, a lot on wide windows).',
    ],
  },
  {
    version: '2.9.1',
    notes: [
      'Material 3 Expressive: the newest Material components. Thick sliders with a slim bar handle, connected button groups, buttons that change shape as you press them, a power button that turns into a rounded square when on, and a morphing loading shape while searching for devices.',
      'Material You looks the way Google apps do: a clean tonal background, large titles with a coloured subtitle, filled cards with big rounded shapes, and device tiles in colour containers with scalloped icon shapes.',
      'Animated squiggles: progress bars are wavy, and a moving wave sits under the large titles.',
      'No more GitHub 403s on update checks: Glow reads a small versions file from the repo instead of the rate-limited GitHub API.',
    ],
  },
  {
    version: '2.9.0',
    notes: [
      'Solar live data: sign in with your FoxESS username and password in Solar, and the board follows your inverter about every 5 seconds instead of every few minutes, by itself, even with Glow closed. The API key stays as the backup. Needs board firmware 1.7.0.',
    ],
  },
  {
    version: '2.8.5',
    notes: [
      'Fixes app updates not being offered: GitHub’s update feed only lists the last ten releases, so app releases were missed once firmware releases filled it. The app now reads the full release list (refreshed every ten minutes).',
    ],
  },
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
