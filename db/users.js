const { createSessionSchema } = require("./sessions");
const argon2 = require("argon2");
const crypto = require("crypto");
const { sha256 } = require("../utils/crypto");

const createUserSchema = (db) => {
  const sessionSchema = createSessionSchema(db);
  const initializeUsersTable = db.exec(
    `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        uuid UUID NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
  );

  const createUser = async (userData) => {
    const { username, password } = userData;

    if (!username || !password) {
      throw new Error("Username and password are required.");
    }

    const existingUser = await getUserByUsername(username);

    if (existingUser) {
      throw new Error("Username already exists.");
    }

    const passwordHash = await argon2.hash(password);

    const user = await createUserInDatabase({ username, passwordHash });

    const sessionToken = crypto.randomUUID();

    await sessionSchema.createSessionInDatabase({
      userId: user.uuid,
      tokenHash: sha256(sessionToken),
    });

    return { user, sessionToken };
  };

  const loginUser = async (userData) => {
    const { username, password } = userData;

    if (!username || !password) {
      throw new Error("Username and password are required.");
    }

    const user = await getUserByUsername(username);

    if (!user) {
      throw new Error("Invalid credentials.");
    }

    const valid = await argon2.verify(user.password_hash, password);

    if (!valid) {
      throw new Error("Invalid credentials.");
    }

    const sessionToken = crypto.randomUUID();

    await sessionSchema.createSessionInDatabase({
      userId: user.uuid,
      tokenHash: sha256(sessionToken),
    });

    return { user, sessionToken };
  };

  const createUserInDatabase = (userData) => {
    const { username, passwordHash } = userData;
    const uuid = crypto.randomUUID();

    const result = db
      .prepare(
        `INSERT INTO users (username, password_hash, uuid) VALUES (?, ?, ?)`,
      )
      .run(username, passwordHash, uuid);
    return { user: result.lastInsertRowid, username, uuid };
  };

  const getUsers = () => {
    return db.prepare(`SELECT * FROM users`).all();
  };

  const getUserByUUID = (uuid) => {
    return db.prepare(`SELECT * FROM users WHERE uuid = ?`).get(uuid);
  };

  const getUserByUsername = (username) => {
    return db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
  };

  return {
    initializeUsersTable,
    createUser,
    loginUser,
    getUsers,
    getUserByUUID,
    getUserByUsername,
  };
};

module.exports = {
  createUserSchema,
};
