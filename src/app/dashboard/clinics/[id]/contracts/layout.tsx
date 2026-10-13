import { isModulePageAllowed } from "@/lib/modules-server";
import ModuleUnavailable from "@/components/module-unavailable";

// Module « CONTRATS_AIDANTS » de la licence (cf. src/lib/modules.ts) : inaccessible s'il est désactivé.
export default async function ModuleLayout({ children }: { children: React.ReactNode }) {
  if (!(await isModulePageAllowed("CONTRATS_AIDANTS"))) return <ModuleUnavailable module="CONTRATS_AIDANTS" />;
  return children;
}
