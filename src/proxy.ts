import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  const cookie = getSessionCookie(request);
  if (!cookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Match everything except:
  //  - /api/auth/*       (Better Auth's own routes)
  //  - /api/calls, /api/runs, /api/evaluations (bearer-token gated, never cookie-gated)
  //  - /sign-in          (the sign-in page itself)
  //  - /_next/*          (Next assets)
  //  - any path with a file extension (favicon, png, etc.)
  matcher: [
    "/((?!api/auth|api/calls|api/runs|api/evaluations|sign-in|_next/static|_next/image|favicon\\.ico|.*\\.[^/]+$).*)",
  ],
};
