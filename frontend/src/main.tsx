import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled rather than pulled from a CDN: this app ships as one
// self-hosted container, so it should not depend on Google at runtime.
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
// Latin Extended carries č ć š ž đ, so Serbian text (lib/i18n.ts) stays in Inter
// instead of falling back to the system font for every other word.
import '@fontsource/inter/latin-ext-400.css'
import '@fontsource/inter/latin-ext-500.css'
import '@fontsource/inter/latin-ext-600.css'
import '@fontsource/inter/latin-ext-700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
