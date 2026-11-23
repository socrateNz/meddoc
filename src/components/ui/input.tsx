import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

// Champs numériques : à l'entrée dans le champ, son contenu est sélectionné — taper remplace le 0
// (ou l'ancienne valeur) au lieu de s'y ajouter (« 05000 »), et l'effacer se fait d'une touche. La
// molette de la souris ne change plus la valeur par accident en faisant défiler la page.
function Input({ className, type, onFocus, onWheel, ...props }: React.ComponentProps<"input">) {
  const isNumber = type === "number"
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
        if (isNumber) {
          const input = e.currentTarget
          requestAnimationFrame(() => input.select())
        }
        onFocus?.(e)
      }}
      onWheel={(e: React.WheelEvent<HTMLInputElement>) => {
        if (isNumber && document.activeElement === e.currentTarget) e.currentTarget.blur()
        onWheel?.(e)
      }}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
