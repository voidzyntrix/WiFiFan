// The Solar tab: the FoxESS API key, how often to ask, the low-battery alert, and what the board sees.
// The board does the work (solar.ts); this only configures it and shows its status.

import { useEffect, useState } from 'react'
import { openLink } from '../../platform'
import { Hint, PillButton, SegmentedPill, SettingHeading, SettingSwitch, TextField } from '../../ui/components/Controls'
import { Txt } from '../../ui/motion'
import { board } from './board'
import { MODE } from './modes'
import { describeSolar, parseSolar, solarCommand, solarFlags, type SolarStatus } from './solar'
import { parseFox, passwordMd5, refreshBoardToken, type FoxStatus } from './foxLogin'
import { settings, useSettings } from '../../settings/store'
import type { LedController } from './useLed'

const POLLS = [2, 5, 10, 15]
const FLASH_EVERY = [5, 10, 30, 60]
const FLASH_MS = [250, 500, 1000]

/** The grid-loss pattern, kept on the board (GRIDLOSS). */
interface GridLoss { both: number; flash: number; every: number; ms: number }
function parseGridLoss(line: string): GridLoss | null {
  try { return JSON.parse(line.slice('GRIDLOSS,'.length)) as GridLoss } catch { return null }
}
const LOWS = [10, 20, 30]
const FOX_API = 'https://www.foxesscloud.com/user/center'

