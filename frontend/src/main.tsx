import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled rather than pulled from a CDN: this app ships as one
// self-hosted container, so it should not depend on Google at runtime.
import '@fontsource/barlow/latin-400.css'
import '@fontsource/barlow-condensed/latin-500.css'
import '@fontsource/barlow-condensed/latin-600.css'
import '@fontsource/barlow-condensed/latin-700.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
