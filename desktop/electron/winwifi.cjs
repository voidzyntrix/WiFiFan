// Windows Wi-Fi through the system's own tools (netsh and the WLAN API), for pairing Wi-Fi boards:
// which unpaired boards are in range (their "Glow-XXXX" networks), the network this PC is on (to
// fill in the setup form), and joining a board's network and returning to the previous one.
// No Electron in here, so it can be tried with plain node.

const { execFile } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function run(file, args, ms = 20000) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: ms, encoding: 'utf8' }, (_err, stdout) => resolve(stdout || ''))
  })
}
const netsh = (...args) => run('netsh', args)

// Windows only rescans now and then, so networks that just appeared are missing from netsh's list.
// This asks the adapter for a fresh scan (WlanScan) first.
const SCAN = `
Add-Type @'
using System; using System.Runtime.InteropServices;
public class GlowWlan {
  [DllImport("wlanapi.dll")] static extern int WlanOpenHandle(uint v, IntPtr r, out uint n, out IntPtr h);
  [DllImport("wlanapi.dll")] static extern int WlanEnumInterfaces(IntPtr h, IntPtr r, out IntPtr l);
  [DllImport("wlanapi.dll")] static extern int WlanScan(IntPtr h, ref Guid g, IntPtr a, IntPtr b, IntPtr c);
  public static void Scan() {
    uint n; IntPtr h, l;
    if (WlanOpenHandle(2, IntPtr.Zero, out n, out h) != 0) return;
    if (WlanEnumInterfaces(h, IntPtr.Zero, out l) != 0) return;
    if (Marshal.ReadInt32(l) < 1) return;
    Guid g = (Guid)Marshal.PtrToStructure(new IntPtr(l.ToInt64() + 8), typeof(Guid));
    WlanScan(h, ref g, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
  }
}
'@
[GlowWlan]::Scan()
`
const SCAN_ENCODED = Buffer.from(SCAN, 'utf16le').toString('base64')

/** SSIDs in the last scan whose name starts with `prefix`. */
async function listSetup(prefix) {
  const out = await netsh('wlan', 'show', 'networks', 'mode=bssid')
  const found = new Set()
  for (const m of out.matchAll(/^\s*SSID\s+\d+\s*:\s*(.+?)\s*$/gm)) if (m[1].startsWith(prefix)) found.add(m[1])
  return [...found]
}

/** Nearby unpaired boards, after a fresh scan. */
async function scanSetup(prefix) {
  await run('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', SCAN_ENCODED], 15000)
  await sleep(2500)
  return listSetup(prefix)
}

/** The network this PC is on: { ssid, profile, connected }, or null. */
async function current() {
  const out = await netsh('wlan', 'show', 'interfaces')
  const field = (name) => new RegExp(`^\\s*${name}\\s*:\\s*(.+?)\\s*$`, 'm').exec(out)?.[1] ?? null
  const state = field('State')
  const ssid = field('SSID')
  if (!ssid || !/^connected$/i.test(state ?? '')) return null
  return { ssid, profile: field('Profile') ?? ssid }
}

/** The name and (when Windows lets this user read it) the password of the network this PC is on. */
async function currentNetwork() {
  const c = await current()
  if (!c) return null
  const out = await netsh('wlan', 'show', 'profile', `name=${c.profile}`, 'key=clear')
  const key = /^\s*Key Content\s*:\s*(.*?)\s*$/m.exec(out)?.[1]
  return { ssid: c.ssid, password: key || null }
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

let joined = null   // { ssid, previous }

/** Joins the first nearby network starting with `prefix` (the board's own, with its known password). */
async function joinSetup(prefix, password) {
  let ssid = null
  for (let i = 0; i < 6 && !ssid; i++) {
    ssid = (await scanSetup(prefix))[0] ?? null
    if (!ssid) await sleep(1000)
  }
  if (!ssid) throw new Error("No board network was found nearby. Is the board powered and not yet set up?")

  const previous = (await current())?.profile ?? null
  const file = path.join(os.tmpdir(), `glow-setup-${process.pid}.xml`)
  fs.writeFileSync(file, `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${esc(ssid)}</name>
  <SSIDConfig><SSID><name>${esc(ssid)}</name></SSID></SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>manual</connectionMode>
  <MSM><security>
    <authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption>
    <sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${esc(password)}</keyMaterial></sharedKey>
  </security></MSM>
</WLANProfile>`)
  try { await netsh('wlan', 'add', 'profile', `filename=${file}`, 'user=current') } finally { fs.rmSync(file, { force: true }) }

  joined = { ssid, previous }
  await netsh('wlan', 'connect', `name=${ssid}`, `ssid=${ssid}`)
  // on the board's network, with an address from its DHCP (192.168.4.x)
  const onBoard = () => Object.values(os.networkInterfaces()).some((l) => (l || []).some((a) => a.family === 'IPv4' && a.address.startsWith('192.168.4.')))
  for (let i = 0; i < 30; i++) {
    await sleep(1000)
    if ((await current())?.ssid === ssid && onBoard()) return { ssid }
  }
  await leaveSetup()
  throw new Error(`Couldn't join ${ssid}`)
}

/** Back to the network this PC was on, and forgets the board's. */
async function leaveSetup() {
  const j = joined
  joined = null
  if (!j) return
  if (j.previous) await netsh('wlan', 'connect', `name=${j.previous}`)
  await netsh('wlan', 'delete', 'profile', `name=${j.ssid}`)
}

module.exports = { scanSetup, current, currentNetwork, joinSetup, leaveSetup }
