import { NextResponse } from "next/server";
import { UserService } from "@/services/UserService";
import { rateLimitOrResponse } from "@/middlewares/rateLimiter";
import { requireApiUser } from "@/lib/api-auth";
import { parsePagination } from "@/lib/pagination";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { Role, Prisma } from "@prisma/client";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  role: z.nativeEnum(Role),
  phone: z.string().optional(),
});

// Aucun hash de mot de passe ne doit jamais sortir de cette route.
const PUBLIC_USER_FIELDS = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  phone: true,
  isActive: true,
  organizationId: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export async function GET(req: Request) {
  try {
    const limited = await rateLimitOrResponse(req, 60, 60000);
    if (limited) return limited;

    const auth = await requireApiUser(["ADMIN", "COORDINATOR"]);
    if ("response" in auth) return auth.response;
    const { user } = auth;
    const { page, pageSize, skip, take } = parsePagination(new URL(req.url).searchParams);

    const where: Prisma.UserWhereInput =
      user.organization?.type === "HOLDING"
        ? { OR: [{ organizationId: user.organizationId }, { organization: { parentId: user.organizationId } }] }
        : { organizationId: user.organizationId };

    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, select: PUBLIC_USER_FIELDS, orderBy: { lastName: "asc" }, skip, take }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({ data: items, total, page, pageSize });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const limited = await rateLimitOrResponse(req, 10, 60000);
    if (limited) return limited;

    const auth = await requireApiUser(["ADMIN"]);
    if ("response" in auth) return auth.response;

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
