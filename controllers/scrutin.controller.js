// controllers/scrutin.controller.js
// Table : elections (renommée d'après l'UML de Quadri)
// Statuts : EN_PREPARATION | OUVERTE | SUSPENDUE | CLOTUREE | RESULTATS_PUBLIES
const { pool } = require("../config/db");
const { logActivite } = require("../middleware/logger.middleware");

// GET /api/elections
const listerElections = async (req, res) => {
  try {
    const { statut } = req.query;
    let query = `
      SELECT e.*, a.nom AS admin_nom,
             COUNT(DISTINCT c.id) AS nombre_candidats,
             COUNT(DISTINCT v.id) AS nombre_votes
      FROM elections e
      LEFT JOIN admins_supremes a ON e.admin_id = a.id
      LEFT JOIN candidats c ON c.election_id = e.id AND c.statut = 'ACTIF'
      LEFT JOIN votes v ON v.election_id = e.id
    `;
    const params = [];
    if (statut) { query += " WHERE e.statut = ?"; params.push(statut); }
    query += " GROUP BY e.id ORDER BY e.date_creation DESC";

    const [rows] = await pool.execute(query, params);
    res.json({ succes: true, data: rows, total: rows.length });
  } catch (error) {
    console.error("Erreur listerElections:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// GET /api/elections/:id
const getElection = async (req, res) => {
  try {
    const { id } = req.params;
    const [elections] = await pool.execute(
      "SELECT e.*, a.nom AS admin_nom FROM elections e LEFT JOIN admins_supremes a ON e.admin_id = a.id WHERE e.id = ?",
      [id]
    );
    if (elections.length === 0) return res.status(404).json({ succes: false, message: "Élection introuvable" });

    const [candidats] = await pool.execute(
      "SELECT * FROM candidats WHERE election_id = ? AND statut = 'ACTIF' ORDER BY numero_ordre ASC",
      [id]
    );
    res.json({ succes: true, data: { ...elections[0], candidats } });
  } catch (error) {
    console.error("Erreur getElection:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// POST /api/elections
const creerElection = async (req, res) => {
  try {
    const { titre, description, date_debut, date_fin } = req.body;
    if (!titre || !date_debut || !date_fin) {
      return res.status(400).json({ succes: false, message: "Champs requis: titre, date_debut, date_fin" });
    }
    if (new Date(date_debut) >= new Date(date_fin)) {
      return res.status(400).json({ succes: false, message: "date_debut doit être avant date_fin" });
    }

    const [result] = await pool.execute(
      "INSERT INTO elections (titre, description, date_debut, date_fin, statut, admin_id) VALUES (?, ?, ?, ?, 'EN_PREPARATION', ?)",
      [titre, description || null, date_debut, date_fin, req.admin.id]
    );

    await logActivite("admin", req.admin.id, "ELECTION_CREEE", { election_id: result.insertId, titre }, req.ip);
    res.status(201).json({ succes: true, message: "Élection créée", data: { id: result.insertId, titre, statut: "EN_PREPARATION" } });
  } catch (error) {
    console.error("Erreur creerElection:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// PUT /api/elections/:id
const modifierElection = async (req, res) => {
  try {
    const { id } = req.params;
    const { titre, description, date_debut, date_fin } = req.body;

    const [elections] = await pool.execute("SELECT * FROM elections WHERE id = ?", [id]);
    if (elections.length === 0) return res.status(404).json({ succes: false, message: "Élection introuvable" });
    if (elections[0].statut === "OUVERTE") {
      return res.status(400).json({ succes: false, message: "Impossible de modifier une élection ouverte" });
    }

    const e = elections[0];
    await pool.execute(
      "UPDATE elections SET titre=?, description=?, date_debut=?, date_fin=? WHERE id=?",
      [titre || e.titre, description !== undefined ? description : e.description,
       date_debut || e.date_debut, date_fin || e.date_fin, id]
    );

    await logActivite("admin", req.admin.id, "ELECTION_MODIFIEE", { election_id: id }, req.ip);
    res.json({ succes: true, message: "Élection modifiée" });
  } catch (error) {
    console.error("Erreur modifierElection:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// PATCH /api/elections/:id/statut → Ouvrir / Clôturer / Publier résultats
const changerStatutElection = async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;
    const statutsValides = ["EN_PREPARATION", "OUVERTE", "SUSPENDUE", "CLOTUREE", "RESULTATS_PUBLIES"];

    if (!statutsValides.includes(statut)) {
      return res.status(400).json({ succes: false, message: `Statut invalide. Valeurs: ${statutsValides.join(", ")}` });
    }

    const [elections] = await pool.execute("SELECT * FROM elections WHERE id = ?", [id]);
    if (elections.length === 0) return res.status(404).json({ succes: false, message: "Élection introuvable" });

    // Vérifier au moins 2 candidats avant d'ouvrir
    if (statut === "OUVERTE") {
      const [candidats] = await pool.execute(
        "SELECT COUNT(*) AS total FROM candidats WHERE election_id = ? AND statut = 'ACTIF'", [id]
      );
      if (candidats[0].total < 2) {
        return res.status(400).json({ succes: false, message: "Au moins 2 candidats actifs sont requis pour ouvrir l'élection" });
      }
    }

    await pool.execute("UPDATE elections SET statut = ? WHERE id = ?", [statut, id]);
    await logActivite("admin", req.admin.id, "ELECTION_STATUT_CHANGE", {
      election_id: id, ancien: elections[0].statut, nouveau: statut
    }, req.ip);

    res.json({ succes: true, message: `Élection : statut mis à jour → ${statut}` });
  } catch (error) {
    console.error("Erreur changerStatutElection:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

module.exports = { listerElections, getElection, creerElection, modifierElection, changerStatutElection };
