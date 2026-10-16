// Settings > Internet access: control Wi-Fi boards from anywhere. No account needed: Glow uses a
// free public MQTT broker and encrypts everything end to end (devices/cloud.ts). Your own broker
// works too. Boards get the settings whenever Glow reaches them on their own Wi-Fi.

import { useState } from 'react'
import { PUBLIC_BROKERS, boardJson, isConfigured, newKey } from '../../devices/cloud'
import { board } from '../../devices/glow/board'
import { settings, useSettings, type CloudConfig } from '../../settings/store'
import { Hint, PillButton, TextField } from '../components/Controls'
import { SettingsCard } from '../components/SettingsCard'
import { toast } from '../toast'

/** A board connected on its own Wi-Fi gets the new settings at once; the others when Glow next reaches them there. */
function pushToBoard(line: string) {
  if (board.snapshot.state === 'connected' && board.snapshot.kind === 'wifi') board.sendData(line)
}

export function CloudCard({ i }: { i: number }) {
  const saved = useSettings().cloud
  const [host, setHost] = useState(saved?.host ?? '')
  const [user, setUser] = useState(saved?.user ?? '')
  const [pass, setPass] = useState(saved?.pass ?? '')
  const [port, setPort] = useState(String(saved?.port ?? 8883))
  const [wsPort, setWsPort] = useState(String(saved?.wsPort ?? 8884))
  const [custom, setCustom] = useState(!!saved && !PUBLIC_BROKERS.some((b) => b.host === saved.host))

  const store = (c: Omit<CloudConfig, 'key'>) => {
    const cloud: CloudConfig = { ...c, key: saved?.key ?? newKey() }
    settings.set({ cloud })
    pushToBoard(`cloud=${boardJson(cloud)}`)
    toast('Saved. Connect to each board once on its own Wi-Fi to give it this.')
  }
  const usePublic = (b: (typeof PUBLIC_BROKERS)[number]) => {
    setHost(b.host); setPort(String(b.port)); setWsPort(String(b.wsPort)); setUser(''); setPass('')
    store({ host: b.host, port: b.port, wsPort: b.wsPort, tls: true, user: '', pass: '' })
  }
  const saveCustom = () => {
    const h = host.trim().replace(/^[a-z]+:\/\//i, '').replace(/[/:].*$/, '')
    const p = [Number(port), Number(wsPort)]
    if (!h || !p.every((n) => Number.isInteger(n) && n > 0 && n < 65536)) { toast('Check the server address and the ports'); return }
    setHost(h)
    store({ host: h, port: p[0], wsPort: p[1], tls: true, user: user.trim(), pass })
  }
  const remove = () => {
    settings.set({ cloud: null })
    pushToBoard('cloud={}')
    setHost(''); setUser(''); setPass(''); setCustom(false)
    toast('Internet access removed')
  }

  return (
    <SettingsCard id="cloud" title="Internet access" i={i}>
      <Hint>
        Control Wi-Fi boards from anywhere. No account and no payment: Glow uses a free public broker, and everything
        is encrypted end to end, so the broker only carries noise. Connect to each board once on its own Wi-Fi to give it this.
      </Hint>
      <div className="button-row">
        {PUBLIC_BROKERS.map((b) => (
          <PillButton key={b.host} text={b.name} highlighted={saved?.host === b.host} onClick={() => usePublic(b)} />
        ))}
        <PillButton text="My own broker" highlighted={custom} onClick={() => setCustom(true)} />
      </div>
      {isConfigured(saved) && <Hint>On: {saved.host}</Hint>}
      {custom && (
        <>
          <TextField label="Server" value={host} onChange={setHost} placeholder="broker.example.com" maxLength={90} />
          <TextField label="Username (if it needs one)" value={user} onChange={setUser} maxLength={60} />
          <TextField label="Password" value={pass} onChange={setPass} maxLength={60} password />
          <div className="button-row">
            <TextField label="Board port (TLS)" value={port} onChange={setPort} maxLength={5} />
            <TextField label="App port (WebSocket)" value={wsPort} onChange={setWsPort} maxLength={5} />
          </div>
          <div className="button-row"><PillButton text="Save" highlighted onClick={saveCustom} /></div>
        </>
      )}
      {isConfigured(saved) && <div className="button-row"><PillButton text="Turn off" onClick={remove} /></div>}
    </SettingsCard>
  )
}
