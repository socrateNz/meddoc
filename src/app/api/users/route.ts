import { NextResponse } from "next/server";
import { UserService } from "@/services/UserService";
import { z } from "zod";
import { Role } from "@prisma/client";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  role: z.nativeEnum(Role),
  phone: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const role = req.headers.get("x-user-role");
    
    // RBAC simple: Seul un ADMIN peut lister tous les utilisateurs (ou coordinateur)
    if (role !== "ADMIN" && role !== "COORDINATOR") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const users = await UserService.getUsers();
    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const role = req.headers.get("x-user-role");
    
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Seul un administrateur peut créer des utilisateurs" }, { status: 403 });
    }

    const body = await req.json();
    const data = createUserSchema.parse(body);

    const newUser = await UserService.createUser(data);
    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Données invalides", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Erreur lors de la création de l'utilisateur" }, { status: 500 });
  }
}
