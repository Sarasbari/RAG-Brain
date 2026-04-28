import 'dotenv/config'
import { runPipeline } from '../src/ingestion/pipeline'

const args = process.argv.slice(2)

const sourceArg = args.find((a) => a.startsWith('--source='))
const sinceArg = args.find((a) => a.startsWith('--since='))

const sources = sourceArg
  ? [sourceArg.replace('--source=', '') as any]
  : ['notion', 'confluence', 'slack']

const since = sinceArg?.replace('--since=', '')

runPipeline({ sources, since })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Pipeline failed:', err)
    process.exit(1)
  })