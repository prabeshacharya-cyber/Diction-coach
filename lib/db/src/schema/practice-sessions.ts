import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const practiceSessionsTable = pgTable("practice_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  promptLabel: text("prompt_label"),
  promptText: text("prompt_text"),
  transcript: text("transcript").notNull(),
  wordCount: integer("word_count").notNull(),
  wpm: integer("wpm").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  feedback: text("feedback"),
  bodyLanguageAnalysis: text("body_language_analysis"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPracticeSessionSchema = createInsertSchema(practiceSessionsTable).omit({ id: true, createdAt: true });
export const selectPracticeSessionSchema = createSelectSchema(practiceSessionsTable);
export type InsertPracticeSession = z.infer<typeof insertPracticeSessionSchema>;
export type PracticeSession = typeof practiceSessionsTable.$inferSelect;
