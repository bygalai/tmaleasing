import { getUserDisplayName } from '../lib/telegram'

export function ProfilePage() {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
      <p className="text-xs tracking-[0.12em] text-white/60">ПРОФИЛЬ</p>
      <h2 className="mt-2 text-xl font-semibold text-[#F2F3F5]">{getUserDisplayName()}</h2>
      <p className="mt-2 text-sm text-white/70">
        Раздел профиля заготовлен. На следующем этапе добавим историю интересов, заявки и персональные
        уведомления.
      </p>
    </section>
  )
}
