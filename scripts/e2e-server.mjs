import { createReadStream } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const port = Number(process.env.E2E_PORT ?? 3144)
const root = join(fileURLToPath(new URL('..', import.meta.url)), 'tests', 'fixtures')

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)

  if (url.pathname === '/api/search') {
    writeJson(response, { message: 'golden search' })
    return
  }

  if (url.pathname === '/api/login') {
    writeJson(response, { message: 'golden login' })
    return
  }

  if (url.pathname === '/favicon.ico') {
    writeJson(response, { error: 'not found' }, 404)
    return
  }

  const filePath =
    url.pathname === '/' ? join(root, 'golden-page.html') : join(root, `.${url.pathname}`)

  if (!filePath.startsWith(root)) {
    writeJson(response, { error: 'not found' }, 404)
    return
  }

  const contentType = contentTypes[extname(filePath)] ?? 'application/octet-stream'
  response.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' })
  createReadStream(filePath).pipe(response)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Capultura golden E2E fixture server listening on http://127.0.0.1:${port}`)
})

function writeJson(response, payload, statusCode = 200) {
  const body = JSON.stringify(payload)

  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(body)
}
