// routes/ussd.routes.js
const express = require("express");
const router = express.Router();
const {
  verifierAcces, renvoyerOTP, validerOTP, definirMotDePasse,
  modifierMotDePasse, authentifier, voter, verifierStatutVote,
} = require("../controllers/ussd.controller");

// Accès
router.post("/verifier-acces", verifierAcces);
// Activation compte (1ère connexion)
router.post("/renvoyer-otp", renvoyerOTP);           // Si OTP expiré
router.post("/valider-otp", validerOTP);              // Valider l'OTP
router.post("/definir-mot-de-passe", definirMotDePasse); // Créer le MDP → ACTIF
// Connexions normales
router.post("/authentifier", authentifier);           // Login → session_token
// Modification MDP volontaire
router.post("/modifier-mot-de-passe", modifierMotDePasse);
// Vote
router.post("/voter", voter);
// Consultation
router.post("/statut-vote", verifierStatutVote);

module.exports = router;
