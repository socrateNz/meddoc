"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Confirmation unique pour toute l'application (au lieu du confirm() du navigateur, dont l'aspect
// change d'un navigateur à l'autre) : `const confirm = useConfirm(); if (!(await confirm({...}))) return;`
type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Action irréversible (suppression...) : bouton rouge.
  destructive?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!options} onOpenChange={(open) => !open && close(false)}>
        <DialogContent className="w-[calc(100%-1rem)] rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {options?.destructive && <AlertTriangle className="h-5 w-5 text-red-600" />}
              {options?.title}
            </DialogTitle>
            {options?.description && <DialogDescription>{options.description}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              {options?.cancelLabel ?? "Annuler"}
            </Button>
            <Button variant={options?.destructive ? "destructive" : "default"} onClick={() => close(true)} autoFocus>
              {options?.confirmLabel ?? "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  // Hors du tableau de bord (sans fournisseur) : repli sur la confirmation du navigateur.
  return confirm ?? (async (o) => window.confirm(o.description ? `${o.title}\n\n${o.description}` : o.title));
}
