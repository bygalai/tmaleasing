import type { VercelRequest, VercelResponse } from '@vercel/node'

type TelegramUser = {
  id: number
  username?: string
  first_name?: string
  last_name?: string
}

type TelegramMessage = {
  message_id: number
  from?: TelegramUser
  chat: { id: number }
  text?: string
  web_app_data?: { data: string }
}

type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const MANAGER_CHAT_ID = process.env.TELEGRAM_MANAGER_CHAT_ID

async function callTelegram<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  if (!BOT_TOKEN) {
    console.error('Missing TELEGRAM_BOT_TOKEN env')
    throw new Error('Bot token not configured')
  }

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const json = await res.json()
  if (!json.ok) {
    console.error('Telegram API error', method, json)
    throw new Error(json.description ?? 'Telegram API error')
  }
  return json.result as T
}

function formatUserLabel(user?: TelegramUser): string {
  if (!user) return 'неизвестный пользователь'
  const parts = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
  const name = parts || 'Без имени'
  const handle = user.username ? `@${user.username}` : ''
  return `${name}${handle ? ` (${handle})` : ''} [id: ${user.id}]`
}

type LeadPayload = {
  kind: 'lead'
  listingId: string
  listingTitle: string
  priceRub: number
  detailUrl: string
  imageUrl?: string
}

function isLeadPayload(value: unknown): value is LeadPayload {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<LeadPayload>
  return (
    v.kind === 'lead' &&
    typeof v.listingId === 'string' &&
    typeof v.listingTitle === 'string' &&
    typeof v.priceRub === 'number' &&
    typeof v.detailUrl === 'string'
  )
}

function formatPriceRubCompact(value: number): string {
  const raw = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(value)
  return raw.replace(/\s/g, '.')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(200).send('OK')
    return
  }

  const update = req.body as TelegramUpdate

  try {
    const msg = update.message
    if (!msg) {
      res.status(200).send('OK')
      return
    }

    // /start и простые команды
    if (msg.text?.startsWith('/start')) {
      await callTelegram('sendMessage', {
        chat_id: msg.chat.id,
        text:
          'Привет! Это бот GONKA.\n\nОставляйте заявки через Mini App — менеджер свяжется с вами в этом чате.',
      })
      res.status(200).send('OK')
      return
    }

    // Заявка из Mini App через WebApp.sendData
    if (msg.web_app_data?.data) {
      let parsed: unknown
      try {
        parsed = JSON.parse(msg.web_app_data.data)
      } catch (err) {
        console.error('Failed to parse web_app_data:', err)
      }

      if (isLeadPayload(parsed)) {
        const lead = parsed
        const userLabel = formatUserLabel(msg.from)
        const price = formatPriceRubCompact(lead.priceRub)

        const textLines = [
          '🟠 *Новая заявка из Mini App*',
          '',
          `👤 ${userLabel}`,
          '',
          `🚗 *${lead.listingTitle}*`,
          `💰 Цена: *${price}₽*`,
          '',
          `🔗 [Открыть объявление](${lead.detailUrl})`,
        ]

        const managerChat = MANAGER_CHAT_ID ? Number(MANAGER_CHAT_ID) : msg.chat.id

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

        // Ответ пользователю
        await callTelegram('sendMessage', {
          chat_id: msg.chat.id,
          text:
            '✅ Заявка по этому автомобилю отправлена менеджеру.\n' +
            'Мы свяжемся с вами в этом чате.',
        })
      }

      res.status(200).send('OK')
      return
    }

    // Остальные апдейты пока игнорируем
    res.status(200).send('OK')
  } catch (error) {
    console.error('telegram-webhook handler error:', error)
    res.status(200).send('OK')
  }
}

