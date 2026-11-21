import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieOptions, supabaseConfig } from "@/modules/auth/config";

export async function proxy(request: NextRequest) {
  const cacheControl = "private, no-store";
  // Browser writes must not originate on a different site. Next additionally
  // checks Origin against Host for its Server Actions.
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return new NextResponse(null, {
      status: 403,
      headers: { "Cache-Control": cacheControl },
    });
  }
  const config = supabaseConfig();
  if (!config) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", cacheControl);
    return response;
  }
  let response = NextResponse.next({ request });
  const client = createServerClient(config.url, config.key, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values)
          response.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers))
          response.headers.set(name, value);
      },
    },
  });
  await client.auth.getClaims();
  response.headers.set("Cache-Control", cacheControl);
  return response;
}

export const config = { matcher: ["/empresas/:path*", "/acceso"] };
