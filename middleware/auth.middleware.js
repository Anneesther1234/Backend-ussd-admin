// middleware/auth.middleware.js
// Log les tentatives d'accès refusées
const jwt = require("jsonwebtoken");
const { logActivite } = require("./logger.middleware");
require("dotenv").config();

const verifierToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    await logActivite("systeme", null, "ACCES_REFUSE_TOKEN_MANQUANT", {
      route: req.originalUrl, method: req.method
    }, req.ip);
    return res.status(401).json({ succes: false, message: "Accès refusé. Token manquant." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    await logActivite("systeme", null, "ACCES_REFUSE_TOKEN_INVALIDE", {
      route: req.originalUrl, raison: error.message
    }, req.ip);
    return res.status(403).json({ succes: false, message: "Token invalide ou expiré." });
  }
};

module.exports = { verifierToken };
