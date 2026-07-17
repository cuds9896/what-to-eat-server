const createSessionSchema = (db) => {
  const initializeSessionsTable = db.exec(
    `CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id UUID NOT NULL,
        tokenHash TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(uuid) ON DELETE CASCADE
      );`,
  );

  const createSessionInDatabase = (sessionData) => {
    const { userId, tokenHash } = sessionData;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
    db.prepare(
      `INSERT INTO sessions (user_id, tokenHash, expires_at) VALUES (?, ?, ?)`,
    ).run(userId, tokenHash, expiresAt.toISOString());
  };

  const getSessionByTokenHash = (tokenHash) => {
    console.log("looking up session");
    return db
      .prepare(`SELECT * FROM sessions where tokenHash = ?`)
      .get(tokenHash);
  };

  return {
    createSessionInDatabase,
    getSessionByTokenHash,
  };
};

module.exports = {
  createSessionSchema,
};
