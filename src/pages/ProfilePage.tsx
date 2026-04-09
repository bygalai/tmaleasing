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
    <section className="page-transition flex flex-col items-center gap-6 pt-6">
      <div className="flex flex-col items-center gap-6">
        <div className="relative flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200/90 bg-white shadow-sm">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span
              className="font-sf text-5xl font-light text-ios-label"
              aria-hidden
            >
              {initial}
            </span>
          )}
        </div>

        {/* Никнейм в San Francisco */}
        <p className="text-center font-sf text-xl font-medium tracking-tight text-zinc-900">
          {nickname}
        </p>
      </div>

      {/* Нижний блок — «Здесь пока пусто» */}
      <div className="flex w-full max-w-[560px] items-center justify-center rounded-2xl border border-zinc-200/90 bg-white py-8 shadow-sm">
        <p className="font-sf text-ios-label">В разработке</p>
      </div>
    </section>
  )
}
