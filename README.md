# Admirelle B — site e-commerce

Site de la maison de mode Admirelle B (Cotonou) : boutique, sur-mesure, espace cliente, espace administrateur et paiement FedaPay.

- `public/` : le site (accueil 3D, boutique, admin sur `/admin.html`).
- `public/config.js` : les réglages publics (Firebase, Cloudinary, paiement en ligne).
- `netlify/functions/` : l'enregistrement des commandes et le paiement FedaPay (côté serveur).
- `firestore.rules` : les règles de sécurité de la base, à coller dans la console Firebase.
- `GUIDE-INSTALLATION.md` : toutes les étapes, pas à pas.

Les clés secrètes (Firebase Admin, FedaPay, EmailJS) se mettent uniquement dans Netlify, dans les variables d'environnement (voir `.env.example`). Elles ne doivent jamais être ajoutées à ce dépôt.

**Le jour du lancement :** supprimez le fichier `public/_headers`. Il empêche Google d'indexer le site tant que les prix et les textes ne sont pas validés.
