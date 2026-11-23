// Impression d'un seul élément (ticket de caisse 80 mm, facture A4) sans le reste de la page.
//
// Avant : on imprimait la page entière en masquant tout sauf le ticket (visibility), le ticket
// restant dans sa boîte de dialogue centrée. Sur tablette Android (Chrome + imprimante thermique
// ESC/POS), le ticket sortait décalé — haut et gauche rognés — et l'aperçu comptait plusieurs
// pages blanches : la page masquée gardait sa hauteur, et la position de la boîte de dialogue
// dépendait du défilement et de la taille de l'écran.
//
// Ici : une copie de l'élément est posée seule à la racine de <body>, tout le reste est retiré de
// la mise en page à l'impression (display: none), et le format de page est imposé (@page) —
// sans marge pour le ticket (largeur du papier thermique choisi), A4 pour la facture. La copie garde ses classes, donc
// son style à l'écran.

const ROOT_ID = "print-root";
const STYLE_ID = "print-root-style";
const PRINTING_CLASS = "printing-element";

export type PrintFormat = "thermal" | "a4";

// Retire la copie : appelé à la fermeture du ticket. Pas à « afterprint » : sur Android cet
// événement part dès l'ouverture de l'aperçu, qui se recalcule ensuite (changement de papier) —
// la copie doit rester là tant qu'il est ouvert. Invisible à l'écran, elle ne gêne pas.
export function cleanupPrint() {
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
  document.documentElement.classList.remove(PRINTING_CLASS);
}

export function printElement(element: HTMLElement, format: PrintFormat = "thermal") {
  cleanupPrint();

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.dataset.format = format;
  const copy = element.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  root.appendChild(copy);
  document.body.appendChild(root);

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent =
    format === "thermal"
      ? // Pas de « size » : la largeur est celle du papier choisi dans la boîte d'impression
        // (« Papier thermique 80 mm ») ; sans marge, le ticket part du bord haut.
        "@page { margin: 0; }"
      : "@page { size: A4; margin: 10mm; }";
  document.head.appendChild(style);
  document.documentElement.classList.add(PRINTING_CLASS);

  // Laisse le navigateur appliquer la copie et le format avant d'ouvrir la boîte d'impression.
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}
