import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_ROUTES = ["/", "/login", "/register"];

function isPublicRoute(pathname: string) {
  return (
    PUBLIC_ROUTES.includes(pathname) ||
    pathname.startsWith("/games") ||
    pathname.startsWith("/search") ||
    pathname.startsWith("/user/") ||
    pathname.startsWith("/auth/") // OAuth callback and any future auth helpers
  );
}

export async function middleware(request: NextRequest) {
  // Start with a passthrough response so cookies can be mutated.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          // Write cookies into both the request and the response so that
          // the refreshed session is available to Server Components
          // further down the chain.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not add any logic between createServerClient and getUser().
  // getUser() validates the session with the Supabase Auth server and
  // refreshes the token if needed. It must run on every request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicRoute(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
