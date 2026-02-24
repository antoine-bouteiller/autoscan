// Auto-generated file. Do not edit.
export const migrations = [
  {
    name: '20251121083546_lame_the_spike',
    sql: `CREATE TABLE \`media\` (	\`tmdb_id\` integer NOT NULL,	\`original_language\` text NOT NULL,	\`preferred_language\` text NOT NULL,	\`title\` text NOT NULL,	\`type\` text NOT NULL,	PRIMARY KEY(\`tmdb_id\`, \`type\`));`,
  },
  {
    name: '20260224183326_hot_franklin_storm',
    sql: `CREATE TABLE \`trakt_sync_history\` (	\`plex_rating_key\` text PRIMARY KEY,	\`synced_at\` integer NOT NULL);--> statement-breakpointCREATE TABLE \`trakt_tokens\` (	\`access_token\` text NOT NULL,	\`expires_at\` integer NOT NULL,	\`id\` integer PRIMARY KEY AUTOINCREMENT,	\`refresh_token\` text NOT NULL);`,
  },
]
