// controllers/ussd.controller.js
// MISE A JOUR COMPLETE :
// - Log de TOUTES les actions y compris refus
// - Activation compte via OTP envoyé à l'enrôlement
// - Modification mot de passe électeur actif
// - Réinitialisation : l'agent soumet après vérification physique
const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const { logActivite } = require("../middleware/logger.middleware");
const { notifierActiviteSuspecte } = require("../notifications/notifyAdmin");
const { genererCodeTemporaire, genererTokenSession, envoyerSMS } = require("../utils/sms");

// ═══════════════════════════════════════════════════════
// POST /api/ussd/verifier-acces
// Dès que l'électeur compose *155#
// ═══════════════════════════════════════════════════════
const verifierAcces = async (req, res) => {
  try {
    const { telephone } = req.body;
    if (!telephone) {
      await logActivite("systeme", null, "USSD_ACCES_TELEPHONE_MANQUANT", {}, req.ip);
      return res.json({ autorise: false, message: "END Numero manquant." });
    }

    const [rows] = await pool.execute(
      "SELECT id, nom, prenom, statut, mot_de_passe FROM electeurs WHERE numero_telephone = ?",
      [telephone]
    );

    if (rows.length === 0) {
      await logActivite("systeme", null, "USSD_ACCES_REFUSE_NUMERO_INCONNU", { telephone }, req.ip);
      return res.json({ autorise: false, message: "END Numero non reconnu. Veuillez vous enroler a la CEI." });
    }

    const e = rows[0];

    if (e.statut === "BLOQUE") {
      await logActivite("electeur", e.id, "USSD_ACCES_REFUSE_COMPTE_BLOQUE", { telephone }, req.ip);
      return res.json({ autorise: false, message: "END Compte bloque. Contactez la CEI au 1500." });
    }
    if (e.statut === "SUSPENDU") {
      await logActivite("electeur", e.id, "USSD_ACCES_REFUSE_COMPTE_SUSPENDU", { telephone }, req.ip);
      return res.json({ autorise: false, message: "END Compte suspendu. Contactez la CEI." });
    }

    // INACTIF = compte créé mais pas encore activé → OTP déjà envoyé à l'enrôlement
    const inactif = e.statut === "INACTIF";
    await logActivite("electeur", e.id, "USSD_ACCES_AUTORISE", { telephone, inactif }, req.ip);

    return res.json({
      autorise: true,
      compte_actif: !inactif,
      premiere_connexion: inactif || !e.mot_de_passe,
      electeur_id: e.id,
      nom: e.nom,
      prenom: e.prenom,
    });
  } catch (error) {
    console.error("Erreur verifierAcces:", error);
    await logActivite("systeme", null, "USSD_ERREUR_VERIF_ACCES", { erreur: error.message }, req.ip);
    res.json({ autorise: false, message: "END Erreur systeme. Reessayez." });
  }
};

