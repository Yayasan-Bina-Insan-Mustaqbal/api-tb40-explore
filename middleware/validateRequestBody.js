function validateRequestBody(req, res, next) {
  //   console.log(req.body);
  const { parts } = req.body;

  if (!parts || !parts.umum || (!parts.tb40 && !parts.tb40anak && !parts.raporkarakter)) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  const { version, type } = req.params;
  const { umum } = parts;
  const scores = parts[type] || parts.tb40; // Fallback to tb40 if type-specific key missing


  if (
    !umum.nama ||
    !umum.nama.lengkap ||
    !umum.lahir ||
    !umum.lahir.tanggal ||
    !umum.tanggal
  ) {
    return res.status(400).json({ error: "Invalid minimum 'umum' data" });
  }

  if (
    !Array.isArray(scores) ||
    scores.length !== 40 ||
    !scores.every(
      (score) => typeof score === "number" && score >= 0 && score <= 100
    )
  ) {
    return res.status(400).json({
      error: `Invalid ${type} data, should be array of 40 data of number between 0-100`,
    });
  }

  // Set nama.panggilan to nama.lengkap if not available
  if (!umum.nama.panggilan) {
    umum.nama.panggilan = umum.nama.lengkap;
  }

  next();
}

module.exports = validateRequestBody;
