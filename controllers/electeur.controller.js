// controllers/electeur.controller.js
// MISE A JOUR :
// - Enrôlement : envoi SMS OTP dès création, compte reste INACTIF
// - Log de toutes les actions y compris refus
const { pool } = require("../config/db");
const { logActivite } = require("../middleware/logger.middleware");
const { notifierDemandeModification } = require("../notifications/notifyAdmin");
const { genererCodeTemporaire, envoyerSMS } = require("../utils/sms");
const bcrypt = require("bcryptjs");

// GET /api/electeurs
const listerElecteurs = async (req, res) => {
  try {
    const { recherche, statut, page = 1, limite = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limite);
    const limiteInt = parseInt(limite);
    const offsetInt = parseInt(offset);

    let where = "WHERE 1=1";
    const params = [];

    if (recherche) {
      where += " AND (e.nom LIKE ? OR e.prenom LIKE ? OR e.numero_electeur LIKE ? OR e.numero_telephone LIKE ? OR e.numero_cni LIKE ?)";
      const t = `%${recherche}%`;
      params.push(t, t, t, t, t);
    }
    if (statut) { where += " AND e.statut = ?"; params.push(statut); }

    const [rows] = await pool.execute(
      `SELECT e.id, e.numero_electeur, e.numero_carte, e.nom, e.prenom,
              e.date_naissance, e.lieu_naissance, e.numero_cni,
              e.numero_telephone, e.statut, e.a_vote, e.tentatives_echec,
              e.derniere_connexion, e.date_enrolement,
              ag.nom AS agent_nom, ag.agence
       FROM electeurs e
       LEFT JOIN agents_cei ag ON e.agent_id = ag.id
       ${where} ORDER BY e.date_enrolement DESC LIMIT ${limiteInt} OFFSET ${offsetInt}`,
      params
    );

    const [[total]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM electeurs e ${where}`, params
    );

    res.json({
      succes: true, data: rows,
      pagination: { total: total.total, page: parseInt(page), limite: limiteInt,
                    pages: Math.ceil(total.total / limiteInt) }
    });
  } catch (error) {
    console.error("Erreur listerElecteurs:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// GET /api/electeurs/:id
const getElecteur = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT e.id, e.numero_electeur, e.numero_carte, e.nom, e.prenom,
              e.date_naissance, e.lieu_naissance, e.numero_cni,
              e.numero_telephone, e.statut, e.a_vote, e.tentatives_echec,
              e.derniere_connexion, e.date_enrolement,
              ag.nom AS agent_nom, ag.agence
       FROM electeurs e LEFT JOIN agents_cei ag ON e.agent_id = ag.id
       WHERE e.id = ?`, [req.params.id]
    );
    if (rows.length === 0) {
      await logActivite("admin", req.admin?.id, "ELECTEUR_INTROUVABLE", { electeur_id: req.params.id }, req.ip);
      return res.status(404).json({ succes: false, message: "Electeur introuvable" });
    }
    res.json({ succes: true, data: rows[0] });
  } catch (error) {
    console.error("Erreur getElecteur:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// POST /api/electeurs/enroler
// Agent enrôle un électeur → compte INACTIF + SMS OTP envoyé immédiatement
const enrolerElecteur = async (req, res) => {
  try {
    const { nom, prenom, date_naissance, lieu_naissance, numero_cni, numero_telephone, agent_id } = req.body;
    if (!nom || !prenom || !date_naissance || !numero_cni || !numero_telephone || !agent_id) {
      await logActivite("agent", agent_id, "ENROLEMENT_REFUSE_DONNEES_MANQUANTES", { numero_telephone }, req.ip);
      return res.status(400).json({ succes: false, message: "Champs requis: nom, prenom, date_naissance, numero_cni, numero_telephone, agent_id" });
    }

    // Unicité CNI + téléphone
    const [existant] = await pool.execute(
      "SELECT id FROM electeurs WHERE numero_cni = ? OR numero_telephone = ?",
      [numero_cni, numero_telephone]
    );
    if (existant.length > 0) {
      await logActivite("agent", agent_id, "ENROLEMENT_REFUSE_DOUBLON", { numero_cni, numero_telephone }, req.ip);
      return res.status(409).json({ succes: false, message: "Ce citoyen est deja enrole (CNI ou telephone deja utilise)" });
    }

    // Générer numéro électeur unique
    const annee = new Date().getFullYear();
    const [[dernierElecteur]] = await pool.execute("SELECT COUNT(*) AS total FROM electeurs");
    const numero_electeur = `CI-${annee}-${String(dernierElecteur.total + 1).padStart(5, "0")}`;
    const numero_carte = `CARTE-${Date.now()}`;

    const [result] = await pool.execute(
      `INSERT INTO electeurs (numero_electeur, numero_carte, nom, prenom, date_naissance,
        lieu_naissance, numero_cni, numero_telephone, statut, agent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'INACTIF', ?)`,
      [numero_electeur, numero_carte, nom, prenom, date_naissance,
       lieu_naissance || null, numero_cni, numero_telephone, agent_id]
    );

    const electeur_id = result.insertId;

    // Générer OTP et l'envoyer par SMS immédiatement
    const code = genererCodeTemporaire();
    const codeHash = await bcrypt.hash(code, 10);
    const expiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await pool.execute(
      "INSERT INTO otp (electeur_id, code, date_expiration, type) VALUES (?, ?, ?, 'PREMIERE_CONNEXION')",
      [electeur_id, codeHash, expiration]
    );

    await envoyerSMS(
      numero_telephone,
      `CEI-VOTE: Bienvenue ${prenom} ${nom}. Votre numero electeur: ${numero_electeur}. Code d'activation: ${code}. Composez *155# pour activer votre compte. Code valable 10 min.`
    );

    await logActivite("agent", agent_id, "ELECTEUR_ENROLE", {
      electeur_id, numero_electeur, sms_otp_envoye: true
    }, req.ip);

    res.status(201).json({
      succes: true,
      message: "Electeur enrole avec succes. Un SMS avec le code d'activation a ete envoye.",
      data: { id: electeur_id, numero_electeur, numero_carte, nom, prenom },
      ...(process.env.NODE_ENV === "development" && { otp_dev: code }),
    });
  } catch (error) {
    console.error("Erreur enrolerElecteur:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// PATCH /api/electeurs/:id/statut → Admin change le statut
const changerStatutElecteur = async (req, res) => {
  try {
    const { id } = req.params;
    const { statut, raison } = req.body;
    const statutsValides = ["ACTIF", "INACTIF", "SUSPENDU", "BLOQUE"];
    if (!statutsValides.includes(statut)) {
      return res.status(400).json({ succes: false, message: `Statut invalide. Valeurs: ${statutsValides.join(", ")}` });
    }

    const resetTentatives = statut === "ACTIF" ? ", tentatives_echec = 0" : "";
    await pool.execute(`UPDATE electeurs SET statut = ? ${resetTentatives} WHERE id = ?`, [statut, id]);
    await logActivite("admin", req.admin.id, "ELECTEUR_STATUT_CHANGE", { electeur_id: id, statut, raison }, req.ip);
    res.json({ succes: true, message: `Statut electeur mis a jour : ${statut}` });
  } catch (error) {
    console.error("Erreur changerStatutElecteur:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// GET /api/electeurs/demandes
const listerDemandesModification = async (req, res) => {
  try {
    const { statut = "EN_ATTENTE" } = req.query;
    const [rows] = await pool.execute(
      `SELECT dm.*, CONCAT(e.nom, ' ', e.prenom) AS electeur_nom, e.numero_electeur,
              CONCAT(ag.nom, ' ', ag.prenom) AS agent_nom, ag.agence
       FROM demandes_modification_electeur dm
       JOIN electeurs e ON dm.electeur_id = e.id
       JOIN agents_cei ag ON dm.agent_id = ag.id
       WHERE dm.statut = ? ORDER BY dm.date_creation DESC`,
      [statut]
    );
    res.json({ succes: true, data: rows, total: rows.length });
  } catch (error) {
    console.error("Erreur listerDemandesModification:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// POST /api/electeurs/demandes → Agent soumet une demande de modification
const soumettreDemandeModification = async (req, res) => {
  try {
    const { electeur_id, agent_id, champ_modifie, nouvelle_valeur } = req.body;
    const champsAutorises = ["nom", "prenom", "date_naissance", "lieu_naissance", "numero_telephone"];
    if (!champsAutorises.includes(champ_modifie)) {
      await logActivite("agent", agent_id, "DEMANDE_MODIFICATION_REFUSEE_CHAMP_INTERDIT", { champ_modifie }, req.ip);
      return res.status(400).json({ succes: false, message: `Champ non autorise. Permis: ${champsAutorises.join(", ")}` });
    }

    const [electeurs] = await pool.execute("SELECT * FROM electeurs WHERE id = ?", [electeur_id]);
    if (electeurs.length === 0) return res.status(404).json({ succes: false, message: "Electeur introuvable" });

    const ancienne_valeur = electeurs[0][champ_modifie];
    const [result] = await pool.execute(
      "INSERT INTO demandes_modification_electeur (electeur_id, agent_id, champ_modifie, ancienne_valeur, nouvelle_valeur) VALUES (?, ?, ?, ?, ?)",
      [electeur_id, agent_id, champ_modifie, ancienne_valeur, nouvelle_valeur]
    );

    const [agents] = await pool.execute("SELECT CONCAT(nom,' ',prenom) AS nom_complet FROM agents_cei WHERE id = ?", [agent_id]);
    await notifierDemandeModification({
      demande_id: result.insertId,
      agent_nom: agents[0]?.nom_complet || "Agent",
      electeur_nom: `${electeurs[0].nom} ${electeurs[0].prenom}`,
      champ_modifie, ancienne_valeur, nouvelle_valeur,
    });

    await logActivite("agent", agent_id, "DEMANDE_MODIFICATION_SOUMISE", { demande_id: result.insertId, electeur_id, champ_modifie }, req.ip);
    res.status(201).json({ succes: true, message: "Demande soumise. En attente d'approbation.", data: { demande_id: result.insertId } });
  } catch (error) {
    console.error("Erreur soumettreDemandeModification:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// PATCH /api/electeurs/demandes/:id/traiter → Admin approuve ou refuse
const traiterDemandeModification = async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, commentaire } = req.body;
    if (!["VALIDEE", "REJETEE"].includes(decision)) {
      return res.status(400).json({ succes: false, message: "decision invalide. Valeurs: 'VALIDEE' ou 'REJETEE'" });
    }

    const [demandes] = await pool.execute("SELECT * FROM demandes_modification_electeur WHERE id = ?", [id]);
    if (demandes.length === 0) return res.status(404).json({ succes: false, message: "Demande introuvable" });
    if (demandes[0].statut !== "EN_ATTENTE") {
      return res.status(400).json({ succes: false, message: "Cette demande a deja ete traitee" });
    }

    if (decision === "VALIDEE") {
      await pool.execute(
        `UPDATE electeurs SET ${demandes[0].champ_modifie} = ? WHERE id = ?`,
        [demandes[0].nouvelle_valeur, demandes[0].electeur_id]
      );
    }

    await pool.execute(
      "UPDATE demandes_modification_electeur SET statut=?, admin_id=?, commentaire_admin=?, date_traitement=NOW() WHERE id=?",
      [decision, req.admin.id, commentaire || null, id]
    );

    await logActivite("admin", req.admin.id, `MODIFICATION_${decision}`, { demande_id: id, electeur_id: demandes[0].electeur_id, champ: demandes[0].champ_modifie }, req.ip);
    res.json({ succes: true, message: `Demande ${decision === "VALIDEE" ? "validee et appliquee" : "rejetee"}` });
  } catch (error) {
    console.error("Erreur traiterDemandeModification:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

module.exports = {
  listerElecteurs, getElecteur, enrolerElecteur,
  changerStatutElecteur, listerDemandesModification,
  soumettreDemandeModification, traiterDemandeModification
};
