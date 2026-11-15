import { spawn } from 'node:child_process'
import process from 'node:process'

const isWin = process.platform === 'win32'
const pnpmCmd = isWin ? 'pnpm.cmd' : 'pnpm'
const children = []

function killTree(child) {
  if (!child?.pid) return
  if (isWin) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    child.kill('SIGTERM')
  }
}

function start(name, args) {
  const child = spawn(pnpmCmd, args, {
    stdio: 'inherit',
    shell: isWin,
    env: process.env,
  })
  children.push(child)
  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`)
      process.exitCode = code
    }
  })
  return child
}

console.log('[dev:all] Applying local D1 migrations...')
const migrate = spawn(pnpmCmd, ['run', 'db:migrate:local'], {
  stdio: 'inherit',
  shell: isWin,
  env: process.env,
})

migrate.on('exit', (code) => {
  if (code !== 0) {
    console.error('[dev:all] Local D1 migration failed, exit code:', code)
    process.exit(code ?? 1)
  }
  start('worker', ['run', 'dev:worker'])
  start('vite', ['run', 'dev:web'])
  const shutdown = () => {
    for (const c of children) killTree(c)
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
})
