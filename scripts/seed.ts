/**
 * Idempotent demo seed: 3 users, 2 documents, 2 shares.
 * Run: npm run db:seed   (uses DATABASE_URL from .env)
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { documents, documentShares, users } from '../worker/db/schema';
import type { DocJSON } from '../shared/types';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set (see .env.example)');

export const SEED_USERS = [
  { id: '00000000-0000-4000-8000-00000000a11c', email: 'alice@ajaia.test', name: 'Alice Chen' },
  { id: '00000000-0000-4000-8000-000000000b0b', email: 'bob@ajaia.test', name: 'Bob Patel' },
  { id: '00000000-0000-4000-8000-0000000ca201', email: 'carol@ajaia.test', name: 'Carol Ruiz' },
] as const;
const [alice, bob, carol] = SEED_USERS;

const text = (t: string, marks?: string[]) => ({ type: 'text', text: t, ...(marks ? { marks: marks.map((type) => ({ type })) } : {}) });
const p = (...content: object[]) => ({ type: 'paragraph', content });
const h = (level: number, t: string) => ({ type: 'heading', attrs: { level }, content: [text(t)] });
const list = (type: 'bulletList' | 'orderedList', items: string[]) => ({
  type,
  content: items.map((i) => ({ type: 'listItem', content: [p(text(i))] })),
});

const welcome: DocJSON = {
  type: 'doc',
  content: [
    h(1, 'Welcome to Ajaia Docs'),
    p(
      text('This is a shared document. You can make text '),
      text('bold', ['bold']),
      text(', '),
      text('italic', ['italic']),
      text(' or '),
      text('underlined', ['underline']),
      text(' from the toolbar or with the usual keyboard shortcuts.'),
    ),
    h(2, 'What you can try'),
    list('bulletList', [
      'Edit this document — changes save automatically.',
      'Import a .txt, .md or .docx file from the documents page.',
      'Share a document with a teammate as an editor or a viewer.',
    ]),
    h(2, 'Demo accounts'),
    list('orderedList', [
      'Alice owns this document and shared it with Bob as an editor.',
      'Bob owns “Q3 Planning Notes” and shared it with Carol as a viewer.',
      'Carol can read Bob’s notes but cannot change them.',
    ]),
  ],
};

const planning: DocJSON = {
  type: 'doc',
  content: [
    h(1, 'Q3 Planning Notes'),
    p(text('Goals for the quarter, in priority order:')),
    list('orderedList', ['Ship the document editor pilot.', 'Onboard two internal teams.', 'Collect feedback on sharing.']),
    h(2, 'Open questions'),
    list('bulletList', ['Do we need comments before launch?', 'Which teams go first?']),
  ],
};

export const SEED_DOCS = [
  { id: '00000000-0000-4000-8000-0000000d0c01', ownerId: alice.id, title: 'Welcome to Ajaia Docs', content: welcome },
  { id: '00000000-0000-4000-8000-0000000d0c02', ownerId: bob.id, title: 'Q3 Planning Notes', content: planning },
];

async function main() {
  const client = postgres(url!, { max: 1, ssl: 'require' });
  const db = drizzle(client);
  await db.insert(users).values([...SEED_USERS]).onConflictDoNothing();
  await db.insert(documents).values(SEED_DOCS).onConflictDoNothing();
  await db
    .insert(documentShares)
    .values([
      { documentId: SEED_DOCS[0].id, userId: bob.id, role: 'editor' },
      { documentId: SEED_DOCS[1].id, userId: carol.id, role: 'viewer' },
    ])
    .onConflictDoNothing();
  const [counts] = await client`select
    (select count(*) from users)::int as users,
    (select count(*) from documents)::int as documents,
    (select count(*) from document_shares)::int as shares`;
  console.log('seeded', counts);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
