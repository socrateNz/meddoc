import { NextResponse } from "next/server";

// Redirection RELATIVE vers /login : derrière Nginx, `req.url` porte l'adresse interne de
// l'application (127.0.0.1:3000), une URL absolue construite dessus enverrait le navigateur vers
// localhost. Un en-tête Location relatif est valide (RFC 9110) et garde le domaine du visiteur.
export async function GET() {
  const response = new NextResponse(null, { status: 307, headers: { Location: "/login" } });

  // Clear authentication cookies
  response.cookies.set({
    name: "token",
    value: "",
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });
  
  response.cookies.set({
    name: "refreshToken",
    value: "",
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });

  return response;
}
