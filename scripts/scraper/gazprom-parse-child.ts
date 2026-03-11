/**
 * Child process: читает JSON-строку из stdin, парсит HTML, пишет результат в stdout.
 * Запускается основным скриптом; при зависании парсера родитель убивает процесс.
 */

import * as readline from 'node:readline'
import { extractDetailFromHtml } from './gazprom-extract'

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => {
  try {
    const { html, pageUrl } = JSON.parse(line) as { html: string; pageUrl: string }
    const data = extractDetailFromHtml(html ?? '', pageUrl ?? '')
    console.log(JSON.stringify({ ok: true, data }))
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: String(e) }))
  }
})
