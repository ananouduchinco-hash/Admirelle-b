/* Webhook FedaPay : FedaPay prévient le site à chaque changement de statut d'une transaction.
   URL à déclarer dans FedaPay > Paramètres > Webhooks : https://VOTRE-SITE/.netlify/functions/fedapay-webhook */
const { Webhook } = require("fedapay");
const { db, json, env, syncPayment } = require("../lib/shared");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Méthode non autorisée." });
  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
  let evt;
  try {
    if (env.FEDAPAY_WEBHOOK_SECRET) {
      const sig = event.headers["x-fedapay-signature"] || event.headers["X-FEDAPAY-SIGNATURE"];
      evt = Webhook.constructEvent(raw, sig, env.FEDAPAY_WEBHOOK_SECRET);
    } else {
      // sans secret, le contenu n'est pas cru : seul l'identifiant sert, et le statut est relu chez FedaPay
      evt = JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Webhook refusé :", e.message);
    return json(400, { error: "Signature invalide." });
  }

  try {
    const entity = evt.entity || evt.object || (evt.data && evt.data.object) || {};
    const txId = entity.id;
    if (!txId || !String(evt.name || "").startsWith("transaction.")) return json(200, { ignored: true });
    const store = db();
    let orderId = entity.custom_metadata && entity.custom_metadata.order_id;
    if (!orderId) {
      const q = await store.collection("orders").where("payment.transactionId", "==", txId).limit(1).get();
      if (q.empty) return json(200, { ignored: true });
      orderId = q.docs[0].id;
    }
    const { order } = await syncPayment(store, orderId);
    return json(200, { ok: true, payment: (order.payment || {}).status });
  } catch (e) {
    console.error(e);
    // 500 : FedaPay réessaiera plus tard
    return json(500, { error: "Traitement impossible." });
  }
};
