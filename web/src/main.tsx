import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
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
