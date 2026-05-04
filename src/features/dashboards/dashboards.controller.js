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

async function createDashboard(req, res, next) {
  try {
    const userUuid = requireUserUuid(req, res);
    if (!userUuid) return;
    const { name } = req.body || {};
    const id = await service.createDashboard(userUuid, name);
    res.status(201).json({ id });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

async function getDashboard(req, res, next) {
  try {
    const userUuid = requireUserUuid(req, res);
    if (!userUuid) return;
    const dashboard = await service.getDashboardWithSteps(userUuid, req.params.id);
    res.json({ dashboard });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'not_found' });
    next(err);
  }
}

async function updateDashboard(req, res, next) {
  try {
    const userUuid = requireUserUuid(req, res);
    if (!userUuid) return;
    await service.updateDashboard(userUuid, req.params.id, req.body || {});
    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

async function deleteDashboard(req, res, next) {
  try {
    const userUuid = requireUserUuid(req, res);
    if (!userUuid) return;
    await service.deleteDashboard(userUuid, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'not_found' });
    next(err);
  }
}

async function getDashboardData(req, res, next) {
  try {
    const userUuid = requireUserUuid(req, res);
    if (!userUuid) return;
    const re = /^\d{4}-\d{2}-\d{2}$/;
    const { from, to } = req.query;
    if (!re.test(from || '') || !re.test(to || '')) {
      return res.status(400).json({ error: 'from/to format YYYY-MM-DD requis' });
    }
    const data = await service.computeDashboardData(userUuid, req.params.id, from, to);
    res.json(data);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'not_found' });
    next(err);
  }
}

module.exports = {
  listDashboards,
  createDashboard,
  getDashboard,
  updateDashboard,
  deleteDashboard,
  getDashboardData,
  requireUserUuid,
};
