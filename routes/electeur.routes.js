const express = require("express");
const router = express.Router();
const {
  listerElecteurs, getElecteur, enrolerElecteur,
  changerStatutElecteur, listerDemandesModification,
  soumettreDemandeModification, traiterDemandeModification
} = require("../controllers/electeur.controller");
const { verifierToken } = require("../middleware/auth.middleware");

// Enrôlement agent (sans JWT) — envoie OTP par SMS automatiquement
router.post("/enroler", enrolerElecteur);
// Demandes modification agent (sans JWT)
router.post("/demandes", soumettreDemandeModification);

// Routes admin protégées
router.get("/", verifierToken, listerElecteurs);
router.get("/demandes", verifierToken, listerDemandesModification);
router.get("/:id", verifierToken, getElecteur);
router.patch("/:id/statut", verifierToken, changerStatutElecteur);
router.patch("/demandes/:id/traiter", verifierToken, traiterDemandeModification);

module.exports = router;
