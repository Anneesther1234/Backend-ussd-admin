// controllers/public.controller.js
// Routes publiques sans JWT — table elections (pas scrutins)
const { pool } = require("../config/db");

const listerElectionsPubliques = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT e.id, e.titre, e.description, e.date_debut, e.date_fin, e.statut,
              COUNT(DISTINCT c.id) AS nombre_candidats, COUNT(DISTINCT v.id) AS nombre_votes
       FROM elections e
       LEFT JOIN candidats c ON c.election_id=e.id AND c.statut='ACTIF'
       LEFT JOIN votes v ON v.election_id=e.id
       WHERE e.statut IN ('OUVERTE','CLOTUREE','RESULTATS_PUBLIES')
       GROUP BY e.id ORDER BY e.date_debut DESC`
    );
    res.json({ succes: true, data: rows });
  } catch (error) {
    console.error("Erreur listerElectionsPubliques:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

const getResultatsPublics = async (req, res) => {
  try {
    const { electionId } = req.params;
    const [elections] = await pool.execute(
      "SELECT id, titre, description, date_debut, date_fin, statut FROM elections WHERE id = ? AND statut IN ('OUVERTE','CLOTUREE','RESULTATS_PUBLIES')",
      [electionId]
    );
    if (elections.length === 0) return res.status(404).json({ succes: false, message: "Élection introuvable ou résultats non publiés." });

    const [resultats] = await pool.execute(
      `SELECT c.id, c.nom, c.prenom, c.parti, c.photo, c.numero_ordre,
              COUNT(v.id) AS nb_votes,
              ROUND(COUNT(v.id)*100.0/NULLIF((SELECT COUNT(*) FROM votes WHERE election_id=?),0),2) AS pourcentage
       FROM candidats c LEFT JOIN votes v ON v.candidat_id=c.id AND v.election_id=?
       WHERE c.election_id=? AND c.statut='ACTIF'
       GROUP BY c.id ORDER BY nb_votes DESC`,
      [electionId, electionId, electionId]
    );

    const [[total]] = await pool.execute("SELECT COUNT(*) AS total FROM votes WHERE election_id=?", [electionId]);
    const [[inscrits]] = await pool.execute("SELECT COUNT(*) AS total FROM electeurs WHERE statut='ACTIF'");

    res.json({
      succes: true,
      data: {
        election: elections[0], resultats,
        statistiques: { total_votes: total.total, total_inscrits: inscrits.total,
          taux_participation: inscrits.total > 0 ? ((total.total/inscrits.total)*100).toFixed(1) : 0 },
        derniere_mise_a_jour: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Erreur getResultatsPublics:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

const getCandidatsPublics = async (req, res) => {
  try {
    const { electionId } = req.params;
    const [rows] = await pool.execute(
      `SELECT c.id, c.nom, c.prenom, c.parti, c.description, c.photo, c.numero_ordre,
              e.titre AS election_titre, e.statut AS election_statut
       FROM candidats c JOIN elections e ON c.election_id=e.id
       WHERE c.election_id=? AND c.statut='ACTIF' AND e.statut IN ('OUVERTE','CLOTUREE','RESULTATS_PUBLIES')
       ORDER BY c.numero_ordre ASC`,
      [electionId]
    );
    res.json({ succes: true, data: rows });
  } catch (error) {
    console.error("Erreur getCandidatsPublics:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

const getCompteurTempsReel = async (req, res) => {
  try {
    const { electionId } = req.params;
    const [resultats] = await pool.execute(
      `SELECT c.id, c.nom, c.prenom, c.parti, c.photo, c.numero_ordre, COUNT(v.id) AS nb_votes
       FROM candidats c LEFT JOIN votes v ON v.candidat_id=c.id AND v.election_id=?
       WHERE c.election_id=? AND c.statut='ACTIF' GROUP BY c.id ORDER BY nb_votes DESC`,
      [electionId, electionId]
    );
    const [[total]] = await pool.execute("SELECT COUNT(*) AS total FROM votes WHERE election_id=?", [electionId]);
    res.json({ succes: true, total_votes: total.total, resultats, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("Erreur getCompteurTempsReel:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

module.exports = { listerElectionsPubliques, getResultatsPublics, getCandidatsPublics, getCompteurTempsReel };
