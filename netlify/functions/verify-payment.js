/* Vérifie le paiement d'une commande auprès de FedaPay (appelé au retour sur le site). */
const { db, json, fail, httpError, syncPayment } = require("../lib/shared");

exports.handler = async (event) => {
  try {
    const id = String((event.queryStringParameters || {}).order || "").replace(/[^A-Za-z0-9_-]/g, "");
    if (!id) throw httpError(400, "Commande manquante.");
    const store = db();
    const { order } = await syncPayment(store, id);
    // seules des informations non sensibles sont renvoyées
    return json(200, {
      number: order.number,
      status: order.status,
      paymentStatus: (order.payment || {}).status,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      total: order.total,
      items: (order.items || []).map((i) => ({ name: i.name, size: i.size, color: i.color, qty: i.qty, price: i.price }))
    });
  } catch (e) {
    return fail(e);
  }
};
