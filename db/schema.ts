import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * One owner-scoped record keeps the dashboard data durable without storing
 * uploaded MTS images themselves. Screenshots are processed transiently and
 * only their extracted portfolio data and import history are retained.
 */
export const dashboardState = sqliteTable("dashboard_state", {
  scope: text("scope").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
