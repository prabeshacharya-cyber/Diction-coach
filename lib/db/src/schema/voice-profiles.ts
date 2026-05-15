import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const voiceProfilesTable = pgTable("voice_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  avgClarity: real("avg_clarity").notNull().default(5),
  avgConfidence: real("avg_confidence").notNull().default(5),
  avgConciseness: real("avg_conciseness").notNull().default(5),
  avgConnection: real("avg_connection").notNull().default(5),
  totalSessions: integer("total_sessions").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VoiceProfile = typeof voiceProfilesTable.$inferSelect;
