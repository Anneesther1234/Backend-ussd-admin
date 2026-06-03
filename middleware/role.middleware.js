// middleware/role.middleware.js
// Vérification du rôle admin (super_admin vs admin)

const exigerRole = (...rolesAutorises) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        succes: false,
        message: "Non authentifié.",
      });
    }

    if (!rolesAutorises.includes(req.admin.role)) {
      return res.status(403).json({
        succes: false,
        message: `Accès refusé. Rôle requis: ${rolesAutorises.join(" ou ")}`,
      });
    }

    next();
  };
};

module.exports = { exigerRole };
