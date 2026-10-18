// Adresse publique (https://meddoc.tacynt.com) d'une requête reçue par un Route Handler.
// En production, MedDoc écoute sur 127.0.0.1:3000 derrière Nginx : `req.url` y porte cette
// adresse interne, pas le domaine tapé par le visiteur. On reconstruit donc l'origine à partir de
// l'en-tête Host (fixé par Nginx, qui ne sert que nos domaines) et de X-Forwarded-Proto (écrasé
// par Nginx). X-Forwarded-Host n'est volontairement PAS utilisé : Nginx transmet tel quel celui
// envoyé par le client, il serait donc falsifiable (redirection vers un autre site).
export function publicOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("host");
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : url.protocol.replace(":", "");
  return host ? `${proto}://${host}` : url.origin;
}
