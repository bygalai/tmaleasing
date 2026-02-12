import type { PropsWithChildren } from 'react'
import { getAppTheme, getSafeAreaInsets } from '../../lib/telegram'

export function AppLayout({ children }: PropsWithChildren) {
  const theme = getAppTheme()
  const insets = getSafeAreaInsets()

  return (
    <div
      className="min-h-dvh w-full"
      style={{
        background: `radial-gradient(1200px 600px at 120% -20%, #FF5C3415, transparent), linear-gradient(180deg, #4A4F58 0%, ${theme.bgColor} 55%, #11141a 100%)`,
        color: theme.textColor || '#F2F3F5',
      }}
    >
      <main
        className="mx-auto flex min-h-dvh w-full max-w-[680px] flex-col px-4 py-5"
        style={{
          paddingTop: `calc(max(env(safe-area-inset-top, 0px), ${insets.top}px) + 16px)`,
          paddingRight: `calc(max(env(safe-area-inset-right, 0px), ${insets.right}px) + 16px)`,
          paddingBottom: `calc(max(env(safe-area-inset-bottom, 0px), ${insets.bottom}px) + 16px)`,
          paddingLeft: `calc(max(env(safe-area-inset-left, 0px), ${insets.left}px) + 16px)`,
        }}
      >
        {children}
      </main>
    </div>
  )
}
