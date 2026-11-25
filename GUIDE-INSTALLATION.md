# Admirelle B : guide d'installation du site

Ce dossier contient le site e-commerce complet d'Admirelle B : la boutique, l'espace cliente, le tableau de bord de la styliste et le paiement en ligne.

Tant que les services ci-dessous ne sont pas branchés, le site tourne en **mode démo**. Le catalogue est un exemple, les données restent dans le navigateur et seule la commande par WhatsApp fonctionne. Chaque étape de ce guide active une partie du site réel.

---

## 1. Contenu du dossier

| Élément | Rôle |
|---|---|
| `public/index.html` | Le site : accueil, collections, fiches produit, sur-mesure, à propos, contact, panier, commande, espace cliente, pages légales |
| `public/admin.html` | Le tableau de bord privé de la styliste |
| `public/config.js` | **Le seul fichier à modifier** : il contient les clés publiques Firebase et Cloudinary |
| `netlify/functions/` | Le serveur. Il crée les commandes, gère le paiement FedaPay, reçoit les confirmations de paiement et envoie les notifications |
| `firestore.rules` | Les règles de sécurité de la base de données |
| `.env.example` | La liste des clés secrètes à déclarer dans Netlify |

**Services utilisés** (tous ont une offre gratuite pour démarrer) :

- **Netlify** : hébergement et serveur.
- **Firebase** : base de données et comptes clientes.
- **Cloudinary** : stockage des photos.
- **FedaPay** : paiements MTN MoMo, Moov Money, Visa et Mastercard.
- **EmailJS** : notifications par e-mail. Ce service est facultatif.

---

## 2. Mettre le site en ligne sur Netlify

Le serveur a besoin de modules (`fedapay`, `firebase-admin`). Pour que Netlify les installe, le déploiement doit passer par **GitHub**. Le glisser-déposer simple n'installe pas ces modules.

1. Créez un dépôt GitHub, par exemple `admirelle-b-site`, et envoyez-y tout le contenu de ce dossier.
2. Sur Netlify, cliquez sur **Add new site**, puis **Import an existing project**, et choisissez le dépôt.
3. Netlify lit `netlify.toml` tout seul : il n'y a rien à régler. Cliquez sur **Deploy**.
4. Le site est en ligne, en mode démo. Vous pourrez brancher le nom de domaine plus tard dans **Domain management**.

---

## 3. Firebase : base de données et comptes

