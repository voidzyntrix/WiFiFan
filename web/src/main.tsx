import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
// The UI is latin only: the subsets below are the ones the app ever renders, and only the weights
// styles.css uses (400/500; 700 stands in where 600 is set). Keeps the boot css and the apk small
// (the full set pulled in cyrillic, greek and vietnamese faces too); other scripts fall back to
// the system font.
import '@fontsource/roboto/latin-400.css'
import '@fontsource/roboto/latin-500.css'
import '@fontsource/roboto/latin-700.css'
import './ui/md'
import './styles.css'

// Selection and dragging are off everywhere (the CSS covers the page; this covers Material's shadow
// DOM and double-click or Ctrl+A), except inside a text field.
const inField = (e: Event) => e.composedPath().some((n) => n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement)
document.addEventListener('selectstart', (e) => { if (!inField(e)) e.preventDefault() })
document.addEventListener('dragstart', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
