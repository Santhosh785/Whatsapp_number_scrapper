import path from 'node:path';
import mongoose from 'mongoose';
import { Client, RemoteAuth } from 'whatsapp-web.js';
import { MongoStore } from 'wwebjs-mongo';

export const SESSION_ID = 'focas-leads';

/** True when running inside a Vercel (or other read-only-fs) serverless function. */
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

/**
 * RemoteAuth unzips the restored session to disk before Chromium can use it.
 * On Vercel only /tmp is writable, so the session lands there and is discarded
 * when the function freezes — MongoDB remains the source of truth.
 */
const DATA_PATH = IS_SERVERLESS
  ? '/tmp/wwebjs_auth'
  : path.join(process.cwd(), '.wwebjs_auth');

let mongoosePromise: Promise<typeof mongoose> | null = null;

/**
 * wwebjs-mongo talks to Mongo through mongoose, which is a separate connection
 * from the native driver used by the rest of the app. Cached the same way so a
 * warm function does not reconnect.
 */
function connectMongoose() {
  const uri = process.env.ENGINE_MONGO_URL;
  if (!uri) throw new Error('ENGINE_MONGO_URL is not set.');
  mongoosePromise ??= mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  return mongoosePromise;
}

export async function getSessionStore(): Promise<MongoStore> {
  await connectMongoose();
  return new MongoStore({ mongoose });
}

/** Whether a linked-device session is already stored in MongoDB. */
export async function hasStoredSession(): Promise<boolean> {
  const store = await getSessionStore();
  // wwebjs-mongo appends "-<clientId>" internally when RemoteAuth saves.
  return store.sessionExists({ session: `RemoteAuth-${SESSION_ID}` });
}

export async function deleteStoredSession(): Promise<void> {
  const store = await getSessionStore();
  await store.delete({ session: `RemoteAuth-${SESSION_ID}` }).catch(() => {});
}

/** Resolve the Chromium binary: bundled @sparticuz build on Vercel, local Chrome otherwise. */
async function resolveBrowser(): Promise<{ executablePath: string; args: string[] }> {
  if (IS_SERVERLESS) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return {
      executablePath: await chromium.executablePath(),
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
    };
  }

  const local =
    process.env.CHROME_PATH ||
    ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium']
      .find((p) => require('node:fs').existsSync(p));

  if (!local) {
    throw new Error(
      'No local Chromium found. Install Chrome/Chromium or set CHROME_PATH in .env.local.',
    );
  }
  return {
    executablePath: local,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };
}

/**
 * Build a client backed by the MongoDB-stored session. Nothing is launched
 * until `client.initialize()` is called.
 */
export async function createClient(): Promise<Client> {
  const store = await getSessionStore();
  const { executablePath, args } = await resolveBrowser();

  return new Client({
    authStrategy: new RemoteAuth({
      store,
      clientId: SESSION_ID,
      dataPath: DATA_PATH,
      // Minimum accepted by RemoteAuth. A sync run is shorter than this, so in
      // practice the session is written back on the explicit save below.
      backupSyncIntervalMs: 60_000,
    }),
    puppeteer: {
      headless: true,
      executablePath,
      args,
      // Cold Chromium on Lambda-class hardware is slow to hand over a page.
      timeout: 120_000,
    },
    // Pin the WA Web build so a WhatsApp release cannot silently break the
    // Store selectors the extractor relies on.
    webVersionCache: {
      type: 'remote',
      remotePath:
        'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1027725712-alpha.html',
    },
  });
}
