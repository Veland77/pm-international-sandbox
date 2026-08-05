// src/middleware/basicAuth.js
// Site-wide HTTP Basic Auth gate. Credentials come from SANDBOX_USER and
// SANDBOX_PASSWORD environment variables only — never hardcoded here. If
// either is unset, every request is denied (fail closed, not open).

function requireAuth(req, res, next) {
  const expectedUser = process.env.SANDBOX_USER;
  const expectedPassword = process.env.SANDBOX_PASSWORD;

  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");

  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    const providedUser = decoded.slice(0, separatorIndex);
    const providedPassword = decoded.slice(separatorIndex + 1);

    if (
      expectedUser &&
      expectedPassword &&
      providedUser === expectedUser &&
      providedPassword === expectedPassword
    ) {
      return next();
    }
  }

  res.set("WWW-Authenticate", 'Basic realm="PM International Sandbox"');
  res.status(401).send("Authentication required.");
}

module.exports = { requireAuth };
