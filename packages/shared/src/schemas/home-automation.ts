import { z } from 'zod';

// ============================================
// Home Assistant Domains
// ============================================

/**
 * Supported Home Assistant entity domains
 */
export const haDomainSchema = z.enum([
  'light',
  'switch',
  'fan',
  'climate',
  'lock',
  'cover',
  'sensor',
  'binary_sensor',
]);

export type HADomain = z.infer<typeof haDomainSchema>;

// Domains that support actions (not read-only)
export const CONTROLLABLE_DOMAINS: HADomain[] = [
  'light',
  'switch',
  'fan',
  'climate',
  'lock',
  'cover',
];

// Domains that are read-only
export const READONLY_DOMAINS: HADomain[] = ['sensor', 'binary_sensor'];

// Domains that require confirmation before action
export const SENSITIVE_DOMAINS: HADomain[] = ['lock', 'cover'];

// ============================================
// Entity Schema
// ============================================

export const haEntitySchema = z.object({
  entityId: z.string(), // light.living_room
  domain: haDomainSchema,
  friendlyName: z.string().nullable(),
  state: z.string().nullable(), // on, off, 72, unavailable, etc.
  attributes: z.record(z.unknown()).nullable(),
  areaId: z.string().nullable(),
  lastChanged: z.string().nullable(),
  lastUpdated: z.string().nullable(),
});

export type HAEntity = z.infer<typeof haEntitySchema>;

// ============================================
// Configuration Schemas
// ============================================

export const haConfigSchema = z.object({
  id: z.number(),
  url: z.string(),
  isConnected: z.boolean(),
  lastConnectedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type HAConfig = z.infer<typeof haConfigSchema>;

// Config status (without sensitive token)
export const haConfigStatusSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  lastConnectedAt: z.string().nullable(),
  lastError: z.string().nullable(),
});

export type HAConfigStatus = z.infer<typeof haConfigStatusSchema>;

// Input for configuring HA connection
export const configureHAInputSchema = z.object({
  url: z.string().url('Please enter a valid URL'),
  accessToken: z.string().min(1, 'Access token is required'),
});

export type ConfigureHAInput = z.infer<typeof configureHAInputSchema>;

// Test connection response
export const testConnectionResponseSchema = z.object({
  success: z.boolean(),
  entityCount: z.number().optional(),
  error: z.string().optional(),
});

export type TestConnectionResponse = z.infer<typeof testConnectionResponseSchema>;

// ============================================
// Scene Schemas
// ============================================

export const sceneActionSchema = z.object({
  entityId: z.string(),
  domain: haDomainSchema,
  service: z.string(), // turn_on, turn_off, toggle, set_temperature, etc.
  data: z.record(z.unknown()).optional(), // brightness, temperature, etc.
});

export type SceneAction = z.infer<typeof sceneActionSchema>;

export const haSceneSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  description: z.string().nullable(),
  actions: z.array(sceneActionSchema),
  createdBy: z.string(),
  isShared: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type HAScene = z.infer<typeof haSceneSchema>;

export const createSceneSchema = z.object({
  name: z.string().min(1, 'Scene name is required').max(100),
  icon: z.string().optional(),
  description: z.string().max(500).optional(),
  actions: z.array(sceneActionSchema).min(1, 'At least one action is required'),
  isShared: z.boolean().default(true),
});

export type CreateSceneInput = z.infer<typeof createSceneSchema>;

export const updateSceneSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  icon: z.string().nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  actions: z.array(sceneActionSchema).min(1).optional(),
  isShared: z.boolean().optional(),
});

export type UpdateSceneInput = z.infer<typeof updateSceneSchema>;

// ============================================
// Favorites Schemas
// ============================================

export const haFavoriteSchema = z.object({
  id: z.string(),
  userId: z.string(),
  entityId: z.string(),
  displayName: z.string().nullable(),
  icon: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: z.string(),
});

export type HAFavorite = z.infer<typeof haFavoriteSchema>;

export const addFavoriteSchema = z.object({
  entityId: z.string(),
  displayName: z.string().max(100).optional(),
  icon: z.string().optional(),
});

export type AddFavoriteInput = z.infer<typeof addFavoriteSchema>;

export const updateFavoriteSchema = z.object({
  id: z.string(),
  displayName: z.string().max(100).nullable().optional(),
  icon: z.string().nullable().optional(),
});

export type UpdateFavoriteInput = z.infer<typeof updateFavoriteSchema>;

export const reorderFavoritesSchema = z.object({
  favoriteIds: z.array(z.string()).min(1),
});

export type ReorderFavoritesInput = z.infer<typeof reorderFavoritesSchema>;

// ============================================
// Service Call Schemas
// ============================================

export const serviceCallSchema = z.object({
  entityId: z.string(),
  domain: haDomainSchema,
  service: z.string(), // turn_on, turn_off, toggle, etc.
  data: z.record(z.unknown()).optional(),
});

export type ServiceCallInput = z.infer<typeof serviceCallSchema>;

// Quick toggle - just entity ID
export const toggleEntitySchema = z.object({
  entityId: z.string(),
});

export type ToggleEntityInput = z.infer<typeof toggleEntitySchema>;

// ============================================
// Action Log Schemas
// ============================================

export const haActionLogSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  actionType: z.enum(['service_call', 'scene_activate']),
  details: z.record(z.unknown()),
  status: z.enum(['success', 'error']),
  errorMessage: z.string().nullable(),
  executedAt: z.string(),
});

export type HAActionLog = z.infer<typeof haActionLogSchema>;

// ============================================
// AI Command Schemas
// ============================================

export const aiCommandSchema = z.object({
  command: z.string().min(1, 'Command is required').max(500),
});

export type AICommandInput = z.infer<typeof aiCommandSchema>;

export const aiCommandResponseSchema = z.object({
  understood: z.boolean(),
  actions: z.array(
    z.object({
      entityId: z.string(),
      domain: haDomainSchema,
      service: z.string(),
      data: z.record(z.unknown()).optional(),
    })
  ),
  confirmationRequired: z.boolean(),
  message: z.string(),
});

export type AICommandResponse = z.infer<typeof aiCommandResponseSchema>;

// ============================================
// State Changed Event
// ============================================

export const stateChangedEventSchema = z.object({
  entityId: z.string(),
  oldState: z.string().nullable(),
  newState: z.string(),
  attributes: z.record(z.unknown()).optional(),
});

export type StateChangedEvent = z.infer<typeof stateChangedEventSchema>;

// ============================================
// Entity with Favorite Info (for UI)
// ============================================

export interface HAEntityWithFavorite extends HAEntity {
  isFavorite: boolean;
  favorite?: HAFavorite;
}
