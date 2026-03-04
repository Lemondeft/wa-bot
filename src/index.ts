import fs from 'fs'
import path from 'path'

const PID_FILE = path.join(process.cwd(), 'bot.pid')

if (fs.existsSync(PID_FILE)) {
    const oldPid = fs.readFileSync(PID_FILE, 'utf8')
    try {
        process.kill(parseInt(oldPid), 0)
        console.error('❌ Bot is already running! PID:', oldPid)
        console.error('Kill it with: kill', oldPid)
    } catch {
        fs.unlinkSync(PID_FILE)
    }
}

fs.writeFileSync(PID_FILE, process.pid.toString())

process.on('exit', () => {
    try { fs.unlinkSync(PID_FILE) } catch {}
})

process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Cleaning up...')
    try { fs.unlinkSync(PID_FILE) } catch {}
    process.exit(0)
})

process.on('SIGTERM', () => {
    try { fs.unlinkSync(PID_FILE) } catch {}
    process.exit(0)
})

import 'dotenv/config'
import { startBot } from './wa.ts'

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err)
})

startBot().catch(console.error)