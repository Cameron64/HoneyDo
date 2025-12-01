import { z } from 'zod';

// Re-export shopping schemas
export * from './shopping';

// Re-export home automation schemas
export * from './home-automation';

// Re-export recipes schemas
export * from './recipes';

// Theme schema
export const themeSchema = z.enum(['light', 'dark', 'system']);

// User role schema
export const userRoleSchema = z.enum(['admin', 'member', 'guest']);

// Notification preferences schema
export const notificationPreferencesSchema = z.object({
  enabled: z.boolean(),
  push: z.boolean(),
  sound: z.boolean(),
});

// User preferences schema
export const userPreferencesSchema = z.object({
  theme: themeSchema,
  accentColor: z.string().optional(),
  notifications: notificationPreferencesSchema,
});

// Partial user preferences for updates
export const updateUserPreferencesSchema = userPreferencesSchema.partial();

// User schema
export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  role: userRoleSchema,
  preferences: userPreferencesSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Module schema
export const moduleSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
});

// User module schema
export const userModuleSchema = z.object({
  userId: z.string(),
  moduleId: z.string(),
  enabled: z.boolean(),
  config: z.record(z.unknown()).nullable(),
});

// Toggle module input
export const toggleModuleInputSchema = z.object({
  moduleId: z.string(),
  enabled: z.boolean(),
});

// Update module config input
export const updateModuleConfigInputSchema = z.object({
  moduleId: z.string(),
  config: z.record(z.unknown()),
});

// Inferred types from schemas (for validation purposes)
export type ThemeSchema = z.infer<typeof themeSchema>;
export type UserRoleSchema = z.infer<typeof userRoleSchema>;
export type NotificationPreferencesSchema = z.infer<typeof notificationPreferencesSchema>;
export type UserPreferencesSchema = z.infer<typeof userPreferencesSchema>;
export type UpdateUserPreferencesSchema = z.infer<typeof updateUserPreferencesSchema>;
export type UserSchema = z.infer<typeof userSchema>;
export type ModuleSchema = z.infer<typeof moduleSchema>;
export type UserModuleSchema = z.infer<typeof userModuleSchema>;
export type ToggleModuleInput = z.infer<typeof toggleModuleInputSchema>;
export type UpdateModuleConfigInput = z.infer<typeof updateModuleConfigInputSchema>;
