"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Plus, Edit, Trash2, Loader2, BedSingle, DoorOpen, UserMinus } from "lucide-react";
import { createWard, updateWard, deleteWard, deleteRoom, deleteBed, releaseBed } from "@/actions/wards";
import RoomDialog from "./room-dialog";
import BedDialog from "./bed-dialog";
import AssignBedDialog from "./assign-bed-dialog";
import { toast } from "sonner";

const ROOMS_STRUCTURE_ROLES = ["COORDINATOR"];
const ROOMS_OPERATE_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER"];

interface RoomsViewProps {
  clinicId: string;
  wards: any[];
  patients: { id: string; user: { firstName: string; lastName: string } }[];
  currentUserRole: string;
}

function WardDialog({ clinicId, ward, onSuccess }: { clinicId: string; ward?: { id: string; name: string; code: string }; onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(ward?.name || "");
  const [code, setCode] = useState(ward?.code || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      toast.error("Le nom et le code du service sont requis.");
      return;
    }
    setLoading(true);
    try {
      const res = ward
        ? await updateWard(ward.id, { name: name.trim(), code: code.trim() })
        : await createWard({ organizationId: clinicId, name: name.trim(), code: code.trim() });
      if (res.success) {
        toast.success(ward ? "Service mis à jour." : "Service créé.");
        setOpen(false);
        if (!ward) {
          setName("");
          setCode("");
        }
        onSuccess?.();
      } else {
        toast.error(res.error || "Erreur lors de l'enregistrement.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          ward ? (
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" />
          ) : (
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs" />
          )
        }
      >
        {ward ? <Edit className="h-3.5 w-3.5" /> : (<><Plus className="h-4 w-4" />Nouveau service</>)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[380px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5 text-blue-500" />
            {ward ? "Modifier le service" : "Nouveau service"}
          </DialogTitle>
          <DialogDescription>ex: Urgences, Soins Intensifs, Maternité...</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nom du service *</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Maternité" className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label>Code *</Label>
            <Input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ex: MATERNITY" className="rounded-xl" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Annuler</Button>
            <Button type="submit" disabled={loading} className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function RoomsView({ clinicId, wards, patients, currentUserRole }: RoomsViewProps) {
  const router = useRouter();
  const refresh = () => router.refresh();

  const canStructure = ROOMS_STRUCTURE_ROLES.includes(currentUserRole);
  const canOperate = ROOMS_OPERATE_ROLES.includes(currentUserRole);

  const handleDeleteWard = async (id: string) => {
    const res = await deleteWard(id);
    if (res.success) {
      toast.success("Service supprimé.");
      refresh();
    } else {
      toast.error(res.error || "Erreur lors de la suppression.");
    }
  };

  const handleDeleteRoom = async (id: string) => {
    const res = await deleteRoom(id);
    if (res.success) {
      toast.success("Chambre supprimée.");
      refresh();
    } else {
      toast.error(res.error || "Erreur lors de la suppression.");
    }
  };

  const handleDeleteBed = async (id: string) => {
    const res = await deleteBed(id);
    if (res.success) {
      toast.success("Lit supprimé.");
      refresh();
    } else {
      toast.error(res.error || "Erreur lors de la suppression.");
    }
  };

  const handleReleaseBed = async (patientId: string) => {
    const res = await releaseBed(patientId);
    if (res.success) {
      toast.success("Lit libéré.");
      refresh();
    } else {
      toast.error(res.error || "Erreur lors de la libération.");
    }
  };

  return (
    <div className="space-y-6">
      {canStructure && (
        <div className="flex justify-end animate-fade-up">
          <WardDialog clinicId={clinicId} onSuccess={refresh} />
        </div>
      )}

      {wards.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Aucun service configuré pour cette clinique.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {wards.map((ward: any) => (
            <Card key={ward.id} className="rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Building2 className="h-5 w-5 text-blue-500 shrink-0" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">{ward.name}</h3>
                  <Badge variant="outline" className="text-[10px] shrink-0">{ward.code}</Badge>
                </div>
                {canStructure && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <RoomDialog wardId={ward.id} onSuccess={refresh} />
                    <WardDialog clinicId={clinicId} ward={ward} onSuccess={refresh} />
                    {ward.rooms.length === 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => handleDeleteWard(ward.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="p-5 space-y-4">
                {ward.rooms.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Aucune chambre dans ce service.</p>
                ) : (
                  ward.rooms.map((room: any) => (
                    <div key={room.id} className="rounded-xl border border-slate-100 dark:border-slate-800 p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <DoorOpen className="h-4 w-4 text-slate-400 shrink-0" />
                          <p className="font-semibold text-sm truncate">{room.name}</p>
                        </div>
                        {canStructure && (
                          <div className="flex items-center gap-1 shrink-0">
                            <BedDialog roomId={room.id} onSuccess={refresh} />
                            {room.beds.length === 0 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                onClick={() => handleDeleteRoom(room.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>

                      {room.beds.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">Aucun lit dans cette chambre.</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                          {room.beds.map((bed: any) => {
                            const occupant = bed.patients?.[0];
                            if (bed.status === "OCCUPIED" && occupant) {
                              return (
                                <div key={bed.id} className="rounded-xl border-2 border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/20 p-3 flex flex-col gap-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-red-700 dark:text-red-400">{bed.label}</span>
                                    {canOperate && (
                                      <button
                                        type="button"
                                        title="Libérer le lit"
                                        onClick={() => handleReleaseBed(occupant.id)}
                                        className="text-red-500 hover:text-red-700"
                                      >
                                        <UserMinus className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-red-600/90 dark:text-red-400/80 truncate">
                                    {occupant.user.lastName} {occupant.user.firstName}
                                  </span>
                                </div>
                              );
                            }
                            return (
                              <div
                                key={bed.id}
                                className="rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 flex flex-col items-center gap-1"
                              >
                                <BedSingle className="h-4 w-4 text-emerald-600" />
                                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{bed.label}</span>
                                <span className="text-[10px] text-emerald-600/70">Libre</span>
                                {(canOperate || canStructure) && (
                                  <div className="flex items-center gap-0.5 mt-0.5">
                                    {canOperate && <AssignBedDialog bedId={bed.id} bedLabel={bed.label} patients={patients} onSuccess={refresh} />}
                                    {canStructure && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                                        onClick={() => handleDeleteBed(bed.id)}
                                        title="Supprimer le lit"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
