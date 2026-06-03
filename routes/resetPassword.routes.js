// routes/resetPassword.routes.js
// NOUVEAU FLUX : électeur USSD → agent (vérif physique) → admin (valide) → OTP SMS → électeur remet MDP
const express = require("express");
const router = express.Router();
const {
  preDemandeUSSD, agentSoumettreReset, listerDemandes, validerParAdmin, demandesAgent,
} = require("../controllers/resetPassword.controller");
const { verifierToken } = require("../middleware/auth.middleware");
const { exigerRole } = require("../middleware/role.middleware");

// Étape 1 : Électeur signale via USSD (sans JWT)
router.post("/demande-ussd", preDemandeUSSD);

// Étape 2 : Agent soumet après vérification physique (sans JWT admin)
router.post("/agent-soumettre", agentSoumettreReset);

// Étape 3 : Admin valide ou rejette (JWT requis)
router.get("/", verifierToken, listerDemandes);
router.patch("/:id/valider", verifierToken, exigerRole("super_admin"), validerParAdmin);

// Consultation agent
router.get("/agent/:agentId", demandesAgent);

// Étape 4 : L'électeur reçoit son OTP et utilise /api/ussd/valider-otp
//           puis /api/ussd/definir-mot-de-passe (mêmes routes que la 1ère connexion)

module.exports = router;
