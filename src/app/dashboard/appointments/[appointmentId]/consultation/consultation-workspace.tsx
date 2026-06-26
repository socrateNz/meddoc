"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { completeConsultation } from "@/actions/appointments";
import { Loader2, FileText, Activity, Stethoscope, Pill, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function ConsultationWorkspace({ patient, appointment }: { patient: any, appointment?: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("notes");

  // Form State
  const [symptoms, setSymptoms] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [plan, setPlan] = useState("");
  
  // Medications State
  const [medications, setMedications] = useState<{name: string, dosage: string, frequency: string, instructions: string}[]>([]);
  const [currentMed, setCurrentMed] = useState({ name: "", dosage: "", frequency: "", instructions: "" });

  const addMedication = () => {
    if (!currentMed.name || !currentMed.dosage || !currentMed.frequency) {
      toast.error("Veuillez remplir le nom, le dosage et la fréquence du médicament.");
      return;
    }
    setMedications([...medications, currentMed]);
    setCurrentMed({ name: "", dosage: "", frequency: "", instructions: "" });
  };

  const removeMedication = (index: number) => {
    setMedications(medications.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!symptoms || !diagnosis || !plan) {
      toast.error("Veuillez remplir tous les champs de notes cliniques.");
      setActiveTab("notes");
      return;
    }

    setLoading(true);
    try {
      const response = await completeConsultation({
        appointmentId: appointment?.id,
        patientId: patient.id,
        symptoms,
        diagnosis,
        plan,
        medications
      });

      if (response.success) {
        toast.success("Consultation clôturée avec succès.");
        if (appointment?.id) {
          router.push("/dashboard/appointments");
        } else {
          router.push(`/dashboard/patients/${patient.id}`);
        }
      } else {
        toast.error(response.error || "Erreur lors de la clôture.");
      }
    } catch (error) {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  };

  const isCompleted = appointment?.status === 'COMPLETED';

  return (
    <div className="grid gap-6 md:grid-cols-12">
      <div className="md:col-span-4 lg:col-span-3 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Patient</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Nom complet</p>
              <p className="font-medium">{patient.user.lastName} {patient.user.firstName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date de naissance</p>
              <p className="font-medium">
                {new Date(patient.dateOfBirth).toLocaleDateString('fr-FR')}
              </p>
            </div>
            {patient.allergies?.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground text-red-500 font-medium">Allergies</p>
                <ul className="list-disc list-inside text-sm mt-1">
                  {patient.allergies.map((allergy: string, i: number) => (
                    <li key={i}>{allergy}</li>
                  ))}
                </ul>
              </div>
            )}
            {patient.pathologies?.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground">Pathologies</p>
                <ul className="list-disc list-inside text-sm mt-1">
                  {patient.pathologies.map((pathology: string, i: number) => (
                    <li key={i}>{pathology}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmit}
          disabled={loading || isCompleted}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isCompleted ? "Consultation Terminée" : "Clôturer la consultation"}
        </Button>
      </div>

      <div className="md:col-span-8 lg:col-span-9">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="history" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Historique
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4" />
              Notes cliniques
            </TabsTrigger>
            <TabsTrigger value="prescriptions" className="flex items-center gap-2">
              <Pill className="h-4 w-4" />
              Prescriptions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Dossiers médicaux précédents</CardTitle>
                <CardDescription>
                  Historique des consultations et documents du patient.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {patient.medicalRecords?.length > 0 ? (
                  <div className="space-y-4">
                    {patient.medicalRecords.map((record: any) => (
                      <div key={record.id} className="border-b pb-4 last:border-0 last:pb-0">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-medium flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            {record.title}
                          </h4>
                          <span className="text-xs text-muted-foreground">
                            {new Date(record.createdAt).toLocaleDateString('fr-FR')}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{record.description}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Aucun historique médical trouvé pour ce patient.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Évaluation Clinique</CardTitle>
                <CardDescription>
                  Remplissez vos observations et votre diagnostic pour cette consultation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="symptoms" className="text-base font-semibold text-primary">1. Symptômes & Observations</Label>
                  <Textarea
                    id="symptoms"
                    placeholder="Décrivez les symptômes présentés par le patient..."
                    className="min-h-[120px] resize-y"
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    disabled={isCompleted}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="diagnosis" className="text-base font-semibold text-primary">2. Diagnostic / Évaluation</Label>
                  <Textarea
                    id="diagnosis"
                    placeholder="Votre évaluation clinique et diagnostic..."
                    className="min-h-[120px] resize-y"
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    disabled={isCompleted}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plan" className="text-base font-semibold text-primary">3. Plan de Traitement</Label>
                  <Textarea
                    id="plan"
                    placeholder="Recommandations, suivi prévu, soins à apporter..."
                    className="min-h-[120px] resize-y"
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    disabled={isCompleted}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="prescriptions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Prescriptions & Médicaments</CardTitle>
                <CardDescription>
                  Ajoutez les médicaments prescrits. Ils seront ajoutés au Plan de Soins du patient et figureront sur l'ordonnance.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 items-end">
                  <div className="space-y-2">
                    <Label>Médicament</Label>
                    <Input 
                      placeholder="Ex: Paracétamol" 
                      value={currentMed.name}
                      onChange={(e) => setCurrentMed({...currentMed, name: e.target.value})}
                      disabled={isCompleted}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Dosage</Label>
                    <Input 
                      placeholder="Ex: 1000mg" 
                      value={currentMed.dosage}
                      onChange={(e) => setCurrentMed({...currentMed, dosage: e.target.value})}
                      disabled={isCompleted}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fréquence</Label>
                    <Input 
                      placeholder="Ex: 1 matin et soir" 
                      value={currentMed.frequency}
                      onChange={(e) => setCurrentMed({...currentMed, frequency: e.target.value})}
                      disabled={isCompleted}
                    />
                  </div>
                  <Button 
                    onClick={addMedication} 
                    disabled={isCompleted}
                    className="flex flex-row gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Ajouter
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Instructions additionnelles (Optionnel)</Label>
                  <Input 
                    placeholder="Ex: À prendre au cours du repas" 
                    value={currentMed.instructions}
                    onChange={(e) => setCurrentMed({...currentMed, instructions: e.target.value})}
                    disabled={isCompleted}
                  />
                </div>

                {medications.length > 0 ? (
                  <div className="mt-8 space-y-3">
                    <h4 className="font-medium text-sm text-muted-foreground border-b pb-2">Liste des prescriptions à générer</h4>
                    {medications.map((med, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
                        <div>
                          <p className="font-semibold text-primary">{med.name} <span className="text-muted-foreground font-normal">- {med.dosage}</span></p>
                          <p className="text-sm">{med.frequency}</p>
                          {med.instructions && <p className="text-xs text-muted-foreground mt-1 italic">Note: {med.instructions}</p>}
                        </div>
                        {!isCompleted && (
                          <Button variant="ghost" size="icon" onClick={() => removeMedication(index)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-dashed">
                    <Pill className="h-8 w-8 text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground">Aucun médicament prescrit pour le moment.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
