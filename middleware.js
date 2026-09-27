// EdgeOne Pages middleware for SPA routing.

export const config = {
  matcher: [
    "/((?!api|kv|src|node_modules|@vite|@fs|@id|assets|pwa|sw\\.js|favicon|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico|.*\\.woff|.*\\.woff2|.*\\.ttf|.*\\.txt|.*\\.webmanifest|.*\\.js|.*\\.css|.*\\.sass|.*\\.scss).*)",
  ],
};

/**
 * @param {Object} context
 * @param {Request} context.request
 * @param {Function} context.next
 * @param {Function} context.rewrite
 */
export function middleware(context) {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  const bypassPrefixes = ["/api/", "/kv/", "/src/", "/node_modules/", "/@vite/", "/@fs/", "/@id/"];
  if (bypassPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return context.next();
  }

  if (pathname === "/" || pathname === "/index.html") {
    return context.next();
  }

  return context.rewrite("/index.html");
}
