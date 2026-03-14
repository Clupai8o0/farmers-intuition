import { readFileSync } from 'fs'
import { resolve, join } from 'path'
import { pathToFileURL } from 'url'
import dotenv from 'dotenv'

// Load .env so process.env.ELEVEN_LABS is available to API handlers
dotenv.config()
dotenv.config({ path: '.env.local', override: true })

/**
 * Vite plugin that serves Vercel-style serverless functions from api/ directory
 * during local development, so you can use `npm run dev` instead of `vercel dev`.
 */
export default function vercelApiPlugin() {
  return {
    name: 'vercel-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next()

        const route = req.url.replace(/^\/api\//, '').replace(/\?.*$/, '')
        const filePath = resolve(`api/${route}.js`)

        let handler
        try {
          // Use dynamic import with cache busting for HMR
          const mod = await import(pathToFileURL(filePath).href + '?t=' + Date.now())
          handler = mod.default
        } catch (e) {
          return next() // file doesn't exist, let Vite handle it
        }

        // Build a minimal Vercel-compatible req/res
        const fakeRes = {
          statusCode: 200,
          headers: {},
          status(code) { this.statusCode = code; return this },
          setHeader(k, v) { this.headers[k] = v; return this },
          json(data) {
            res.writeHead(this.statusCode, { ...this.headers, 'Content-Type': 'application/json' })
            res.end(JSON.stringify(data))
          },
          send(body) {
            res.writeHead(this.statusCode, this.headers)
            res.end(body)
          },
        }

        // Parse JSON body for non-multipart requests
        const contentType = req.headers['content-type'] || ''
        if (contentType.includes('application/json')) {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          try {
            req.body = JSON.parse(Buffer.concat(chunks).toString())
          } catch {
            req.body = {}
          }
        }

        try {
          await handler(req, fakeRes)
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    },
  }
}
