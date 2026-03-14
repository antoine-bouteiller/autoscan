import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

const dir = './migrations'

const items = readdirSync(dir)

const migrationFolders = items
  .filter((item) => {
    if (item === 'meta') {
      return false
    }

    const fullPath = join(dir, item)
    return statSync(fullPath).isDirectory()
  })
  .toSorted()

let output = `// Auto-generated file. Do not edit.\n`
output += `export const migrations = [\n`

for (const folder of migrationFolders) {
  const sqlFilePath = join(dir, folder, 'migration.sql')

  if (existsSync(sqlFilePath)) {
    const content = readFileSync(sqlFilePath, 'utf8')

    const statements = content
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) =>
        s
          .replaceAll('`', '\\`')
          .replaceAll('$', String.raw`\$`)
          .replaceAll('\n', '')
      )

    output += `  {\n    name: '${folder}',\n    statements: [\n`
    for (const statement of statements) {
      output += `      \`${statement}\`,\n`
    }
    output += `    ],\n  },\n`
  }
}

output += `]\n`

writeFileSync('./src/migrations.ts', output)
