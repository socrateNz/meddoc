import { isModulePageAllowed } from "@/lib/modules-server";
import ModuleUnavailable from "@/components/module-unavailable";

// Relevés partenaires : rattachés au module « LABORATOIRE » de la licence (cf. src/lib/modules.ts).
export default async function ModuleLayout({ children }: { children: React.ReactNode }) {
  if (!(await isModulePageAllowed("LABORATOIRE"))) return <ModuleUnavailable module="LABORATOIRE" />;
  return children;
}
