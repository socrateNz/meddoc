import { isModulePageAllowed } from "@/lib/modules-server";
import ModuleUnavailable from "@/components/module-unavailable";

// Module « COMPTABILITE » de la licence (cf. src/lib/modules.ts) : inaccessible s'il est désactivé.
export default async function ModuleLayout({ children }: { children: React.ReactNode }) {
  if (!(await isModulePageAllowed("COMPTABILITE"))) return <ModuleUnavailable module="COMPTABILITE" />;
  return children;
}
