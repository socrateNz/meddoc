import { isModulePageAllowed } from "@/lib/modules-server";
import ModuleUnavailable from "@/components/module-unavailable";

// Module « PHARMACIE » de la licence (cf. src/lib/modules.ts) : inaccessible s'il est désactivé.
export default async function ModuleLayout({ children }: { children: React.ReactNode }) {
  if (!(await isModulePageAllowed("PHARMACIE"))) return <ModuleUnavailable module="PHARMACIE" />;
  return children;
}
