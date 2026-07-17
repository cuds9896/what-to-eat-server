const Database = require("better-sqlite3");
const express = require("express");
const cors = require("cors");
const { createRecipeStore } = require("./db/recipes");
const { createWebhookServer } = require("./db/webhook");
const { createUserSchema } = require("./db/users");
const { createSessionSchema } = require("./db/sessions");
const { createAuthMiddleware } = require("./middleware/auth");
const cookieParser = require("cookie-parser");

const app = express();
app.use((req, res, next) => {
  console.log("Incoming request:", req.method, req.url);
  next();
});
const expressPort = 3000;
const webhookPort = 8000;

const db = new Database("what-to-eat.db");
const recipeStore = createRecipeStore(db);
const userStore = createUserSchema(db);
const sessionStore = createSessionSchema(db);

const authenticate = createAuthMiddleware({
  getSessionByTokenHash: sessionStore.getSessionByTokenHash,
});

const webhook = createWebhookServer({ port: webhookPort });
const { server, connections, users, voting } = webhook;
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/me", authenticate, async (req, res) => {
  console.log("test");
  const user = await userStore.getUserByUUID(req.user.id);
  console.log("/me user: " + user.username + " UUID: " + user.uuid);
  res.json({ username: user.username, uuid: user.uuid });
});

app.post("/login", async (req, res) => {
  try {
    const { user, sessionToken } = await userStore.loginUser(req.body);

    res.cookie("session", sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.status(200).json({
      sessionToken: sessionToken,
      user: {
        username: user.username,
        uuid: user.uuid,
      },
    });
  } catch (error) {
    console.error("Error during login:", error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post("/signup", async (req, res) => {
  try {
    const { user, sessionToken } = await userStore.createUser(req.body);

    res.cookie("session", sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days}
    });

    res.status(201).json({
      sessionToken: sessionToken,
      user: {
        username: user.username,
        uuid: user.uuid,
      },
    });
  } catch (error) {
    console.error("Error during signup:", error.message);
    res.status(400).json({ error: error.message });
  }
});

recipeStore.initializeTables();

app.get("/getRecipes", (req, res) => {
  res.json(recipeStore.getRecipes());
});

app.get("/getIngredients", (req, res) => {
  res.json(recipeStore.getIngredients());
});

app.post("/removeRecipe", express.json(), (req, res) => {
  const recipeId = req.body.id;
  console.log(`Received request to remove recipe with ID: ${recipeId}`);
  console.log("Request body:", req.body);
  const result = recipeStore.removeRecipe(recipeId);
  console.log(`Deleted recipe with ID: ${recipeId} and its ingredients`);
  res.json(result);
});

app.post("/saveIngredients", express.json(), (req, res) => {
  const categories = req.body.categories;
  const result = recipeStore.saveIngredients(categories);
  res.json(result);
});

app.post("/addRecipe", express.json(), (req, res) => {
  try {
    const recipe = req.body;
    if (!recipe.title || !Array.isArray(recipe.ingredients)) {
      return res.status(400).json({ error: "Invalid recipe format" });
    }

    const recipeId = recipeStore.addRecipe(recipe);
    res.status(201).json({
      id: recipeId.id,
      title: recipe.title,
      instructions: recipe.instructions,
    });
  } catch (error) {
    console.error("Error processing request:", error.message);
    res.status(400).json({ error: "Bad Request" });
  }
});

app.listen(expressPort, "0.0.0.0", () => {
  console.log(`Express server is listening on port ${expressPort}`);
});

module.exports = { app, server, db, connections, users, voting };
