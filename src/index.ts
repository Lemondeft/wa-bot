import 'dotenv/config'
import { startBot } from './wa.js'

startBot().catch(console.error)