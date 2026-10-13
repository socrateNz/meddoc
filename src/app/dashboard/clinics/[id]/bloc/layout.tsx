import { isModulePageAllowed } from "@/lib/modules-server";
import ModuleUnavailable from "@/components/module-unavailable";

// Module « BLOC » de la licence (cf. src/lib/modules.ts) : inaccessible s'il est désactivé.
export default async function ModuleLayout({ children }: { children: React.ReactNode }) {
  if (!(await isModulePageAllowed("BLOC"))) return <ModuleUnavailable module="BLOC" />;
  return children;
}
