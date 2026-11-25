/* =====================================================================
   ADMIRELLE B — CONFIGURATION
   C'est le seul fichier à remplir pour brancher le site sur les vrais services.
   Tant que "firebase.apiKey" est vide, le site fonctionne en MODE DÉMO
   (catalogue d'exemple, données enregistrées dans le navigateur, paiement en ligne désactivé).
   ===================================================================== */
window.AB_CONFIG = {
  // 1) Firebase : console.firebase.google.com > Paramètres du projet > Vos applications > Config
  firebase: {
    apiKey: "AIzaSyCuKXs0xcbZtwXChfm81uHAX7MeEPlYspk",
    authDomain: "admirrelle-b.firebaseapp.com",
    projectId: "admirrelle-b",
    storageBucket: "admirrelle-b.firebasestorage.app",
    messagingSenderId: "738861467160",
    appId: "1:738861467160:web:f6ae62a3ace8743505656d"
  },

  // 2) Cloudinary (envoi des photos depuis l'admin et le formulaire sur-mesure)
  //    cloudinary.com > Settings > Upload > Add upload preset (mode "Unsigned")
  cloudinary: {
    cloudName: "",
    uploadPreset: ""
  },

  // 3) Fonctions Netlify (paiement FedaPay, commandes). Ne pas modifier sur Netlify.
  functionsBase: "/.netlify/functions",

  // 4) Paiement en ligne FedaPay : passer à true une fois les clés FedaPay
  //    enregistrées dans Netlify. En attendant, les commandes se confirment sur WhatsApp.
  payments: { online: false },

  // Version du SDK Firebase chargé depuis le CDN officiel
  firebaseSdk: "10.12.2"
};

/* Valeurs par défaut du site. Elles sont remplacées par celles enregistrées
   dans l'admin (Paramètres) dès que Firebase est configuré. */
window.AB_DEFAULT_SETTINGS = {
  brand: "Admirelle B",
  tagline: "L'élégance se porte sur mesure.",
  heroKicker: "Maison de mode féminine · Sur mesure",
  heroText: "Pantalons, chemises et ensembles pensés pour la femme qui s'affirme. Chaque pièce est coupée avec précision, finie à la main, et peut être ajustée à vos mesures.",
  heroImage: "images/tailleur-cacao-1.jpg",
  aboutImage: "images/portrait-styliste.jpg",
  atelierImage: "images/atelier-selfie.jpg",
  designerName: "Admirelle Babadjide",
  designerTitle: "Fondatrice et styliste",
  aboutStory: "Admirelle B est née d'une conviction : une femme qui se sent bien dans ses vêtements avance avec assurance. Depuis son atelier, Admirelle Babadjide imagine des pièces qui allient la rigueur de la coupe et la douceur des matières, pour accompagner les femmes dans tous les moments où elles ont besoin d'être pleinement elles-mêmes.\n\nChaque création commence par un dessin, se poursuit par le choix du tissu et se termine par des heures de finitions à la main. Rien n'est laissé au hasard : ni la tombée d'un pantalon, ni la place d'un bouton.",
  whatsapp: "2290191999905",
  phoneDisplay: "+229 01 91 99 99 05",
  email: "badmirelle@gmail.com",
  address: "",
  hours: "Du lundi au samedi, sur rendez-vous",
  socials: { instagram: "", facebook: "", tiktok: "" },
  currency: "FCFA",
  shipping: [
    { id: "atelier", label: "Retrait à l'atelier (sur rendez-vous)", fee: 0, delay: "Dès que la pièce est prête" },
    { id: "cotonou", label: "Livraison à Cotonou", fee: 2000, delay: "24 à 48 h" },
    { id: "nokoue", label: "Abomey-Calavi, Porto-Novo, Sèmè-Podji", fee: 3000, delay: "24 à 72 h" },
    { id: "benin", label: "Autres villes du Bénin", fee: 5000, delay: "2 à 5 jours" },
    { id: "international", label: "International (tarif communiqué après la commande)", fee: 0, delay: "Sur devis", quote: true }
  ],
  announcement: "Créations sur mesure · Paiement Mobile Money et carte bancaire · Commande sur WhatsApp"
};
