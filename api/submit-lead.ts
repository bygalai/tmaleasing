/**
 * API для приёма заявок из Mini App, когда WebApp.sendData недоступен
 * (например, при входе через кнопку «Открыть приложение» в профиле бота).
 * Не теряем лиды независимо от способа открытия Mini App.
 */

type LeadBody = {
  kind: 'lead'
  listingId: string
  listingTitle: string
  priceRub: number
  detailUrl: string
  imageUrl?: string
  userId: number
  firstName?: string
  lastName?: string
  username?: string
}

function isLeadBody(value: unknown): value is LeadBody {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.kind === 'lead' &&
    typeof v.listingId === 'string' &&
    typeof v.listingTitle === 'string' &&
    typeof v.priceRub === 'number' &&
    typeof v.detailUrl === 'string' &&
    typeof v.userId === 'number'
  )
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const MANAGER_CHAT_ID = process.env.TELEGRAM_MANAGER_CHAT_ID

async function callTelegram<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  if (!BOT_TOKEN) throw new Error('Bot token not configured')
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.description ?? 'Telegram API error')
  return json.result as T
}

function formatUserLabel(u: { userId: number; firstName?: string; lastName?: string; username?: string }): string {
  const parts = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
  const name = parts || 'Без имени'
  const handle = u.username ? `@${u.username}` : ''
  return `${name}${handle ? ` (${handle})` : ''} [id: ${u.userId}]`
}

function formatPriceRubCompact(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0, useGrouping: true })
    .format(value)
    .replace(/\s/g, '.')
}

export default async function handler(req: { method?: string; body?: unknown }, res: { status: (n: number) => { send: (x: unknown) => void; json: (x: unknown) => void } }) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }

  if (!BOT_TOKEN) {
    res.status(500).json({ ok: false, error: 'Server config error' })
    return
  }

  if (!isLeadBody(req.body)) {
    res.status(400).json({ ok: false, error: 'Invalid payload' })
    return
  }

  const lead = req.body
  const userLabel = formatUserLabel({
    userId: lead.userId,
    firstName: lead.firstName,
    lastName: lead.lastName,
    username: lead.username,
  })
  const price = formatPriceRubCompact(lead.priceRub)

  const textLines = [
    '🟠 *Новая заявка из Mini App* (через API)',
    '',
    `👤 ${userLabel}`,
    '',
    `🚗 *${lead.listingTitle}*`,
    `💰 Цена: *${price}₽*`,
    '',
    `🔗 [Открыть объявление](${lead.detailUrl})`,
  ]

  const managerChat = MANAGER_CHAT_ID ? Number(MANAGER_CHAT_ID) : lead.userId

  try {
    if (lead.imageUrl) {
      await callTelegram('sendPhoto', {
        chat_id: managerChat,
        photo: lead.imageUrl,
        caption: textLines.join('\n'),
        parse_mode: 'Markdown',
      })
    } else {
      await callTelegram('sendMessage', {
        chat_id: managerChat,
        text: textLines.join('\n'),
        parse_mode: 'Markdown',
      })
    }

    await callTelegram('sendMessage', {
      chat_id: lead.userId,
      text:
        '✅ Заявка по автомобилю отправлена менеджеру.\nМы свяжемся с Вами в этом чате или в лс.',
    })

    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('submit-lead API error:', err)
    res.status(500).json({ ok: false, error: 'Failed to send lead' })
  }
}
