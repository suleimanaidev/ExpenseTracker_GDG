import { Conversation } from '../models/Conversation.js';

const MAX_CONVERSATIONS = 200;
const MAX_MESSAGES = 200;
const LIST_LIMIT = 100;

const titleFrom = (text) => {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean || 'New chat';
};

const summary = (c) => ({
  id: c._id.toString(),
  title: c.title,
  updatedAt: c.lastMessageAt,
  messageCount: c.messages?.length ?? undefined,
});

const toStored = (messages) =>
  messages.map(({ role, text }) => ({ role, text: text.slice(0, 4000), at: new Date() }));

export const listConversations = async (req, res, next) => {
  try {
    const items = await Conversation.find({ user: req.user._id })
      .select('title lastMessageAt')
      .sort({ lastMessageAt: -1 })
      .limit(LIST_LIMIT)
      .lean();
    return res.json({ conversations: items.map(summary) });
  } catch (err) {
    next(err);
  }
};

export const getConversation = async (req, res, next) => {
  try {
    const c = await Conversation.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!c) return res.status(404).json({ error: 'Conversation not found' });
    return res.json({
      id: c._id.toString(),
      title: c.title,
      updatedAt: c.lastMessageAt,
      messages: c.messages.map(({ role, text }) => ({ role, text })),
    });
  } catch (err) {
    next(err);
  }
};

export const createConversation = async (req, res, next) => {
  try {
    const { messages } = req.body;

    // Oldest conversations make room, so history never grows without bound.
    const count = await Conversation.countDocuments({ user: req.user._id });
    if (count >= MAX_CONVERSATIONS) {
      const oldest = await Conversation.find({ user: req.user._id })
        .sort({ lastMessageAt: 1 })
        .limit(count - MAX_CONVERSATIONS + 1)
        .select('_id')
        .lean();
      await Conversation.deleteMany({ _id: { $in: oldest.map((o) => o._id) } });
    }

    const firstUser = messages.find((m) => m.role === 'user');
    const conversation = await Conversation.create({
      user: req.user._id,
      title: titleFrom(firstUser?.text ?? messages[0].text),
      messages: toStored(messages),
      lastMessageAt: new Date(),
    });
    return res.status(201).json({ conversation: summary(conversation) });
  } catch (err) {
    next(err);
  }
};

export const appendMessages = async (req, res, next) => {
  try {
    const updated = await Conversation.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      {
        $push: { messages: { $each: toStored(req.body.messages), $slice: -MAX_MESSAGES } },
        $set: { lastMessageAt: new Date() },
      },
      { new: true }
    ).select('title lastMessageAt');
    if (!updated) return res.status(404).json({ error: 'Conversation not found' });
    return res.json({ conversation: summary(updated) });
  } catch (err) {
    next(err);
  }
};

export const renameConversation = async (req, res, next) => {
  try {
    const updated = await Conversation.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: { title: req.body.title } },
      { new: true }
    ).select('title lastMessageAt');
    if (!updated) return res.status(404).json({ error: 'Conversation not found' });
    return res.json({ conversation: summary(updated) });
  } catch (err) {
    next(err);
  }
};

export const deleteConversation = async (req, res, next) => {
  try {
    const result = await Conversation.deleteOne({ _id: req.params.id, user: req.user._id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Conversation not found' });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

export const clearConversations = async (req, res, next) => {
  try {
    const result = await Conversation.deleteMany({ user: req.user._id });
    return res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) {
    next(err);
  }
};
