// middleware/logger.middleware.js
// Table : journal_audit — log TOUTES les actions y compris les refus
const { pool } = require("../config/db");

const logActivite = async (type_acteur, acteur_id, action, details = {}, ip = null) => {
  try {
    const acteur = `${type_acteur}:${acteur_id || "inconnu"}`;
    await pool.execute(
      "INSERT INTO journal_audit (action, acteur, type_acteur, acteur_id, details, adresse_ip) VALUES (?, ?, ?, ?, ?, ?)",
      [action, acteur, type_acteur, acteur_id || null, JSON.stringify(details), ip]
    );
  } catch (error) {
    console.error("Erreur log activite:", error.message);
  }
};

module.exports = { logActivite };
