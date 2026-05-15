const http = require("http");
const { WebSocketServer } = require("ws");
const Database = require("better-sqlite3");
const express = require("express");
const app = express();

const url = require("url");
const { json } = require("stream/consumers");
const uuidv4 = require("uuid").v4;

const cors = require("cors");

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

app.use(cors());

db.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    instructions TEXT,
    link TEXT
  );
  CREATE TABLE IF NOT EXISTS ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT,
    calories INTEGER,
    carbs INTEGER,
    protein INTEGER,
    fat INTEGER
  );
  CREATE TABLE IF NOT EXISTS recipe_ingredients (
    recipe_id INTEGER,
    ingredient_id INTEGER,
    quantity TEXT,
    unit TEXT,
    PRIMARY KEY (recipe_id, ingredient_id),
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
  );
`);

app.get("/getRecipes", (req, res) => {
  const recipes = db
    .prepare(
      `SELECT r.id, r.title, r.instructions, 
      GROUP_CONCAT(i.name || '|' || ri.quantity || '|' || ri.unit) AS ingredients
     FROM recipes r
     LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
     LEFT JOIN ingredients i ON ri.ingredient_id = i.id
     GROUP BY r.id`,
    )
    .all();
  const formattedRecipes = recipes.map((recipe) => {
    const ingredients = recipe.ingredients
      ? recipe.ingredients.split(",").map((item) => {
          const [name, quantity, unit] = item.split("|");
          return { name, quantity, unit };
        })
      : [];
    return {
      id: recipe.id,
      title: recipe.title,
      instructions: recipe.instructions,
      ingredients: ingredients,
    };
  });
  res.json(formattedRecipes);
});

app.get("/getIngredients", (req, res) => {
  const ingredients = db
    .prepare(
      `SELECT id, name, category, calories, carbs, protein, fat FROM ingredients`,
    )
    .all();
  res.json(ingredients);
});

app.post("/removeRecipe", express.json(), (req, res) => {
  const recipeId = req.body.id;
  console.log(`Received request to remove recipe with ID: ${recipeId}`);
  console.log("Request body:", req.body);
  const deleteRecipe = db.prepare(`DELETE FROM recipes WHERE id = ?`);
  const deleteRecipeIngredients = db.prepare(
    `DELETE FROM recipe_ingredients WHERE recipe_id = ?`,
  );
  deleteRecipe.run(recipeId);
  deleteRecipeIngredients.run(recipeId);
  console.log(`Deleted recipe with ID: ${recipeId} and its ingredients`);
  res.json({ success: true });
});

app.post("/saveIngredients", express.json(), (req, res) => {
  const categories = req.body.categories;
  Object.entries(categories).forEach(([categoryName, ingredients]) => {
    ingredients.forEach((ingredient) => {
      const modifyIngredient = db.prepare(
        `UPDATE ingredients SET category = ? WHERE name = ?`,
      );
      modifyIngredient.run(categoryName, ingredient);
    });
  });
  res.json({ success: true });
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
  console.log(result);
  const recipeId = result.lastInsertRowid;
  console.log(`Inserted recipe with ID: ${recipeId}`);
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

app.post("/addRecipe", express.json(), (req, res) => {
  try {
    const recipe = req.body;
    if (!recipe.title || !Array.isArray(recipe.ingredients)) {
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
  if (message.username) {
    console.log(`User ${message.username} is now online.`);
    user.state.username = message.username;
    user.state.online = true;
  }
  if (message.recipes && message.recipes.length > 0) {
    console.log(`User ${user.state.username} updated their recipes.`);
    user.state.recipes = message.recipes;
  }
  if (message.votes && message.votes.length > 0) {
    console.log(`User ${user.state.username} updated their votes.`);
    user.state.votes = message.votes;
  }

  broadcastUsers();

  console.log(`Received message from ${users[uuid].state.username}:`, message);
};
const handleClose = (uuid) => {
  console.log(`Client disconnected: ${users[uuid].state.username}`);
  delete connections[uuid];
  delete users[uuid];
  broadcastUsers();
};

server.listen(webhookPort, () => {
  console.log(`Server is listening on port ${webhookPort}`);
});

wsServer.on("connection", (connection) => {
  const uuid = uuidv4();
  console.log(`Client connected with UUID: ${uuid}`);

  connections[uuid] = connection;

  users[uuid] = {
    state: {
      username: "",
      recipes: [],
      votes: [],
      online: false,
    },
  };

  connection.on("message", (message) => handleMessage(message, uuid));

  connection.on("close", () => handleClose(uuid));
});
