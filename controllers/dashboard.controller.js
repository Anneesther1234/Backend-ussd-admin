// controllers/dashboard.controller.js
// Tables : elections, electeurs, votes, agents_cei, journal_audit
const { pool } = require("../config/db");

const getDashboard = async (req, res) => {
  try {
    const [[statsElecteurs]] = await pool.execute(
      "SELECT COUNT(*) AS total, SUM(a_vote=TRUE) AS ont_vote, SUM(statut='BLOQUE') AS bloques, SUM(statut='SUSPENDU') AS suspendus, SUM(statut='ACTIF') AS actifs FROM electeurs"
    );
    const [[statsElections]] = await pool.execute(
      "SELECT COUNT(*) AS total, SUM(statut='OUVERTE') AS ouvertes, SUM(statut='CLOTUREE') AS cloturees, SUM(statut='EN_PREPARATION') AS en_preparation, SUM(statut='RESULTATS_PUBLIES') AS publiees FROM elections"
    );
    const [voteParElection] = await pool.execute(
      `SELECT e.titre, e.statut, COUNT(v.id) AS nb_votes FROM elections e LEFT JOIN votes v ON v.election_id = e.id WHERE e.statut IN ('OUVERTE','CLOTUREE','RESULTATS_PUBLIES') GROUP BY e.id ORDER BY e.date_debut DESC LIMIT 5`
    );
    const [[demandesReset]] = await pool.execute("SELECT COUNT(*) AS total FROM demandes_reinitialisation_mdp WHERE statut = 'EN_ATTENTE'");
    const [[demandesModif]] = await pool.execute("SELECT COUNT(*) AS total FROM demandes_modification_electeur WHERE statut = 'EN_ATTENTE'");
    const [[statsAgents]] = await pool.execute("SELECT COUNT(*) AS total, SUM(statut='ACTIF') AS actifs FROM agents_cei");
    const [activiteRecente] = await pool.execute(
      "SELECT action, COUNT(*) AS occurrences FROM journal_audit WHERE date_action >= NOW() - INTERVAL 24 HOUR GROUP BY action ORDER BY occurrences DESC LIMIT 10"
    );

    res.json({
      succes: true,
      data: {
        electeurs: {
          total: statsElecteurs.total,
          actifs: statsElecteurs.actifs || 0,
          ont_vote: statsElecteurs.ont_vote || 0,
          bloques: statsElecteurs.bloques || 0,
          suspendus: statsElecteurs.suspendus || 0,
          taux_participation: statsElecteurs.total > 0 ? ((statsElecteurs.ont_vote / statsElecteurs.total) * 100).toFixed(1) : 0,
        },
        elections: { total: statsElections.total, ouvertes: statsElections.ouvertes || 0, cloturees: statsElections.cloturees || 0, en_preparation: statsElections.en_preparation || 0 },
        votes_par_election: voteParElection,
        alertes: { demandes_reset_en_attente: demandesReset.total, demandes_modif_en_attente: demandesModif.total },
        agents: statsAgents,
        activite_recente: activiteRecente,
        derniere_mise_a_jour: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Erreur getDashboard:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

const getResultatsElection = async (req, res) => {
  try {
    const { electionId } = req.params;
    const [elections] = await pool.execute("SELECT * FROM elections WHERE id = ?", [electionId]);
    if (elections.length === 0) return res.status(404).json({ succes: false, message: "Élection introuvable" });

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
    const [[totalInscrits]] = await pool.execute("SELECT COUNT(*) AS total FROM electeurs WHERE statut='ACTIF'");

    res.json({
      succes: true,
      data: {
        election: elections[0], resultats,
        statistiques: {
          total_votes: total.total,
          total_inscrits: totalInscrits.total,
          taux_participation: totalInscrits.total > 0 ? ((total.total / totalInscrits.total) * 100).toFixed(1) : 0,
        },
        genere_le: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Erreur getResultatsElection:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

const getLogs = async (req, res) => {
  try {
    const { type_acteur, action, page = 1, limite = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limite);
    const limiteInt = parseInt(limite);
    const offsetInt = (parseInt(page) - 1) * limiteInt;
    let query = "SELECT * FROM journal_audit WHERE 1=1";
    const params = [];
    if (type_acteur) { query += " AND type_acteur = ?"; params.push(type_acteur); }
    if (action) { query += " AND action LIKE ?"; params.push(`%${action}%`); }
    query += ` ORDER BY date_action DESC LIMIT ${limiteInt} OFFSET ${offsetInt}`;

    const [rows] = await pool.execute(query, params);
    res.json({ succes: true, data: rows, total: rows.length });
  } catch (error) {
    console.error("Erreur getLogs:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

module.exports = { getDashboard, getResultatsElection, getLogs };
