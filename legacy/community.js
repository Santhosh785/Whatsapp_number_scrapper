const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

console.log('=================================================');
console.log('   WhatsApp Community Lead Extractor');
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

client.on('authenticated', () => console.log('✅ Authenticated!'));

client.on('auth_failure', (msg) => {
    console.error('❌ Auth failed:', msg);
    process.exit(1);
});

client.on('ready', async () => {
    console.log('✅ Connected!');
    console.log('⏳ Waiting for the chat store to sync...');

    // Chats stream in after 'ready'; poll until groups appear.
    let groupsReady = 0;
    for (let i = 0; i < 24; i++) {
        groupsReady = await client.pupPage.evaluate(
            () => window.require('WAWebCollections').Chat.getModelsArray()
                .filter((c) => c.id.server === 'g.us').length
        );
        if (groupsReady > 0) break;
        await new Promise((r) => setTimeout(r, 5000));
    }

    if (!groupsReady) {
        console.log('\n❌ No groups synced after 2 minutes. Make sure your phone is online.\n');
        await client.destroy();
        process.exit(1);
    }

    console.log(`⚡ ${groupsReady} groups synced. Reading members...\n`);

    try {
        const groups = await client.pupPage.evaluate(async () => {
            const Store = window.require('WAWebCollections');
            const GM = Store.WAWebGroupMetadataCollection;

            // Groups are identified by the 'g.us' server. The chat.isGroup flag no
            // longer exists in current WhatsApp Web builds.
            const chats = Store.Chat.getModelsArray().filter((c) => c.id.server === 'g.us');

            const out = [];
            for (const chat of chats) {
                let md = chat.groupMetadata;
                let parts = md?.participants?.getModelsArray?.() ?? [];

                // Metadata loads lazily, so a group can report zero members simply
                // because it has not been fetched yet. Force-load those.
                if (parts.length === 0) {
                    try {
                        md = await GM.find(chat.id);
                        parts = md?.participants?.getModelsArray?.() ?? [];
                    } catch { /* leave empty */ }
                }

                out.push({
                    id: chat.id._serialized,
                    name: chat.name || chat.formattedTitle || chat.id.user,
                    parentId: md?.parentGroup?._serialized || null,
                    participants: parts.map((p) => {
                        // Participant ids are '@lid' privacy identifiers; the real
                        // number lives on the linked contact record.
                        const contact = p.contact;
                        let phone = null;
                        const raw = contact?.phoneNumber;
                        if (raw) {
                            const u = raw.user ?? String(raw).split('@')[0];
                            if (/^\d{8,}$/.test(u)) phone = u;
                        }
                        if (!phone && contact?.id?.server === 'c.us') phone = contact.id.user;
                        if (!phone && p.id.server === 'c.us') phone = p.id.user;

                        return {
                            lid: p.id._serialized,
                            phone,
                            name: contact?.name || contact?.pushname || contact?.verifiedName || '',
                            isAdmin: !!p.isAdmin,
                            isSuperAdmin: !!p.isSuperAdmin
                        };
                    })
                });
            }
            return out;
        });

        await processCommunities(groups);
    } catch (err) {
        console.error('❌ Failed to read groups:', err.message);
        await client.destroy();
        process.exit(1);
    }
});

// The community parent group is usually not in your chat list (you are in the
// subgroups, not the announcement group), so communities are reconstructed from
// the parentGroup back-references on the subgroups themselves.
function buildCommunities(groups) {
    const byParent = new Map();
    for (const g of groups) {
        if (!g.parentId) continue;
        if (!byParent.has(g.parentId)) byParent.set(g.parentId, []);
        byParent.get(g.parentId).push(g);
    }
    return [...byParent.entries()].map(([parentId, subgroups]) => ({
        parentId,
        // No readable community title, so name it after its largest subgroup.
        label: [...subgroups].sort((a, b) => b.participants.length - a.participants.length)[0].name,
        subgroups
    }));
}

