import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import { appendSecurityHeaders } from '@/middlewares/securityHeaders';
import { canAccessSection } from '@/lib/permissions-catalog';

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
const publicPaths = ['/', '/api/auth/login', '/login', '/forgot-password', '/api/health'];

// Comptes usagers (patient, proche) : accueil sur /dashboard, jamais sur l'espace clinique.
const PORTAL_ROLES = ['PATIENT', 'FAMILY'];

// Accès par section de dashboard (indépendant du préfixe /dashboard/clinics/<id>/...) : chaque
// section exige une permission (src/lib/permissions-catalog.ts, SECTION_PERMISSIONS), partagée avec
// la barre latérale. Le jeton ne porte que le rôle : ses permissions par défaut s'appliquent ici.

// Page d'arrivée des rôles qui n'ont pas de tableau de bord clinique.
const ROLE_HOME_SECTION: Record<string, string> = { COMPTABLE: 'comptabilite', ACCUEIL: 'accueil', LABORANTIN: 'lab' };

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

  // Page d'accueil publique : seule page où le pixel Facebook est autorisé (cf. facebook-pixel.tsx).
  if (pathname === '/') {
    const response = NextResponse.next();
    appendSecurityHeaders(response.headers, { marketing: true });
    return response;
  }

  // Si c'est une route publique
  if (publicPaths.includes(pathname) || pathname.startsWith('/reset-password')) {
    return withSecurityHeaders(NextResponse.next());
  }

  // Routes appelées par des services externes (cron) avec leur propre secret
  // partagé plutôt qu'un cookie de session — voir CRON_SECRET dans .env.example.
  if (pathname.startsWith('/api/cron/')) {
    return withSecurityHeaders(NextResponse.next());
  }

  // Interopérabilité (FHIR, HL7) : systèmes externes authentifiés par clé d'API dans la route
  // elle-même (cf. src/lib/integration-auth.ts), jamais par cookie de session.
  if (pathname.startsWith('/api/fhir/') || pathname.startsWith('/api/hl7/')) {
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

    // Accueil d'un utilisateur de clinique : sa clinique. Redirigé ICI, avant tout rendu, plutôt
    // que par le redirect() de src/app/dashboard/page.tsx : /dashboard a un loading.tsx, la page
    // est donc déjà en streaming (200) quand ce redirect() arrive, et Next doit alors recharger
    // toute la page côté navigateur — rechargement qui déclenche l'erreur React #310 (« Rendered
    // more hooks… ») dans le routeur de Next, visible quelques secondes à chaque connexion.
    // Patients et familles en sont exclus : l'espace clinique est réservé au personnel (cf.
    // clinics/[id]/layout.tsx, qui les renvoie vers /dashboard) — les y envoyer d'ici faisait
    // boucler les deux redirections à l'infini.
    const clinicHome =
      payload.organizationType === 'CLINIC' && payload.organizationId && !PORTAL_ROLES.includes(role)
        ? `/dashboard/clinics/${payload.organizationId as string}`
        : null;
    // Comptable, accueil, laborantin : pas de tableau de bord clinique, arrivée sur leur page.
    const home = clinicHome ? (ROLE_HOME_SECTION[role] ? `${clinicHome}/${ROLE_HOME_SECTION[role]}` : clinicHome) : '/dashboard';
    const redirectTo = (path: string) => {
      const res = NextResponse.redirect(new URL(path, request.url));
      if (newAccessToken) {
        res.cookies.set({
          name: 'token',
          value: newAccessToken,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 15,
          path: '/',
        });
      }
      return withSecurityHeaders(res);
    };
    if (pathname === '/dashboard' && home !== '/dashboard') {
      return redirectTo(home);
    }
    // Le tableau de bord clinique (statistiques médicales et financières) n'est pas pour eux.
    if (clinicHome && ROLE_HOME_SECTION[role] && pathname === clinicHome) {
      return redirectTo(home);
    }

    // RBAC: Filtrage des pages en fonction du rôle, quel que soit le préfixe
    // (/dashboard/<section> pour une holding, /dashboard/clinics/<id>/<section> pour une clinique)
    const sectionMatch = pathname.match(/^\/dashboard\/(?:clinics\/[^/]+\/)?([^/]+)/);
    const section = sectionMatch?.[1];
    if (section && !canAccessSection(role, section)) {
      return redirectTo(home);
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
