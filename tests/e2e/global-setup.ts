import { execFileSync } from 'node:child_process'

export default function globalSetup() {
  execFileSync('node', ['tests/fixtures/make-fixtures.mjs'], { stdio: 'inherit' })
}
