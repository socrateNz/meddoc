import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listLabOrders } from "@/actions/lab";
import LabView from "./lab-view";

export const metadata = {
  title: "Laboratoire | MedDoc",
};

export default async function LabPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  const orgFilter: any = {};
  if (currentUser.organization?.type === "HOLDING") {
    orgFilter.OR = [
      { organizationId: currentUser.organizationId },
      { organization: { parentId: currentUser.organizationId } }
    ];
  } else if (currentUser.organization?.type === "CLINIC") {
    orgFilter.organizationId = currentUser.organizationId;
  } else {
    orgFilter.organizationId = { in: [] };
  }

  const [labOrdersRes, patients] = await Promise.all([
    listLabOrders(),
    prisma.patient.findMany({
      where: orgFilter,
      include: { user: true },
      orderBy: { user: { lastName: "asc" } },
    }),
  ]);

  const labOrders = labOrdersRes.success ? labOrdersRes.data || [] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Laboratoire
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Demandes d&apos;analyses et résultats de laboratoire.
        </p>
      </div>

      <LabView labOrders={labOrders} patients={patients} currentUserRole={currentUser.role} />
    </div>
  );
}
