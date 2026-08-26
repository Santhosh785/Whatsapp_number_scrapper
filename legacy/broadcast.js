/**
 * WhatsApp Broadcast List Extractor
 *
 * Reads the WhatsApp Web Store directly instead of going through
 * whatsapp-web.js's Client.inject(), which breaks on current WA Web builds:
 * the page reloads itself once after the initial sync and destroys the
 * execution context mid-injection. Here we simply wait for that reload to
 * settle before touching the page.
 *
 * Recipients of a broadcast list live in
 *   chat.broadcastMetadata.audienceExpression.userJids
 * as @lid ids, which are resolved to phone numbers via the Contact store.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(__dirname, '.wwebjs_auth', 'session-wa-extractor');
const WA_URL = 'https://web.whatsapp.com/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.67 Safari/537.36';

console.log('=================================================');
console.log('   WhatsApp Broadcast List Extractor');
console.log('=================================================\n');

/** Wait for the chat list, then for the page to stop navigating. */
async function waitUntilSettled(page) {
    let lastNav = Date.now();
    page.on('framenavigated', (f) => {
        if (f === page.mainFrame()) lastNav = Date.now();
    });

    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
        const loggedIn = await page
            .evaluate(() => !!document.querySelector('#pane-side'))
            .catch(() => false); // reload in flight
        if (loggedIn && Date.now() - lastNav > 8000) return true;

        const needsQr = await page
            .evaluate(() => !document.querySelector('#pane-side') && !!document.querySelector('canvas'))
            .catch(() => false);
        if (needsQr && Date.now() - lastNav > 10000) return false;

        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('timed out waiting for WhatsApp Web to load');
}

/** Read every broadcast list plus its recipients, resolved to phone numbers. */
function readBroadcastLists() {
    const Store = window.require('WAWebCollections');
    const ApiContact = (() => {
        try { return window.require('WAWebApiContact'); } catch { return null; }
    })();

    const toNumber = (value) => {
        if (!value) return null;
        const s = typeof value === 'string' ? value : (value.user ? value.user : String(value._serialized || value));
        const digits = s.split('@')[0].replace(/\D/g, '');
        return digits || null;
    };

    const resolveJid = (jid) => {
        const contact = Store.Contact.get(jid);
        if (contact) {
            const n = toNumber(contact.phoneNumber);
            if (n) return { number: n, name: contact.name || contact.pushname || contact.verifiedName || '', via: 'contact' };
        }
        if (ApiContact && ApiContact.getPhoneNumber) {
            try {
                const n = toNumber(ApiContact.getPhoneNumber(contact ? contact.id : jid));
                if (n) return { number: n, name: contact?.name || '', via: 'api' };
            } catch { /* unmapped */ }
        }
        // Already a plain phone jid (older lists predate @lid)
        if (jid.endsWith('@c.us')) return { number: toNumber(jid), name: contact?.name || '', via: 'jid' };
        return { number: null, name: contact?.name || '', via: null, jid };
    };

    return Store.Chat.getModelsArray()
        .filter((c) => c.id.server === 'broadcast' && c.id.user !== 'status')
        .map((c) => {
            const jids = c.broadcastMetadata?.audienceExpression?.userJids || [];
            return {
                id: c.id._serialized,
                name: c.name || c.formattedTitle || c.id.user,
                declaredCount: c.broadcastRecipientCount ?? jids.length,
                audienceType: c.broadcastMetadata?.audienceExpression?.type || 'UNKNOWN',
                recipients: jids.map(resolveJid),
            };
        });
}

function writeOutput(list) {
    const resolved = list.recipients.filter((r) => r.number);
    const unresolved = list.recipients.filter((r) => !r.number);

    const safe = list.name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase().slice(0, 40) || 'broadcast';
    const numbersFile = path.join(__dirname, `broadcast_${safe}_numbers.txt`);
    const detailsFile = path.join(__dirname, `broadcast_${safe}_details.txt`);

    fs.writeFileSync(numbersFile, resolved.map((r) => r.number).join('\n') + '\n', 'utf8');

    const header =
        `Broadcast list: ${list.name}\n` +
        `Extracted: ${new Date().toLocaleString()}\n` +
        `Total: ${resolved.length}${unresolved.length ? ` (+${unresolved.length} unresolved)` : ''}\n` +
        '='.repeat(40) + '\n';
    const body = resolved.map((r) => (r.name ? `${r.number} [${r.name}]` : r.number)).join('\n');
    const tail = unresolved.length
        ? '\n' + '-'.repeat(40) + '\nUnresolved (no phone number mapped locally):\n' +
          unresolved.map((r) => r.jid).join('\n')
        : '';
    fs.writeFileSync(detailsFile, header + body + tail + '\n', 'utf8');

    return { numbersFile, detailsFile, resolved, unresolved };
}

(async () => {
    if (!fs.existsSync(SESSION_DIR)) {
        console.error('❌ No saved session at .wwebjs_auth/session-wa-extractor');
        process.exit(1);
    }

    const browser = await puppeteer.launch({
        headless: true,
        userDataDir: SESSION_DIR,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
        const page = (await browser.pages())[0] || (await browser.newPage());
        await page.setUserAgent(UA);

        console.log('🌐 Opening WhatsApp Web...');
        await page.goto(WA_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });

        console.log('⏳ Waiting for sync (WhatsApp reloads once — this is normal)...');
        const loggedIn = await waitUntilSettled(page);

        if (!loggedIn) {
            const shot = path.join(__dirname, 'login-qr.png');
            await page.screenshot({ path: shot });
            console.log('\n❌ Not logged in. QR code saved to: login-qr.png');
            console.log('   Open that image and scan it: Phone → Settings → Linked Devices\n');
            process.exit(1);
        }
        console.log('✅ Connected!\n');

        const lists = await page.evaluate(readBroadcastLists);

        if (lists.length === 0) {
            console.log('❌ No broadcast lists found on this account.\n');
            process.exit(0);
        }

        console.log(`Found ${lists.length} broadcast list(s):\n`);
        lists.forEach((b, i) => {
            const ok = b.recipients.filter((r) => r.number).length;
            console.log(`  [${i + 1}] ${b.name} — ${ok}/${b.declaredCount} recipients resolved`);
        });

        const arg = process.argv[2];
        let selected = [];

        if (arg === 'all') {
            selected = lists;
            console.log('\n✅ Extracting all lists');
        } else {
            const idx = parseInt(arg, 10);
            if (!isNaN(idx) && idx >= 1 && idx <= lists.length) {
                selected = [lists[idx - 1]];
                console.log(`\n✅ Selected: "${lists[idx - 1].name}"`);
            } else {
                console.log('\n👆 Run again with the list number:');
                lists.forEach((b, i) => console.log(`   node broadcast.js ${i + 1}   → ${b.name}`));
                console.log('   node broadcast.js all → every list\n');
                process.exit(0);
            }
        }

        console.log('');
        for (const list of selected) {
            const { numbersFile, detailsFile, resolved, unresolved } = writeOutput(list);
            console.log(`📄 ${list.name}: ${resolved.length} numbers`);
            console.log(`   ${path.basename(numbersFile)}`);
            console.log(`   ${path.basename(detailsFile)}`);
            if (unresolved.length) {
                console.log(`   ⚠️  ${unresolved.length} recipient(s) had no local phone-number mapping`);
            }
        }
        console.log('\n=================================================');
        console.log('✅ Done!');
        console.log('=================================================\n');
    } finally {
        await browser.close();
    }
    process.exit(0);
})().catch((err) => {
    console.error('\n❌ Failed:', err.message);
    process.exit(1);
});
