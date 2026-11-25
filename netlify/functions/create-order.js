/* Crée une commande. Les prix sont TOUJOURS recalculés ici à partir de la base,
   jamais repris du navigateur. Pour le paiement en ligne, crée la transaction FedaPay
   et renvoie le lien de paiement sécurisé. */
const { admin, db, fedapay, json, fail, httpError, siteSettings, phoneIntl, notify, orderText, money, uidFromRequest, env } = require("../lib/shared");

const clean = (v, max = 200) => String(v == null ? "" : v).trim().slice(0, max);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Méthode non autorisée." });
  try {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch (e) { throw httpError(400, "Requête invalide."); }
    const store = db();

    // --- validation ---
    const c = body.customer || {};
    const customer = { nom: clean(c.nom, 120), tel: clean(c.tel, 40), email: clean(c.email, 160).toLowerCase(), adresse: clean(c.adresse, 240), ville: clean(c.ville, 80), notes: clean(c.notes, 400) };
    if (customer.nom.length < 2) throw httpError(400, "Indiquez votre nom.");
    if (customer.tel.replace(/\D/g, "").length < 8) throw httpError(400, "Numéro de téléphone invalide.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customer.email)) throw httpError(400, "Adresse e-mail invalide.");
    const method = body.payment === "fedapay" ? "fedapay" : "whatsapp";
    const rawItems = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
    if (!rawItems.length) throw httpError(400, "Votre panier est vide.");

    // --- produits et prix depuis la base ---
    const refs = [...new Set(rawItems.map((i) => clean(i.id, 120)))].map((id) => store.collection("products").doc(id));
    const docs = await store.getAll(...refs);
    const byId = Object.fromEntries(docs.filter((d) => d.exists).map((d) => [d.id, d.data()]));
    const items = rawItems.map((i) => {
      const p = byId[clean(i.id, 120)];
      if (!p || p.published === false) throw httpError(400, "Une création de votre panier n'est plus disponible.");
      if (p.availability === "epuise") throw httpError(409, `${p.name} est épuisé.`);
      const qty = Math.max(1, Math.min(20, parseInt(i.qty, 10) || 1));
      const size = clean(i.size, 30), color = clean(i.color, 40);
      if (Array.isArray(p.sizes) && p.sizes.length && !p.sizes.includes(size)) throw httpError(400, `Taille indisponible pour ${p.name}.`);
      if (Array.isArray(p.colors) && p.colors.length && !p.colors.some((x) => x.name === color)) throw httpError(400, `Couleur indisponible pour ${p.name}.`);
      if (typeof p.stock === "number" && p.availability === "en_stock" && p.stock < qty) throw httpError(409, `Stock insuffisant pour ${p.name} (${p.stock} disponible${p.stock > 1 ? "s" : ""}).`);
      const price = Math.round(Number(p.price) || 0);
      if (price <= 0) throw httpError(400, `Prix manquant pour ${p.name}.`);
      return { id: i.id, slug: p.slug || i.id, name: p.name, price, priceFrom: !!p.priceFrom, size, color, qty, image: (p.images || [])[0] || "" };
    });

    const settings = await siteSettings(store);
    const zone = settings.shipping.find((z) => z.id === body.zone) || settings.shipping[0];
    if (zone.quote && method === "fedapay") throw httpError(400, "Pour l'international, la commande se confirme sur WhatsApp.");
    if (zone.id !== "atelier" && (customer.adresse.length < 3 || customer.ville.length < 2)) throw httpError(400, "Indiquez votre adresse de livraison.");
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const shippingFee = zone.quote ? 0 : Math.round(Number(zone.fee) || 0);
    const total = subtotal + shippingFee;
    if (method === "fedapay" && total < 100) throw httpError(400, "Montant trop faible pour un paiement en ligne.");

    // --- enregistrement ---
    const uid = await uidFromRequest(event);
    const d = new Date();
    const number = `AB-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const status = method === "fedapay" ? "en_attente_paiement" : "nouvelle";
    const order = {
      number, uid: uid || null, customer, items, subtotal, shippingFee, total,
      zone: zone.id, zoneLabel: zone.label, quote: !!zone.quote,
      payment: { method, status: method === "fedapay" ? "en_attente" : "a_confirmer", provider: method === "fedapay" ? "FedaPay" : "WhatsApp", env: env.FEDAPAY_ENV === "live" ? "live" : "sandbox" },
      status, history: [{ status, at: d.toISOString(), by: "site" }],
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const ref = await store.collection("orders").add(order);

    if (method === "whatsapp") {
      await notify(settings.email, `Nouvelle commande WhatsApp ${number} · ${money(total)}`, `À confirmer avec la cliente sur WhatsApp.\n\n${orderText(order)}`);
      return json(200, { orderId: ref.id, number });
    }

    // --- transaction FedaPay ---
    const Tx = fedapay();
    const site = (env.SITE_URL || env.URL || `https://${event.headers.host}`).replace(/\/$/, "");
    const [firstname, ...rest] = customer.nom.split(/\s+/);
    const base = {
      description: `Commande ${number} - Admirelle B`,
      amount: total,
      currency: { iso: "XOF" },
      callback_url: `${site}/?confirmation=${ref.id}`,
      custom_metadata: { order_id: ref.id, order_number: number }
    };
    const cust = { firstname: firstname || customer.nom, lastname: rest.join(" ") || firstname || "-", email: customer.email };
    const phone = phoneIntl(customer.tel);
    let tx;
    try {
      tx = await Tx.create({ ...base, customer: phone ? { ...cust, phone_number: { number: phone, country: "BJ" } } : cust });
    } catch (e) {
      console.warn("FedaPay, nouvel essai sans téléphone :", e.message);
      tx = await Tx.create({ ...base, customer: cust });
    }
    const token = await tx.generateToken();
    await ref.update({ "payment.transactionId": tx.id, "payment.reference": tx.reference || null });
    return json(200, { orderId: ref.id, number, paymentUrl: token.url });
  } catch (e) {
    return fail(e);
  }
};
