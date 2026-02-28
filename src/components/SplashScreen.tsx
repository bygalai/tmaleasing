import { useEffect, useRef, useState } from 'react'
import { getUserDisplayName } from '../lib/telegram'

const MIN_DISPLAY_MS = 1800
const FADEOUT_MS = 350

type SplashScreenProps = {
  onReady: () => void
  isAppReady: boolean
}

export function SplashScreen({ onReady, isAppReady }: SplashScreenProps) {
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)
  const [fading, setFading] = useState(false)
  const readyCalled = useRef(false)

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_DISPLAY_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (readyCalled.current || !minTimeElapsed || !isAppReady) return
    readyCalled.current = true
    setFading(true)
    const timer = setTimeout(onReady, FADEOUT_MS)
    return () => clearTimeout(timer)
  }, [minTimeElapsed, isAppReady, onReady])

  const userName = getUserDisplayName()
  const greeting = userName === 'Гость' ? 'Привет!' : `Привет, ${userName}`

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white transition-opacity duration-300 ${fading ? 'opacity-0' : 'opacity-100'}`}
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      <h1
        className="max-w-[90%] text-center text-2xl font-medium tracking-tight text-slate-900 sm:text-3xl"
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
          animation: 'splash-reveal 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        }}
      >
        {greeting}
      </h1>
    </div>
  )
}
