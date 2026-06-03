// controllers/candidat.controller.js
// Table : candidats — lié à elections (pas scrutins)
// Champ : photo (pas photo_url), numero_ordre obligatoire
const { pool } = require("../config/db");
const { logActivite } = require("../middleware/logger.middleware");

// GET /api/candidats/:electionId
const listerCandidats = async (req, res) => {
  try {
    const { electionId } = req.params;
    const [rows] = await pool.execute(
      "SELECT * FROM candidats WHERE election_id = ? ORDER BY numero_ordre ASC",
      [electionId]
    );
    res.json({ succes: true, data: rows, total: rows.length });
  } catch (error) {
    console.error("Erreur listerCandidats:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// POST /api/candidats
const ajouterCandidat = async (req, res) => {
  try {
    const { election_id, nom, prenom, parti, description, photo, numero_ordre } = req.body;
    if (!election_id || !nom || !prenom || !numero_ordre) {
      return res.status(400).json({ succes: false, message: "Champs requis: election_id, nom, prenom, numero_ordre" });
    }

    const [elections] = await pool.execute("SELECT statut FROM elections WHERE id = ?", [election_id]);
    if (elections.length === 0) return res.status(404).json({ succes: false, message: "Élection introuvable" });
    if (["OUVERTE", "CLOTUREE"].includes(elections[0].statut)) {
      return res.status(400).json({ succes: false, message: "Impossible d'ajouter un candidat à une élection ouverte ou clôturée" });
    }

    // Vérifier unicité du numero_ordre dans cette élection
    const [existant] = await pool.execute(
      "SELECT id FROM candidats WHERE election_id = ? AND numero_ordre = ?", [election_id, numero_ordre]
    );
    if (existant.length > 0) {
      return res.status(409).json({ succes: false, message: `Le numéro d'ordre ${numero_ordre} est déjà utilisé` });
    }

    const [result] = await pool.execute(
      "INSERT INTO candidats (election_id, nom, prenom, parti, description, photo, numero_ordre) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [election_id, nom, prenom, parti || null, description || null, photo || null, numero_ordre]
    );

    await logActivite("admin", req.admin.id, "CANDIDAT_AJOUTE", { candidat_id: result.insertId, nom, election_id }, req.ip);
    res.status(201).json({ succes: true, message: "Candidat ajouté", data: { id: result.insertId, nom, prenom, numero_ordre } });
  } catch (error) {
    console.error("Erreur ajouterCandidat:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// PUT /api/candidats/:id
const modifierCandidat = async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, prenom, parti, description, photo, numero_ordre } = req.body;

    const [candidats] = await pool.execute(
      "SELECT c.*, e.statut FROM candidats c JOIN elections e ON c.election_id = e.id WHERE c.id = ?", [id]
    );
    if (candidats.length === 0) return res.status(404).json({ succes: false, message: "Candidat introuvable" });
    if (["OUVERTE", "CLOTUREE"].includes(candidats[0].statut)) {
      return res.status(400).json({ succes: false, message: "Impossible de modifier un candidat d'une élection ouverte ou clôturée" });
    }

    const c = candidats[0];
    await pool.execute(
      "UPDATE candidats SET nom=?, prenom=?, parti=?, description=?, photo=?, numero_ordre=? WHERE id=?",
      [nom || c.nom, prenom || c.prenom, parti !== undefined ? parti : c.parti,
       description !== undefined ? description : c.description,
       photo !== undefined ? photo : c.photo,
       numero_ordre || c.numero_ordre, id]
    );

    await logActivite("admin", req.admin.id, "CANDIDAT_MODIFIE", { candidat_id: id }, req.ip);
    res.json({ succes: true, message: "Candidat modifié" });
  } catch (error) {
    console.error("Erreur modifierCandidat:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// DELETE /api/candidats/:id → Soft delete (statut = RETIRE)
const retirerCandidat = async (req, res) => {
  try {
    const { id } = req.params;
    const [candidats] = await pool.execute(
      "SELECT c.*, e.statut FROM candidats c JOIN elections e ON c.election_id = e.id WHERE c.id = ?", [id]
    );
    if (candidats.length === 0) return res.status(404).json({ succes: false, message: "Candidat introuvable" });
    if (["OUVERTE", "CLOTUREE"].includes(candidats[0].statut)) {
      return res.status(400).json({ succes: false, message: "Impossible de retirer un candidat d'une élection ouverte ou clôturée" });
    }

    await pool.execute("UPDATE candidats SET statut = 'RETIRE' WHERE id = ?", [id]);
    await logActivite("admin", req.admin.id, "CANDIDAT_RETIRE", { candidat_id: id }, req.ip);
    res.json({ succes: true, message: "Candidat retiré" });
  } catch (error) {
    console.error("Erreur retirerCandidat:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

module.exports = { listerCandidats, ajouterCandidat, modifierCandidat, retirerCandidat };
