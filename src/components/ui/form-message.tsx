import { CircleCheck, OctagonX } from "lucide-react";

// Message affiché dans un formulaire ou une fenêtre (erreur de saisie, confirmation) : même aspect
// partout, lisible (14 px), avec une icône.
export function FormMessage({ type, text }: { type: "success" | "error"; text: string }) {
  const success = type === "success";
  return (
    <div
      role={success ? "status" : "alert"}
      className={`flex items-start gap-2 rounded-xl border p-3 text-sm font-medium ${
        success
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/30 dark:text-emerald-400"
          : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/30 dark:text-red-400"
      }`}
    >
      {success ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <OctagonX className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{text}</span>
    </div>
  );
}
