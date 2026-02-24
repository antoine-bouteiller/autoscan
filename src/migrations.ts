// Auto-generated file. Do not edit.
export const migrations = [
  {
    name: '20251121083546_lame_the_spike',
    sql: `CREATE TABLE \`media\` (	\`tmdb_id\` integer NOT NULL,	\`original_language\` text NOT NULL,	\`preferred_language\` text NOT NULL,	\`title\` text NOT NULL,	\`type\` text NOT NULL,	PRIMARY KEY(\`tmdb_id\`, \`type\`));`,
  },
]
