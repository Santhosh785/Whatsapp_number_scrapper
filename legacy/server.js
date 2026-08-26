const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

console.log('=================================================');
console.log('   WhatsApp Group Member Extractor v2 (Fast)');
console.log('=================================================\n');

const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'wa-extractor' }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('Scan this QR code with your WhatsApp:\n');
    qrcode.generate(qr, { small: true });
    console.log('\nPhone → Settings → Linked Devices → Link a Device\n');
});

client.on('authenticated', () => {
    console.log('✅ Authenticated!');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Auth failed:', msg);
    process.exit(1);
});

client.on('ready', async () => {
    console.log('✅ Connected!\n');

    try {
        // Direct JS eval inside WhatsApp Web — much faster than getChats()
        console.log('⚡ Fetching groups directly (fast method)...');

        const groups = await client.pupPage.evaluate(async () => {
            const Store = window.require('WAWebCollections');
            const groupChats = Store.Chat.getModelsArray().filter(c => c.isGroup);
            return groupChats.map(g => ({
                id: g.id._serialized,
                name: g.name,
                memberCount: g.groupMetadata ? g.groupMetadata.participants.length : 0,
                participants: g.groupMetadata
                    ? g.groupMetadata.participants.map(p => ({
                        id: p.id._serialized,
                        isAdmin: p.isAdmin,
                        isSuperAdmin: p.isSuperAdmin
                      }))
                    : []
            }));
        });

        if (!groups || groups.length === 0) {
            // Fallback to standard method if direct eval fails
            console.log('⚠️  Direct method failed, using fallback...');
            await extractViaAPI(client);
            return;
        }

        await processGroups(groups);

    } catch (err) {
        console.log('⚠️  Fast method failed, trying fallback...');
        console.log('   Reason:', err.message);
        await extractViaAPI(client);
    }
});

async function extractViaAPI(client) {
    console.log('📋 Loading groups (this may take 30–60s for large accounts)...');
    const chats = await client.getChats();
    const groups = chats
        .filter(c => c.isGroup)
        .map(g => ({
            id: g.id._serialized,
            name: g.name,
            memberCount: g.participants.length,
            participants: g.participants.map(p => ({
                id: p.id._serialized,
                isAdmin: p.isAdmin,
                isSuperAdmin: p.isSuperAdmin
            }))
        }));
    await processGroups(groups);
}

async function processGroups(groups) {
    if (groups.length === 0) {
        console.log('❌ No groups found.');
        await client.destroy();
        process.exit(0);
    }

    console.log(`\nFound ${groups.length} group(s):\n`);
    groups.forEach((g, i) => {
        console.log(`  [${i + 1}] ${g.name} (${g.memberCount} members)`);
    });

    let selected;
    const argIndex = parseInt(process.argv[2]);

    if (groups.length === 1) {
        selected = groups[0];
        console.log(`\n✅ Auto-selected: "${selected.name}"`);
    } else if (!isNaN(argIndex) && argIndex >= 1 && argIndex <= groups.length) {
        selected = groups[argIndex - 1];
        console.log(`\n✅ Selected: "${selected.name}"`);
    } else {
        console.log('\n👆 Run again with group number:');
        groups.forEach((g, i) => console.log(`   node server.js ${i + 1}   → ${g.name}`));
        console.log('');
        await client.destroy();
        process.exit(0);
    }

    console.log(`\n🔄 Extracting ${selected.participants.length} members...`);

    const numbers = [];
    const details = [];

    for (const p of selected.participants) {
        const num = p.id.replace('@c.us', '').replace('@lid', '').replace('@s.whatsapp.net', '');
        if (!num || !/^\d+$/.test(num)) continue;
        numbers.push(num);
        const role = p.isSuperAdmin ? 'Super Admin' : p.isAdmin ? 'Admin' : 'Member';
        details.push(`${num} [${role}]`);
    }

    // Save files
    const ts = new Date().toLocaleString();
    fs.writeFileSync(
        path.join(__dirname, 'members_numbers.txt'),
        numbers.join('\n'),
        'utf8'
    );
    fs.writeFileSync(
        path.join(__dirname, 'members_details.txt'),
        `Group: ${selected.name}\nExtracted: ${ts}\nTotal: ${numbers.length}\n${'='.repeat(40)}\n` + details.join('\n'),
        'utf8'
    );

    console.log('\n=================================================');
    console.log(`✅ Saved ${numbers.length} numbers!`);
    console.log('   📄 members_numbers.txt');
    console.log('   📄 members_details.txt');
    console.log('=================================================\n');

    await client.destroy();
    process.exit(0);
}

client.on('disconnected', () => process.exit(0));

client.initialize();