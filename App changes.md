# App changes

Changes the app needs for firmware 2.1.1 (spinner). Done in app 2.13.59.

## 1. Spinner: colour and brightness must not restart it

Firmware 2.1.1 keeps the spinner turning when `h=` or `l=` change its colour or
brightness. It takes the new colour at once.

Today `web/src/devices/glow/useLed.ts` re-sends `spin=H/S/V/T` on every colour or
brightness change (the `MODE.SPIN` case in `sendCurrent`, around line 492). Each
`spin=` restarts the turn from the top, so the arc jumps while the user drags.

**Change:** in Spinner mode, send `h=H/S/V` (or `l=`) for colour and brightness
changes. Send `spin=H/S/V/T` only when the mode is entered or the seconds per turn
change. Against firmware older than 2.1.1, keep sending `spin=` on every change.

## 2. Spinner preview: flat arc, not a taper

`web/src/devices/glow/simulate.ts` (the `MODE.SPIN` case, around line 157) draws a
tapered tail with a `PROFILE` of decreasing brightness. The board now draws a flat
arc: 8 pixels at full brightness, the rest dark.

**Change:** replace the `PROFILE` tail with a flat arc, lit at full value for
`tailIdx < 8` and dark for the rest.

## Not changed

- The app's use of `p=` and `pal=` (firmware 2.1.0) is unchanged.
- Firmware 2.1.1 keeps the same command names and version gates (`spin` 2.0.0,
  per-pixel 2.1.0).

## Firmware 2.1.2 changed this again

`spin` keeps turning only for brightness changes: a brightness-only `h=`/`l=`
(same hue and saturation, new value) keeps the arc turning; a colour change
ends the spinner like any other colour command. In the app, `spinLive` is
firmware 2.1.1 only, and 2.1.2+ adds `spinBri`; colour picks drop the Spinner
mode on every firmware except 2.1.1, and a send while in Spinner mode is a
brightness change, so `h=` keeps the arc turning. (App 2.13.59 shipped the
2.1.1 contract; app 2.13.61 is against 2.1.2–2.1.4.)
