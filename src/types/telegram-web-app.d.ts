type TelegramThemeParams = {
  bg_color?: string
  text_color?: string
}

type TelegramSafeAreaInsets = {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

type TelegramWebAppInitDataUnsafeUser = {
  id?: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
}

type TelegramWebAppInitDataUnsafe = {
  user?: TelegramWebAppInitDataUnsafeUser
}

type TelegramWebApp = {
  ready: () => void
  expand: () => void
  close: () => void
  openTelegramLink?: (url: string) => void
  sendData?: (data: string) => void
  themeParams?: TelegramThemeParams
  safeAreaInset?: TelegramSafeAreaInsets
   // Строка initData, которую Telegram пробрасывает в Mini App
  initData?: string
  initDataUnsafe?: TelegramWebAppInitDataUnsafe
  /** Bot API 7.7+: отключает вертикальные свайпы закрытия/сворачивания Mini App (конфликт со скроллом). */
  disableVerticalSwipes?: () => void
  enableVerticalSwipes?: () => void
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp
  }
}
