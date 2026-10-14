// `npm run dev`: starts the Vite dev server (live reload of the UI), then Electron on top of it.
import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electron = require('electron')   // the path of the Electron executable

const server = await createServer({ configFile: fileURLToPath(new URL('../vite.config.mts', import.meta.url)) })
await server.listen()
const url = server.resolvedUrls.local[0]
console.log(`UI at ${url}`)

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, GLOW_DEV_URL: url },
})
child.on('exit', async (code) => {
  await server.close()
  process.exit(code ?? 0)
})
