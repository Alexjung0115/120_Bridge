// Validates rag-data and AI1 evidence inputs without writing the corpus (T013).
// Writes data/validation-report.json and exits 1 on errors. Usage: npm run data:validate
import { buildCorpus, writeJson } from "./build-corpus";

const { report } = buildCorpus();
writeJson("data/validation-report.json", report);
for (const issue of report.errors) console.error(`ERROR ${issue.target}: ${issue.message}`);
console.log(`${report.corpusVersion}: ${report.errors.length} errors, ${report.warnings.length} warnings, ${report.excluded.length} exclusions`);
if (!report.ok) process.exit(1);
