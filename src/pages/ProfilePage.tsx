import {
  getTelegramAvatarInitial,
  getTelegramNickname,
  getTelegramPhotoUrl,
} from '../lib/telegram'

export function ProfilePage() {
  const photoUrl = getTelegramPhotoUrl()
  const nickname = getTelegramNickname()
  const initial = getTelegramAvatarInitial()

  return (
    <section className="flex flex-col items-center gap-6 pt-6">
      {/* Аватар — большая часть, тёплое свечение как в референсе */}
      <div className="flex flex-col items-center gap-6">
        <div
          className="relative flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-full"
          style={{
            background:
              'radial-gradient(circle at 30% 30%, rgba(255, 180, 140, 0.5) 0%, rgba(255, 140, 100, 0.35) 40%, rgba(255, 120, 80, 0.2) 70%, transparent 100%)',
            boxShadow: '0 0 60px rgba(255, 140, 100, 0.25), inset 0 0 40px rgba(255, 255, 255, 0.15)',
          }}
        >
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span
              className="font-sf text-5xl font-light text-slate-700"
              aria-hidden
            >
              {initial}
            </span>
          )}
        </div>

        {/* Никнейм в San Francisco */}
        <p className="text-center font-sf text-xl font-medium tracking-tight text-slate-900">
          {nickname}
        </p>
      </div>

      {/* Нижний блок — «Здесь пока пусто» */}
      <div className="flex w-full max-w-[560px] items-center justify-center rounded-2xl bg-white/80 py-8">
        <p className="font-sf text-slate-600">В разработке</p>
      </div>
    </section>
  )
}
