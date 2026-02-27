import 'dotenv/config'
import { startBot } from './wa.js'

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err)
})

startBot().catch(console.error)