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
const MINIAPP_URL = process.env.MINIAPP_URL ?? 'https://tma-tawny.vercel.app'
const REPLY_COMMAND_RE = /^\/reply(?:@\w+)?\s+(-?\d+)\s+([\s\S]+)$/i

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

function getManagerChatId(): number | null {
  if (!MANAGER_CHAT_ID) return null
  const parsed = Number(MANAGER_CHAT_ID)
  return Number.isFinite(parsed) ? parsed : null
}

function parseReplyCommand(text: string): { userId: number; messageText: string } | null {
  const match = text.trim().match(REPLY_COMMAND_RE)
  if (!match) return null
  const userId = Number(match[1])
  const messageText = match[2].trim()
  if (!Number.isFinite(userId) || !messageText) return null
  return { userId, messageText }
}

export default async function handler(req: any, res: any) {
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

    // Команда менеджера: /reply <userId> <текст>
    if (msg.text?.trim().startsWith('/reply')) {
      const managerChatId = getManagerChatId()
      if (managerChatId == null) {
        await callTelegram('sendMessage', {
          chat_id: msg.chat.id,
          text:
            '⚠️ Не задан TELEGRAM_MANAGER_CHAT_ID.\n' +
            'Добавьте переменную окружения и повторите команду.',
        })
        res.status(200).send('OK')
        return
      }

      if (msg.chat.id !== managerChatId) {
        await callTelegram('sendMessage', {
          chat_id: msg.chat.id,
          text: '⛔ Команда /reply доступна только в чате менеджера.',
        })
        res.status(200).send('OK')
        return
      }

      const parsedReply = parseReplyCommand(msg.text)
      if (!parsedReply) {
        await callTelegram('sendMessage', {
          chat_id: msg.chat.id,
          text:
            'Неверный формат команды.\n' +
            'Используйте: /reply <userId> <текст>\n\n' +
            'Пример:\n' +
            '/reply 123456789 Здравствуйте! Готовы обсудить условия по лоту.',
        })
        res.status(200).send('OK')
        return
      }

      try {
        await callTelegram('sendMessage', {
          chat_id: parsedReply.userId,
          text: parsedReply.messageText,
        })
        await callTelegram('sendMessage', {
          chat_id: msg.chat.id,
          text: `✅ Отправлено пользователю [id: ${parsedReply.userId}]`,
        })
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        await callTelegram('sendMessage', {
          chat_id: msg.chat.id,
          text:
            `❌ Не удалось отправить сообщение пользователю [id: ${parsedReply.userId}].\n` +
            `Причина: ${errorMessage}\n\n` +
            'Проверьте, что пользователь уже взаимодействовал с ботом (нажал /start или открыл Mini App).',
        })
      }

      res.status(200).send('OK')
      return
    }

    // /start и простые команды
    if (msg.text?.startsWith('/start')) {
      const shortName =
        msg.from?.first_name ||
        (msg.from?.username ? `@${msg.from.username}` : 'друг')

      // Прокидываем данные пользователя в URL Mini App как fallback,
      // чтобы фронтенд мог восстановить профиль даже если WebApp API не даёт user.
      let url = MINIAPP_URL
      if (msg.from) {
        const userForUrl = {
          id: msg.from.id,
          first_name: msg.from.first_name,
          last_name: msg.from.last_name,
          username: msg.from.username,
        }
        const encoded = encodeURIComponent(JSON.stringify(userForUrl))
        url = `${MINIAPP_URL}?u=${encoded}`
      }

      await callTelegram('sendMessage', {
        chat_id: msg.chat.id,
        text:
          `Привет, ${shortName}! Это бот GONKA.\n\n` +
          'Нажмите кнопку ниже, чтобы открыть мини-приложение и оставить заявку.',
        reply_markup: {
          keyboard: [
            [
              {
                text: 'Начать',
                web_app: { url },
              },
            ],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
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
          '',
          `💬 Ответ: \`/reply ${msg.from?.id ?? msg.chat.id} Ваш текст\``,
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
            '✅ Заявка по автомобилю отправлена менеджеру.\n' +
            'Мы свяжемся с Вами в этом чате или в лс.',
        })
      } else {
        // На всякий случай залогируем странный payload, чтобы не терять заявки.
        const managerChat = MANAGER_CHAT_ID ? Number(MANAGER_CHAT_ID) : msg.chat.id
        await callTelegram('sendMessage', {
          chat_id: managerChat,
          text:
            '⚠️ Получены данные из Mini App, но формат не распознан.\n' +
            `raw: \`${msg.web_app_data.data.slice(0, 2000)}\``,
          parse_mode: 'Markdown',
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

