// Liste curatée de codes CIM-10 (ICD-10) couvrant les motifs de consultation les plus
// fréquents en médecine générale, adaptée au contexte d'une clinique d'Afrique
// francophone (paludisme, typhoïde, etc.). Ce n'est PAS la classification CIM-10
// officielle complète (~70 000 codes) — juste un sous-ensemble pratique pour la
// recherche rapide d'un diagnostic pendant une consultation.

export interface Icd10Code {
  code: string;
  label: string;
  category: string;
}

export const ICD10_CODES: Icd10Code[] = [
  // Maladies infectieuses & parasitaires
  { code: "B50", label: "Paludisme à Plasmodium falciparum", category: "Infectieux" },
  { code: "B51", label: "Paludisme à Plasmodium vivax", category: "Infectieux" },
  { code: "B54", label: "Paludisme, sans précision", category: "Infectieux" },
  { code: "A01.0", label: "Fièvre typhoïde", category: "Infectieux" },
  { code: "A09", label: "Gastro-entérite et colite d'origine infectieuse", category: "Infectieux" },
  { code: "A15", label: "Tuberculose respiratoire, confirmée bactériologiquement", category: "Infectieux" },
  { code: "B15", label: "Hépatite virale A aiguë", category: "Infectieux" },
  { code: "B16", label: "Hépatite virale B aiguë", category: "Infectieux" },
  { code: "B18", label: "Hépatite virale chronique", category: "Infectieux" },
  { code: "B20", label: "Maladie à VIH", category: "Infectieux" },
  { code: "A90", label: "Dengue classique", category: "Infectieux" },
  { code: "B05", label: "Rougeole", category: "Infectieux" },
  { code: "A37", label: "Coqueluche", category: "Infectieux" },
  { code: "B26", label: "Oreillons", category: "Infectieux" },
  { code: "B01", label: "Varicelle", category: "Infectieux" },
  { code: "B27", label: "Mononucléose infectieuse", category: "Infectieux" },
  { code: "A00", label: "Choléra", category: "Infectieux" },
  { code: "A08", label: "Gastro-entérite virale", category: "Infectieux" },
  { code: "B99", label: "Maladie infectieuse, sans précision", category: "Infectieux" },
  { code: "U07.1", label: "COVID-19, virus identifié", category: "Infectieux" },

  // Système respiratoire
  { code: "J00", label: "Rhinopharyngite aiguë (rhume banal)", category: "Respiratoire" },
  { code: "J02", label: "Pharyngite aiguë", category: "Respiratoire" },
  { code: "J03", label: "Angine (amygdalite) aiguë", category: "Respiratoire" },
  { code: "J06", label: "Infection aiguë des voies respiratoires supérieures", category: "Respiratoire" },
  { code: "J11", label: "Grippe, virus non identifié", category: "Respiratoire" },
  { code: "J18", label: "Pneumonie, organisme non précisé", category: "Respiratoire" },
  { code: "J20", label: "Bronchite aiguë", category: "Respiratoire" },
  { code: "J21", label: "Bronchiolite aiguë", category: "Respiratoire" },
  { code: "J44", label: "Bronchopneumopathie chronique obstructive (BPCO)", category: "Respiratoire" },
  { code: "J45", label: "Asthme", category: "Respiratoire" },
  { code: "J30", label: "Rhinite allergique", category: "Respiratoire" },
  { code: "J32", label: "Sinusite chronique", category: "Respiratoire" },
  { code: "J35.0", label: "Amygdalite chronique", category: "Respiratoire" },
  { code: "R05", label: "Toux", category: "Respiratoire" },
  { code: "R06.0", label: "Dyspnée", category: "Respiratoire" },

  // Système cardiovasculaire
  { code: "I10", label: "Hypertension artérielle essentielle", category: "Cardiovasculaire" },
  { code: "I11", label: "Cardiopathie hypertensive", category: "Cardiovasculaire" },
  { code: "I20", label: "Angine de poitrine (angor)", category: "Cardiovasculaire" },
  { code: "I21", label: "Infarctus aigu du myocarde", category: "Cardiovasculaire" },
  { code: "I50", label: "Insuffisance cardiaque", category: "Cardiovasculaire" },
  { code: "I48", label: "Fibrillation et flutter auriculaires", category: "Cardiovasculaire" },
  { code: "I63", label: "Infarctus cérébral (AVC ischémique)", category: "Cardiovasculaire" },
  { code: "I64", label: "Accident vasculaire cérébral, sans précision", category: "Cardiovasculaire" },
  { code: "I83", label: "Varices des membres inférieurs", category: "Cardiovasculaire" },
  { code: "I95", label: "Hypotension", category: "Cardiovasculaire" },
  { code: "R07.4", label: "Douleur thoracique, sans précision", category: "Cardiovasculaire" },

  // Système endocrinien / métabolique
  { code: "E10", label: "Diabète sucré de type 1", category: "Endocrinien" },
  { code: "E11", label: "Diabète sucré de type 2", category: "Endocrinien" },
  { code: "E03", label: "Hypothyroïdie", category: "Endocrinien" },
  { code: "E05", label: "Hyperthyroïdie (thyrotoxicose)", category: "Endocrinien" },
  { code: "E66", label: "Obésité", category: "Endocrinien" },
  { code: "E86", label: "Déplétion volémique (déshydratation)", category: "Endocrinien" },
  { code: "E44", label: "Malnutrition protéino-énergétique modérée", category: "Endocrinien" },
  { code: "E43", label: "Malnutrition protéino-énergétique sévère", category: "Endocrinien" },
  { code: "E78", label: "Anomalies du métabolisme des lipoprotéines", category: "Endocrinien" },

  // Système digestif
  { code: "K21", label: "Reflux gastro-œsophagien", category: "Digestif" },
  { code: "K29", label: "Gastrite et duodénite", category: "Digestif" },
  { code: "K25", label: "Ulcère de l'estomac", category: "Digestif" },
  { code: "K26", label: "Ulcère duodénal", category: "Digestif" },
  { code: "K35", label: "Appendicite aiguë", category: "Digestif" },
  { code: "K52", label: "Autres gastro-entérites et colites non infectieuses", category: "Digestif" },
  { code: "K59.0", label: "Constipation", category: "Digestif" },
  { code: "K58", label: "Syndrome de l'intestin irritable", category: "Digestif" },
  { code: "K80", label: "Lithiase biliaire", category: "Digestif" },
  { code: "K74", label: "Fibrose et cirrhose du foie", category: "Digestif" },
  { code: "R10", label: "Douleur abdominale et pelvienne", category: "Digestif" },
  { code: "R11", label: "Nausées et vomissements", category: "Digestif" },

  // Système génito-urinaire
  { code: "N39.0", label: "Infection des voies urinaires, siège non précisé", category: "Génito-urinaire" },
  { code: "N30", label: "Cystite", category: "Génito-urinaire" },
  { code: "N20", label: "Calcul du rein et de l'uretère (lithiase urinaire)", category: "Génito-urinaire" },
  { code: "N18", label: "Maladie rénale chronique", category: "Génito-urinaire" },
  { code: "N40", label: "Hyperplasie de la prostate", category: "Génito-urinaire" },
  { code: "N76", label: "Autres affections inflammatoires du vagin et de la vulve", category: "Génito-urinaire" },

  // Grossesse, accouchement et suivi prénatal
  { code: "Z34", label: "Surveillance d'une grossesse normale", category: "Obstétrique" },
  { code: "O26", label: "Soins maternels pour d'autres affections liées à la grossesse", category: "Obstétrique" },
  { code: "O14", label: "Pré-éclampsie", category: "Obstétrique" },
  { code: "O21", label: "Vomissements excessifs au cours de la grossesse", category: "Obstétrique" },
  { code: "Z39", label: "Examen et soins postnataux", category: "Obstétrique" },

  // Système ostéo-articulaire / musculo-squelettique
  { code: "M54.5", label: "Lombalgie", category: "Musculo-squelettique" },
  { code: "M54.2", label: "Cervicalgie", category: "Musculo-squelettique" },
  { code: "M25.5", label: "Douleur articulaire", category: "Musculo-squelettique" },
  { code: "M79.1", label: "Myalgie", category: "Musculo-squelettique" },
  { code: "M19", label: "Arthrose, sans précision", category: "Musculo-squelettique" },
  { code: "M06", label: "Polyarthrite rhumatoïde", category: "Musculo-squelettique" },
  { code: "M10", label: "Goutte", category: "Musculo-squelettique" },

  // Peau et tissus sous-cutanés
  { code: "L03", label: "Cellulite (dermohypodermite bactérienne)", category: "Dermatologique" },
  { code: "L02", label: "Abcès cutané, furoncle et anthrax", category: "Dermatologique" },
  { code: "L20", label: "Dermatite atopique (eczéma)", category: "Dermatologique" },
  { code: "L23", label: "Dermatite allergique de contact", category: "Dermatologique" },
  { code: "L30", label: "Autres dermatites", category: "Dermatologique" },
  { code: "B35", label: "Dermatophytose (mycose cutanée)", category: "Dermatologique" },
  { code: "L50", label: "Urticaire", category: "Dermatologique" },

  // Yeux et oreilles
  { code: "H10", label: "Conjonctivite", category: "Ophtalmo / ORL" },
  { code: "H66", label: "Otite moyenne suppurée", category: "Ophtalmo / ORL" },
  { code: "H60", label: "Otite externe", category: "Ophtalmo / ORL" },
  { code: "H61.2", label: "Bouchon de cérumen", category: "Ophtalmo / ORL" },

  // Santé mentale
  { code: "F32", label: "Épisode dépressif", category: "Santé mentale" },
  { code: "F41", label: "Autres troubles anxieux", category: "Santé mentale" },
  { code: "F41.1", label: "Anxiété généralisée", category: "Santé mentale" },
  { code: "F51.0", label: "Insomnie non organique", category: "Santé mentale" },
  { code: "F10", label: "Troubles liés à l'utilisation de l'alcool", category: "Santé mentale" },

  // Traumatismes et causes externes
  { code: "S00", label: "Traumatisme superficiel de la tête", category: "Traumatologie" },
  { code: "S06", label: "Traumatisme intracrânien", category: "Traumatologie" },
  { code: "S52", label: "Fracture de l'avant-bras", category: "Traumatologie" },
  { code: "S82", label: "Fracture de la jambe, y compris la cheville", category: "Traumatologie" },
  { code: "S93.4", label: "Entorse de la cheville", category: "Traumatologie" },
  { code: "T14.1", label: "Plaie ouverte d'une région du corps non précisée", category: "Traumatologie" },
  { code: "T30", label: "Brûlure, siège non précisé", category: "Traumatologie" },
  { code: "T63", label: "Effet toxique d'un contact avec un animal venimeux", category: "Traumatologie" },

  // Symptômes et signes généraux
  { code: "R50.9", label: "Fièvre, sans précision", category: "Symptômes généraux" },
  { code: "R51", label: "Céphalée", category: "Symptômes généraux" },
  { code: "R42", label: "Étourdissements et vertiges", category: "Symptômes généraux" },
  { code: "R53", label: "Malaise et fatigue", category: "Symptômes généraux" },
  { code: "R55", label: "Syncope et collapsus", category: "Symptômes généraux" },
  { code: "R60", label: "Œdème, non classé ailleurs", category: "Symptômes généraux" },
  { code: "R63.4", label: "Perte de poids anormale", category: "Symptômes généraux" },

  // Examens et suivi
  { code: "Z00", label: "Examen général et investigation de personnes sans plainte", category: "Suivi / Prévention" },
  { code: "Z01.4", label: "Examen gynécologique de routine", category: "Suivi / Prévention" },
  { code: "Z23", label: "Vaccination nécessaire (immunisation)", category: "Suivi / Prévention" },
  { code: "Z71.3", label: "Consultation de conseil diététique", category: "Suivi / Prévention" },
];

export function searchIcd10Codes(query: string, limit = 20): Icd10Code[] {
  const q = query.trim().toLowerCase();
  if (!q) return ICD10_CODES.slice(0, limit);
  return ICD10_CODES.filter(
    (c) => c.code.toLowerCase().includes(q) || c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
  ).slice(0, limit);
}
