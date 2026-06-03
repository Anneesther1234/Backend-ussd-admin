// controllers/resetPassword.controller.js
// NOUVEAU FLUX :
// 1. Électeur demande sur USSD → se rend chez l'agent
// 2. Agent vérifie physiquement + soumet la demande (PAS l'électeur)
// 3. Admin valide
// 4. Code OTP envoyé à l'électeur par SMS
// 5. Électeur remet un mot de passe comme à la 1ère connexion
const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const { logActivite } = require("../middleware/logger.middleware");
const { notifierDemandeModification } = require("../notifications/notifyAdmin");
const { genererCodeTemporaire, envoyerSMS } = require("../utils/sms");

// ═══════════════════════════════════════════════════════
// POST /api/reset-password/demande-ussd
// Électeur signale via USSD qu'il veut réinitialiser
// → crée une pré-demande, lui dit de se rendre chez l'agent
// ═══════════════════════════════════════════════════════
const preDemandeUSSD = async (req, res) => {
  try {
    const { telephone, numero_electeur } = req.body;
    if (!telephone || !numero_electeur) {
      return res.status(400).json({ succes: false, message: "telephone et numero_electeur requis" });
    }

    const [rows] = await pool.execute(
      "SELECT id, nom, prenom, statut FROM electeurs WHERE numero_telephone = ? AND numero_electeur = ?",
      [telephone, numero_electeur]
    );

    if (rows.length === 0) {
      await logActivite("systeme", null, "RESET_PREDMANDE_ELECTEUR_INTROUVABLE", { numero_electeur }, req.ip);
      return res.json({ succes: false, message: "Numero electeur incorrect." });
    }

    const electeur = rows[0];

    // Vérifier pas de demande déjà en cours
    const [enCours] = await pool.execute(
      "SELECT id FROM demandes_reinitialisation_mdp WHERE electeur_id = ? AND statut IN ('EN_ATTENTE','VALIDEE')",
      [electeur.id]
    );
    if (enCours.length > 0) {
      return res.json({
        succes: false,
        message: "Une demande est deja en cours. Rendez-vous en agence CEI avec votre carte d'electeur.",
      });
    }

    // Créer une pré-demande avec statut EN_ATTENTE_AGENT
    const [result] = await pool.execute(
      "INSERT INTO demandes_reinitialisation_mdp (electeur_id, motif, statut) VALUES (?, 'Demande USSD - En attente verification agent', 'EN_ATTENTE')",
      [electeur.id]
    );

    await logActivite("electeur", electeur.id, "RESET_PREDEMANDE_USSD", { demande_id: result.insertId }, req.ip);

    res.json({
      succes: true,
      message: "Demande enregistree. Rendez-vous en agence CEI avec votre carte d'electeur et votre piece d'identite pour finaliser la reinitialisation.",
      demande_id: result.insertId,
    });
  } catch (error) {
    console.error("Erreur preDemandeUSSD:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// ═══════════════════════════════════════════════════════
// POST /api/reset-password/agent-soumettre
// Agent vérifie l'identité physiquement et soumet la demande à l'admin
// ═══════════════════════════════════════════════════════
const agentSoumettreReset = async (req, res) => {
  try {
    const { numero_electeur, telephone, agent_id, motif } = req.body;
    if (!numero_electeur || !telephone || !agent_id) {
      return res.status(400).json({ succes: false, message: "numero_electeur, telephone et agent_id requis" });
    }

    const [rows] = await pool.execute(
      "SELECT id, nom, prenom FROM electeurs WHERE numero_electeur = ? AND numero_telephone = ?",
      [numero_electeur, telephone]
    );

    if (rows.length === 0) {
      await logActivite("agent", agent_id, "RESET_SOUMISSION_ELECTEUR_INTROUVABLE", { numero_electeur }, req.ip);
      return res.status(404).json({ succes: false, message: "Electeur introuvable. Verifier le numero electeur et le telephone." });
    }

    const electeur = rows[0];

    // Chercher une pré-demande USSD existante ou en créer une nouvelle
    const [existante] = await pool.execute(
      "SELECT id FROM demandes_reinitialisation_mdp WHERE electeur_id = ? AND statut = 'EN_ATTENTE'",
      [electeur.id]
    );

    let demande_id;
    if (existante.length > 0) {
      // Mettre à jour la pré-demande existante avec l'agent
      demande_id = existante[0].id;
      await pool.execute(
        "UPDATE demandes_reinitialisation_mdp SET agent_id = ?, motif = ? WHERE id = ?",
        [agent_id, motif || "Verification physique effectuee par l'agent", demande_id]
      );
    } else {
      // Créer une nouvelle demande directement par l'agent
      const [result] = await pool.execute(
        "INSERT INTO demandes_reinitialisation_mdp (electeur_id, agent_id, motif) VALUES (?, ?, ?)",
        [electeur.id, agent_id, motif || "Demande directe agent apres verification physique"]
      );
      demande_id = result.insertId;
    }

    // Notifier l'admin par email
    await notifierDemandeModification({
      demande_id,
      agent_nom: `Agent ID ${agent_id}`,
      electeur_nom: `${electeur.nom} ${electeur.prenom}`,
      champ_modifie: "mot_de_passe",
      ancienne_valeur: "****",
      nouvelle_valeur: "Reinitialisation demandee apres verification physique",
    });

    await logActivite("agent", agent_id, "RESET_SOUMIS_PAR_AGENT", {
      demande_id, electeur_id: electeur.id
    }, req.ip);

    res.json({
      succes: true,
      message: "Demande transmise a l'administrateur. L'electeur recevra un SMS quand la demande est validee.",
      demande_id,
    });
  } catch (error) {
    console.error("Erreur agentSoumettreReset:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// ═══════════════════════════════════════════════════════
// GET /api/reset-password → Liste des demandes (admin)
// ═══════════════════════════════════════════════════════
const listerDemandes = async (req, res) => {
  try {
    const { statut } = req.query;
    let query = `
      SELECT dr.id, dr.statut, dr.motif, dr.created_at, dr.valide_at, dr.date_traitement_agent,
             CONCAT(e.nom, ' ', e.prenom) AS electeur_nom,
             e.numero_electeur, e.numero_telephone,
             dr.commentaire_admin,
             a.nom AS admin_nom,
             CONCAT(ag.nom, ' ', ag.prenom) AS agent_nom, ag.agence
      FROM demandes_reinitialisation_mdp dr
      JOIN electeurs e ON dr.electeur_id = e.id
      LEFT JOIN admins_supremes a ON dr.admin_id = a.id
      LEFT JOIN agents_cei ag ON dr.agent_id = ag.id
    `;
    const params = [];
    if (statut) { query += " WHERE dr.statut = ?"; params.push(statut); }
    query += " ORDER BY dr.created_at DESC";

    const [rows] = await pool.execute(query, params);
    res.json({ succes: true, data: rows, total: rows.length });
  } catch (error) {
    console.error("Erreur listerDemandes:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// ═══════════════════════════════════════════════════════
// PATCH /api/reset-password/:id/valider
// Admin valide → envoie OTP à l'électeur
// ═══════════════════════════════════════════════════════
const validerParAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, commentaire } = req.body;
    if (!["VALIDEE", "REJETEE"].includes(decision)) {
      return res.status(400).json({ succes: false, message: "decision invalide. Valeurs: 'VALIDEE' ou 'REJETEE'" });
    }

    const [demandes] = await pool.execute(
      `SELECT dr.*, e.numero_telephone, e.id AS eid, CONCAT(e.nom, ' ', e.prenom) AS electeur_nom
       FROM demandes_reinitialisation_mdp dr JOIN electeurs e ON dr.electeur_id = e.id WHERE dr.id = ?`,
      [id]
    );

    if (demandes.length === 0) return res.status(404).json({ succes: false, message: "Demande introuvable" });
    if (demandes[0].statut !== "EN_ATTENTE") {
      return res.status(400).json({ succes: false, message: "Cette demande a deja ete traitee" });
    }

    const demande = demandes[0];

    if (decision === "VALIDEE") {
      // Générer OTP et envoyer par SMS immédiatement
      const code = genererCodeTemporaire();
      const codeHash = await bcrypt.hash(code, 10);
      const expiration = new Date(Date.now() + 10 * 60 * 1000);

      // Invalider anciens OTP
      await pool.execute("UPDATE otp SET est_utilise = TRUE WHERE electeur_id = ?", [demande.eid]);

      // Créer nouveau OTP de réinitialisation
      await pool.execute(
        "INSERT INTO otp (electeur_id, code, date_expiration, type) VALUES (?, ?, ?, 'REINITIALISATION')",
        [demande.eid, codeHash, expiration]
      );

      // Réinitialiser le mot de passe → compte redevient INACTIF en attente de nouveau MDP
      await pool.execute(
        "UPDATE electeurs SET mot_de_passe = NULL, statut = 'INACTIF', tentatives_echec = 0 WHERE id = ?",
        [demande.eid]
      );

      // Envoyer SMS avec le code
      await envoyerSMS(
        demande.numero_telephone,
        `CEI-VOTE: Reinitialisation approuvee. Votre code: ${code}. Composez *155# pour definir un nouveau mot de passe. Code valable 10 min.`
      );

      await pool.execute(
        "UPDATE demandes_reinitialisation_mdp SET statut='TRAITEE', admin_id=?, commentaire_admin=?, valide_at=NOW(), date_traitement_agent=NOW() WHERE id=?",
        [req.admin.id, commentaire || null, id]
      );

      await logActivite("admin", req.admin.id, "RESET_MDP_VALIDE_OTP_ENVOYE", {
        demande_id: id, electeur_id: demande.eid,
        ...(process.env.NODE_ENV === "development" && { otp_dev: code }),
      }, req.ip);

      res.json({
        succes: true,
        message: "Demande validee. Code OTP envoye par SMS a l'electeur.",
        ...(process.env.NODE_ENV === "development" && { otp_dev: code }),
      });

    } else {
      // Refus
      await pool.execute(
        "UPDATE demandes_reinitialisation_mdp SET statut='REJETEE', admin_id=?, commentaire_admin=?, valide_at=NOW() WHERE id=?",
        [req.admin.id, commentaire || null, id]
      );

      // Notifier l'électeur par SMS
      await envoyerSMS(
        demande.numero_telephone,
        "CEI-VOTE: Votre demande de reinitialisation a ete rejetee. Contactez la CEI pour plus d'informations."
      );

      await logActivite("admin", req.admin.id, "RESET_MDP_REJETE", { demande_id: id }, req.ip);
      res.json({ succes: true, message: "Demande rejetee. L'electeur a ete notifie par SMS." });
    }
  } catch (error) {
    console.error("Erreur validerParAdmin:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// GET /api/reset-password/agent/:agentId → Demandes liées à un agent
const demandesAgent = async (req, res) => {
  try {
    const { agentId } = req.params;
    const [rows] = await pool.execute(
      `SELECT dr.id, dr.statut, dr.motif, dr.created_at,
              CONCAT(e.nom, ' ', e.prenom) AS electeur_nom, e.numero_electeur, e.numero_telephone
       FROM demandes_reinitialisation_mdp dr
       JOIN electeurs e ON dr.electeur_id = e.id
       WHERE dr.agent_id = ?
       ORDER BY dr.created_at DESC`,
      [agentId]
    );
    res.json({ succes: true, data: rows, total: rows.length });
  } catch (error) {
    console.error("Erreur demandesAgent:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

module.exports = { preDemandeUSSD, agentSoumettreReset, listerDemandes, validerParAdmin, demandesAgent };
