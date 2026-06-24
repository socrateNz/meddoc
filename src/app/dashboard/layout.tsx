import { getCurrentUser } from "@/lib/auth";
import Sidebar from "./sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentUser();

  return (
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-slate-50/80 to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/20 relative">
      {/* Decorative background glow circles */}
      <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-blue-400/10 dark:bg-blue-600/5 blur-[120px] pointer-events-none z-0" />
      <div className="absolute -bottom-[20%] left-[20%] w-[500px] h-[500px] rounded-full bg-violet-400/10 dark:bg-violet-600/5 blur-[120px] pointer-events-none z-0" />

      {/* Responsive & Dynamic Sidebar */}
      <Sidebar currentUser={currentUser} />

      {/* Main Content */}
      <main className="flex flex-1 flex-col h-full min-h-0 overflow-hidden relative z-10">
        <div className="flex-1 p-6 lg:p-8 flex flex-col overflow-y-auto min-h-0">
          {children}
        </div>
      </main>
    </div>
  );
}

