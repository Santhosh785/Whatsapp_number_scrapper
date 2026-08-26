/** Loads .env.local (then .env) for the CLI scripts. Next.js does this itself. */
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

if (!process.env.ENGINE_MONGO_URL) {
  console.error('✖ ENGINE_MONGO_URL is not set. Copy .env.example to .env.local first.');
  process.exit(1);
}
