// routes/scrutin.routes.js — routes /api/elections
const express = require("express");
const router = express.Router();
const { listerElections, getElection, creerElection, modifierElection, changerStatutElection } = require("../controllers/scrutin.controller");
const { verifierToken } = require("../middleware/auth.middleware");

router.use(verifierToken);
router.get("/", listerElections);
router.get("/:id", getElection);
router.post("/", creerElection);
router.put("/:id", modifierElection);
router.patch("/:id/statut", changerStatutElection);

module.exports = router;
