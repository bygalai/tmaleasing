import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** При смене маршрута прокручивает страницу вверх, чтобы пользователь видел начало контента (например, фото объявления). */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [pathname])

  return null
}
