const express = require("express");
const router = express.Router();
const { listerElectionsPubliques, getResultatsPublics, getCandidatsPublics, getCompteurTempsReel } = require("../controllers/public.controller");

router.get("/elections", listerElectionsPubliques);
router.get("/resultats/:electionId", getResultatsPublics);
router.get("/candidats/:electionId", getCandidatsPublics);
router.get("/compteur/:electionId", getCompteurTempsReel);

module.exports = router;
