const { sha256 } = require("../utils/crypto");

function createAuthMiddleware({ getSessionByTokenHash }) {
  async function authenticate(req, res, next) {
    const token = req.cookies.session;

    if (!token) {
      return res.sendStatus(401);
    }

    const tokenHash = sha256(token);

    const session = await getSessionByTokenHash(tokenHash);

    if (!session) {
      return res.sendStatus(401);
    }

    req.user = {
      id: session.user_id,
    };
    next();
  }

  return authenticate;
}

module.exports = {
  createAuthMiddleware,
};
