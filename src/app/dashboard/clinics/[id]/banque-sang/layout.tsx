import { isModulePageAllowed } from "@/lib/modules-server";
import ModuleUnavailable from "@/components/module-unavailable";

// Module « BANQUE_SANG » de la licence (cf. src/lib/modules.ts) : inaccessible s'il est désactivé.
export default async function ModuleLayout({ children }: { children: React.ReactNode }) {
  if (!(await isModulePageAllowed("BANQUE_SANG"))) return <ModuleUnavailable module="BANQUE_SANG" />;
  return children;
}
