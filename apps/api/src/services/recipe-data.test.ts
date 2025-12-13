/**
 * Recipe Data Service Tests
 *
 * Tests for the RecipeDataService which manages recipe data from history.json.
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { RecipeDataService, type HistoryRecipe, type RecipeHistory } from './recipe-data';

// Mock fs modules
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Type the mocked functions
const mockReadFile = readFile as MockedFunction<typeof readFile>;
const mockWriteFile = writeFile as MockedFunction<typeof writeFile>;
const mockMkdir = mkdir as MockedFunction<typeof mkdir>;
const mockExistsSync = existsSync as MockedFunction<typeof existsSync>;
const mockReadFileSync = readFileSync as MockedFunction<typeof readFileSync>;

// Test fixtures
const testRecipes: HistoryRecipe[] = [
  {
    id: 'recipe-001',
    name: 'Lemon Herb Chicken',
    source: 'Test Kitchen',
    sourceUrl: 'https://example.com/lemon-chicken',
    cuisine: 'Mediterranean',
    mealTypes: ['dinner'],
    prepTimeMinutes: 15,
    cookTimeMinutes: 45,
    totalTimeMinutes: 60,
    effort: 3,
    defaultServings: 4,
    servingsUnit: 'servings',
    ingredients: [
      { name: 'chicken breast', amount: 4, unit: 'pieces', category: 'protein' },
    ],
    instructions: ['Preheat oven', 'Season chicken', 'Roast'],
    tags: ['weeknight', 'healthy'],
    rating: 5,
    timesMade: 8,
    lastMade: '2024-12-15',
  },
  {
    id: 'recipe-002',
    name: 'Quick Beef Tacos',
    source: 'Family Recipe',
    sourceUrl: null,
    cuisine: 'Mexican',
    mealTypes: ['dinner', 'lunch'],
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    totalTimeMinutes: 25,
    effort: 2,
    defaultServings: 4,
    servingsUnit: 'servings',
    ingredients: [
      { name: 'ground beef', amount: 1, unit: 'lb', category: 'protein' },
    ],
    instructions: ['Brown beef', 'Add seasoning', 'Serve'],
    tags: ['weeknight', 'kid-friendly', 'quick'],
    rating: 4,
    timesMade: 12,
    lastMade: '2024-12-10',
  },
  {
    id: 'recipe-003',
    name: 'Vegetable Stir Fry',
    source: 'Online',
    sourceUrl: 'https://example.com/stir-fry',
    cuisine: 'Asian',
    diet: 'vegetarian',
    mealTypes: ['dinner'],
    prepTimeMinutes: 20,
    cookTimeMinutes: 10,
    totalTimeMinutes: 30,
    effort: 2,
    defaultServings: 2,
    servingsUnit: 'servings',
    ingredients: [
      { name: 'broccoli', amount: 2, unit: 'cups', category: 'vegetable' },
    ],
    instructions: ['Prep vegetables', 'Stir fry', 'Serve'],
    tags: ['vegetarian', 'quick', 'healthy'],
    rating: 4,
    timesMade: 5,
    lastMade: '2024-11-20',
  },
];

const testHistory: RecipeHistory = {
  recipes: testRecipes,
  metadata: {
    lastUpdated: '2024-12-15',
    totalRecipes: 3,
  },
};

describe('RecipeDataService', () => {
  let service: RecipeDataService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create fresh service instance for each test
    service = new RecipeDataService();
  });

  describe('load', () => {
    it('should load recipes from disk', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(testHistory));

      const result = await service.load();

      expect(result.recipes).toHaveLength(3);
      expect(result.metadata.totalRecipes).toBe(3);
    });

    it('should use cache on subsequent loads within TTL', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(testHistory));

      // First load
      await service.load();
      // Second load (should use cache)
      await service.load();

      // readFile should only be called once
      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });

    it('should reload when forceReload is true', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(testHistory));

      // First load
      await service.load();
      // Force reload
      await service.load(true);

      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });

    it('should return empty history if file does not exist', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT: no such file'));

      const result = await service.load();

      expect(result.recipes).toHaveLength(0);
      expect(result.metadata.totalRecipes).toBe(0);
    });

    it('should return empty history if file contains invalid JSON', async () => {
      mockReadFile.mockResolvedValue('not valid json');

      const result = await service.load();

      expect(result.recipes).toHaveLength(0);
    });
  });

  describe('loadSync', () => {
    it('should load recipes synchronously', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify(testHistory));

      const result = service.loadSync();

      expect(result.recipes).toHaveLength(3);
    });

    it('should return empty history on error', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = service.loadSync();

      expect(result.recipes).toHaveLength(0);
    });
  });

  describe('getById', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(testHistory));
      await service.load();
    });

    it('should return recipe by ID', async () => {
      const recipe = await service.getById('recipe-001');

      expect(recipe).not.toBeNull();
      expect(recipe?.name).toBe('Lemon Herb Chicken');
    });

    it('should return null for non-existent ID', async () => {
      const recipe = await service.getById('non-existent');

      expect(recipe).toBeNull();
    });
  });

  describe('getByIdSync', () => {
    beforeEach(() => {
      mockReadFileSync.mockReturnValue(JSON.stringify(testHistory));
    });

    it('should return recipe by ID synchronously', () => {
      const recipe = service.getByIdSync('recipe-002');

      expect(recipe).not.toBeNull();
      expect(recipe?.name).toBe('Quick Beef Tacos');
    });
  });

  describe('getByName', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(testHistory));
      await service.load();
    });

    it('should return recipe by name (case-insensitive)', async () => {
      const recipe = await service.getByName('LEMON HERB CHICKEN');

      expect(recipe).not.toBeNull();
      expect(recipe?.id).toBe('recipe-001');
    });

    it('should return null for non-existent name', async () => {
      const recipe = await service.getByName('Non Existent Recipe');

      expect(recipe).toBeNull();
    });
  });

  describe('getAll', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(testHistory));
      await service.load();
    });

    it('should return all recipes with no filters', async () => {
      const recipes = await service.getAll();

      expect(recipes).toHaveLength(3);
    });

    it('should filter by search term', async () => {
      const recipes = await service.getAll({ search: 'chicken' });

      expect(recipes).toHaveLength(1);
      expect(recipes[0].name).toBe('Lemon Herb Chicken');
    });

    it('should filter by cuisine', async () => {
      const recipes = await service.getAll({ cuisine: 'Mexican' });

      expect(recipes).toHaveLength(1);
      expect(recipes[0].name).toBe('Quick Beef Tacos');
    });

    it('should filter by diet', async () => {
      const recipes = await service.getAll({ diet: 'vegetarian' });

      expect(recipes).toHaveLength(1);
      expect(recipes[0].name).toBe('Vegetable Stir Fry');
    });

    it('should filter by max effort', async () => {
      const recipes = await service.getAll({ maxEffort: 2 });

      expect(recipes).toHaveLength(2);
      expect(recipes.every((r) => r.effort <= 2)).toBe(true);
    });

    it('should filter by max time', async () => {
      const recipes = await service.getAll({ maxTime: 30 });

      expect(recipes).toHaveLength(2);
      expect(recipes.every((r) => r.totalTimeMinutes <= 30)).toBe(true);
    });

    it('should filter by meal type', async () => {
      const recipes = await service.getAll({ mealType: 'lunch' });

      expect(recipes).toHaveLength(1);
      expect(recipes[0].name).toBe('Quick Beef Tacos');
    });

    it('should sort by name ascending (default)', async () => {
      const recipes = await service.getAll({ sortBy: 'name' });

      expect(recipes[0].name).toBe('Lemon Herb Chicken');
      expect(recipes[2].name).toBe('Vegetable Stir Fry');
    });

    it('should sort by rating descending', async () => {
      const recipes = await service.getAll({ sortBy: 'rating', sortOrder: 'desc' });

      expect(recipes[0].rating).toBe(5);
      expect(recipes[1].rating).toBe(4);
    });

    it('should sort by timesMade descending', async () => {
      const recipes = await service.getAll({ sortBy: 'timesMade', sortOrder: 'desc' });

      expect(recipes[0].timesMade).toBe(12);
    });

    it('should limit results', async () => {
      const recipes = await service.getAll({ limit: 2 });

      expect(recipes).toHaveLength(2);
    });
  });

  describe('getCuisines', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(testHistory));
      await service.load();
    });

    it('should return unique cuisines sorted', async () => {
      const cuisines = await service.getCuisines();

      expect(cuisines).toEqual(['Asian', 'Mediterranean', 'Mexican']);
    });
  });

  describe('getCount', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(testHistory));
      await service.load();
    });

    it('should return recipe count', async () => {
      const count = await service.getCount();

      expect(count).toBe(3);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(testHistory));
      await service.load();
    });

    it('should return recipe statistics', async () => {
      const stats = await service.getStats();

      expect(stats.totalRecipes).toBe(3);
      expect(stats.recipesMade).toBe(3); // All have timesMade > 0
      expect(stats.topRated).toHaveLength(3);
      expect(stats.topRated[0].rating).toBe(5);
      expect(stats.mostMade).toHaveLength(3);
      expect(stats.mostMade[0].timesMade).toBe(12);
      expect(stats.cuisineCounts).toEqual({
        Mediterranean: 1,
        Mexican: 1,
        Asian: 1,
      });
    });
  });

  describe('save', () => {
    it('should save history to disk', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await service.save(testHistory);

      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should update metadata on save', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const history: RecipeHistory = {
        recipes: [testRecipes[0]],
        metadata: {
          lastUpdated: '2020-01-01',
          totalRecipes: 0,
        },
      };

      await service.save(history);

      // Check that writeFile was called with updated metadata
      const writeCall = mockWriteFile.mock.calls[0];
      const savedData = JSON.parse(writeCall[1] as string);
      expect(savedData.metadata.totalRecipes).toBe(1);
      expect(savedData.metadata.lastUpdated).not.toBe('2020-01-01');
    });
  });

  describe('upsert', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(testHistory));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
    });

    it('should add new recipe', async () => {
      const newRecipe: HistoryRecipe = {
        ...testRecipes[0],
        id: 'recipe-new',
        name: 'New Recipe',
      };

      const result = await service.upsert(newRecipe);

      expect(result.id).toBe('recipe-new');
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should update existing recipe', async () => {
      const updatedRecipe: HistoryRecipe = {
        ...testRecipes[0],
        name: 'Updated Lemon Chicken',
      };

      const result = await service.upsert(updatedRecipe);

      expect(result.name).toBe('Updated Lemon Chicken');
    });
  });

  describe('update', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(testHistory));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
    });

    it('should update recipe by ID', async () => {
      const result = await service.update('recipe-001', { rating: 3 });

      expect(result).not.toBeNull();
      expect(result?.rating).toBe(3);
    });

    it('should return null for non-existent ID', async () => {
      const result = await service.update('non-existent', { rating: 3 });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(testHistory));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
    });

    it('should delete recipe by ID', async () => {
      const deleted = await service.delete('recipe-001');

      expect(deleted).not.toBeNull();
      expect(deleted?.id).toBe('recipe-001');
    });

    it('should return null for non-existent ID', async () => {
      const deleted = await service.delete('non-existent');

      expect(deleted).toBeNull();
    });
  });

  describe('recordMade', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(testHistory));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
    });

    it('should increment timesMade and update lastMade', async () => {
      const recipe = await service.recordMade('recipe-001');

      expect(recipe).not.toBeNull();
      expect(recipe?.timesMade).toBe(9); // Was 8, now 9
    });

    it('should update rating if provided', async () => {
      const recipe = await service.recordMade('recipe-001', undefined, 3);

      expect(recipe?.rating).toBe(3);
    });

    it('should return null for non-existent ID', async () => {
      const recipe = await service.recordMade('non-existent');

      expect(recipe).toBeNull();
    });
  });

  describe('addNote', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(testHistory));
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
    });

    it('should add note to recipe', async () => {
      const recipe = await service.addNote('recipe-001', 'This is a test note');

      expect(recipe).not.toBeNull();
      expect(recipe?.notes).toContain('This is a test note');
    });

    it('should not add duplicate notes', async () => {
      await service.addNote('recipe-001', 'First note');
      const recipe = await service.addNote('recipe-001', 'First note');

      const notesArray = Array.isArray(recipe?.notes) ? recipe.notes : [recipe?.notes];
      expect(notesArray.filter((n) => n === 'First note')).toHaveLength(1);
    });

    it('should return null for non-existent ID', async () => {
      const recipe = await service.addNote('non-existent', 'Note');

      expect(recipe).toBeNull();
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate cache', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(testHistory));

      // Load to populate cache
      await service.load();
      expect(mockReadFile).toHaveBeenCalledTimes(1);

      // Invalidate cache
      service.invalidateCache();

      // Next load should read from disk
      await service.load();
      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('historyExists', () => {
    it('should return true if file exists', () => {
      mockExistsSync.mockReturnValue(true);

      expect(service.historyExists()).toBe(true);
    });

    it('should return false if file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      expect(service.historyExists()).toBe(false);
    });
  });
});
