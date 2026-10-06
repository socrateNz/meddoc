import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { listLabTests } from "@/actions/lab";
import { PaginationNav, keepQuery } from "@/components/ui/pagination-nav";
import { pageFromParam } from "@/lib/pagination";
import { getPharmacyItems } from "@/actions/finance";
import CatalogView from "./catalog-view";

export const metadata = {
  title: "Catalogue des examens | MedDoc",
};

interface LabCatalogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LabCatalogPage({ searchParams }: LabCatalogPageProps) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }
  if (currentUser.role !== "COORDINATOR") {
    redirect("/dashboard/lab");
  }

  const query = await searchParams;
  const [res, pharmacyRes] = await Promise.all([listLabTests(undefined, { page: pageFromParam(query.page) }), getPharmacyItems()]);
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
      {res.success && (
        <PaginationNav
          page={res.page}
          pageSize={res.pageSize}
          total={res.total}
          pathname="/dashboard/lab/catalog"
          query={keepQuery(query)}
          itemLabel="examen"
        />
      )}
    </div>
  );
}