// ═══════════════════════════════════════════════════════
// POST /api/ussd/renvoyer-otp
// L'électeur inactif peut demander un renvoi de son OTP
// (si le premier a expiré)
// ═══════════════════════════════════════════════════════
const renvoyerOTP = async (req, res) => {
  try {
    const { telephone, numero_electeur } = req.body;

    const [rows] = await pool.execute(
      "SELECT id, nom, prenom, statut FROM electeurs WHERE numero_telephone = ? AND numero_electeur = ?",
      [telephone, numero_electeur]
    );

    if (rows.length === 0) {
      await logActivite("systeme", null, "OTP_RENVOI_REFUSE_ELECTEUR_INTROUVABLE", { telephone, numero_electeur }, req.ip);
      return res.json({ succes: false, message: "Numero electeur incorrect ou ne correspond pas a ce telephone." });
    }

    const electeur = rows[0];

    if (electeur.statut !== "INACTIF") {
      return res.json({ succes: false, message: "Ce compte est deja active. Utilisez votre mot de passe." });
    }

    // Invalider OTP précédents
    await pool.execute("UPDATE otp SET est_utilise = TRUE WHERE electeur_id = ? AND est_utilise = FALSE", [electeur.id]);

    // Générer nouveau OTP
    const code = genererCodeTemporaire();
    const codeHash = await bcrypt.hash(code, 10);
    const expiration = new Date(Date.now() + 10 * 60 * 1000);

    await pool.execute(
      "INSERT INTO otp (electeur_id, code, date_expiration, type) VALUES (?, ?, ?, 'PREMIERE_CONNEXION')",
      [electeur.id, codeHash, expiration]
    );

    await envoyerSMS(telephone, `CEI-VOTE: Nouveau code d'activation: ${code}. Valable 10 minutes. Ne le communiquez a personne.`);
    await logActivite("electeur", electeur.id, "OTP_RENVOYE", { type: "PREMIERE_CONNEXION" }, req.ip);

    res.json({
      succes: true,
      message: "Nouveau code envoye par SMS. Valable 10 minutes.",
      ...(process.env.NODE_ENV === "development" && { otp_dev: code }),
    });
  } catch (error) {
    console.error("Erreur renvoyerOTP:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// ═══════════════════════════════════════════════════════
// POST /api/ussd/valider-otp
// Valide le code OTP (activation ou réinitialisation)
// ═══════════════════════════════════════════════════════
const validerOTP = async (req, res) => {
  try {
    const { electeur_id, code, numero_electeur, telephone } = req.body;

    // Chercher l'électeur par ID ou par numero_electeur + telephone
    let eid = electeur_id;
    if (!eid && numero_electeur && telephone) {
      const [rows] = await pool.execute(
        "SELECT id FROM electeurs WHERE numero_electeur = ? AND numero_telephone = ?",
        [numero_electeur, telephone]
      );
      if (rows.length === 0) {
        await logActivite("systeme", null, "OTP_VALIDATION_ELECTEUR_INTROUVABLE", { numero_electeur }, req.ip);
        return res.json({ succes: false, message: "Numero electeur incorrect." });
      }
      eid = rows[0].id;
    }

    const [otps] = await pool.execute(
      "SELECT * FROM otp WHERE electeur_id = ? AND est_utilise = FALSE ORDER BY id DESC LIMIT 1",
      [eid]
    );

    if (otps.length === 0) {
      await logActivite("electeur", eid, "OTP_VALIDATION_REFUSEE_AUCUN_OTP", {}, req.ip);
      return res.json({ succes: false, message: "Aucun code actif. Demandez un nouveau code." });
    }

    const otp = otps[0];
    if (new Date() > new Date(otp.date_expiration)) {
      await logActivite("electeur", eid, "OTP_VALIDATION_REFUSEE_EXPIRE", {}, req.ip);
      return res.json({ succes: false, message: "Code expire. Demandez un nouveau code." });
    }

    const valide = await bcrypt.compare(code, otp.code);
    if (!valide) {
      await logActivite("electeur", eid, "OTP_VALIDATION_REFUSEE_CODE_INCORRECT", {}, req.ip);
      return res.json({ succes: false, message: "Code incorrect." });
    }

    // Invalider l'OTP
    await pool.execute("UPDATE otp SET est_utilise = TRUE WHERE id = ?", [otp.id]);

    // Renvoyer identité pour vérification
    const [electeurs] = await pool.execute(
      "SELECT nom, prenom, date_naissance FROM electeurs WHERE id = ?", [eid]
    );

    await logActivite("electeur", eid, "OTP_VALIDE", { type: otp.type }, req.ip);

    res.json({
      succes: true,
      message: "Code valide.",
      identite: electeurs[0],
      electeur_id: eid,
      type: otp.type,
    });
  } catch (error) {
    console.error("Erreur validerOTP:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// ═══════════════════════════════════════════════════════
// POST /api/ussd/definir-mot-de-passe
// 1ère activation : définir le mot de passe → compte ACTIF
// ═══════════════════════════════════════════════════════
const definirMotDePasse = async (req, res) => {
  try {
    const { electeur_id, mot_de_passe, confirmation } = req.body;
    if (!electeur_id || !mot_de_passe || !confirmation) {
      return res.status(400).json({ succes: false, message: "electeur_id, mot_de_passe et confirmation requis" });
    }
    if (mot_de_passe !== confirmation) {
      await logActivite("electeur", electeur_id, "DEFINITION_MDP_REFUSEE_CONFIRMATION", {}, req.ip);
      return res.json({ succes: false, message: "Les mots de passe ne correspondent pas." });
    }
    if (!/^\d{6,}$/.test(mot_de_passe)) {
      return res.json({ succes: false, message: "Le mot de passe doit contenir au moins 6 chiffres." });
    }

    const hash = await bcrypt.hash(mot_de_passe, 12);
    await pool.execute(
      "UPDATE electeurs SET mot_de_passe = ?, statut = 'ACTIF', tentatives_echec = 0 WHERE id = ?",
      [hash, electeur_id]
    );

    await logActivite("electeur", electeur_id, "MOT_DE_PASSE_DEFINI_COMPTE_ACTIVE", {}, req.ip);
    res.json({ succes: true, message: "Mot de passe cree. Compte active. Vous pouvez maintenant voter." });
  } catch (error) {
    console.error("Erreur definirMotDePasse:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// ═══════════════════════════════════════════════════════
// POST /api/ussd/modifier-mot-de-passe
// Électeur ACTIF veut changer son mot de passe volontairement 
// ═══════════════════════════════════════════════════════
const modifierMotDePasse = async (req, res) => {
  try {
    const { telephone, numero_electeur, ancien_mot_de_passe, nouveau_mot_de_passe, confirmation } = req.body;

    if (!telephone || !numero_electeur || !ancien_mot_de_passe || !nouveau_mot_de_passe || !confirmation) {
      return res.status(400).json({ succes: false, message: "Tous les champs sont requis" });
    }

    if (nouveau_mot_de_passe !== confirmation) {
      return res.json({ succes: false, message: "Les nouveaux mots de passe ne correspondent pas." });
    }
    if (!/^\d{6,}$/.test(nouveau_mot_de_passe)) {
      return res.json({ succes: false, message: "Le nouveau mot de passe doit contenir au moins 6 chiffres." });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM electeurs WHERE numero_electeur = ? AND numero_telephone = ?",
      [numero_electeur, telephone]
    );

    if (rows.length === 0) {
      await logActivite("systeme", null, "MODIF_MDP_REFUSEE_ELECTEUR_INTROUVABLE", { numero_electeur }, req.ip);
      return res.json({ succes: false, message: "Numero electeur incorrect." });
    }

    const e = rows[0];

    if (e.statut !== "ACTIF") {
      await logActivite("electeur", e.id, "MODIF_MDP_REFUSEE_COMPTE_INACTIF", { statut: e.statut }, req.ip);
      return res.json({ succes: false, message: "Compte non actif. Impossible de modifier le mot de passe." });
    }

    // Vérifier l'ancien mot de passe
    const ancienValide = await bcrypt.compare(ancien_mot_de_passe, e.mot_de_passe || "");
    if (!ancienValide) {
      await logActivite("electeur", e.id, "MODIF_MDP_REFUSEE_ANCIEN_MDP_INCORRECT", {}, req.ip);
      return res.json({ succes: false, message: "Ancien mot de passe incorrect." });
    }

    // Vérifier que le nouveau est différent de l'ancien
    const memeMotDePasse = await bcrypt.compare(nouveau_mot_de_passe, e.mot_de_passe);
    if (memeMotDePasse) {
      return res.json({ succes: false, message: "Le nouveau mot de passe doit etre different de l'ancien." });
    }

    const hash = await bcrypt.hash(nouveau_mot_de_passe, 12);
    await pool.execute("UPDATE electeurs SET mot_de_passe = ? WHERE id = ?", [hash, e.id]);
    await logActivite("electeur", e.id, "MOT_DE_PASSE_MODIFIE", {}, req.ip);

    // Confirmer par SMS
    await envoyerSMS(telephone, "CEI-VOTE: Votre mot de passe a ete modifie avec succes.");

    res.json({ succes: true, message: "Mot de passe modifie avec succes." });
  } catch (error) {
    console.error("Erreur modifierMotDePasse:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// ═══════════════════════════════════════════════════════
// POST /api/ussd/authentifier
// Connexions normales : numero_electeur + mot_de_passe
// ═══════════════════════════════════════════════════════
const authentifier = async (req, res) => {
  try {
    const { telephone, numero_electeur, mot_de_passe } = req.body;
    if (!telephone || !numero_electeur || !mot_de_passe) {
      return res.status(400).json({ succes: false, message: "telephone, numero_electeur et mot_de_passe requis" });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM electeurs WHERE numero_electeur = ? AND numero_telephone = ?",
      [numero_electeur, telephone]
    );

    if (rows.length === 0) {
      await logActivite("systeme", null, "AUTH_REFUSEE_ELECTEUR_INTROUVABLE", { numero_electeur }, req.ip);
      return res.json({ succes: false, message: "Numero electeur invalide." });
    }

    const e = rows[0];

    if (!e.mot_de_passe) {
      await logActivite("electeur", e.id, "AUTH_REFUSEE_COMPTE_PAS_ACTIVE", {}, req.ip);
      return res.json({ succes: false, message: "Compte non active. Utilisez le code SMS recu lors de l'enrolement." });
    }
    if (e.statut === "BLOQUE") {
      await logActivite("electeur", e.id, "AUTH_REFUSEE_COMPTE_BLOQUE", {}, req.ip);
      return res.json({ succes: false, bloque: true, message: "Compte bloque. Contactez la CEI au 1500." });
    }
    if (e.statut === "SUSPENDU") {
      await logActivite("electeur", e.id, "AUTH_REFUSEE_COMPTE_SUSPENDU", {}, req.ip);
      return res.json({ succes: false, message: "Compte suspendu. Contactez la CEI." });
    }

    const valide = await bcrypt.compare(mot_de_passe, e.mot_de_passe);

    if (!valide) {
      const nouvTentatives = e.tentatives_echec + 1;
      const bloquer = nouvTentatives >= 3;

      await pool.execute(
        "UPDATE electeurs SET tentatives_echec = ?, statut = ? WHERE id = ?",
        [nouvTentatives, bloquer ? "BLOQUE" : e.statut, e.id]
      );

      await logActivite("electeur", e.id, "AUTH_ECHEC_MDP_INCORRECT", {
        tentatives: nouvTentatives, bloque: bloquer
      }, req.ip);

      if (bloquer) {
        await notifierActiviteSuspecte({
          type: "COMPTE_BLOQUE", ip: req.ip, electeur_id: e.id,
          description: `Compte de ${e.nom} ${e.prenom} bloque apres 3 echecs`,
        });
        return res.json({ succes: false, bloque: true, message: "Compte bloque apres 3 tentatives. Contactez la CEI au 1500." });
      }

      return res.json({
        succes: false,
        message: `Mot de passe incorrect. ${3 - nouvTentatives} tentative(s) restante(s).`,
        tentatives_restantes: 3 - nouvTentatives,
      });
    }

    // Succès
    await pool.execute(
      "UPDATE electeurs SET tentatives_echec = 0, derniere_connexion = NOW() WHERE id = ?", [e.id]
    );

    // Créer session USSD
    const tokenSession = genererTokenSession();
    const expireAt = new Date(Date.now() + 2 * 60 * 1000);

    await pool.execute(
      "INSERT INTO sessions_ussd (electeur_id, numero_telephone, date_debut, date_fin, token_session, etape_courante) VALUES (?, ?, NOW(), ?, ?, 'AUTHENTIFIE')",
      [e.id, telephone, expireAt, tokenSession]
    );

    const [elections] = await pool.execute(
      "SELECT id, titre, description, date_fin FROM elections WHERE statut = 'OUVERTE' AND NOW() BETWEEN date_debut AND date_fin"
    );

    await logActivite("electeur", e.id, "AUTHENTIFICATION_REUSSIE", {}, req.ip);

    res.json({
      succes: true,
      token_session: tokenSession,
      electeur: { nom: e.nom, prenom: e.prenom, a_vote: e.a_vote },
      elections_actives: elections,
    });
  } catch (error) {
    console.error("Erreur authentifier:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// ═══════════════════════════════════════════════════════
// POST /api/ussd/voter
// ═══════════════════════════════════════════════════════
const voter = async (req, res) => {
  const connexion = await pool.getConnection();
  try {
    const { token_session, election_id, candidat_id } = req.body;
    if (!token_session || !election_id || !candidat_id) {
      return res.status(400).json({ succes: false, message: "token_session, election_id et candidat_id requis" });
    }

    const [sessions] = await connexion.execute(
      "SELECT * FROM sessions_ussd WHERE token_session = ? AND token_utilise = FALSE", [token_session]
    );
    if (sessions.length === 0) {
      await logActivite("systeme", null, "VOTE_REFUSE_SESSION_INVALIDE", { token_session }, req.ip);
      return res.json({ succes: false, message: "Session invalide ou deja utilisee." });
    }
    if (new Date() > new Date(sessions[0].date_fin)) {
      await logActivite("electeur", sessions[0].electeur_id, "VOTE_REFUSE_SESSION_EXPIREE", {}, req.ip);
      return res.json({ succes: false, message: "Session expiree. Reconnectez-vous." });
    }

    const electeur_id = sessions[0].electeur_id;
    await connexion.beginTransaction();

    // Double-vote check
    const [dejaVote] = await connexion.execute(
      "SELECT id FROM votes WHERE election_id = ? AND electeur_id = ?", [election_id, electeur_id]
    );
    if (dejaVote.length > 0) {
      await connexion.rollback();
      await logActivite("electeur", electeur_id, "VOTE_REFUSE_DEJA_VOTE", { election_id }, req.ip);
      return res.json({ succes: false, message: "Vous avez deja vote pour cette election." });
    }

    const [elections] = await connexion.execute(
      "SELECT id FROM elections WHERE id = ? AND statut = 'OUVERTE' AND NOW() BETWEEN date_debut AND date_fin",
      [election_id]
    );
    if (elections.length === 0) {
      await connexion.rollback();
      await logActivite("electeur", electeur_id, "VOTE_REFUSE_ELECTION_INACTIVE", { election_id }, req.ip);
      return res.json({ succes: false, message: "Cette election n'est plus active." });
    }

    const [candidats] = await connexion.execute(
      "SELECT id FROM candidats WHERE id = ? AND election_id = ? AND statut = 'ACTIF'",
      [candidat_id, election_id]
    );
    if (candidats.length === 0) {
      await connexion.rollback();
      await logActivite("electeur", electeur_id, "VOTE_REFUSE_CANDIDAT_INVALIDE", { candidat_id }, req.ip);
      return res.json({ succes: false, message: "Candidat invalide." });
    }

    await connexion.execute(
      "INSERT INTO votes (election_id, candidat_id, electeur_id, session_ussd) VALUES (?, ?, ?, ?)",
      [election_id, candidat_id, electeur_id, token_session]
    );
    await connexion.execute("UPDATE electeurs SET a_vote = TRUE WHERE id = ?", [electeur_id]);
    await connexion.execute(
      "UPDATE sessions_ussd SET token_utilise = TRUE, statut = 'FERMEE', date_fin = NOW() WHERE token_session = ?",
      [token_session]
    );

    await connexion.commit();

    const [el] = await pool.execute(
      "SELECT numero_telephone, nom, prenom FROM electeurs WHERE id = ?", [electeur_id]
    );
    if (el.length > 0) {
      await envoyerSMS(el[0].numero_telephone, `CEI-VOTE: Votre vote a ete enregistre avec succes. Merci ${el[0].prenom} ${el[0].nom} pour votre participation.`);
    }

    await logActivite("electeur", electeur_id, "VOTE_ENREGISTRE", { election_id, candidat_id }, req.ip);
    res.json({ succes: true, message: "Vote enregistre avec succes. Merci pour votre participation." });
  } catch (error) {
    await connexion.rollback();
    console.error("Erreur voter:", error);
    res.status(500).json({ succes: false, message: "Erreur lors de l'enregistrement du vote." });
  } finally {
    connexion.release();
  }
};

// POST /api/ussd/statut-vote
const verifierStatutVote = async (req, res) => {
  try {
    const { telephone, numero_electeur } = req.body;
    const [rows] = await pool.execute(
      "SELECT id, a_vote FROM electeurs WHERE numero_telephone = ? AND numero_electeur = ?",
      [telephone, numero_electeur]
    );
    if (rows.length === 0) {
      await logActivite("systeme", null, "STATUT_VOTE_ELECTEUR_INTROUVABLE", { numero_electeur }, req.ip);
      return res.json({ succes: false, message: "Electeur introuvable." });
    }
    await logActivite("electeur", rows[0].id, "STATUT_VOTE_CONSULTE", { a_vote: rows[0].a_vote }, req.ip);
    res.json({
      succes: true, a_vote: rows[0].a_vote,
      message: rows[0].a_vote ? "Vous avez deja vote." : "Vous n'avez pas encore vote.",
    });
  } catch (error) {
    console.error("Erreur verifierStatutVote:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

module.exports = {
  verifierAcces, renvoyerOTP, validerOTP, definirMotDePasse,
  modifierMotDePasse, authentifier, voter, verifierStatutVote,
};
