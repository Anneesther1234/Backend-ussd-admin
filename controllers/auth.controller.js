// controllers/auth.controller.js
// Auth admin suprême via Google OAuth → génère JWT
// Table : admins_supremes
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");
const { logActivite } = require("../middleware/logger.middleware");
require("dotenv").config();

const genererToken = (admin) => {
  return jwt.sign(
    { id: admin.id, email: admin.email, nom: admin.nom, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
  );
};

const googleCallback = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?erreur=Email non autorisé`);
    }
    const token = genererToken(req.user);
    await logActivite("admin", req.user.id, "CONNEXION_GOOGLE", { email: req.user.email }, req.ip);
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (error) {
    console.error("Erreur callback Google:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

const monProfil = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, nom, email, role, statut, date_creation FROM admins_supremes WHERE id = ?",
      [req.admin.id]
    );
    if (rows.length === 0) return res.status(404).json({ succes: false, message: "Admin introuvable" });
    res.json({ succes: true, data: rows[0] });
  } catch (error) {
    console.error("Erreur monProfil:", error);
    res.status(500).json({ succes: false, message: "Erreur serveur" });
  }
};

const deconnexion = async (req, res) => {
  await logActivite("admin", req.admin.id, "DECONNEXION", {}, req.ip);
  res.json({ succes: true, message: "Déconnexion réussie" });
};

module.exports = { googleCallback, monProfil, deconnexion, genererToken };
