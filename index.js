const http = require("http");
const { WebSocketServer } = require("ws");
const Database = require("better-sqlite3");
const express = require("express");
const app = express();

const url = require("url");
const { json } = require("stream/consumers");
const uuidv4 = require("uuid").v4;

const server = http.createServer();

const wsServer = new WebSocketServer({ server });
const webhookPort = 8000;
const expressPort = 3000;

const connections = {};
const users = {};

const db = new Database("what-to-eat.db");

app.listen(expressPort, () => {
  console.log(`Express server is listening on port ${expressPort}`);
});

app.get("/getRecipes", (req, res) => {
  db.all("SELECT * FROM recipes", [], (err, rows) => {
    if (err) {
      console.error("Error fetching recipes:", err.message);
      res.status(500).json({ error: "Internal Server Error" });
    } else {
      res.json(rows);
    }
  });
});

const insertRecipe = db.prepare(
  "INSERT INTO recipes (title, instructions) VALUES (?, ?)",
);

const insertIngredient = db.prepare(
  `INSERT OR IGNORE INTO ingredients (name) 
  VALUES (?)`,
);

const getIngredientId = db.prepare("SELECT id FROM ingredients WHERE name = ?");

const linkIngredientToRecipe = db.prepare(
  `INSERT OR IGNORE INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) 
  VALUES (?, ?, ?, ?)`,
);

const addRecipeTransaction = db.transaction((recipe) => {
  const result = insertRecipe.run(recipe.title, recipe.instructions);
  const recipeId = result.lastInsertRowId;
  for (const ingredient of recipe.ingredients) {
    insertIngredient.run(ingredient.name);
    const ingredientIdResult = getIngredientId.get(ingredient.name);
    linkIngredientToRecipe.run(
      recipeId,
      ingredientIdResult.id,
      ingredient.quantity,
      ingredient.unit,
    );
  }
  return recipeId;
});

app.post("/addRecipes", express.json(), (req, res) => {
  try {
    const recipe = req.body;
    if (
      !recipe.title ||
      !recipe.instructions ||
      !Array.isArray(recipe.ingredients)
    ) {
      return res.status(400).json({ error: "Invalid recipe format" });
    }
    const recipeId = addRecipeTransaction(recipe);
    res.status(201).json({
      id: recipeId,
      title: recipe.title,
      instructions: recipe.instructions,
    });
  } catch (error) {
    console.error("Error processing request:", error.message);
    res.status(400).json({ error: "Bad Request" });
  }
});

const broadcastUsers = () => {
  Object.keys(connections).forEach((uuid) => {
    const connection = connections[uuid];
    const message = JSON.stringify(users);
    connection.send(message);
  });
};

const handleMessage = (bytes, uuid) => {
  const message = JSON.parse(bytes.toString());
  const user = users[uuid];
  user.state = message;

  broadcastUsers();

  console.log(`Received message from ${users[uuid].username}:`, message);
};
const handleClose = (uuid) => {
  console.log(`Client disconnected: ${users[uuid].username}`);
  delete connections[uuid];
  delete users[uuid];
  broadcastUsers();
};

server.listen(webhookPort, () => {
  console.log(`Server is listening on port ${webhookPort}`);
});

wsServer.on("connection", (connection, request) => {
  const { username } = url.parse(request.url, true).query;
  const uuid = uuidv4();
  console.log(`Client connected with username: ${username} and UUID: ${uuid}`);

  connections[uuid] = connection;

  users[uuid] = {
    username: username,
    state: {
      recipes: [],
      online: false,
    },
  };

  connection.on("message", (message) => handleMessage(message, uuid));

  connection.on("close", () => handleClose(uuid));
});
