import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { listLabTests } from "@/actions/lab";
import { getPharmacyItems } from "@/actions/finance";
import CatalogView from "./catalog-view";

export const metadata = {
  title: "Catalogue des examens | MedDoc",
};

export default async function LabCatalogPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }
  if (currentUser.role !== "COORDINATOR") {
    redirect("/dashboard/lab");
  }

  const [res, pharmacyRes] = await Promise.all([listLabTests(), getPharmacyItems()]);
  const labTests = res.success ? res.data || [] : [];
  const pharmacyItems = pharmacyRes.success ? pharmacyRes.data || [] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/lab">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catalogue des examens</h1>
          <p className="text-sm text-muted-foreground">Examens disponibles, tarifs et seuils critiques pour votre clinique.</p>
        </div>
      </div>

      <CatalogView labTests={labTests} pharmacyItems={pharmacyItems} />
    </div>
  );
}
