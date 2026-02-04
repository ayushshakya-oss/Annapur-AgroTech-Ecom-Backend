function normalizeOrigin(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function parseOriginList(envValue) {
  if (!envValue || typeof envValue !== "string") return [];
  return envValue
    .split(",")
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);
}

function getAllowedOrigins() {
  const fromList = parseOriginList(process.env.FRONTEND_URLS);

  const primary = normalizeOrigin(process.env.FRONTEND_URL);
  const client = normalizeOrigin(process.env.CLIENT_URL);

  const origins = ["http://localhost:3000", primary, client, ...fromList]
    .map((o) => normalizeOrigin(o))
    .filter(Boolean);

  // de-dupe while preserving order
  return [...new Set(origins)];
}

function buildCorsOptions() {
  const allowedOrigins = getAllowedOrigins();

  return {
    origin(origin, callback) {
      const normalizedOrigin = normalizeOrigin(origin);

      // allow non-browser clients (no Origin header)
      if (!normalizedOrigin) return callback(null, true);

      if (allowedOrigins.includes(normalizedOrigin))
        return callback(null, true);

      // Do not error (which can become a 500 and look like a random network/CORS failure)
      console.error("❌ CORS blocked:", normalizedOrigin);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  };
}

module.exports = {
  normalizeOrigin,
  getAllowedOrigins,
  buildCorsOptions,
};
