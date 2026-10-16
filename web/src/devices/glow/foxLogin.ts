// Signing in to the FoxESS web portal, for Solar's live data (the board streams it: see main.ino "Fox live").
//
// The portal wants every request signed by FoxESS's own code, shipped as a small WebAssembly module
// (signature.wasm). It needs 16 MB of memory, far more than the board has, so the app runs it: it
// downloads the module once from the foxess-control project (pinned commit, checked by SHA-256), signs
// the login, and gives the board the session token. Same flow as foxess-control's web_session.py:
//   POST https://www.foxesscloud.com/basic/v0/user/login
//   {"user": <username>, "password": md5(password), "type": 1, "verification": 1}  ->  result.token

import { platform } from '../../platform'
import { md5 } from '../../lib/md5'
import { settings } from '../../settings/store'
import { board } from './board'

const BASE = 'https://www.foxesscloud.com'
const LOGIN_PATH = '/basic/v0/user/login'
const WASM_URL = 'https://raw.githubusercontent.com/nicois/foxess-control/bd83aefb98b2ee7ecfe62d538dc2a1e2b166e172/custom_components/foxess_control/foxess/signature.wasm'
const WASM_SHA256 = 'c817419723bff8168497384db98719f7e10f2840c763df997ba66a5223ee3a5b'
const CACHE_KEY = 'glow_fox_signature_wasm'
const LANG = 'en'

interface Signer { sign(path: string, token: string, lang: string, ts: string): string }
let signer: Promise<Signer> | null = null

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('')
const toB64 = (u: Uint8Array) => { let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s) }
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** The module, from the cache or downloaded; only ever the exact pinned file. */
export async function wasmBytes(download = (url: string) => platform.net.bytes(url, 64 * 1024)): Promise<Uint8Array> {
  const check = async (b: Uint8Array) => hex(await crypto.subtle.digest('SHA-256', b)) === WASM_SHA256
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) { const b = fromB64(cached); if (await check(b)) return b }
  } catch { /* no cache */ }
  const b = await download(WASM_URL)
  if (!(await check(b))) throw new Error("The FoxESS signature file didn't match; sign-in is off for safety")
  try { localStorage.setItem(CACHE_KEY, toB64(b)) } catch { /* storage full */ }
  return b
}

/** Runs the module the way foxess-control's signature.py does: three stub imports, begin_signature(url, token, lang, ts). */
export async function makeSigner(bytes: Uint8Array): Promise<Signer> {
  let mem: WebAssembly.Memory | null = null
  const env = {
    emscripten_memcpy_big: (d: number, s: number, n: number) => { new Uint8Array(mem!.buffer).copyWithin(d, s, s + n); return d },
    emscripten_resize_heap: () => 0,
    setTempRet0: () => {},
  }
  const { instance } = await WebAssembly.instantiate(bytes, { env })
  const ex = instance.exports as Record<string, (...a: number[]) => number> & { memory: WebAssembly.Memory }
  mem = ex.memory
  ex.__wasm_call_ctors()
  const write = (s: string) => {
    const e = new TextEncoder().encode(s + '\0')
    const p = ex.stackAlloc(e.length)
    new Uint8Array(mem!.buffer).set(e, p)
    return p
  }
  return {
    sign(path, token, lang, ts) {
      const sp = ex.stackSave()
      try {
        const r = ex.begin_signature(write(path), write(token), write(lang), write(ts))
        const u = new Uint8Array(mem!.buffer)
        let out = ''
        for (let i = r; u[i]; i++) out += String.fromCharCode(u[i])
        return out
      } finally { ex.stackRestore(sp) }
    },
  }
}

const getSigner = () => (signer ??= wasmBytes().then(makeSigner).catch((e) => { signer = null; throw e }))

/** Signs in with the username and the password's MD5; resolves with the session token. */
export async function foxLogin(user: string, passwordMd5: string): Promise<string> {
  const s = await getSigner()
  const ts = String(Date.now())
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'lang': LANG,
    'timestamp': ts,
    'signature': s.sign(LOGIN_PATH, '', LANG, ts),
    'token': '',
    'timezone': tz,
    'dt': `${tz}@${ts}@${now}`,
    'platform': 'web',
  }
  const text = await platform.net.post(BASE + LOGIN_PATH, headers, JSON.stringify({ user, password: passwordMd5, type: 1, verification: 1 }))
  let json: { errno?: number; msg?: string; result?: { token?: string } }
  try { json = JSON.parse(text) } catch { throw new Error('FoxESS sent an unreadable answer') }
  if (json.errno !== 0) throw new Error(json.msg ? `FoxESS: ${json.msg}` : `FoxESS refused the sign-in (${json.errno})`)
  const token = json.result?.token
  if (!token) throw new Error('FoxESS sent no token')
  return token
}

/** The password as FoxESS wants it: its MD5 (an MD5 already typed in is kept as it is). */
export const passwordMd5 = (p: string) => (/^[0-9a-f]{32}$/i.test(p.trim()) ? p.trim().toLowerCase() : md5(p.trim()))

/** Signs in with the saved login and gives the board the token. */
export async function refreshBoardToken(): Promise<void> {
  const { foxUser, foxPassMd5 } = settings.get()
  if (!foxUser || !foxPassMd5) throw new Error('No FoxESS login saved')
  const token = await foxLogin(foxUser, foxPassMd5)
  board.sendData(`fox=${JSON.stringify({ token, user: foxUser })}`)
}

export interface FoxStatus { live: number; token: number; bad: number; plant: number; age: number; user: string; err: string }
export function parseFox(line: string): FoxStatus | null {
  try { return JSON.parse(line.slice('FOX,'.length)) as FoxStatus } catch { return null }
}

const REFRESH_AFTER_S = 6 * 3600

/**
 * While the app is connected to a Wi-Fi board: when the board's token was refused or is older than
 * 6 hours, sign in again (with the saved login) and hand it the new one. Checked now and every 30 min.
 */
export function startFoxRefresh(): () => void {
  let stopped = false
  const check = async () => {
    if (stopped || board.snapshot.state !== 'connected') return
    const { foxUser, foxPassMd5 } = settings.get()
    if (!foxUser || !foxPassMd5) return
    const reply = board.waitFor('FOX,', 3000).catch(() => null)
    board.sendData('fox')
    const line = await reply
    const st = line ? parseFox(line) : null
    if (!st || stopped) return
    if (st.bad || !st.token || st.age < 0 || st.age > REFRESH_AFTER_S) {
      try { await refreshBoardToken() } catch { /* tried again next time; the Solar tab shows why */ }
    }
  }
  const first = window.setTimeout(() => void check(), 4000)
  const timer = window.setInterval(() => void check(), 30 * 60_000)
  return () => { stopped = true; window.clearTimeout(first); window.clearInterval(timer) }
}
