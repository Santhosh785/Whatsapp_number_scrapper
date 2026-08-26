/**
 * Run a full extraction from your own machine and write to the same MongoDB
 * the dashboard reads.
 *
 * Use this when the Vercel function runs out of time on a large account, or to
 * backfill without waiting for the weekly cron:
 *
 *   npm run sync
 */
import './env';
import { runSync } from '../lib/wa/sync';

const started = Date.now();

runSync('cli')
  .then((run) => {
    if (run.status === 'failed') {
      console.error(`\n✖ Sync failed after ${((Date.now() - started) / 1000).toFixed(0)}s`);
      console.error(`  ${run.error}`);
      process.exit(1);
    }

    const s = run.stats;
    console.log('\n─────────────────────────────────────────');
    console.log(`✔ Sync complete in ${((Date.now() - started) / 1000).toFixed(0)}s`);
    console.log(`  Sources        ${s.sources}`);
    console.log(`  Leads seen     ${s.leadsSeen}`);
    console.log(`  New            ${s.newLeads}`);
    console.log(`  Updated        ${s.updatedLeads}`);
    console.log(`  Unresolved     ${s.unresolved}`);
    console.log('─────────────────────────────────────────\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('✖ Unexpected failure:', err);
    process.exit(1);
  });
