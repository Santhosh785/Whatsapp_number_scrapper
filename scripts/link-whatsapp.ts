/**
 * Link WhatsApp from the terminal instead of the dashboard. The QR is printed
 * to the console and the resulting session is saved to MongoDB, so a Vercel
 * deployment picks it up without any further setup.
 *
 *   npm run link-whatsapp
 */
import './env';
import qrcodeTerminal from 'qrcode-terminal';
import { createClient, deleteStoredSession } from '../lib/wa/client';

(async () => {
  console.log('Clearing any existing stored session…');
  await deleteStoredSession();

  const client = await createClient();

  client.on('qr', (qr) => {
    console.log('\nScan this with WhatsApp → Settings → Linked Devices → Link a Device:\n');
    qrcodeTerminal.generate(qr, { small: true });
  });

  client.on('authenticated', () => console.log('\n✔ Authenticated — saving session to MongoDB…'));

  client.on('remote_session_saved', () => {
    console.log('✔ Session stored in MongoDB. Vercel can now sync.\n');
    setTimeout(() => process.exit(0), 1000);
  });

  client.on('ready', () => console.log('✔ WhatsApp ready. Waiting for the session upload…'));

  client.on('auth_failure', (m) => {
    console.error('✖ Authentication failed:', m);
    process.exit(1);
  });

  await client.initialize();
})().catch((err) => {
  console.error('✖ Failed:', err.message);
  process.exit(1);
});
