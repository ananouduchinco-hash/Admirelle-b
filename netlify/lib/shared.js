/* =====================================================================
   ADMIRELLE B — code partagé des fonctions Netlify
   Variables d'environnement (Netlify > Site configuration > Environment variables) :
     FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY   (compte de service Firebase)
     FEDAPAY_SECRET_KEY        (sk_sandbox_... ou sk_live_...)
     FEDAPAY_ENV               (sandbox | live)
     FEDAPAY_WEBHOOK_SECRET    (wh_sandbox_... ou wh_live_..., facultatif mais recommandé)
     SITE_URL                  (facultatif : https://votre-domaine.com, sinon l'URL Netlify)
     EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY, NOTIFY_EMAIL  (facultatif)
   ===================================================================== */
const admin = require("firebase-admin");
const { FedaPay, Transaction } = require("fedapay");

const env = process.env;

function db() {
  if (!admin.apps.length) {
    if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
      throw httpError(500, "Configuration Firebase manquante sur le serveur.");
    }
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
      })
    });
  }
  return admin.firestore();
}

function fedapay() {
  if (!env.FEDAPAY_SECRET_KEY) throw httpError(500, "Clé FedaPay manquante sur le serveur.");
  FedaPay.setApiKey(env.FEDAPAY_SECRET_KEY);
  FedaPay.setEnvironment(env.FEDAPAY_ENV === "live" ? "live" : "sandbox");
  return Transaction;
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const json = (statusCode, body) => ({ statusCode, headers: HEADERS, body: JSON.stringify(body) });
const fail = (e) => {
  if (!e.status || e.status >= 500) console.error(e);
  return json(e.status || 500, { error: e.status ? e.message : "Une erreur est survenue. Réessayez ou contactez-nous sur WhatsApp." });
};

const DEFAULT_SHIPPING = [
  { id: "atelier", label: "Retrait à l'atelier (sur rendez-vous)", fee: 0 },
  { id: "cotonou", label: "Livraison à Cotonou", fee: 2000 },
  { id: "nokoue", label: "Abomey-Calavi, Porto-Novo, Sèmè-Podji", fee: 3000 },
  { id: "benin", label: "Autres villes du Bénin", fee: 5000 },
  { id: "international", label: "International (tarif communiqué après la commande)", fee: 0, quote: true }
];

async function siteSettings(store) {
  const s = await store.doc("settings/site").get();
  const data = s.exists ? s.data() : {};
  return {
    shipping: Array.isArray(data.shipping) && data.shipping.length ? data.shipping : DEFAULT_SHIPPING,
    email: data.email || env.NOTIFY_EMAIL || "",
    whatsapp: data.whatsapp || ""
  };
}

/* Numéro béninois au format international (+229 01 XX XX XX XX depuis 2024) */
function phoneIntl(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 8) d = "22901" + d;
  else if (d.length === 10 && d.startsWith("01")) d = "229" + d;
  return d.length >= 11 ? "+" + d : "";
}

const money = (n) => new Intl.NumberFormat("fr-FR").format(n).replace(/ /g, " ") + " FCFA";

/* Notification e-mail via EmailJS (facultatif) */
async function notify(to, subject, message) {
  if (!to || !env.EMAILJS_SERVICE_ID || !env.EMAILJS_TEMPLATE_ID || !env.EMAILJS_PUBLIC_KEY) return false;
  try {
    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: env.EMAILJS_SERVICE_ID,
        template_id: env.EMAILJS_TEMPLATE_ID,
        user_id: env.EMAILJS_PUBLIC_KEY,
        accessToken: env.EMAILJS_PRIVATE_KEY || undefined,
        template_params: { to_email: to, subject, message, reply_to: env.NOTIFY_EMAIL || "" }
      })
    });
    if (!r.ok) console.warn("EmailJS", r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.warn("EmailJS", e.message);
    return false;
  }
}

function orderText(o) {
  const lines = (o.items || []).map((i) => `• ${i.name} · ${i.color} · ${i.size} · x${i.qty} · ${money(i.price * i.qty)}`);
  return [
    `Commande ${o.number}`, "", ...lines, "",
    `Livraison : ${o.zoneLabel} (${money(o.shippingFee || 0)})`,
    `Total : ${money(o.total)}`, "",
    `Cliente : ${o.customer.nom} · ${o.customer.tel} · ${o.customer.email}`,
    o.customer.adresse ? `Adresse : ${o.customer.adresse}, ${o.customer.ville}` : "Retrait à l'atelier",
    o.customer.notes ? `Instructions : ${o.customer.notes}` : ""
  ].join("\n");
}

