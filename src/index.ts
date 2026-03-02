import 'dotenv/config'
import { startBot } from './wa.ts'

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err)
})

startBot().catch(console.error)