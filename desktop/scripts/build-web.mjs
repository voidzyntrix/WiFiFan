// Builds the shared app (web/) and copies it into dist/, which the packaged Glow.exe loads.
import { execSync } from 'node:child_process'
import { cpSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const web = fileURLToPath(new URL('../../web', import.meta.url))
const dist = fileURLToPath(new URL('../dist', import.meta.url))
execSync('npm run build', { cwd: web, stdio: 'inherit' })
rmSync(dist, { recursive: true, force: true })
cpSync(`${web}/dist`, dist, { recursive: true })
console.log('web build copied to desktop/dist')
