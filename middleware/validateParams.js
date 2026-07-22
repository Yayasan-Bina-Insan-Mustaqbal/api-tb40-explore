const validVersions = ['v0.1', 'v0.2', 'v0.3'];
const validTypes = ['tb40', 'tb40anak', 'raporkarakter'];

function validateParams(req, res, next) {
  const { version, type } = req.params;

  console.log(`Received version: ${version}, type: ${type}`);

  if (!validVersions.includes(version)) {
    return res.status(400).json({ error: 'Invalid version parameter' });
  }

  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid type parameter' });
  }

  next();
}

module.exports = validateParams;