import { NextResponse, type NextRequest } from "next/server";

/**
 * First-pass redirect for unauthenticated traffic hitting /admin.
 *
 * This is a convenience, NOT the security boundary. It only checks that a
 * session cookie is present and well-formed enough to be worth trying — the
 * signature and expiry are verified server-side on every admin page and every
 * admin API route (see lib/admin-session.ts). Middleware runs on the edge
 * runtime where node:crypto is unavailable, which is another reason the real
 * check lives in the route handlers.
 */
const ADMIN_COOKIE = "padre65_admin";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes answer with a status code, never a redirect — a fetch following
  // a 302 to an HTML login page produces a confusing failure.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const isLoginRoute = pathname === "/admin/login";
  const cookie = request.cookies.get(ADMIN_COOKIE)?.value ?? "";
  const looksSignedIn = cookie.includes(".") && cookie.length > 16;

  if (!looksSignedIn && pathname.startsWith("/admin") && !isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (looksSignedIn && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
