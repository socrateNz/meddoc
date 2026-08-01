import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Endpoint public léger pour un service de supervision d'uptime externe.
// Ne révèle aucune information sensible, juste l'état de la connexion DB.
export async function GET() {
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
