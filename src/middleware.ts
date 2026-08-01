import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import { appendSecurityHeaders } from '@/middlewares/securityHeaders';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}. Voir .env.example.`);
  }
  return value;
}

const JWT_SECRET = new TextEncoder().encode(requireEnv('JWT_SECRET'));
const REFRESH_SECRET = new TextEncoder().encode(requireEnv('JWT_REFRESH_SECRET'));

// Routes publiques qui ne nécessitent pas d'authentification
const publicPaths = ['/', '/api/auth/login', '/login', '/forgot-password'];

// RBAC par section de dashboard (indépendant du préfixe /dashboard/clinics/<id>/...)
const restrictedSections: Record<string, string[]> = {
  patients: ['ADMIN', 'COORDINATOR', 'CAREGIVER'],
  team: ['ADMIN', 'COORDINATOR'],
  incidents: ['ADMIN', 'COORDINATOR', 'CAREGIVER'],
  'ai-assistant': ['ADMIN', 'COORDINATOR', 'CAREGIVER'],
  finance: ['ADMIN', 'COORDINATOR'],
  contracts: ['ADMIN', 'COORDINATOR'],
  permissions: ['ADMIN'],
  'audit-log': ['ADMIN'],
};

function withSecurityHeaders(response: NextResponse): NextResponse {
  appendSecurityHeaders(response.headers);
  return response;
}

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
  if (publicPaths.includes(pathname) || pathname.startsWith('/reset-password')) {
    return withSecurityHeaders(NextResponse.next());
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
    return withSecurityHeaders(NextResponse.redirect(new URL('/login', request.url)));
  }

  // Si pas de token et qu'on essaie d'accéder à une API protégée -> erreur 401
  if (!token && pathname.startsWith('/api')) {
    return withSecurityHeaders(NextResponse.json({ error: 'Non autorisé' }, { status: 401 }));
  }

  try {
    const { payload } = await jwtVerify(token!, JWT_SECRET);
    const role = payload.role as string;

    // RBAC: Filtrage des pages en fonction du rôle, quel que soit le préfixe
    // (/dashboard/<section> pour une holding, /dashboard/clinics/<id>/<section> pour une clinique)
    const sectionMatch = pathname.match(/^\/dashboard\/(?:clinics\/[^/]+\/)?([^/]+)/);
    const section = sectionMatch?.[1];
    if (section && restrictedSections[section] && !restrictedSections[section].includes(role)) {
      return withSecurityHeaders(NextResponse.redirect(new URL('/dashboard', request.url)));
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

    return withSecurityHeaders(response);
  } catch (error) {
    if (pathname.startsWith('/api')) {
      return withSecurityHeaders(NextResponse.json({ error: 'Token invalide' }, { status: 401 }));
    }
    return withSecurityHeaders(NextResponse.redirect(new URL('/login', request.url)));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
