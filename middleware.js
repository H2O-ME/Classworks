// EdgeOne Pages Middleware for SPA routing
// Handles fallback to index.html for client-side routing

// Middleware only runs on routes that don't match static files
export const config = {
  matcher: [
    '/((?!assets|pwa|sounds|sw\\.js|sw-cache-manager\\.js|favicon|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico|.*\\.woff|.*\\.woff2|.*\\.ttf|.*\\.mp3|.*\\.webmanifest|.*\\.js|.*\\.css).*)'
  ],
};

/**
 * @param {Object} context
 * @param {Request} context.request
 * @param {Function} context.next
 * @param {Function} context.redirect
 * @param {Function} context.rewrite
 */
export function middleware(context) {
  const url = new URL(context.request.url)
  const pathname = url.pathname

  // Skip for root path - let it serve index.html normally
  if (pathname === '/' || pathname === '/index.html') {
    return context.next()
  }

  // Rewrite all other routes to index.html for Vue Router (history mode)
  return context.rewrite('/index.html')
}
