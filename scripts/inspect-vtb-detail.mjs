const detailUrl =
  process.argv[2] || 'https://www.vtb-leasing.ru/market/gwm-tank-500-al-188258-04-24-nsk/'

const response = await fetch(detailUrl, {
  headers: {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36',
    'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8',
  },
})

const html = await response.text()
console.log('status', response.status, 'len', html.length)

const uploadImageMatches = [
  ...html.matchAll(/https?:\/\/www\.vtb-leasing\.ru\/upload\/[^"'\\s]+\.(?:jpg|jpeg|png|webp)/gi),
].map((m) => m[0])

const relativeUploadMatches = [
  ...html.matchAll(/\/upload\/[^"'\\s]+\.(?:jpg|jpeg|png|webp)/gi),
].map((m) => m[0])

const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1]
const twitter = html.match(/<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i)?.[1]

console.log('og:image', og ?? '-')
console.log('twitter:image', twitter ?? '-')
console.log('upload absolute', [...new Set(uploadImageMatches)].slice(0, 20))
console.log('upload relative', [...new Set(relativeUploadMatches)].slice(0, 20))
