import { v2 as cloudinary } from 'cloudinary';

// Le SDK lit déjà CLOUDINARY_URL tout seul au premier appel s'il est présent — ne configurer
// explicitement que si les 3 variables séparées existent, pour ne jamais écraser cette lecture
// automatique avec des valeurs undefined (c'est ce que faisait la version précédente de ce
// fichier : un cloudinary.config({cloud_name: undefined, ...}) systématique, qui aurait neutralisé
// CLOUDINARY_URL même une fois renseigné). Ni l'un ni l'autre configuré : les appels Cloudinary
// échoueront avec un message clair ("Must supply cloud_name") plutôt que silencieusement.
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export default cloudinary;
