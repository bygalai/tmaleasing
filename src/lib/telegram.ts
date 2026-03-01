import { closeMiniApp, init, retrieveLaunchParams } from '@telegram-apps/sdk-react'

export type AppInsets = {
  top: number
  right: number
  bottom: number
  left: number
}

export type AppTheme = {
  bgColor: string
  textColor: string
}

type TelegramUser = {
  firstName?: string
  lastName?: string
  username?: string
}

const FALLBACK_THEME: AppTheme = {
  bgColor: '#0b0f19',
  textColor: '#f8fafc',
}

export function initializeTelegram(): void {
  try {
    init()
  } catch {
    // App still works in browser preview mode.
  }

  const webApp = window.Telegram?.WebApp
  if (!webApp) return

  webApp.expand()
}

/** Вызвать, когда приложение готово к показу (после SplashScreen). */
export function notifyAppReady(): void {
  const webApp = window.Telegram?.WebApp
  if (webApp) {
    webApp.ready()
  }
}

export function getTelegramUserFromInitData(): TelegramUser | undefined {
  try {
    const launchParams = retrieveLaunchParams(true)
    return launchParams.tgWebAppData?.user
  } catch {
    return undefined
  }
}

export function closeTelegramMiniApp(): void {
  if (closeMiniApp.isAvailable()) {
    closeMiniApp()
    return
  }

  window.Telegram?.WebApp?.close()
}

export function getAppTheme(): AppTheme {
  try {
    const launchParams = retrieveLaunchParams(true)
    const launchTheme = launchParams.tgWebAppThemeParams

    return {
      bgColor: launchTheme.bgColor ?? FALLBACK_THEME.bgColor,
      textColor: launchTheme.textColor ?? FALLBACK_THEME.textColor,
    }
  } catch {
    const webAppTheme = window.Telegram?.WebApp?.themeParams
    return {
      bgColor: webAppTheme?.bg_color ?? FALLBACK_THEME.bgColor,
      textColor: webAppTheme?.text_color ?? FALLBACK_THEME.textColor,
    }
  }
}

export function getSafeAreaInsets(): AppInsets {
  const insets = window.Telegram?.WebApp?.safeAreaInset
  return {
    top: insets?.top ?? 0,
    right: insets?.right ?? 0,
    bottom: insets?.bottom ?? 0,
    left: insets?.left ?? 0,
  }
}

export function getUserDisplayName(): string {
  const user = getTelegramUserFromInitData()
  if (!user) return 'Гость'

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  if (fullName.length > 0) return fullName
  if (user.username) return `@${user.username}`

  return 'Пользователь Telegram'
}
