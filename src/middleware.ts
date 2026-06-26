import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'super_secret_jwt_key_for_dev_only'
);
const REFRESH_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET || 'super_secret_refresh_key_for_dev_only'
);

// Routes publiques qui ne nécessitent pas d'authentification
const publicPaths = ['/', '/api/auth/login', '/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Si c'est un fichier statique ou une image, on ignore
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Si c'est une route publique
  if (publicPaths.includes(pathname)) {
    return NextResponse.next();
  }

  let token = request.cookies.get('token')?.value;
  const refreshToken = request.cookies.get('refreshToken')?.value;
  let newAccessToken: string | null = null;

  // Refresh token rotation in middleware if access token has expired
  if (!token && refreshToken) {
    try {
      const { payload: refreshPayload } = await jwtVerify(refreshToken, REFRESH_SECRET);
      if (refreshPayload && refreshPayload.userId) {
        newAccessToken = await new SignJWT({
          userId: refreshPayload.userId,
          email: refreshPayload.email,
          role: refreshPayload.role,
          organizationId: refreshPayload.organizationId,
          organizationType: refreshPayload.organizationType,
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setExpirationTime('15m')
          .sign(JWT_SECRET);
        
        token = newAccessToken;
      }
    } catch (e) {
      // Refresh token is expired or invalid
    }
  }

  // Si pas de token et qu'on essaie d'accéder au dashboard -> redirection vers login
  if (!token && !pathname.startsWith('/api')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Si pas de token et qu'on essaie d'accéder à une API protégée -> erreur 401
  if (!token && pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const { payload } = await jwtVerify(token!, JWT_SECRET);
    const role = payload.role as string;
    
    // RBAC: Filtrage des pages en fonction du rôle
    const restrictedRoutes = [
      { path: '/dashboard/patients', roles: ['ADMIN', 'COORDINATOR', 'CAREGIVER'] },
      { path: '/dashboard/team', roles: ['ADMIN', 'COORDINATOR'] },
      { path: '/dashboard/incidents', roles: ['ADMIN', 'COORDINATOR', 'CAREGIVER'] },
      { path: '/dashboard/ai-assistant', roles: ['ADMIN', 'COORDINATOR', 'CAREGIVER'] },
    ];

    for (const route of restrictedRoutes) {
      if (pathname.startsWith(route.path) && !route.roles.includes(role)) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.userId as string);
    requestHeaders.set('x-user-role', role);
    if (payload.organizationId) {
      requestHeaders.set('x-organization-id', payload.organizationId as string);
    }
    if (payload.organizationType) {
      requestHeaders.set('x-organization-type', payload.organizationType as string);
    }

    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

    // Set new cookie if regenerated
    if (newAccessToken) {
      response.cookies.set({
        name: 'token',
        value: newAccessToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 15,
        path: '/',
      });
    }

    return response;
  } catch (error) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