/* Interroge FedaPay et met la commande à jour. On ne fait jamais confiance au navigateur :
   le statut vient toujours de l'API FedaPay, avec la clé secrète. */
async function syncPayment(store, orderId) {
  const ref = store.collection("orders").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw httpError(404, "Commande introuvable.");
  const order = snap.data();
  const pay = order.payment || {};
  if (pay.method !== "fedapay" || !pay.transactionId) return { order, changed: false };
  if (pay.status === "payee" || pay.status === "remboursee") return { order, changed: false };

  const Tx = fedapay();
  const tx = await Tx.retrieve(pay.transactionId);
  const st = String(tx.status || "");
  let paymentStatus = "en_attente";
  if (st.includes("refunded")) paymentStatus = "remboursee";
  else if (Tx.PAID_STATUS.includes(st)) paymentStatus = "payee";
  else if (["declined", "canceled", "cancelled", "expired"].includes(st)) paymentStatus = "echouee";

  let anomaly = null;
  if (paymentStatus === "payee" && Number(tx.amount) !== Number(order.total)) {
    anomaly = `Montant payé (${tx.amount}) différent du total (${order.total})`;
    paymentStatus = "en_attente";
  }
  if (paymentStatus === pay.status && !anomaly) return { order, changed: false };

  const now = new Date().toISOString();
  let becamePaid = false;
  await store.runTransaction(async (t) => {
    const fresh = (await t.get(ref)).data();
    if ((fresh.payment || {}).status === "payee") return;
    // Firestore : toutes les lectures avant les écritures
    const pRefs = paymentStatus === "payee" ? (fresh.items || []).map((it) => store.collection("products").doc(it.id)) : [];
    const pSnaps = pRefs.length ? await t.getAll(...pRefs) : [];
    const upd = {
      "payment.status": paymentStatus,
      "payment.fedapayStatus": st,
      "payment.mode": tx.mode || null,
      "payment.updatedAt": now,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (anomaly) upd["payment.anomaly"] = anomaly;
    if (paymentStatus === "payee") {
      becamePaid = true;
      upd["payment.paidAt"] = now;
      upd.status = "confirmee";
      upd.history = admin.firestore.FieldValue.arrayUnion({ status: "confirmee", at: now, by: "FedaPay" });
      // décrémente le stock des pièces suivies
      const stock = {};
      pSnaps.forEach((p) => { if (p.exists && typeof p.data().stock === "number") stock[p.id] = { left: p.data().stock, availability: p.data().availability }; });
      (fresh.items || []).forEach((it) => { if (stock[it.id]) stock[it.id].left = Math.max(0, stock[it.id].left - it.qty); });
      Object.entries(stock).forEach(([id, s]) => {
        t.update(store.collection("products").doc(id), { stock: s.left, ...(s.left === 0 && s.availability === "en_stock" ? { availability: "epuise" } : {}) });
      });
    }
    t.update(ref, upd);
  });

  const updated = (await ref.get()).data();
  if (becamePaid) {
    const s = await siteSettings(store);
    const txt = orderText(updated);
    await notify(s.email, `Nouvelle commande payée ${updated.number} · ${money(updated.total)}`, `Paiement confirmé par FedaPay (${tx.mode || "paiement en ligne"}).\n\n${txt}`);
    await notify(updated.customer.email, `Admirelle B · confirmation de votre commande ${updated.number}`,
      `Bonjour ${updated.customer.nom},\n\nMerci pour votre commande ! Votre paiement de ${money(updated.total)} a bien été reçu.\n\n${txt}\n\nLa styliste vous contacte très vite pour la livraison.\n\nAdmirelle B`);
  }
  return { order: updated, changed: true };
}

async function uidFromRequest(event) {
  const h = event.headers.authorization || event.headers.Authorization || "";
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return null;
  try {
    db();
    const t = await admin.auth().verifyIdToken(m[1]);
    return t.uid;
  } catch (e) {
    return null;
  }
}

module.exports = { admin, db, fedapay, json, fail, httpError, siteSettings, phoneIntl, money, notify, orderText, syncPayment, uidFromRequest, env };
