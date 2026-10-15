// `npm run dev`: starts the shared app's Vite dev server (web/, live reload), then Electron on top of it.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electron = require('electron')   // the path of the Electron executable
const webDir = fileURLToPath(new URL('../../web', import.meta.url))
const { createServer } = await import(new URL('../../web/node_modules/vite/dist/node/index.js', import.meta.url).href)

const server = await createServer({ root: webDir, configFile: `${webDir}/vite.config.mts` })
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
