import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { pool, initDatabase, RowDataPacket, ResultSetHeader } from './db';
import { callAI, callAIChat, ChatMessage } from './ai';
import { MODELS, DEFAULT_MODEL_ID } from './models';
import {
  buildCategorizationSystem,
  buildCategorizationUser,
  parseCategorizationResult,
  buildRewriteSystem,
  buildRewriteUser,
  buildRewriteIterationUser,
  buildChatSystem
} from './prompts';
import { logger } from './logger';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '5072');

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key']
}));
app.use(express.json({ limit: '10mb' }));

// ─── Auth Middleware ───────────────────────────────────────────────────────────

function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.ADMIN_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'tumble-api' });
});

// ── Categories ────────────────────────────────────────────────────────────────

app.get('/api/categories', requireApiKey, async (_req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM categories ORDER BY name');
    res.json(rows);
  } catch (error) {
    logger.error('[GET /api/categories]', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.post('/api/categories', requireApiKey, async (req, res) => {
  const { name, description, color } = req.body;
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  try {
    const id = generateId();
    await pool.execute(
      'INSERT INTO categories (id, name, description, color, is_auto) VALUES (?, ?, ?, ?, 0)',
      [id, name.trim(), description || null, color || '#6B7280']
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM categories WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Category name already exists' });
    } else {
      logger.error('[POST /api/categories]', error);
      res.status(500).json({ error: 'Failed to create category' });
    }
  }
});

// ── Tags ──────────────────────────────────────────────────────────────────────

app.get('/api/tags', requireApiKey, async (_req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM tags ORDER BY name');
    res.json(rows);
  } catch (error) {
    logger.error('[GET /api/tags]', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

app.post('/api/tags', requireApiKey, async (req, res) => {
  const { name, color } = req.body;
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  try {
    const id = generateId();
    await pool.execute(
      'INSERT INTO tags (id, name, color, is_custom) VALUES (?, ?, ?, 1)',
      [id, name.trim().toLowerCase(), color || '#6B7280']
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM tags WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Tag name already exists' });
    } else {
      logger.error('[POST /api/tags]', error);
      res.status(500).json({ error: 'Failed to create tag' });
    }
  }
});

// ── Texts ─────────────────────────────────────────────────────────────────────

app.post('/api/texts', requireApiKey, async (req, res) => {
  const { title, content, manualTags } = req.body;
  if (!title || !content) {
    res.status(400).json({ error: 'title and content are required' });
    return;
  }

  const textId = generateId();
  const wordCount = countWords(content);

  try {
    // Insert text
    await pool.execute(
      'INSERT INTO texts (id, title, content, word_count) VALUES (?, ?, ?, ?)',
      [textId, title.trim(), content, wordCount]
    );

    // AI categorization
    let categoryName = 'other';
    let suggestedTags: string[] = [];
    try {
      const result = await callAI(
        DEFAULT_MODEL_ID,
        buildCategorizationSystem(),
        buildCategorizationUser(content),
        500
      );
      const parsed = parseCategorizationResult(result.outputText);
      categoryName = parsed.category;
      suggestedTags = parsed.suggestedTags;
      logger.log(`[AI] Categorized "${title}" as "${categoryName}" with tags: ${suggestedTags.join(', ')}`);
    } catch (aiError) {
      logger.error('[AI] Categorization failed, using "other":', aiError);
    }

    // Link category
    const [catRows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM categories WHERE name = ?',
      [categoryName]
    );
    let categoryId: string;
    if (catRows.length > 0) {
      categoryId = catRows[0].id;
    } else {
      categoryId = generateId();
      await pool.execute(
        'INSERT INTO categories (id, name, color, is_auto) VALUES (?, ?, ?, 1)',
        [categoryId, categoryName, '#6B7280']
      );
    }
    await pool.execute(
      'INSERT INTO text_categories (text_id, category_id) VALUES (?, ?)',
      [textId, categoryId]
    );

    // Process tags (AI suggested + manual)
    const allTags = new Set<string>();
    suggestedTags.forEach(t => allTags.add(t.trim().toLowerCase()));
    if (manualTags) {
      const manual = typeof manualTags === 'string'
        ? manualTags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean)
        : manualTags;
      manual.forEach((t: string) => allTags.add(t));
    }

    for (const tagName of allTags) {
      if (!tagName) continue;
      const [existingTag] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM tags WHERE name = ?',
        [tagName]
      );
      let tagId: string;
      if (existingTag.length > 0) {
        tagId = existingTag[0].id;
      } else {
        tagId = generateId();
        await pool.execute(
          'INSERT INTO tags (id, name, is_custom) VALUES (?, ?, 0)',
          [tagId, tagName]
        );
      }
      await pool.execute(
        'INSERT IGNORE INTO text_tags (text_id, tag_id) VALUES (?, ?)',
        [textId, tagId]
      );
    }

    // Return full text with relations
    const text = await getTextById(textId);
    res.status(201).json(text);
  } catch (error) {
    logger.error('[POST /api/texts]', error);
    res.status(500).json({ error: 'Failed to create text' });
  }
});

app.get('/api/texts', requireApiKey, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string || '1');
    const limit = parseInt(req.query.limit as string || '20');
    const offset = (page - 1) * limit;
    const categoryFilter = req.query.category as string;
    const tagFilter = req.query.tag as string;
    const search = req.query.search as string;

    let whereClause = '';
    const params: any[] = [];

    if (categoryFilter) {
      whereClause += ' AND c.name = ?';
      params.push(categoryFilter);
    }
    if (tagFilter) {
      whereClause += ' AND EXISTS (SELECT 1 FROM text_tags tt2 JOIN tags tg2 ON tt2.tag_id = tg2.id WHERE tt2.text_id = t.id AND tg2.name = ?)';
      params.push(tagFilter);
    }
    if (search) {
      whereClause += ' AND (t.title LIKE ? OR t.content LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const countSql = `
      SELECT COUNT(DISTINCT t.id) as total
      FROM texts t
      LEFT JOIN text_categories tc ON t.id = tc.text_id
      LEFT JOIN categories c ON tc.category_id = c.id
      WHERE 1=1 ${whereClause}
    `;
    const [countRows] = await pool.query<RowDataPacket[]>(countSql, params);
    const total = countRows[0]?.total || 0;

    const sql = `
      SELECT DISTINCT t.id, t.title, t.word_count, t.created_at, t.updated_at
      FROM texts t
      LEFT JOIN text_categories tc ON t.id = tc.text_id
      LEFT JOIN categories c ON tc.category_id = c.id
      WHERE 1=1 ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [textRows] = await pool.query<RowDataPacket[]>(sql, [...params, limit, offset]);

    // Fetch categories and tags for each text
    const texts = await Promise.all(textRows.map(async (row) => {
      const [cats] = await pool.query<RowDataPacket[]>(
        `SELECT c.* FROM categories c JOIN text_categories tc ON c.id = tc.category_id WHERE tc.text_id = ?`,
        [row.id]
      );
      const [tags] = await pool.query<RowDataPacket[]>(
        `SELECT tg.* FROM tags tg JOIN text_tags tt ON tg.id = tt.tag_id WHERE tt.text_id = ?`,
        [row.id]
      );
      return { ...row, categories: cats, tags };
    }));

    res.json({
      data: texts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    logger.error('[GET /api/texts]', error);
    res.status(500).json({ error: 'Failed to fetch texts' });
  }
});

app.get('/api/texts/:id', requireApiKey, async (req, res) => {
  try {
    const text = await getTextById(req.params.id);
    if (!text) { res.status(404).json({ error: 'Text not found' }); return; }
    res.json(text);
  } catch (error) {
    logger.error('[GET /api/texts/:id]', error);
    res.status(500).json({ error: 'Failed to fetch text' });
  }
});

app.put('/api/texts/:id', requireApiKey, async (req, res) => {
  const { title, content, tags, categories } = req.body;
  const { id } = req.params;

  try {
    const [existing] = await pool.query<RowDataPacket[]>('SELECT id FROM texts WHERE id = ?', [id]);
    if (existing.length === 0) { res.status(404).json({ error: 'Text not found' }); return; }

    const updates: string[] = [];
    const params: any[] = [];
    if (title) { updates.push('title = ?'); params.push(title.trim()); }
    if (content) {
      updates.push('content = ?', 'word_count = ?');
      params.push(content, countWords(content));
    }

    if (updates.length > 0) {
      params.push(id);
      await pool.execute(`UPDATE texts SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    // Update categories if provided
    if (categories !== undefined) {
      await pool.execute('DELETE FROM text_categories WHERE text_id = ?', [id]);
      for (const catName of categories) {
        const [catRows] = await pool.query<RowDataPacket[]>('SELECT id FROM categories WHERE name = ?', [catName]);
        if (catRows.length > 0) {
          await pool.execute('INSERT IGNORE INTO text_categories (text_id, category_id) VALUES (?, ?)', [id, catRows[0].id]);
        }
      }
    }

    // Update tags if provided
    if (tags !== undefined) {
      await pool.execute('DELETE FROM text_tags WHERE text_id = ?', [id]);
      for (const tagName of (tags as string[])) {
        const normalizedTag = tagName.trim().toLowerCase();
        if (!normalizedTag) continue;
        const [existingTag] = await pool.query<RowDataPacket[]>('SELECT id FROM tags WHERE name = ?', [normalizedTag]);
        let tagId: string;
        if (existingTag.length > 0) {
          tagId = existingTag[0].id;
        } else {
          tagId = generateId();
          await pool.execute('INSERT INTO tags (id, name, is_custom) VALUES (?, ?, 1)', [tagId, normalizedTag]);
        }
        await pool.execute('INSERT IGNORE INTO text_tags (text_id, tag_id) VALUES (?, ?)', [id, tagId]);
      }
    }

    const text = await getTextById(id);
    res.json(text);
  } catch (error) {
    logger.error('[PUT /api/texts/:id]', error);
    res.status(500).json({ error: 'Failed to update text' });
  }
});

app.delete('/api/texts/:id', requireApiKey, async (req, res) => {
  try {
    const [result] = await pool.execute<ResultSetHeader>('DELETE FROM texts WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) { res.status(404).json({ error: 'Text not found' }); return; }
    res.json({ success: true });
  } catch (error) {
    logger.error('[DELETE /api/texts/:id]', error);
    res.status(500).json({ error: 'Failed to delete text' });
  }
});

// ── Settings ──────────────────────────────────────────────────────────────────

app.get('/api/settings/preferences', requireApiKey, async (_req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT value FROM settings WHERE `key` = ?', ['preferences']);
    res.json({ preferences: rows.length > 0 ? rows[0].value : '' });
  } catch (error) {
    logger.error('[GET /api/settings/preferences]', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

app.put('/api/settings/preferences', requireApiKey, async (req, res) => {
  const { preferences } = req.body;
  if (typeof preferences !== 'string') { res.status(400).json({ error: 'preferences must be a string' }); return; }
  try {
    await pool.execute(
      'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
      ['preferences', preferences, preferences]
    );
    res.json({ preferences });
  } catch (error) {
    logger.error('[PUT /api/settings/preferences]', error);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

// ── Rewrite ───────────────────────────────────────────────────────────────────

app.post('/api/rewrite', requireApiKey, async (req, res) => {
  const { text, language = 'English', model, previousOutput, instruction } = req.body;
  if (!text) { res.status(400).json({ error: 'text is required' }); return; }

  try {
    // Fetch preferences from DB
    const [prefRows] = await pool.query<RowDataPacket[]>('SELECT value FROM settings WHERE `key` = ?', ['preferences']);
    const preferences = prefRows.length > 0 ? prefRows[0].value : undefined;

    // Fetch 15 most recent texts
    const [textRows] = await pool.query<RowDataPacket[]>(`
      SELECT t.id, t.title, t.content,
             GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') as categories
      FROM texts t
      LEFT JOIN text_categories tc ON t.id = tc.text_id
      LEFT JOIN categories c ON tc.category_id = c.id
      GROUP BY t.id, t.title, t.content
      ORDER BY t.created_at DESC
      LIMIT 15
    `);

    if (textRows.length === 0) {
      res.status(400).json({ error: 'No texts in library. Add some texts first to establish your style.' });
      return;
    }

    const examples = textRows.map(row => ({
      title: row.title,
      content: row.content,
      category: row.categories || 'other'
    }));

    const systemPrompt = buildRewriteSystem(examples, preferences, language);
    const userMessage = (previousOutput && instruction)
      ? buildRewriteIterationUser(previousOutput, instruction)
      : buildRewriteUser(text);

    const result = await callAI(model, systemPrompt, userMessage, 6000);

    // Log to rewrite_logs
    await pool.execute(
      'INSERT INTO rewrite_logs (input_text, output_text, input_tokens, output_tokens) VALUES (?, ?, ?, ?)',
      [text, result.outputText, result.inputTokens, result.outputTokens]
    );

    res.json({
      rewritten: result.outputText,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      examplesUsed: examples.length
    });
  } catch (error) {
    logger.error('[POST /api/rewrite]', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to rewrite text' });
  }
});

// ── Models ────────────────────────────────────────────────────────────────────

app.get('/api/models', requireApiKey, (_req, res) => {
  res.json({
    models: MODELS.map(({ id, label, provider, gated }) => ({ id, label, provider, gated })),
    defaultModel: DEFAULT_MODEL_ID
  });
});

// ── Chat ──────────────────────────────────────────────────────────────────────

app.post('/api/chat', requireApiKey, async (req, res) => {
  const { messages, model, conversationId } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages is required' });
    return;
  }

  const cleaned: ChatMessage[] = messages
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m: any) => ({ role: m.role, content: m.content }));

  if (cleaned.length === 0 || cleaned[cleaned.length - 1].role !== 'user') {
    res.status(400).json({ error: 'messages must end with a user message' });
    return;
  }

  try {
    const result = await callAIChat(model, buildChatSystem(), cleaned, 4000);

    // A failed write must not cost the user the reply, so persistence is
    // best-effort and the turn is returned either way.
    let saved: { id: string; title: string } | null = null;
    try {
      saved = await persistChatTurn({
        conversationId: typeof conversationId === 'string' ? conversationId : undefined,
        messages: cleaned,
        reply: result.outputText,
        model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens
      });
    } catch (error) {
      logger.error('[POST /api/chat] failed to save conversation', error);
    }

    res.json({
      reply: result.outputText,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      conversationId: saved?.id ?? null,
      title: saved?.title ?? null
    });
  } catch (error) {
    logger.error('[POST /api/chat]', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Chat request failed' });
  }
});

// ── Conversations ─────────────────────────────────────────────────────────────

app.get('/api/conversations', requireApiKey, async (req, res) => {
  try {
    const requested = parseInt(req.query.limit as string || '50');
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 200) : 50;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT c.id, c.title, c.model, c.input_tokens, c.output_tokens, c.created_at, c.updated_at,
              UNIX_TIMESTAMP(c.updated_at) AS updated_ts,
              COUNT(m.id) AS message_count
       FROM conversations c
       LEFT JOIN conversation_messages m ON m.conversation_id = c.id
       GROUP BY c.id
       ORDER BY c.updated_at DESC
       LIMIT ?`,
      [limit]
    );
    res.json(rows);
  } catch (error) {
    logger.error('[GET /api/conversations]', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

app.get('/api/conversations/:id', requireApiKey, async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT *, UNIX_TIMESTAMP(updated_at) AS updated_ts FROM conversations WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Conversation not found' }); return; }

    const [messages] = await pool.query<RowDataPacket[]>(
      'SELECT role, content FROM conversation_messages WHERE conversation_id = ? ORDER BY `position` ASC',
      [req.params.id]
    );
    res.json({ ...rows[0], messages });
  } catch (error) {
    logger.error('[GET /api/conversations/:id]', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

app.put('/api/conversations/:id', requireApiKey, async (req, res) => {
  const { title } = req.body;
  if (typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'title is required' });
    return;
  }

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      'UPDATE conversations SET title = ? WHERE id = ?',
      [title.trim().slice(0, 500), req.params.id]
    );
    if (result.affectedRows === 0) { res.status(404).json({ error: 'Conversation not found' }); return; }
    res.json({ id: req.params.id, title: title.trim().slice(0, 500) });
  } catch (error) {
    logger.error('[PUT /api/conversations/:id]', error);
    res.status(500).json({ error: 'Failed to rename conversation' });
  }
});

app.delete('/api/conversations/:id', requireApiKey, async (req, res) => {
  try {
    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM conversations WHERE id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0) { res.status(404).json({ error: 'Conversation not found' }); return; }
    res.json({ success: true });
  } catch (error) {
    logger.error('[DELETE /api/conversations/:id]', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// ─── Helper: persist a chat turn ──────────────────────────────────────────────

function deriveTitle(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return 'New conversation';
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
}

/**
 * Appends the turn to its conversation, creating one on the first message.
 * Only messages the row does not already hold are written, so a client that
 * has drifted from the stored history re-syncs instead of duplicating turns.
 */
async function persistChatTurn(opts: {
  conversationId?: string;
  messages: ChatMessage[];
  reply: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<{ id: string; title: string }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let existing: RowDataPacket | undefined;
    if (opts.conversationId) {
      const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT id, title FROM conversations WHERE id = ? FOR UPDATE',
        [opts.conversationId]
      );
      existing = rows[0];
    }

    let id: string;
    let title: string;
    let stored = 0;

    if (existing) {
      // A conversation deleted in another tab falls through to a fresh row.
      id = existing.id;
      title = existing.title;
      const [counts] = await conn.query<RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM conversation_messages WHERE conversation_id = ?',
        [id]
      );
      stored = counts[0].total;
      await conn.execute(
        `UPDATE conversations
         SET model = ?, input_tokens = input_tokens + ?, output_tokens = output_tokens + ?
         WHERE id = ?`,
        [opts.model || null, opts.inputTokens, opts.outputTokens, id]
      );
    } else {
      id = generateId();
      title = deriveTitle(opts.messages[0].content);
      await conn.execute(
        `INSERT INTO conversations (id, title, model, input_tokens, output_tokens)
         VALUES (?, ?, ?, ?, ?)`,
        [id, title, opts.model || null, opts.inputTokens, opts.outputTokens]
      );
    }

    const pending: ChatMessage[] = [
      ...opts.messages.slice(stored),
      { role: 'assistant', content: opts.reply }
    ];
    for (let i = 0; i < pending.length; i++) {
      await conn.execute(
        `INSERT INTO conversation_messages (id, conversation_id, role, content, \`position\`)
         VALUES (?, ?, ?, ?, ?)`,
        [generateId(), id, pending[i].role, pending[i].content, stored + i]
      );
    }

    await conn.commit();
    return { id, title };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// ─── Helper: get full text with relations ─────────────────────────────────────

async function getTextById(id: string) {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM texts WHERE id = ?', [id]);
  if (rows.length === 0) return null;
  const text = rows[0];

  const [cats] = await pool.query<RowDataPacket[]>(
    `SELECT c.* FROM categories c JOIN text_categories tc ON c.id = tc.category_id WHERE tc.text_id = ?`,
    [id]
  );
  const [tags] = await pool.query<RowDataPacket[]>(
    `SELECT tg.* FROM tags tg JOIN text_tags tt ON tg.id = tt.tag_id WHERE tt.text_id = ?`,
    [id]
  );

  return { ...text, categories: cats, tags };
}

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      logger.log(`[Server] tumble-api running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

main();
