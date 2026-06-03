// utils/sms.js
// Service d'envoi de SMS via API opérateur
// À connecter à l'API SMS réelle (Orange CI, MTN, Moov, ou passerelle comme Africa's Talking)
require("dotenv").config();

/**
 * Génère un code temporaire à 6 chiffres
 */
const genererCodeTemporaire = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // "847291"
};

/**
 * Génère un token de session USSD sécurisé
 */
const genererTokenSession = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "SES-";
  for (let i = 0; i < 12; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token; // ex: "SES-A7F29K3M1XQ2"
};

/**
 * Génère un ID de transaction pour un vote
 */
const genererIdTransaction = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "TXL-";
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  id += "-";
  for (let i = 0; i < 4; i++) id += Math.floor(Math.random() * 10);
  return id; // ex: "TXL-A7F2-9031"
};

/**
 * Envoie un SMS
 * En production : remplacer le console.log par l'appel API réel
 * Options : Africa's Talking, Orange CI API, Twilio, etc.
 */
const envoyerSMS = async (numeroTelephone, message) => {
  // ---- SIMULATION EN DÉVELOPPEMENT ----
  if (process.env.NODE_ENV !== "production") {
    console.log("\n📱 SMS SIMULÉ ────────────────────────");
    console.log(`   À      : ${numeroTelephone}`);
    console.log(`   Message: ${message}`);
    console.log("─────────────────────────────────────\n");
    return { succes: true, simule: true };
  }

  // ---- PRODUCTION : Africa's Talking (exemple) ----
  // Décommente et configure selon ton opérateur
  /*
  const AfricasTalking = require("africastalking");
  const at = AfricasTalking({
    apiKey: process.env.AT_API_KEY,
    username: process.env.AT_USERNAME,
  });
  const sms = at.SMS;
  const result = await sms.send({
    to: [numeroTelephone],
    message: message,
    from: "CEI-VOTE",
  });
  return { succes: true, data: result };
  */

  // ---- PRODUCTION : Orange CI API (exemple) ----
  /*
  const response = await fetch(process.env.ORANGE_SMS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.ORANGE_SMS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      outboundSMSMessageRequest: {
        address: `tel:${numeroTelephone}`,
        senderAddress: `tel:${process.env.ORANGE_SENDER}`,
        outboundSMSTextMessage: { message },
      },
    }),
  });
  return { succes: response.ok };
  */

  throw new Error("Aucun fournisseur SMS configuré en production");
};

module.exports = { genererCodeTemporaire, genererTokenSession, genererIdTransaction, envoyerSMS };