function collectMembers(subgroups) {
    const byKey = new Map();
    for (const g of subgroups) {
        for (const p of g.participants) {
            const key = p.phone || p.lid;
            const existing = byKey.get(key);
            if (existing) {
                existing.isAdmin = existing.isAdmin || p.isAdmin;
                existing.isSuperAdmin = existing.isSuperAdmin || p.isSuperAdmin;
                existing.name = existing.name || p.name;
                existing.groups.push(g.name);
            } else {
                byKey.set(key, { ...p, groups: [g.name] });
            }
        }
    }
    return [...byKey.values()];
}

async function processCommunities(groups) {
    const communities = buildCommunities(groups);
    const standalone = groups.filter((g) => !g.parentId);

    if (communities.length === 0) {
        console.log('❌ None of your groups belong to a community.\n');
        await client.destroy();
        process.exit(0);
    }

    console.log(`Found ${communities.length} community/communities:\n`);
    communities.forEach((c, i) => {
        const members = collectMembers(c.subgroups);
        console.log(`  [${i + 1}] ${c.label}`);
        console.log(`       ${c.subgroups.length} subgroup(s) you are in, ${members.length} unique member(s)`);
        c.subgroups.forEach((g) => console.log(`         - ${g.name} (${g.participants.length})`));
        console.log('');
    });

    if (standalone.length) {
        console.log(`  (${standalone.length} group(s) not in any community: ${standalone.map((g) => g.name).join(', ')})\n`);
    }

    const argIndex = parseInt(process.argv[2]);
    let selected;

    if (communities.length === 1) {
        selected = communities[0];
        console.log(`✅ Auto-selected: "${selected.label}"`);
    } else if (!isNaN(argIndex) && argIndex >= 1 && argIndex <= communities.length) {
        selected = communities[argIndex - 1];
        console.log(`✅ Selected: "${selected.label}"`);
    } else {
        console.log('👆 Run again with the community number:');
        communities.forEach((c, i) => console.log(`   node community.js ${i + 1}   → ${c.label}`));
        console.log('');
        await client.destroy();
        process.exit(0);
    }

    const members = collectMembers(selected.subgroups);
    const withPhone = members.filter((m) => m.phone);
    const hidden = members.filter((m) => !m.phone);
    const admins = members.filter((m) => m.isAdmin || m.isSuperAdmin);

    console.log(`\n🔄 ${members.length} unique members — ${withPhone.length} with a number, ${hidden.length} unresolved.`);

    const ts = new Date().toLocaleString();
    const header = (label, n) =>
        `Community: ${selected.label}\nParent group: ${selected.parentId}\n${label}\nExtracted: ${ts}\nTotal: ${n}\n${'='.repeat(50)}\n`;

    const line = (m) => {
        const role = m.isSuperAdmin ? 'Super Admin' : m.isAdmin ? 'Admin' : 'Member';
        const who = m.phone || `${m.lid} (unresolved)`;
        const nm = m.name ? ` ${m.name}` : '';
        return `${who}${nm} [${role}] — ${[...new Set(m.groups)].join(' | ')}`;
    };

    fs.writeFileSync(
        path.join(__dirname, 'community_numbers.txt'),
        withPhone.map((m) => m.phone).join('\n'),
        'utf8'
    );
    fs.writeFileSync(
        path.join(__dirname, 'community_details.txt'),
        header('All members', members.length) + members.map(line).join('\n'),
        'utf8'
    );
    fs.writeFileSync(
        path.join(__dirname, 'community_admins.txt'),
        header('Admins / community leaders', admins.length) + admins.map(line).join('\n'),
        'utf8'
    );

    console.log('\n=================================================');
    console.log(`✅ Saved ${withPhone.length} numbers, ${admins.length} admins!`);
    console.log('   📄 community_numbers.txt   (plain numbers)');
    console.log('   📄 community_details.txt   (name, role, subgroups)');
    console.log('   📄 community_admins.txt    (admins only)');
    if (hidden.length) {
        console.log(`\n⚠️  ${hidden.length} member(s) had no resolvable number.`);
    }
    console.log('=================================================\n');

    await client.destroy();
    process.exit(0);
}

client.on('disconnected', () => process.exit(0));

client.initialize();
