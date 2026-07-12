import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA: registra il service worker (attivo su build servita, ignora in dev con HMR)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}))
}

// Blocco verticale: il manifest lo impone nell'app installata; qui provo anche l'API (Android)
try { (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('portrait').catch(() => {}) } catch { /* non supportato */ }
