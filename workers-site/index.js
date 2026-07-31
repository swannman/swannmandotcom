import { getAssetFromKV } from '@cloudflare/kv-asset-handler'
import manifestJSON from '__STATIC_CONTENT_MANIFEST'

const assetManifest = JSON.parse(manifestJSON)

export default {
  async fetch(request, env, ctx) {
    let options = {
      ASSET_NAMESPACE: env.__STATIC_CONTENT,
      ASSET_MANIFEST: assetManifest,
      // Pages and stylesheets change on every deploy. Without an explicit
      // browserTTL, kv-asset-handler strips Cache-Control entirely and the
      // CDN falls back to its own default TTL, which can keep serving a
      // stale page long after a deploy. Everything else (images) keeps the
      // previous behaviour.
      cacheControl: req => {
        const path = new URL(req.url).pathname
        const isPage =
          path.endsWith('/') || path.endsWith('.html') || path.endsWith('.css')

        return isPage ? { browserTTL: 60, edgeTTL: 60 } : {}
      },
    }

    try {
      const page = await getAssetFromKV(
        { request, waitUntil: ctx.waitUntil.bind(ctx) },
        options,
      )

      const response = new Response(page.body, page)

      response.headers.set('X-XSS-Protection', '1; mode=block')
      response.headers.set('X-Content-Type-Options', 'nosniff')
      response.headers.set('X-Frame-Options', 'DENY')
      response.headers.set('Referrer-Policy', 'unsafe-url')
      response.headers.set('Feature-Policy', 'none')

      return response
    } catch (e) {
      try {
        let notFoundResponse = await getAssetFromKV(
          { request, waitUntil: ctx.waitUntil.bind(ctx) },
          {
            ...options,
            mapRequestToAsset: req =>
              new Request(`${new URL(req.url).origin}/404.html`, req),
          },
        )

        return new Response(notFoundResponse.body, {
          ...notFoundResponse,
          status: 404,
        })
      } catch (e) {}

      return new Response(e.message || e.toString(), { status: 500 })
    }
  },
}
