const createRecipeStore = (db) => {
  const initializeTables = () => {
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
  };

  const getRecipes = () => {
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

    return recipes.map((recipe) => {
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
        ingredients,
      };
    });
  };

  const getIngredients = () => {
    return db
      .prepare(
        `SELECT id, name, category, calories, carbs, protein, fat FROM ingredients`,
      )
      .all();
  };

  const removeRecipe = (recipeId) => {
    const deleteRecipe = db.prepare(`DELETE FROM recipes WHERE id = ?`);
    const deleteRecipeIngredients = db.prepare(
      `DELETE FROM recipe_ingredients WHERE recipe_id = ?`,
    );

    deleteRecipe.run(recipeId);
    deleteRecipeIngredients.run(recipeId);

    return { success: true };
  };

  const saveIngredients = (categories = {}) => {
    Object.entries(categories).forEach(([categoryName, ingredients]) => {
      ingredients.forEach((ingredient) => {
        const modifyIngredient = db.prepare(
          `UPDATE ingredients SET category = ? WHERE name = ?`,
        );
        modifyIngredient.run(categoryName, ingredient);
      });
    });

    return { success: true };
  };

  const insertRecipe = db.prepare(
    "INSERT INTO recipes (title, instructions) VALUES (?, ?)",
  );

  const insertIngredient = db.prepare(
    `INSERT OR IGNORE INTO ingredients (name) 
    VALUES (?)`,
  );

  const getIngredientId = db.prepare(
    "SELECT id FROM ingredients WHERE name = ?",
  );

  const linkIngredientToRecipe = db.prepare(
    `INSERT OR IGNORE INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit) 
    VALUES (?, ?, ?, ?)`,
  );

  const addRecipe = (recipe) => {
    if (!recipe.title || !Array.isArray(recipe.ingredients)) {
      throw new Error("Invalid recipe format");
    }

    const addRecipeTransaction = db.transaction(() => {
      const result = insertRecipe.run(recipe.title, recipe.instructions);
      const recipeId = result.lastInsertRowid;

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

    const recipeId = addRecipeTransaction();
    return {
      id: recipeId,
      title: recipe.title,
      instructions: recipe.instructions,
    };
  };

  return {
    initializeTables,
    getRecipes,
    getIngredients,
    removeRecipe,
    saveIngredients,
    addRecipe,
  };
};

module.exports = { createRecipeStore };
