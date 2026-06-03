const express = require("express");
const router = express.Router();
const { listerCandidats, ajouterCandidat, modifierCandidat, retirerCandidat } = require("../controllers/candidat.controller");
const { verifierToken } = require("../middleware/auth.middleware");

router.use(verifierToken);
router.get("/:electionId", listerCandidats);
router.post("/", ajouterCandidat);
router.put("/:id", modifierCandidat);
router.delete("/:id", retirerCandidat);

module.exports = router;
