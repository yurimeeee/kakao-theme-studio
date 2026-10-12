import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './app/ErrorBoundary'
import { KakaoCallback } from './features/auth/KakaoCallback'

// The Kakao OAuth redirect lands on a real path (OAuth redirect URIs cannot carry a #fragment).
const isKakaoCallback = window.location.pathname === '/auth/kakao/callback'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>{isKakaoCallback ? <KakaoCallback /> : <App />}</ErrorBoundary>
  </StrictMode>,
)
