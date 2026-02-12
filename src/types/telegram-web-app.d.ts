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

type TelegramWebApp = {
  ready: () => void
  expand: () => void
  close: () => void
  themeParams?: TelegramThemeParams
  safeAreaInset?: TelegramSafeAreaInsets
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp
  }
}
