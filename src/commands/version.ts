import path from 'node:path'
import fs from 'node:fs/promises'

export default async function (): Promise<void> {
  const packageJsonPath = path.join(import.meta.dirname, '../../package.json')
  const packageJson = await fs.readFile(packageJsonPath, 'utf8')
  const { version } = JSON.parse(packageJson)
  console.log(version)
}
