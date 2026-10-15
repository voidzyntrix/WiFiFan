import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

/**
 * A Content-Security-Policy for the built app only (the dev server needs inline scripts for
 * live reload). Everything is local; GitHub is reached through the main process, not the page.
 */
function csp(): Plugin {
  return {
    name: 'glow-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: mediastream:; font-src 'self'" />`,
    ),
  }
}

// `base: './'` keeps every URL relative, so Electron can load the build from disk (dist/).
export default defineConfig({
  base: './',
  plugins: [react(), csp()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5173, strictPort: true },
})
