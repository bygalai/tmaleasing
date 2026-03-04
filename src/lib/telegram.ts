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

export type TelegramUser = {
  id?: number
  firstName?: string
  lastName?: string
  username?: string
  photoUrl?: string
}

export type LeadPayload = {
  kind: 'lead'
  listingId: string
  listingTitle: string
  priceRub: number
  detailUrl: string
  imageUrl?: string
}

const FALLBACK_THEME: AppTheme = {
  bgColor: '#0b0f19',
  textColor: '#f8fafc',
}

let cachedTelegramUser: TelegramUser | null | undefined

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
    if (cachedTelegramUser !== undefined) {
      // Уже пытались определить пользователя в этой сессии.
      return cachedTelegramUser ?? undefined
    }

    const mapRaw = (raw: {
      id?: number
      first_name?: string
      last_name?: string
      username?: string
      photo_url?: string
      firstName?: string
      lastName?: string
      photoUrl?: string
    }): TelegramUser | undefined => {
      if (!raw) return undefined
      return {
        id: raw.id,
        firstName: raw.first_name ?? raw.firstName,
        lastName: raw.last_name ?? raw.lastName,
        username: raw.username,
        photoUrl: raw.photo_url ?? raw.photoUrl,
      }
    }

    // 0) Попробуем взять пользователя из query-параметра `u`, который бот добавляет к URL.
    // Этот путь должен работать даже если Mini App открыта как обычный сайт без Telegram WebApp.
    try {
      const params = new URLSearchParams(window.location.search)
      const userJson = params.get('u')
      if (userJson) {
        const decoded = decodeURIComponent(userJson)
        const raw = JSON.parse(decoded) as {
          id?: number
          first_name?: string
          last_name?: string
          username?: string
        }
        const mappedFromUrl = mapRaw(raw as any)
        if (mappedFromUrl?.id || mappedFromUrl?.username || mappedFromUrl?.firstName) {
          cachedTelegramUser = mappedFromUrl
          return cachedTelegramUser
        }
      }
    } catch {
      // игнорируем, пойдём дальше
    }

    const webApp = window.Telegram?.WebApp

    // 1) Попробуем взять пользователя из launchParams (SDK)
    try {
      const launchParams = retrieveLaunchParams(true) as any
      const fromSdk = launchParams?.tgWebAppData?.user ?? launchParams?.user
      const mappedFromSdk = mapRaw(fromSdk ?? {})
      if (mappedFromSdk?.id || mappedFromSdk?.username || mappedFromSdk?.firstName) {
        cachedTelegramUser = mappedFromSdk
        return cachedTelegramUser
      }
    } catch {
      // игнорируем, пойдём дальше
    }

    // 2) Пытаемся распарсить initData
    if (webApp?.initData) {
      try {
        const params = new URLSearchParams(webApp.initData)
        const userJson = params.get('user')
        if (userJson) {
          const raw = JSON.parse(userJson) as {
            id?: number
            first_name?: string
            last_name?: string
            username?: string
            photo_url?: string
          }
          const mapped = mapRaw(raw)
          if (mapped?.id || mapped?.username || mapped?.firstName) {
            cachedTelegramUser = mapped
            return cachedTelegramUser
          }
        }
      } catch {
        // если что-то пошло не так — попробуем initDataUnsafe
      }
    }

    // 3) Фоллбек на initDataUnsafe.user
    const unsafeUser = webApp?.initDataUnsafe?.user
    if (unsafeUser) {
      const mapped = mapRaw(
        unsafeUser as {
          id?: number
          first_name?: string
          last_name?: string
          username?: string
          photo_url?: string
        },
      )
      if (mapped?.id || mapped?.username || mapped?.firstName) {
        cachedTelegramUser = mapped
        return cachedTelegramUser
      }
    }

    cachedTelegramUser = null
    return undefined
  } catch {
    cachedTelegramUser = null
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

/** Никнейм в Telegram: @username или имя. */
export function getTelegramNickname(): string {
  const user = getTelegramUserFromInitData()
  if (!user) return 'Гость'
  if (user.username) return `@${user.username}`
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return full || 'Пользователь'
}

/** URL фото профиля (если доступно в initData). */
export function getTelegramPhotoUrl(): string | undefined {
  return getTelegramUserFromInitData()?.photoUrl
}

/** Первая буква для аватарки-заглушки. */
export function getTelegramAvatarInitial(): string {
  const user = getTelegramUserFromInitData()
  if (!user) return 'Г'
  const first = user.firstName?.trim().charAt(0) ?? user.username?.charAt(0)
  return (first ?? '?').toUpperCase()
}

/** Отправляет данные заявки в бот через WebApp.sendData. Возвращает true, если отправка удалась. */
export function sendLeadToTelegram(payload: LeadPayload): boolean {
  const webApp = window.Telegram?.WebApp
  if (!webApp?.sendData) return false
  try {
    webApp.sendData(JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}
