// routes/auth.routes.js
const express = require("express");
const router = express.Router();
const passport = require("../config/googleAuth");
const { googleCallback, monProfil, deconnexion } = require("../controllers/auth.controller");
const { verifierToken } = require("../middleware/auth.middleware");

// Lancer l'auth Google
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

// Callback après auth Google
router.get("/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/api/auth/echec" }),
  googleCallback
);

router.get("/echec", (req, res) => {
  res.status(401).json({ succes: false, message: "Authentification Google échouée. Email non autorisé." });
});

router.get("/me", verifierToken, monProfil);
router.post("/logout", verifierToken, deconnexion);

module.exports = router;
