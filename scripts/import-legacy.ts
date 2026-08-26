/**
 * One-off backfill: load the .txt files produced by the old scripts
 * (legacy/exports/) into MongoDB so the dashboard has history from day one.
 *
 *   npm run import-legacy
 *
 * Safe to re-run — it goes through the same merge path as a live sync, so
 * re-importing does not duplicate leads.
 */
import './env';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureIndexes } from '../lib/mongo';
import { persistSources } from '../lib/wa/store';
import type { ExtractedSource } from '../lib/wa/extract';
import type { Role } from '../lib/types';

const DIR = join(process.cwd(), 'legacy', 'exports');

/** `918667084287 Some Name [Admin] — Group A | Group B` */
const MEMBER_RE = /^(\S+)\s*(.*?)\s*\[(Super Admin|Admin|Member)\]\s*—\s*(.*)$/;

/** `918807097102 [Jagadheeshwaran]` or a bare number */
const BROADCAST_RE = /^(\d{6,})\s*(?:\[(.*)\])?\s*$/;

function parseCommunityFile(text: string, fallbackLabel: string): ExtractedSource | null {
  const lines = text.split('\n');
  const label = lines.find((l) => l.startsWith('Community:'))?.slice(10).trim() || fallbackLabel;
  const parentId =
    lines.find((l) => l.startsWith('Parent group:'))?.slice(13).trim() || `legacy:${fallbackLabel}`;

  const members: ExtractedSource['members'] = [];
  const groupNames = new Set<string>();

  for (const line of lines) {
    const m = line.match(MEMBER_RE);
    if (!m) continue;

    const [, who, name, role, groupsRaw] = m;
    const groups = groupsRaw.split('|').map((g) => g.trim()).filter(Boolean);
    groups.forEach((g) => groupNames.add(g));

    const unresolved = who.includes('@');
    // The old format repeated the number as a display name; drop that noise.
    const cleanName = name.replace(/^\+?\d[\d\s]*$/, '').trim();

    members.push({
      lid: unresolved ? who : null,
      phone: unresolved ? null : who,
      name: cleanName,
      isAdmin: role !== 'Member',
      isSuperAdmin: role === 'Super Admin',
      groups,
      role: role as Role,
    });
  }

  if (members.length === 0) return null;

  return {
    type: 'community',
    sourceId: parentId,
    label,
    subgroups: [...groupNames].map((name) => ({
      id: `legacy:${name}`,
      name,
      memberCount: members.filter((m) => m.groups.includes(name)).length,
    })),
    members,
  };
}

function parseBroadcastFile(text: string, fallbackLabel: string): ExtractedSource | null {
  const lines = text.split('\n');
  const label = lines.find((l) => l.startsWith('Broadcast list:'))?.slice(15).trim() || fallbackLabel;

  const members: ExtractedSource['members'] = [];
  let inUnresolved = false;

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('Unresolved')) { inUnresolved = true; continue; }
    if (!t || /^[=-]{5,}$/.test(t) || t.startsWith('Extracted:') || t.startsWith('Total:')) continue;

    if (inUnresolved) {
      if (t.includes('@')) {
        members.push({ lid: t, phone: null, name: '', isAdmin: false, isSuperAdmin: false,
          groups: [label], role: 'Member' });
      }
      continue;
    }

    const m = t.match(BROADCAST_RE);
    if (m) {
      members.push({ lid: null, phone: m[1], name: m[2]?.trim() ?? '', isAdmin: false,
        isSuperAdmin: false, groups: [label], role: 'Member' });
    }
  }

  if (members.length === 0) return null;

  return {
    type: 'broadcast',
    sourceId: `legacy:broadcast:${label}`,
    label,
    subgroups: [{ id: `legacy:broadcast:${label}`, name: label, memberCount: members.length }],
    members,
  };
}

/** Oldest format: `Group: <name>` then `<number> [Role]` with no group column. */
function parseGroupFile(text: string, fallbackLabel: string): ExtractedSource | null {
  const lines = text.split('\n');
  const label = lines.find((l) => l.startsWith('Group:'))?.slice(6).trim() || fallbackLabel;

  const members: ExtractedSource['members'] = [];
  for (const line of lines) {
    const m = line.trim().match(/^(\d{6,})\s*\[(Super Admin|Admin|Member)\]$/);
    if (!m) continue;
    members.push({
      lid: null,
      phone: m[1],
      name: '',
      isAdmin: m[2] !== 'Member',
      isSuperAdmin: m[2] === 'Super Admin',
      groups: [label],
      role: m[2] as Role,
    });
  }

  if (members.length === 0) return null;

  return {
    type: 'group',
    sourceId: `legacy:group:${label}`,
    label,
    subgroups: [{ id: `legacy:group:${label}`, name: label, memberCount: members.length }],
    members,
  };
}

(async () => {
  await ensureIndexes();

  let files: string[];
  try {
    files = readdirSync(DIR).filter((f) => f.endsWith('_details.txt'));
  } catch {
    console.error(`✖ No such directory: ${DIR}`);
    process.exit(1);
  }

  const sources: ExtractedSource[] = [];

  for (const file of files) {
    const text = readFileSync(join(DIR, file), 'utf8');
    const fallback = file.replace(/_details\.txt$/, '');

    const parsed = text.startsWith('Broadcast list:')
      ? parseBroadcastFile(text, fallback)
      : text.startsWith('Group:')
        ? parseGroupFile(text, fallback)
        : parseCommunityFile(text, fallback);

    if (parsed) {
      sources.push(parsed);
      console.log(`  ✔ ${file} → "${parsed.label}" (${parsed.members.length} members)`);
    } else {
      console.log(`  – ${file} — nothing parsable, skipped`);
    }
  }

  if (sources.length === 0) {
    console.log('\nNothing to import.\n');
    process.exit(0);
  }

  // Several old files are re-exports of the same community under different
  // names; keep the richest copy of each so counts are not inflated.
  const best = new Map<string, ExtractedSource>();
  for (const s of sources) {
    const existing = best.get(s.sourceId);
    if (!existing || s.members.length > existing.members.length) best.set(s.sourceId, s);
  }

  // The oldest `Group:` exports are stale snapshots of a community that was
  // later exported in full. Keeping both would list the same people twice
  // under two sources, so the standalone copy is dropped.
  const communityLabels = new Set(
    [...best.values()].filter((s) => s.type === 'community').map((s) => s.label),
  );
  for (const [id, s] of best) {
    if (s.type === 'group' && communityLabels.has(s.label)) {
      console.log(`  – "${s.label}" group snapshot superseded by the community export, skipped`);
      best.delete(id);
    }
  }

  const stats = await persistSources([...best.values()]);

  console.log('\n─────────────────────────────────────────');
  console.log(`✔ Imported ${best.size} source(s)`);
  console.log(`  Leads seen     ${stats.leadsSeen}`);
  console.log(`  New            ${stats.newLeads}`);
  console.log(`  Updated        ${stats.updatedLeads}`);
  console.log(`  Unresolved     ${stats.unresolved}`);
  console.log('─────────────────────────────────────────\n');
  process.exit(0);
})().catch((err) => {
  console.error('✖ Import failed:', err);
  process.exit(1);
});
