import fs from 'node:fs/promises'

const BASE_URL = 'https://www.vtb-leasing.ru/auto-market/'

function uniq(arr) {
  return [...new Set(arr)]
}

async function main() {
  const response = await fetch(BASE_URL, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36',
      'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8',
    },
  })
  const html = await response.text()

  await fs.mkdir('tmp', { recursive: true })
  await fs.writeFile('tmp/vtb-auto-market.html', html, 'utf8')

  const scriptSrc = uniq(
    [...html.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]),
  )
  const endpointCandidates = uniq(
    [
      ...html.matchAll(/(\/[^"'\\s]*(?:api|ajax|json|graphql|catalog|market|filter)[^"'\\s]*)/gi),
    ].map((m) => m[1]),
  )
  const uploadCandidates = uniq(
    [...html.matchAll(/(https?:\/\/[^"'\\s]*\/upload\/[^"'\\s]+\.(?:jpg|jpeg|png|webp))/gi)].map(
      (m) => m[1],
    ),
  )

  console.log('Saved HTML: tmp/vtb-auto-market.html')
  console.log('\nScripts:')
  console.log(scriptSrc.slice(0, 120).join('\n'))
  console.log('\nEndpoint candidates:')
  console.log(endpointCandidates.slice(0, 120).join('\n'))
  console.log('\nUpload image candidates:')
  console.log(uploadCandidates.slice(0, 40).join('\n'))

  const targetScripts = scriptSrc.filter(
    (src) =>
      src.includes('catalog.section/auto-market') ||
      src.includes('catalog.smart.filter/auto-market') ||
      src.includes('/build/js/app.js'),
  )

  for (const rawSrc of targetScripts) {
    const scriptUrl = rawSrc.startsWith('http')
      ? rawSrc
      : new URL(rawSrc, BASE_URL).toString()
    let scriptText = ''
    try {
      scriptText = await fetch(scriptUrl).then((r) => r.text())
    } catch (error) {
      console.log(`\n=== Script: ${scriptUrl}`)
      console.log(`fetch failed: ${error instanceof Error ? error.message : 'unknown'}`)
      continue
    }
    const fileName = rawSrc
      .replace(/^https?:\/\//, '')
      .replace(/[^\w.-]+/g, '_')
      .slice(0, 120)
    await fs.writeFile(`tmp/${fileName}.js`, scriptText, 'utf8')
    const endpointInScript = uniq(
      [
        ...scriptText.matchAll(
          /(\/local\/ajax\/[A-Za-z0-9_\-./?=&%]+|\/ajax\/?[A-Za-z0-9_\-./?=&%]*|\/bitrix\/services\/main\/ajax\.php[A-Za-z0-9_\-./?=&%]*|[A-Za-z0-9_\-./]*api[A-Za-z0-9_\-./?=&%]*\.php)/gi,
        ),
      ].map((m) => m[1]),
    )

    const hasAxios = /axios|fetch\(/i.test(scriptText)
    const hasBxAjax = /BX\.ajax|BX\.ajax\.run/i.test(scriptText)

    console.log(`\n=== Script: ${scriptUrl}`)
    console.log(`saved: tmp/${fileName}.js`)
    console.log(`length: ${scriptText.length}, axios/fetch: ${hasAxios}, BX.ajax: ${hasBxAjax}`)
    console.log(endpointInScript.slice(0, 80).join('\n'))
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
