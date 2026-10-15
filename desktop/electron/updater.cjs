// Self-update for the portable Glow.exe: downloads the new exe next to the running one, then hands
// over to a small PowerShell script (update.ps1) that waits for Glow to exit, puts the new file in
// the old one's place (renamed to the new version when the old name carried one), re-points the
// shortcuts that opened the old file, and starts the new Glow. One click, no installer.

const { app, net } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { once } = require('node:events')
const { spawn } = require('node:child_process')

/** Only release files of this repo are ever downloaded. */
const ALLOWED = 'https://github.com/voidzyntrix/WiFiFan/releases/download/'

/** The file the user runs: the portable launcher's own path, or the exe itself when installed. */
function currentExe() {
  return process.env.PORTABLE_EXECUTABLE_FILE || (app.isPackaged ? process.execPath : null)
}

const fail = (message) => Object.assign(new Error(message), { expected: true })

/**
 * Downloads the release at [url] and swaps it in; resolves once the helper is running and Glow
 * may quit ([quit] is called then). Rejects with a message fit for the UI; 'UNSUPPORTED' means
 * this Glow can't replace itself (development run, not Windows) and the UI should open the page.
 * [onProgress]({ received, total }) is called while downloading (total 0 when unknown).
 */
async function install({ url, version, onProgress, quit, exe = currentExe(), allowedPrefix = ALLOWED }) {
  if (process.platform !== 'win32' || !exe) throw fail('UNSUPPORTED')
  if (typeof url !== 'string' || !url.startsWith(allowedPrefix)) throw fail('Refusing to download from an unexpected address.')
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw fail('Unexpected version number.')

  const dir = path.dirname(exe)
  const named = /^(Glow-Desktop-)\d+\.\d+\.\d+(\.exe)$/i.exec(path.basename(exe))
  const final = named ? path.join(dir, `${named[1]}${version}${named[2]}`) : exe
  const part = path.join(dir, `Glow-update-${version}.part`)

  // leftovers of an update that was cut off
  try { for (const f of fs.readdirSync(dir)) if (/^Glow-update-.*\.part$/.test(f)) fs.unlinkSync(path.join(dir, f)) } catch { /* not ours to worry about */ }

  let out
  try { out = fs.createWriteStream(part) } catch (e) { throw fail(cantWrite(dir)) }
  try { await once(out, 'open') } catch { throw fail(cantWrite(dir)) }

  let received = 0, total = 0
  try {
    const res = await net.fetch(url, { headers: { 'User-Agent': 'Glow-desktop' } })
    if (!res.ok) throw fail(`GitHub answered HTTP ${res.status}.`)
    total = Number(res.headers.get('content-length')) || 0
    const reader = res.body.getReader()
    let lastReport = 0
    onProgress?.({ received: 0, total })
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!out.write(value)) await once(out, 'drain')
      received += value.length
      const now = Date.now()
      if (now - lastReport > 100) { lastReport = now; onProgress?.({ received, total }) }
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())))
    onProgress?.({ received, total })
  } catch (e) {
    out.destroy()
    try { fs.unlinkSync(part) } catch { /* already gone */ }
    throw e.expected ? e : fail(`The download failed: ${e.message}`)
  }

  // it must be the whole file, and an executable
  try {
    if (total && received !== total) throw fail('The download was cut short.')
    const fd = fs.openSync(part, 'r')
    const head = Buffer.alloc(2)
    fs.readSync(fd, head, 0, 2, 0)
    fs.closeSync(fd)
    if (received < 1_000_000 || head.toString('latin1') !== 'MZ') throw fail('The downloaded file is not a Glow program.')
  } catch (e) {
    try { fs.unlinkSync(part) } catch { /* already gone */ }
    throw e
  }

  // hand over to the helper, which does the swap once this process has exited
  const script = path.join(os.tmpdir(), 'glow-update.ps1')
  const job = path.join(os.tmpdir(), 'glow-update-job.json')
  fs.writeFileSync(script, fs.readFileSync(path.join(__dirname, 'update.ps1')))
  fs.writeFileSync(job, JSON.stringify({ Old: exe, New: part, Final: final }), 'utf8')
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (/^(PORTABLE_|ELECTRON_)/i.test(k)) delete env[k]   // the new Glow starts fresh
  // Detached, so it outlives Glow (Node ties a normal child to its parent and ends it with it), and
  // through cmd.exe because PowerShell on its own won't run when detached from every console.
  const command = `"powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${script}" "${job}""`
  const child = spawn('cmd.exe', ['/d', '/s', '/c', command], {
    detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true, env,
  })
  try {
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
  } catch (e) {
    try { fs.unlinkSync(part) } catch { /* already gone */ }
    throw fail(`Couldn't start the updater: ${e.message}`)
  }
  child.unref()
  quit()
}

function cantWrite(dir) {
  return `Glow can't write to its own folder (${dir}). Move Glow.exe to a folder you own, such as Documents, and update again.`
}

module.exports = { install, currentExe }
