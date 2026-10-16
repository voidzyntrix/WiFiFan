// Settings > Internet access: the cloud broker that lets Glow reach Wi-Fi boards from anywhere.
// Entered once; boards get it whenever Glow reaches them on the local network (devices/cloud.ts).

import { useState } from 'react'
import { boardJson, isConfigured } from '../../devices/cloud'
import { board } from '../../devices/glow/board'
import { openLink } from '../../platform'
import { settings, useSettings } from '../../settings/store'
import { PillButton, TextField, Hint } from '../components/Controls'
import { SettingsCard } from '../components/SettingsCard'
import { toast } from '../toast'

const CONSOLE = 'https://console.hivemq.cloud'

export function CloudCard({ i }: { i: number }) {
  const saved = useSettings().cloud
  const [host, setHost] = useState(saved?.host ?? '')
  const [user, setUser] = useState(saved?.user ?? '')
  const [pass, setPass] = useState(saved?.pass ?? '')
  const [port, setPort] = useState(String(saved?.port ?? 8883))
  const [wsPort, setWsPort] = useState(String(saved?.wsPort ?? 8884))

  const clean = host.trim().replace(/^[a-z]+:\/\//i, '').replace(/[/:].*$/, '')
  const ports = [Number(port), Number(wsPort)]
  const ok = clean.length > 0 && user.trim().length > 0 && pass.length > 0 && ports.every((p) => Number.isInteger(p) && p > 0 && p < 65536)
  const changed = !saved || saved.host !== clean || saved.user !== user.trim() || saved.pass !== pass || saved.port !== ports[0] || saved.wsPort !== ports[1]

  const save = () => {
    if (!ok) return
    const cloud = { host: clean, port: ports[0], wsPort: ports[1], tls: saved?.tls ?? true, user: user.trim(), pass }
    settings.set({ cloud })
    setHost(clean)
    // a board connected on the local network gets it now; others when Glow next reaches them at home
    if (board.snapshot.state === 'connected' && board.snapshot.kind === 'wifi') board.sendData(`cloud=${boardJson(cloud)}`)
    toast('Saved. Boards get it when you connect to them on their Wi-Fi.')
  }
  const remove = () => {
    settings.set({ cloud: null })
    setHost(''); setUser(''); setPass(''); setPort('8883'); setWsPort('8884')
    if (board.snapshot.state === 'connected' && board.snapshot.kind === 'wifi') board.sendData('cloud={}')
    toast('Internet access removed')
  }

  return (
    <SettingsCard id="cloud" title="Internet access" i={i}>
      <Hint>
        Control Wi-Fi boards from anywhere. Make a free cluster at HiveMQ Cloud, add a login under Access Management,
        then enter its address and login here. Connect to each board once on its own Wi-Fi so it gets them.
      </Hint>
      <TextField label="Server (cluster URL)" value={host} onChange={setHost} placeholder="abc123.s1.eu.hivemq.cloud" maxLength={90} />
      <TextField label="Username" value={user} onChange={setUser} maxLength={60} />
      <TextField label="Password" value={pass} onChange={setPass} maxLength={60} password />
      <div className="button-row">
        <TextField label="Board port" value={port} onChange={setPort} maxLength={5} />
        <TextField label="App port (WebSocket)" value={wsPort} onChange={setWsPort} maxLength={5} />
      </div>
      <div className="button-row">
        <PillButton text="Open HiveMQ Cloud" onClick={() => openLink(CONSOLE)} />
        {isConfigured(saved) && <PillButton text="Remove" onClick={remove} />}
        <PillButton text="Save" highlighted enabled={ok && changed} onClick={save} />
      </div>
    </SettingsCard>
  )
}
