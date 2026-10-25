import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../server.js';
import { User } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { generateAccessToken } from '../middleware/auth.js';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Conversation.deleteMany({})]);
});

const makeUser = async (email) =>
  User.create({ email, passwordHash: await User.hashPassword('Password123!') });

const as = (user) => ({ Authorization: `Bearer ${generateAccessToken(user)}` });

const exchange = (question, answer) => [
  { role: 'user', text: question },
  { role: 'ai', text: answer },
];

describe('chat history', () => {
  it('saves a conversation, titles it from the first question and lists it newest first', async () => {
    const user = await makeUser('chat-a@ledger.app');

    const first = await request(app)
      .post('/api/chats')
      .set(as(user))
      .send({ messages: exchange('is mahine food par kitna kharch hua?', 'PKR 1,450') });
    expect(first.status).toBe(201);
    expect(first.body.conversation.title).toBe('is mahine food par kitna kharch hua?');

    await request(app)
      .post('/api/chats')
      .set(as(user))
      .send({ messages: exchange('second chat', 'ok') });

    const list = await request(app).get('/api/chats').set(as(user));
    expect(list.body.conversations.map((c) => c.title)).toEqual([
      'second chat',
      'is mahine food par kitna kharch hua?',
    ]);
  });

  it('appends to a conversation, reopens it with every message, and bumps it to the top', async () => {
    const user = await makeUser('chat-b@ledger.app');
    const created = await request(app)
      .post('/api/chats')
      .set(as(user))
      .send({ messages: exchange('one', 'a') });
    const id = created.body.conversation.id;
    await request(app).post('/api/chats').set(as(user)).send({ messages: exchange('other', 'b') });

    const appended = await request(app)
      .post(`/api/chats/${id}/messages`)
      .set(as(user))
      .send({ messages: exchange('two', 'c') });
    expect(appended.status).toBe(200);

    const opened = await request(app).get(`/api/chats/${id}`).set(as(user));
    expect(opened.body.messages.map((m) => m.text)).toEqual(['one', 'a', 'two', 'c']);

    const list = await request(app).get('/api/chats').set(as(user));
    expect(list.body.conversations[0].id).toBe(id);
  });

  it('renames and deletes', async () => {
    const user = await makeUser('chat-c@ledger.app');
    const { body } = await request(app)
      .post('/api/chats')
      .set(as(user))
      .send({ messages: exchange('hello', 'hi') });
    const id = body.conversation.id;

    const renamed = await request(app).patch(`/api/chats/${id}`).set(as(user)).send({ title: 'Budget talk' });
    expect(renamed.body.conversation.title).toBe('Budget talk');

    expect((await request(app).delete(`/api/chats/${id}`).set(as(user))).status).toBe(200);
    expect((await request(app).get(`/api/chats/${id}`).set(as(user))).status).toBe(404);
  });

  it("never shows, changes or deletes another user's conversation", async () => {
    const owner = await makeUser('owner@ledger.app');
    const other = await makeUser('other@ledger.app');
    const { body } = await request(app)
      .post('/api/chats')
      .set(as(owner))
      .send({ messages: exchange('private question', 'private answer') });
    const id = body.conversation.id;

    expect((await request(app).get('/api/chats').set(as(other))).body.conversations).toEqual([]);
    expect((await request(app).get(`/api/chats/${id}`).set(as(other))).status).toBe(404);
    expect(
      (await request(app).post(`/api/chats/${id}/messages`).set(as(other)).send({ messages: exchange('x', 'y') })).status
    ).toBe(404);
    expect((await request(app).patch(`/api/chats/${id}`).set(as(other)).send({ title: 'mine now' })).status).toBe(404);
    expect((await request(app).delete(`/api/chats/${id}`).set(as(other))).status).toBe(404);

    expect((await request(app).get(`/api/chats/${id}`).set(as(owner))).body.messages).toHaveLength(2);
  });

  it('requires sign-in and rejects malformed input', async () => {
    const user = await makeUser('chat-d@ledger.app');

    expect((await request(app).get('/api/chats')).status).toBe(401);
    expect((await request(app).post('/api/chats').set(as(user)).send({ messages: [] })).status).toBe(400);
    expect(
      (await request(app).post('/api/chats').set(as(user)).send({ messages: [{ role: 'system', text: 'x' }] })).status
    ).toBe(400);
    expect((await request(app).get('/api/chats/not-an-id').set(as(user))).status).toBe(400);
  });
});
