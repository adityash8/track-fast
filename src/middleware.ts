import { NextResponse } from 'next/server';
// Body validation belongs in the route; GET health must never consume a body.
export function middleware() {
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
export const config = { matcher: ['/api/track', '/api/inspect'] };
