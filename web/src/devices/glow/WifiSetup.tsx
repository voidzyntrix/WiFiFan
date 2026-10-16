// "Set up a new Wi-Fi LED board": the network's name and password, then the pairing (pair.ts) with
// each step shown. On Android Glow joins the board's own network itself; on Windows the user does.

import { useEffect, useRef, useState } from 'react'
import { platform } from '../../platform'
import { Dialog, PillButton, ProgressBar, TextField } from '../../ui/components/Controls'
import { Swap, Txt } from '../../ui/motion'
import type { SetupProps } from '../types'
import { SETUP_PASSWORD, SETUP_PREFIX, pairBoard, type PairStep } from './pair'

const STEP_TEXT: Record<PairStep, string> = {
  join: "Joining the board's own Wi-Fi… (your phone may ask you to confirm)",
  connect: 'Talking to the board…',
  send: 'Sending your Wi-Fi to the board…',
  joining: 'The board is joining your Wi-Fi…',
  find: 'Looking for the board on your Wi-Fi…',
}

export function WifiSetup({ ssid: board, onDone, onDismiss }: SetupProps) {
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<PairStep | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filled, setFilled] = useState<'none' | 'name' | 'both'>('none')
  const signal = useRef({ cancelled: false })
  useEffect(() => () => { signal.current.cancelled = true }, [])

  // The network this device is on, filled in (the password too where the system allows reading it).
  useEffect(() => {
    let live = true
    void platform.wifi?.currentNetwork?.().then((n) => {
      if (!live || !n?.ssid) return
      setSsid((s) => s || n.ssid!)
      if (n.password) setPassword((p) => p || n.password!)
      setFilled(n.password ? 'both' : 'name')
    })
    return () => { live = false }
  }, [])

  const manualJoin = !platform.wifi?.joinSetup
  const ok = ssid.trim().length > 0 && (password.length === 0 || password.length >= 8)

  const start = async () => {
    if (!ok || step) return
    setError(null)
    signal.current = { cancelled: false }
    const run = signal.current
    try {
      setStep(manualJoin ? 'connect' : 'join')
      const device = await pairBoard(ssid.trim(), password, (s) => { if (!run.cancelled) setStep(s) }, run, board)
      if (!run.cancelled) onDone(device)
    } catch (e) {
      if (!run.cancelled) { setStep(null); setError((e as Error).message) }
    }
  }

  const cancel = () => { signal.current.cancelled = true; onDismiss() }

  return (
    <Dialog onDismiss={cancel}>
      <h2 className="dialog-title">Set up a Wi-Fi board</h2>
      <Swap k={step ? 'busy' : 'form'} className="stack">
        {step ? (
          <>
            <div className="dialog-sub"><Txt>{STEP_TEXT[step]}</Txt></div>
            <ProgressBar fraction={null} />
            <div className="dialog-buttons"><PillButton text="Cancel" onClick={cancel} /></div>
          </>
        ) : (
          <>
            <div className="dialog-sub">
              {manualJoin
                ? <>Power the board. A new board opens a Wi-Fi network named <b>{SETUP_PREFIX}XXXX</b> (password <b>{SETUP_PASSWORD}</b>); join it on this PC, then enter the Wi-Fi the board should use (2.4 GHz). The PC goes back to its own network by itself.</>
                : <>Glow joins the board's own network ({board ?? SETUP_PREFIX + 'XXXX'}) for a moment and sends it the Wi-Fi it should use (2.4 GHz).</>}
            </div>
            {filled !== 'none' && (
              <div className="dialog-sub">
                {filled === 'both' ? 'Filled in from the Wi-Fi this device is on.' : 'The name is filled in from the Wi-Fi this device is on. Android doesn\'t share its password, so type it.'}
              </div>
            )}
            {error && <div className="dialog-sub error">{error}</div>}
            <TextField label="Wi-Fi name" value={ssid} onChange={setSsid} maxLength={32} autoFocus onEnter={start} />
            <TextField label="Password" value={password} onChange={setPassword} maxLength={63} password onEnter={() => void start()} />
            <div className="dialog-buttons">
              <PillButton text="Cancel" onClick={cancel} />
              <PillButton text={error ? 'Try again' : 'Set up'} highlighted enabled={ok} onClick={() => void start()} />
            </div>
          </>
        )}
      </Swap>
    </Dialog>
  )
}
