import { Router } from 'express';
import { z } from 'zod';
import {
  appendMessages,
  clearConversations,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
} from '../controllers/chatController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const idParams = z.object({ id: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid conversation id') });

const messageList = z
  .array(
    z.object({
      role: z.enum(['user', 'ai']),
      text: z.string().trim().min(1).max(4000),
    })
  )
  .min(1)
  .max(4);

router.use(authenticate);

router.get('/', listConversations);
router.post('/', validate({ body: z.object({ messages: messageList }) }), createConversation);
router.delete('/', clearConversations);
router.get('/:id', validate({ params: idParams }), getConversation);
router.post(
  '/:id/messages',
  validate({ params: idParams, body: z.object({ messages: messageList }) }),
  appendMessages
);
router.patch(
  '/:id',
  validate({ params: idParams, body: z.object({ title: z.string().trim().min(1).max(120) }) }),
  renameConversation
);
router.delete('/:id', validate({ params: idParams }), deleteConversation);

export default router;
