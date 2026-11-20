import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const distDir = path.join(root, 'dist')
const targetDir = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'web')

if (!fs.existsSync(distDir)) {
  throw new Error('dist/ does not exist. Run pnpm build:web first.')
}

fs.rmSync(targetDir, { recursive: true, force: true })
fs.mkdirSync(targetDir, { recursive: true })
fs.cpSync(distDir, targetDir, { recursive: true })
console.log(`Synced web bundle -> ${targetDir}`)
