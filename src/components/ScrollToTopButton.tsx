import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

const SCROLL_THRESHOLD = 400

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let ticking = false

    const handleScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setVisible(window.scrollY > SCROLL_THRESHOLD)
        ticking = false
      })
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return createPortal(
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Наверх"
      className={`liquid-glass-nav right-4 z-[55] flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300 ease-out active:scale-90 ${
        visible
          ? 'opacity-100 translate-y-0'
          : 'pointer-events-none opacity-0 translate-y-4'
      }`}
      style={{ position: 'fixed', bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 14px) + 10px)' }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="relative z-10 h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      >
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>,
    document.body,
  )
}