export function SolarTab({ c }: { c: LedController }) {
  const [st, setSt] = useState<SolarStatus | null>(null)
  const [key, setKey] = useState('')
  const [changing, setChanging] = useState(false)
  const [gl, setGl] = useState<GridLoss | null>(null)
  const prefs = useSettings()
  const [fox, setFox] = useState<FoxStatus | null>(null)
  const [foxUserIn, setFoxUserIn] = useState(prefs.foxUser)
  const [foxPassIn, setFoxPassIn] = useState('')
  const [signing, setSigning] = useState(false)
  const [foxMsg, setFoxMsg] = useState<string | null>(null)

  // the live-data stream's state on the board, every few seconds
  useEffect(() => {
    let live = true
    const read = async () => {
      const reply = board.waitFor('FOX,', 2000).catch(() => null)
      board.sendData('fox')
      const line = await reply
      const v = line ? parseFox(line) : null
      if (live && v) setFox(v)
    }
    void read()
    const t = window.setInterval(() => void read(), 3000)
    return () => { live = false; window.clearInterval(t) }
  }, [])

  const signIn = async () => {
    const user = foxUserIn.trim()
    if (!user || (!foxPassIn && !prefs.foxPassMd5)) return
    setSigning(true); setFoxMsg(null)
    try {
      if (foxPassIn) settings.set({ foxUser: user, foxPassMd5: passwordMd5(foxPassIn) })
      else settings.set({ foxUser: user })
      await refreshBoardToken()
      setFoxPassIn('')
      setFoxMsg('Signed in. The board connects to the live stream now.')
    } catch (e) {
      setFoxMsg((e as Error).message)
    } finally { setSigning(false) }
  }
  const signOut = () => {
    board.sendData('fox={"off":true}')
    settings.set({ foxUser: '', foxPassMd5: '' })
    setFoxPassIn(''); setFoxMsg('Live data off. Solar uses the API key every few minutes.')
  }
  const liveText = !fox ? '' : fox.live === 2 ? 'Live, about every 5 seconds'
    : fox.bad ? 'The sign-in expired: tap Sign in'
      : fox.token && fox.live === 1 ? 'Connecting to the live stream…'
        : fox.token && !fox.plant ? 'Finding your plant…'
          : fox.token ? (fox.err || 'Waiting to connect') : 'Off: Solar asks FoxESS every few minutes'

  // the grid-loss pattern: read from the board once, and each change is saved on the board
  useEffect(() => {
    let live = true
    const reply = board.waitFor('GRIDLOSS,', 2000).catch(() => null)
    board.sendData('gridloss')
    void reply.then((line) => { const v = line ? parseGridLoss(line) : null; if (live && v) setGl(v) })
    return () => { live = false }
  }, [])
  const setGridLoss = (patch: Partial<GridLoss>) => {
    if (!gl) return
    const next = { ...gl, ...patch }
    setGl(next)
    board.sendData(`gridloss=${JSON.stringify(next)}`)
  }

  // what the board says, every few seconds
  useEffect(() => {
    let live = true
    const read = async () => {
      const reply = board.waitFor('SOLAR,', 2000).catch(() => null)
      board.sendData('solar')
      const line = await reply
      const s = line ? parseSolar(line) : null
      if (live && s) setSt(s)
    }
    void read()
    const timer = window.setInterval(() => void read(), 3000)
    return () => { live = false; window.clearInterval(timer) }
  }, [])

  const needKey = !!st && (!st.key || changing)
  useEffect(() => { solarFlags.setup = needKey; return () => { solarFlags.setup = false } }, [needKey])

  const send = (patch: Record<string, unknown>) => {
    board.sendData(solarCommand(patch))
    setSt((s) => (s ? { ...s, ...patch } as SolarStatus : s))
  }
  const saveKey = () => {
    const k = key.trim()
    if (!k) return
    send({ key: k, on: true })
    setKey(''); setChanging(false)
  }

  if (!st) return <div className="deck tune solar"><Hint>Asking the board…</Hint></div>

  return (
    <div className="deck tune solar">
      <div className="panel-head">
        <span>Solar</span>
        <span className="panel-state"><Txt>{!st.key ? 'Needs your FoxESS key' : st.err ? 'Problem' : !st.have ? 'Asking FoxESS…' : 'Following your inverter'}</Txt></span>
      </div>

      {needKey ? (
        <>
          <Hint>
            The board asks FoxESS for your inverter's state itself, so Solar keeps working with this app closed.
            Make an API key at foxesscloud.com (profile, API management) and paste it here. It is stored on the board.
          </Hint>
          <TextField label="FoxESS API key" value={key} onChange={setKey} maxLength={90} password onEnter={saveKey} />
          <div className="button-row">
            <PillButton text="Get a key" onClick={() => openLink(FOX_API)} />
            {changing && <PillButton text="Cancel" onClick={() => setChanging(false)} />}
            <PillButton text="Save and start" highlighted enabled={key.trim().length > 0} onClick={saveKey} />
          </div>
        </>
      ) : (
        <>
          <Hint><Txt>{st.err ? st.err : st.have ? describeSolar(st) : 'Waiting for the first answer from FoxESS…'}</Txt></Hint>
          {st.name && <Hint>Inverter: {st.name}</Hint>}
          <SettingHeading title="Ask FoxESS every" subtitle="FoxESS allows 1,440 questions a day per inverter" />
          <SegmentedPill options={POLLS.map((m) => `${m} min`)} selected={POLLS.indexOf(st.poll)} onSelect={(i) => send({ poll: POLLS[i] })} />
          <SettingHeading title="Low battery alert" subtitle="Red blinks when the battery drops below" />
          <SegmentedPill options={LOWS.map((p) => `${p} %`)} selected={LOWS.indexOf(st.low)} onSelect={(i) => send({ low: LOWS[i] })} />
          <SettingHeading title="What you see" />
          <Hint>
            LED 1 is the grid: green exporting, lime balanced, yellow then red as you import more, blue when the grid is down
            (with a red flash every 5 s), pulsing above 1 kW of import. LED 2 is the battery: green solid from 80 %, orange breathing
            from 80 % to 70 %, yellow breathing from 70 % to 30 %, red below that; it breathes faster below 20 %, and fades fully
            when the battery alone runs the house. Two quick red blinks every 10 s mean a fault, a low battery for 6 minutes; green blinks mean the battery is full and the sun is exporting.
          </Hint>
          <div className="button-row">
            <SettingHeading title="Live data (about every 5 s)" subtitle={liveText} />
            <Hint>
              Sign in with your FoxESS Cloud username and password (the ones for foxesscloud.com). Glow signs in and gives the board
              a session; the board then follows your inverter live by itself. Your API key stays as the backup. The password is kept
              on this device only as its MD5.
            </Hint>
            <TextField label="FoxESS username" value={foxUserIn} onChange={setFoxUserIn} maxLength={60} />
            <TextField label={prefs.foxPassMd5 ? 'Password (saved; type to change)' : 'FoxESS password'} value={foxPassIn} onChange={setFoxPassIn} maxLength={60} password onEnter={() => void signIn()} />
            {foxMsg && <Hint>{foxMsg}</Hint>}
            <div className="button-row">
              {(prefs.foxUser || fox?.token) ? <PillButton text="Sign out" onClick={signOut} /> : null}
              <PillButton text={signing ? 'Signing in…' : 'Sign in'} highlighted enabled={!signing && !!foxUserIn.trim() && (!!foxPassIn || !!prefs.foxPassMd5)} onClick={() => void signIn()} />
            </div>
            {gl && (
              <>
                <SettingHeading title="When the grid is lost" subtitle="Saved on the board, so it stays after restarts" />
                <SettingSwitch title="Battery colour on both LEDs" subtitle="Breathes the battery's colour on LED 1 as well (otherwise LED 1 is off)" checked={!!gl.both} onChange={(v) => setGridLoss({ both: v ? 1 : 0 })} />
                <SettingSwitch title="Red flash on both LEDs" subtitle="Both LEDs flash red for a moment" checked={!!gl.flash} onChange={(v) => setGridLoss({ flash: v ? 1 : 0 })} />
                <SettingHeading title="Flash every" />
                <SegmentedPill options={FLASH_EVERY.map((x) => (x < 60 ? `${x} s` : '1 min'))} selected={FLASH_EVERY.indexOf(gl.every)} onSelect={(i) => setGridLoss({ every: FLASH_EVERY[i] })} />
                <SettingHeading title="Flash length" />
                <SegmentedPill options={['Short', 'Normal', 'Long']} selected={FLASH_MS.indexOf(gl.ms)} onSelect={(i) => setGridLoss({ ms: FLASH_MS[i] })} />
              </>
            )}
            <PillButton text="Test the LEDs" onClick={() => board.sendData('ledtest')} />
            <PillButton text="Change key" onClick={() => setChanging(true)} />
            <PillButton text="Stop Solar" onClick={() => void c.startMode(MODE.SOLID)} />
          </div>
        </>
      )}
    </div>
  )
}
