// notifications/notifyAdmin.js
// Service d'envoi d'email aux administrateurs
const nodemailer = require("nodemailer");
require("dotenv").config();

// Configurer le transporteur Gmail
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD, // App Password Gmail (pas le vrai mdp)
  },
});

// -------------------------------------------------------
// Notifier l'admin : un agent veut modifier un électeur
// -------------------------------------------------------
const notifierDemandeModification = async (demande) => {
  const { agent_nom, electeur_nom, champ_modifie, ancienne_valeur, nouvelle_valeur, demande_id } = demande;

  const mailOptions = {
    from: `"Système Vote USSD - CEI" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_ADMIN,
    subject: `⚠️ Demande de modification électeur - Action requise`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #1a3a5c; color: white; padding: 20px; text-align: center;">
          <h2 style="margin:0;">🗳️ Système de Vote USSD - CEI</h2>
          <p style="margin:5px 0 0;">Notification de demande de modification</p>
        </div>
        
        <div style="padding: 25px;">
          <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
            <strong>⚠️ Action requise :</strong> Un agent a soumis une demande de modification d'un électeur.
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr style="background: #f8f9fa;">
              <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold; width: 40%;">Agent demandeur</td>
              <td style="padding: 10px; border: 1px solid #dee2e6;">${agent_nom}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Électeur concerné</td>
              <td style="padding: 10px; border: 1px solid #dee2e6;">${electeur_nom}</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Champ à modifier</td>
              <td style="padding: 10px; border: 1px solid #dee2e6;">${champ_modifie}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Ancienne valeur</td>
              <td style="padding: 10px; border: 1px solid #dee2e6; color: #dc3545;">${ancienne_valeur}</td>
            </tr>
            <tr style="background: #f8f9fa;">
              <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Nouvelle valeur demandée</td>
              <td style="padding: 10px; border: 1px solid #dee2e6; color: #28a745;">${nouvelle_valeur}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">ID Demande</td>
              <td style="padding: 10px; border: 1px solid #dee2e6;">#${demande_id}</td>
            </tr>
          </table>

          <p style="color: #666;">Connectez-vous à l'interface d'administration pour approuver ou refuser cette demande.</p>
          
          <div style="background: #e8f5e9; border: 1px solid #a5d6a7; padding: 12px; border-radius: 4px; font-size: 13px; color: #555;">
            ℹ️ Cette modification ne sera pas appliquée sans votre approbation.
          </div>
        </div>

        <div style="background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #888;">
          Système de Vote USSD - INP-HB ESI © 2026
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Notification envoyée à l'admin pour la demande #${demande_id}`);
    return true;
  } catch (error) {
    console.error("❌ Erreur envoi email:", error.message);
    return false;
  }
};

// -------------------------------------------------------
// Notifier l'admin : activité suspecte détectée
// -------------------------------------------------------
const notifierActiviteSuspecte = async (details) => {
  const { type, description, ip, electeur_id } = details;

  const mailOptions = {
    from: `"Système Vote USSD - CEI" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_ADMIN,
    subject: `🚨 ALERTE SÉCURITÉ - Activité suspecte détectée`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #dc3545; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
          <h2 style="margin:0;">🚨 ALERTE SÉCURITÉ</h2>
        </div>
        <div style="padding: 25px;">
          <p><strong>Type :</strong> ${type}</p>
          <p><strong>Description :</strong> ${description}</p>
          <p><strong>IP :</strong> ${ip || "Inconnue"}</p>
          <p><strong>ID Électeur :</strong> ${electeur_id || "N/A"}</p>
          <p><strong>Date/Heure :</strong> ${new Date().toLocaleString("fr-FR")}</p>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("❌ Erreur envoi alerte sécurité:", error.message);
    return false;
  }
};

module.exports = { notifierDemandeModification, notifierActiviteSuspecte };
