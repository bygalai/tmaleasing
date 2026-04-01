import { useEffect, useRef, useState } from 'react'
import { getUserDisplayName, notifyAppReady } from '../lib/telegram'

/** Минимум на сплэше: слишком долго задерживает вход (особенно при медленном канале в РФ). */
const MIN_DISPLAY_MS = 550
const FADEOUT_MS = 350
const HINT_DELAY_MS = 4000
const HINT_PHRASE_DURATION_MS = 3000

const HINT_PHRASES = ['Слабый интернет или VPN мешают', 'Сейчас решим это...']
const NEAR_READY_PHRASE = 'Ещё пару секунд...'

const APPLE_EASING = 'cubic-bezier(0.25, 0.1, 0.25, 1)'

type SplashScreenProps = {
  onReady: () => void
  isAppReady: boolean
  isAlmostReady?: boolean
}

export function SplashScreen({ onReady, isAppReady, isAlmostReady = false }: SplashScreenProps) {
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)
  const [fading, setFading] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [hintIndex, setHintIndex] = useState(0)
  const readyCalled = useRef(false)

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        notifyAppReady()
      })
    })
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_DISPLAY_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setShowHint(true), HINT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!showHint || isAppReady || isAlmostReady) return
    const interval = setInterval(() => {
      setHintIndex((prev) => (prev + 1) % HINT_PHRASES.length)
    }, HINT_PHRASE_DURATION_MS)
    return () => clearInterval(interval)
  }, [showHint, isAppReady, isAlmostReady])

  useEffect(() => {
    if (readyCalled.current || !minTimeElapsed || !isAppReady) return
    readyCalled.current = true
    setFading(true)
    const timer = setTimeout(onReady, FADEOUT_MS)
    return () => clearTimeout(timer)
  }, [minTimeElapsed, isAppReady, onReady])

  let greeting = 'Привет!'
  try {
    const userName = getUserDisplayName()
    if (userName !== 'Гость') {
      greeting = `Привет, ${userName}`
    }
  } catch {
    // Вне Telegram или ошибка SDK
  }

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black transition-opacity duration-300 ${fading ? 'opacity-0' : 'opacity-100'}`}
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      <h1
        className="splash-text-loading max-w-[90%] text-center text-2xl font-medium tracking-tight sm:text-3xl"
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
          animation: 'splash-reveal 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards, splash-text-shimmer 1.8s ease-in-out infinite',
        }}
      >
        {greeting}
      </h1>

      {showHint && !isAppReady && (
        <div
          className="splash-hint relative mt-5 min-h-[2rem] w-full max-w-[90%] px-4"
          style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
            animation: 'splash-hint-enter 0.5s cubic-bezier(0.25, 0.1, 0.25, 1) forwards',
          }}
        >
          {HINT_PHRASES.map((phrase, i) => (
            <span
              key={phrase}
              className="absolute inset-x-0 top-0 block text-center text-sm font-normal text-zinc-500"
              style={{
                opacity: !isAlmostReady && hintIndex === i ? 1 : 0,
                transition: `opacity 0.6s ${APPLE_EASING}`,
              }}
              aria-hidden={isAlmostReady || hintIndex !== i}
            >
              {phrase}
            </span>
          ))}
          <span
            className="absolute inset-x-0 top-0 block text-center text-sm font-normal text-zinc-500"
            style={{
              opacity: isAlmostReady ? 1 : 0,
              transition: `opacity 0.6s ${APPLE_EASING}`,
            }}
            aria-hidden={!isAlmostReady}
          >
            {NEAR_READY_PHRASE}
          </span>
        </div>
      )}
    </div>
  )
}
