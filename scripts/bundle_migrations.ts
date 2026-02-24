import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
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

    const safeContent = content
      .replaceAll('`', '\\`')
      .replaceAll('$', String.raw`\$`)
      .replaceAll('\n', '')

    output += `  {\n    name: '${folder}',\n    sql: \`${safeContent}\`,\n  },\n`
  }
}

output += `]\n`

await Bun.write('./src/migrations.ts', output)
