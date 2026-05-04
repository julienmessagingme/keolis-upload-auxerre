const service = require('./dashboards.service');

/**
 * Renvoie 503 si l'user n'a pas de userUuid en session (Supabase
 * indisponible au moment du login). Plus utile qu'un 500 cryptique.
 */
function requireUserUuid(req, res) {
  const userUuid = req.session?.user?.userUuid;
  if (!userUuid) {
    res.status(503).json({ error: 'service_unavailable', message: 'Mapping Supabase user indisponible. Reconnectez-vous.' });
    return null;
  }
  return userUuid;
}

async function listDashboards(req, res, next) {
  try {
    const userUuid = requireUserUuid(req, res);
    if (!userUuid) return;
    const dashboards = await service.listDashboards(userUuid);
    res.json({ dashboards });
  } catch (err) {
    next(err);
  }
}

module.exports = { listDashboards, requireUserUuid };
