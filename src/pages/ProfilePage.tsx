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
        <div className="relative flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-zinc-900 shadow-none">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span
              className="font-sf text-5xl font-light text-zinc-400"
              aria-hidden
            >
              {initial}
            </span>
          )}
        </div>

        {/* Никнейм в San Francisco */}
        <p className="text-center font-sf text-xl font-medium tracking-tight text-zinc-100">
          {nickname}
        </p>
      </div>

      {/* Нижний блок — «Здесь пока пусто» */}
      <div className="flex w-full max-w-[560px] items-center justify-center rounded-md border border-white/10 bg-zinc-950 py-8">
        <p className="font-sf text-zinc-500">В разработке</p>
      </div>
    </section>
  )
}
