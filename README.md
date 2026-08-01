# MedDoc

MedDoc est une plateforme SaaS de gestion médicale et de coordination des soins pour des holdings hospitalières et leurs cliniques : dossiers patients, plans de soins, rendez-vous, incidents, messagerie interne, finance & pharmacie (achats, ventes, inventaire), assistant clinique IA, et génération de documents PDF.

## Stack technique

- [Next.js](https://nextjs.org) (App Router, Server Actions) + React 19 + TypeScript
- [Prisma](https://www.prisma.io) sur une base **MongoDB**
- Tailwind CSS + shadcn/ui (Radix)
- Authentification par JWT (access token + refresh token) via cookies HTTP-only
- Cloudinary (fichiers/avatars), Google Generative AI / Gemini (assistant IA), `@react-pdf/renderer` (factures, ordonnances)
- PWA (service worker, mode hors-ligne partiel)

## Rôles

`SUPER_ADMIN` (gestion des holdings) · `ADMIN` · `COORDINATOR` · `CAREGIVER` (aidant/soignant) · `FAMILY` · `PATIENT`.

Une organisation est soit une `HOLDING` (regroupe plusieurs cliniques), soit une `CLINIC`. Les accès aux pages et actions serveur sont filtrés par rôle et par organisation (voir [src/middleware.ts](src/middleware.ts)).

## Démarrage local

1. **Dépendances**
   ```bash
   npm install
   ```

2. **Variables d'environnement** — copier `.env.example` en `.env` et renseigner :
   - `DATABASE_URL` : connexion MongoDB (Atlas ou local)
   - `JWT_SECRET` / `JWT_REFRESH_SECRET` : générer avec
     `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
   - `CLOUDINARY_URL` : identifiants Cloudinary
   - `GEMINI_API_KEY` : clé API Google Generative AI

   L'application refuse de démarrer si `JWT_SECRET` ou `JWT_REFRESH_SECRET` sont absents (pas de valeur par défaut en production).

3. **Base de données**
   ```bash
   npx prisma generate
   npx prisma db push
   ```
   `db push` synchronise directement le schéma avec MongoDB (pas de migrations SQL classiques sur ce provider).

4. **Compte initial** — créer un super-administrateur :
   ```bash
   npx tsx scripts/seed-superadmin.ts
   ```
   ou peupler des données de démonstration avec `prisma/seed.ts` / `migrate.ts` selon le besoin.

5. **Lancer le serveur de développement**
   ```bash
   npm run dev
   ```
   puis ouvrir [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — serveur de développement
- `npm run build` — `prisma generate` + build de production
- `npm run start` — serveur de production
- `npm run lint` — ESLint

## Structure du projet

- `src/app` — routes App Router (pages publiques, `dashboard/*`, routes API sous `app/api/*`)
- `src/actions` — Server Actions (logique métier principale, écriture en base)
- `src/services` / `src/repositories` — logique de plus bas niveau utilisée par certaines routes API historiques
- `src/validators` — schémas zod de validation des entrées (Server Actions et routes API)
- `src/middlewares` — rate limiting, en-têtes de sécurité, journal d'audit
- `src/middleware.ts` — middleware Next.js : authentification JWT, RBAC par section, en-têtes de sécurité
- `prisma/schema.prisma` — modèle de données MongoDB

## Sécurité

- Middleware Edge : vérification JWT, RBAC par rôle/section, en-têtes de sécurité (CSP, X-Frame-Options...)
- Rate limiting en mémoire sur les routes sensibles (login, contact, écritures API)
- Journal d'audit (`AuditLog`) sur les actions sensibles, consultable dans `Tableau de bord > Journal d'audit` (ADMIN)
- Validation runtime (zod) sur les Server Actions et routes API en écriture

> Ce projet cible une version de Next.js dont certaines conventions diffèrent des versions publiques habituelles — voir `node_modules/next/dist/docs/` avant de modifier des fichiers de routing ou de configuration.
