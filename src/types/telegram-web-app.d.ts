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

type TelegramMainButton = {
  setParams: (params: {
    text?: string
    color?: string
    text_color?: string
    is_visible?: boolean
    is_active?: boolean
  }) => void
}

type TelegramWebApp = {
  ready: () => void
  expand: () => void
  close: () => void
  openTelegramLink?: (url: string) => void
  sendData?: (data: string) => void
  themeParams?: TelegramThemeParams
  safeAreaInset?: TelegramSafeAreaInsets
  /** Нижняя основная кнопка (как «Начать»), стиль задаётся ботом и/или через setParams */
  MainButton?: TelegramMainButton
   // Строка initData, которую Telegram пробрасывает в Mini App
  initData?: string
  initDataUnsafe?: TelegramWebAppInitDataUnsafe
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp
  }
}
