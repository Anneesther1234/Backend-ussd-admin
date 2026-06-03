// controllers/agent.controller.js
// Table : agents_cei (matricule + mot_de_passe, pas Google)
const { pool } = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { logActivite } = require("../middleware/logger.middleware");

// GET /api/agents
const listerAgents = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT ag.id, ag.matricule, ag.nom, ag.prenom, ag.email, ag.agence, ag.statut, ag.date_creation,
              COUNT(e.id) AS nb_electeurs_enrolles
       FROM agents_cei ag
       LEFT JOIN electeurs e ON e.agent_id = ag.id
       GROUP BY ag.id ORDER BY ag.date_creation DESC`
    );
    res.json({ succes: true, data: rows, total: rows.length });
  } catch (error) {
    console.error("Erreur listerAgents:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// POST /api/agents → Créer un agent (admin suprême uniquement)
const creerAgent = async (req, res) => {
  try {
    const { matricule, nom, prenom, email, mot_de_passe, agence } = req.body;
    if (!matricule || !nom || !prenom || !email || !mot_de_passe) {
      return res.status(400).json({ succes: false, message: "Champs requis: matricule, nom, prenom, email, mot_de_passe" });
    }

    const [existant] = await pool.execute(
      "SELECT id FROM agents_cei WHERE email = ? OR matricule = ?", [email, matricule]
    );
    if (existant.length > 0) {
      return res.status(409).json({ succes: false, message: "Email ou matricule déjà utilisé" });
    }

    const hash = await bcrypt.hash(mot_de_passe, 12);
    const [result] = await pool.execute(
      "INSERT INTO agents_cei (matricule, nom, prenom, email, mot_de_passe, agence, admin_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [matricule, nom, prenom, email, hash, agence || null, req.admin.id]
    );

    await logActivite("admin", req.admin.id, "AGENT_CREE", { agent_id: result.insertId, email }, req.ip);
    res.status(201).json({
      succes: true,
      message: "Compte agent créé avec succès",
      data: { id: result.insertId, matricule, nom, prenom, email, agence },
    });
  } catch (error) {
    console.error("Erreur creerAgent:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// POST /api/agents/login → Connexion agent par matricule + mdp
const loginAgent = async (req, res) => {
  try {
    const { matricule, mot_de_passe } = req.body;
    if (!matricule || !mot_de_passe) {
      return res.status(400).json({ succes: false, message: "matricule et mot_de_passe requis" });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM agents_cei WHERE matricule = ?", [matricule]
    );
    if (rows.length === 0) {
      return res.status(401).json({ succes: false, message: "Matricule ou mot de passe incorrect" });
    }

    const agent = rows[0];
    if (agent.statut !== 'ACTIF') {
      return res.status(403).json({ succes: false, message: "Compte agent désactivé. Contactez l'administrateur." });
    }

    const valide = await bcrypt.compare(mot_de_passe, agent.mot_de_passe);
    if (!valide) {
      return res.status(401).json({ succes: false, message: "Matricule ou mot de passe incorrect" });
    }

    const token = jwt.sign(
      { id: agent.id, matricule: agent.matricule, nom: agent.nom, role: "agent" },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    await logActivite("agent", agent.id, "CONNEXION_AGENT", {}, req.ip);
    res.json({ succes: true, token, agent: { id: agent.id, matricule: agent.matricule, nom: agent.nom, prenom: agent.prenom } });
  } catch (error) {
    console.error("Erreur loginAgent:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

// PATCH /api/agents/:id/statut
const changerStatutAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;
    const statutsValides = ['ACTIF', 'INACTIF', 'SUSPENDU', 'BLOQUE'];
    if (!statutsValides.includes(statut)) {
      return res.status(400).json({ succes: false, message: `Statut invalide. Valeurs: ${statutsValides.join(", ")}` });
    }
    const [agents] = await pool.execute("SELECT id FROM agents_cei WHERE id = ?", [id]);
    if (agents.length === 0) return res.status(404).json({ succes: false, message: "Agent introuvable" });

    await pool.execute("UPDATE agents_cei SET statut = ? WHERE id = ?", [statut, id]);
    await logActivite("admin", req.admin.id, "AGENT_STATUT_CHANGE", { agent_id: id, statut }, req.ip);
    res.json({ succes: true, message: `Statut agent mis à jour : ${statut}` });
  } catch (error) {
    console.error("Erreur changerStatutAgent:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

module.exports = { listerAgents, creerAgent, loginAgent, changerStatutAgent };
