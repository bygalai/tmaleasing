import type { PropsWithChildren } from 'react'
import { getSafeAreaInsets } from '../../lib/telegram'

export function AppLayout({ children }: PropsWithChildren) {
  const insets = getSafeAreaInsets()

  return (
    <div
      className="min-h-dvh w-full"
      style={{
        background: '#000000',
        color: '#fafafa',
      }}
    >
      <main
        className="mx-auto flex w-full max-w-[680px] flex-col px-4 py-5"
        style={{
          paddingTop: `calc(max(env(safe-area-inset-top, 0px), ${insets.top}px) + 16px)`,
          paddingRight: `calc(max(env(safe-area-inset-right, 0px), ${insets.right}px) + 16px)`,
          paddingBottom: `calc(max(env(safe-area-inset-bottom, 0px), ${insets.bottom}px) + 96px)`,
          paddingLeft: `calc(max(env(safe-area-inset-left, 0px), ${insets.left}px) + 16px)`,
        }}
      >
        {children}
      </main>
    </div>
  )
}
