import { Component, type ErrorInfo, type ReactNode, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { initializeTelegram } from './lib/telegram'

initializeTelegram()

class RootErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state: { err: Error | null } = { err: null }

  static getDerivedStateFromError(err: Error): { err: Error } {
    return { err }
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    console.error('App crashed:', err, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.err) {
      return (
        <div
          style={{
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
            maxWidth: 520,
            margin: '48px auto',
            color: '#0f172a',
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Не удалось загрузить приложение</h1>
          <p style={{ color: '#64748b', marginTop: 12, lineHeight: 1.5 }}>
            Обновите страницу. Если экран был белым после прошлого визита — в браузере очистите данные сайта для этого
            адреса (битый кэш каталога). Для локальной разработки нужен файл <code>.env</code> с{' '}
            <code>VITE_SUPABASE_URL</code> и <code>VITE_SUPABASE_ANON_KEY</code>.
          </p>
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              fontSize: 12,
              overflow: 'auto',
              background: '#f1f5f9',
              borderRadius: 8,
            }}
          >
            {this.state.err.message}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </RootErrorBoundary>
  </StrictMode>,
)
