import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { readFile, writeFile } from "node:fs/promises";

// Voix off de vidéo avec ElevenLabs : un fichier texte (le script de la vidéo) devient un MP3.
// Chaque paragraphe (séparé par une ligne vide) est généré à part, avec le paragraphe précédent et
// le suivant en contexte (« request stitching ») pour éviter les sauts de ton aux raccords, puis
// les morceaux sont mis bout à bout dans un seul fichier.
// Le texte peut porter des indications de jeu du modèle v4 : [enthousiaste], [chuchote], [pause]…
// Points de suspension pour les silences, majuscules pour appuyer un mot.
//
// La clé est lue dans ELEVENLABS_API_KEY (fichier .env.local, jamais dans le code).
//
// Usage (dans le dossier de l'application) :
//   node --env-file=.env.local scripts/generate-voiceover.mjs <script.txt> [--sortie voix.mp3]
//     [--voix <id de voix>] [--langue fr] [--stabilite 0.6]
//   node --env-file=.env.local scripts/generate-voiceover.mjs --lister-voix

const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // George : voix masculine posée, de narration
const MODEL_ID = "eleven_v4";

function parseArgs(argv) {
  const options = { langue: "fr", voix: DEFAULT_VOICE_ID, stabilite: 0.6 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--lister-voix") options.listerVoix = true;
    else if (arg.startsWith("--")) options[arg.slice(2)] = argv[++i];
    else positional.push(arg);
  }
  options.entree = positional[0];
  return options;
}

async function listVoices(client) {
  const { voices } = await client.voices.getAll();
  for (const voice of voices) {
    const labels = Object.values(voice.labels ?? {}).join(", ");
    console.log(`${voice.voiceId}  ${voice.name}${labels ? `  (${labels})` : ""}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = new ElevenLabsClient();

  if (options.listerVoix) return listVoices(client);
  if (!options.entree) {
    console.error("Usage : node --env-file=.env.local scripts/generate-voiceover.mjs <script.txt> [--sortie voix.mp3]");
    process.exit(1);
  }

  const text = await readFile(options.entree, "utf8");
  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const output = options.sortie ?? options.entree.replace(/\.[^.\\/]+$/, "") + ".mp3";

  const chunks = [];
  for (const [i, paragraph] of paragraphs.entries()) {
    console.log(`Paragraphe ${i + 1}/${paragraphs.length}…`);
    const audio = await client.textToSpeech.convert(options.voix, {
      text: paragraph,
      modelId: MODEL_ID,
      languageCode: options.langue,
      outputFormat: "mp3_44100_128",
      voiceSettings: { stability: Number(options.stabilite), similarityBoost: 0.75 },
      previousText: paragraphs[i - 1],
      nextText: paragraphs[i + 1],
    });
    chunks.push(Buffer.from(await new Response(audio).arrayBuffer()));
  }

  await writeFile(output, Buffer.concat(chunks));
  console.log(`Voix off écrite dans ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