1. Sur [console.firebase.google.com](https://console.firebase.google.com), créez un projet `admirelle-b`.
2. Activez la connexion par e-mail : **Authentication** > **Sign-in method** > **E-mail/Mot de passe**.
3. Autorisez votre domaine : **Authentication** > **Settings** > **Authorized domains**. Ajoutez l'adresse Netlify, par exemple `admirelle-b.netlify.app`, et le nom de domaine définitif.
4. Créez la base : **Firestore Database** > **Créer une base de données**, en mode production. Choisissez une région en Europe, par exemple `europe-west1`.
5. Protégez la base : **Firestore** > **Règles**. Collez tout le contenu de `firestore.rules`, puis cliquez sur **Publier**.
6. Récupérez les clés publiques : **Paramètres du projet** > **Vos applications** > icône Web `</>`. Créez l'application, puis copiez les valeurs de `firebaseConfig` dans `public/config.js`, partie `firebase`.
7. Créez la clé du serveur : **Paramètres du projet** > **Comptes de service** > **Générer une nouvelle clé privée**. Un fichier JSON se télécharge. Dans Netlify, ouvrez **Site configuration** > **Environment variables** et créez trois variables à partir de ce fichier :
   - `FIREBASE_PROJECT_ID` reçoit la valeur `project_id`.
   - `FIREBASE_CLIENT_EMAIL` reçoit la valeur `client_email`.
   - `FIREBASE_PRIVATE_KEY` reçoit la valeur `private_key`, en entier avec les `\n`.

   Ne mettez jamais ce fichier JSON dans le site ni sur GitHub.

### Créer le compte administrateur de la styliste

1. Dans **Authentication** > **Users** > **Ajouter un utilisateur**, saisissez l'e-mail et le mot de passe de la styliste.
2. Copiez l'**UID** affiché pour ce compte.
3. Dans **Firestore**, créez la collection `admins` et un document dont l'**identifiant est cet UID**. Le document contient un champ `role` de valeur `admin`.
4. La styliste se connecte ensuite sur `votre-site/admin.html`.

---

## 4. Cloudinary : les photos

Ce service sert à envoyer les photos depuis l'admin, et les images d'inspiration du formulaire sur-mesure. Firebase Storage n'est plus gratuit, d'où ce choix.

1. Créez un compte sur [cloudinary.com](https://cloudinary.com).
2. Allez dans **Settings** > **Upload** > **Add upload preset**. Choisissez le mode **Unsigned** et le dossier `admirelle-b`. Limitez les formats à jpg, png et webp.
3. Dans `public/config.js`, remplissez `cloudinary.cloudName` (affiché sur le tableau de bord) et `cloudinary.uploadPreset` (le nom du preset).

---

## 5. FedaPay : le paiement en ligne

1. Créez le compte marchand de la cliente sur [fedapay.com](https://fedapay.com). Pour encaisser de vrais paiements, FedaPay demande la validation du compte, avec les documents de l'entreprise.
2. **Commencez en test (sandbox).** Dans le tableau de bord FedaPay, en mode test, copiez la **clé secrète** `sk_sandbox_…`. Dans Netlify, créez :
   - `FEDAPAY_SECRET_KEY` avec la clé `sk_sandbox_…` ;
   - `FEDAPAY_ENV` avec la valeur `sandbox`.
3. **Webhook.** Dans FedaPay, ouvrez la rubrique Webhooks et créez un webhook avec l'adresse `https://VOTRE-SITE/.netlify/functions/fedapay-webhook`. Copiez sa clé secrète `wh_sandbox_…` dans la variable Netlify `FEDAPAY_WEBHOOK_SECRET`.
4. Dans `public/config.js`, passez `payments: { online: false }` à `payments: { online: true }`. Tant que cette valeur reste à `false`, le paiement en ligne est masqué et les commandes se confirment sur WhatsApp.
5. Redéployez le site : **Deploys** > **Trigger deploy**.
6. Faites une commande de test avec les numéros et cartes de test indiqués dans la documentation FedaPay. Vérifiez que la commande passe à « Payée » dans l'admin.
7. **Passage en réel.** Remplacez la clé par la clé `sk_live_…` et passez `FEDAPAY_ENV` à `live`. Créez le webhook en mode live et mettez sa clé `wh_live_…`. Redéployez.

**Sécurité :**

- Les prix et le total sont **recalculés par le serveur** à partir de la base. Une cliente ne peut donc pas modifier un prix depuis son navigateur.
- Le statut « payé » vient **uniquement de FedaPay**, vérifié avec la clé secrète.
- La clé secrète ne doit jamais apparaître dans `config.js`.

---

## 6. Notifications par e-mail (facultatif)

À chaque commande, la styliste reçoit un e-mail. La cliente reçoit une confirmation après son paiement.

1. Créez un compte sur [emailjs.com](https://www.emailjs.com) et connectez la boîte e-mail d'envoi (**Email Services**).
2. Créez un modèle (**Email Templates**) :
   - **To email** : `{{to_email}}`
   - **Subject** : `{{subject}}`
   - **Content** : `{{message}}`
3. Dans **Account** > **Security**, autorisez les appels API hors navigateur (*API requests from non-browser applications*).
4. Dans Netlify, créez les variables suivantes, puis redéployez :
   - `EMAILJS_SERVICE_ID`
   - `EMAILJS_TEMPLATE_ID`
   - `EMAILJS_PUBLIC_KEY`
   - `EMAILJS_PRIVATE_KEY`
   - `NOTIFY_EMAIL` (l'adresse qui reçoit les commandes)

Dans l'admin, le bouton « Activer les notifications » prévient aussi la styliste directement sur son ordinateur, tant que l'admin est ouvert.

---

## 7. Premiers pas dans l'admin

1. Connectez-vous sur `/admin.html`.
2. Ouvrez **Produits** et cliquez sur **Importer le catalogue de départ** pour mettre en ligne les 11 créations déjà photographiées. Vous pouvez aussi créer vos produits un par un.
3. Vérifiez les prix, compositions et tailles de chaque création, et ajoutez des photos si besoin. Format portrait 3:4. Glissez-les dans la fiche, puis réordonnez-les avec les flèches.
4. Ouvrez **Paramètres du site** :
   - les réseaux sociaux (Instagram, Facebook, TikTok) ;
   - l'adresse de l'atelier ;
   - les tarifs de livraison ;
   - les textes et images de l'accueil et de la page À propos.

**Ce que gère l'admin :**

- **Commandes** : changer le statut, prévenir la cliente sur WhatsApp, enregistrer un paiement reçu hors site.
- **Paiements** : sommes encaissées, en attente et échouées.
- **Produits** : prix, tailles, couleurs, stock, photos, mise en ligne.
- **Collections**.
- **Demandes sur mesure** : mensurations, tissu, image d'inspiration.
- **Messages**.
- **Clientes** : historique et total dépensé.
- **Paramètres du site**.

---

## 8. Ce qu'il reste à fournir par la cliente

- **Photos.** Le site utilise déjà les photos de la styliste portant ses créations (dossier `public/images`). Pour chaque nouveau produit, prévoir 2 à 3 photos au format portrait. Trois photos de studio portent la signature du photographe « Mr.shaky » : vérifier avec lui l'accord pour les utiliser sur le site.
- **Coordonnées manquantes.** Il faut l'adresse de l'atelier et les liens Instagram, Facebook et TikTok. Le téléphone et l'e-mail viennent du formulaire et sont déjà en place.
- **Textes de la page À propos.** Ils ont été rédigés à partir de ses valeurs (émancipation féminine, élégance, intemporalité, affirmation de soi). Ils sont à relire et à ajuster depuis l'admin.
- **Prix, tailles et compositions.** Ils ont été estimés à partir des photos : à confirmer avec la styliste.
- **Conditions légales.** Les CGV, la confidentialité et la page livraison et retours sont des modèles à faire valider. Il faut ajouter les mentions légales de l'entreprise (RCCM, IFU) si elle en a.

---

## 9. Dépannage

| Problème | Solution |
|---|---|
| Le bandeau « Mode démo » reste affiché | Vérifiez `public/config.js` : `apiKey` et `projectId` doivent être remplis. Videz le cache du navigateur. |
| « Accès refusé » dans l'admin | Le document `admins/{UID}` n'existe pas, ou l'UID copié n'est pas le bon. |
| « Configuration Firebase manquante sur le serveur » | Les trois variables `FIREBASE_…` manquent dans Netlify, ou le site n'a pas été redéployé après leur ajout. |
| La clé privée est refusée | Collez `private_key` en entier, sur une seule ligne, avec les `\n`. |
| Le paiement reste « en attente » | Vérifiez le webhook FedaPay (adresse et clé secrète). La page de confirmation revérifie aussi le paiement automatiquement. |
| L'envoi de photos échoue | Le preset Cloudinary doit être en mode **Unsigned**, et son nom doit correspondre exactement à celui de `config.js`. |
| Erreur d'autorisation à la connexion d'une cliente | Ajoutez le domaine du site dans **Firebase** > **Authentication** > **Authorized domains**. |
