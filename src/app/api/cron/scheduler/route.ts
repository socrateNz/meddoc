import { NextResponse } from "next/server";
import { runSchedulerTasks } from "@/lib/scheduler";

// Déclenché par un service de cron externe (ex. cron-job.org, GitHub Actions
// scheduled workflow, ou Vercel Cron sur les plans qui le permettent) toutes
// les quelques minutes. Protégé par CRON_SECRET pour éviter tout déclenchement
// public non autorisé.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    await runSchedulerTasks();
    return NextResponse.json({ success: true, ranAt: new Date().toISOString() });
  } catch (error: any) {
    console.error("Scheduler cron error:", error);
    return NextResponse.json({ success: false, error: error.message || "Erreur du planificateur" }, { status: 500 });
  }
}
