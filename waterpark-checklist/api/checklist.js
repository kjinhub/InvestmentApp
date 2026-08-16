const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function clean(v, max = 100) {
  return String(v || '').trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  try {
    if (!process.env.DATABASE_URL) return send(res, 500, { error: 'DATABASE_URL is not configured' });

    if (req.method === 'GET') {
      const checks = await sql`SELECT item_id, nickname FROM checklist_checks ORDER BY created_at ASC`;
      const rows = await sql`SELECT item_id, text, created_by, created_at FROM checklist_custom_items ORDER BY created_at ASC`;
      const modeRow = rows.find(v => v.item_id === '__meta_mode__');
      const titleRow = rows.find(v => v.item_id === '__meta_title__');
      const customItems = rows.filter(v => !v.item_id.startsWith('__meta_'));
      return send(res, 200, {
        checks,
        customItems,
        mode: modeRow?.text || 'default',
        title: titleRow?.text || '김해 롯데워터파크 커플 준비물 체크리스트'
      });
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = body.action;

    if (action === 'check' || action === 'uncheck') {
      const itemId = clean(body.itemId);
      const nickname = clean(body.nickname, 50);
      if (!itemId || !nickname) return send(res, 400, { error: 'itemId and nickname are required' });
      if (action === 'check') {
        await sql`INSERT INTO checklist_checks (item_id, nickname) VALUES (${itemId}, ${nickname}) ON CONFLICT (item_id, nickname) DO NOTHING`;
      } else {
        await sql`DELETE FROM checklist_checks WHERE item_id = ${itemId} AND nickname = ${nickname}`;
      }
      return send(res, 200, { ok: true });
    }

    if (action === 'addItem') {
      const itemId = clean(body.itemId);
      const text = clean(body.text);
      const nickname = clean(body.nickname, 50);
      if (!itemId || !text || !nickname) return send(res, 400, { error: 'itemId, text and nickname are required' });
      await sql`INSERT INTO checklist_custom_items (item_id, text, created_by) VALUES (${itemId}, ${text}, ${nickname}) ON CONFLICT (item_id) DO NOTHING`;
      return send(res, 200, { ok: true });
    }

    if (action === 'deleteItem') {
      const itemId = clean(body.itemId);
      if (!itemId) return send(res, 400, { error: 'itemId is required' });
      await sql`DELETE FROM checklist_checks WHERE item_id = ${itemId}`;
      await sql`DELETE FROM checklist_custom_items WHERE item_id = ${itemId}`;
      return send(res, 200, { ok: true });
    }

    if (action === 'checkAll') {
      const nickname = clean(body.nickname, 50);
      const itemIds = Array.isArray(body.itemIds) ? body.itemIds.map(v => clean(v)).filter(Boolean).slice(0, 100) : [];
      if (!nickname || !itemIds.length) return send(res, 400, { error: 'nickname and itemIds are required' });
      for (const itemId of itemIds) {
        await sql`INSERT INTO checklist_checks (item_id, nickname) VALUES (${itemId}, ${nickname}) ON CONFLICT (item_id, nickname) DO NOTHING`;
      }
      return send(res, 200, { ok: true });
    }

    if (action === 'reset') {
      await sql`DELETE FROM checklist_checks`;
      return send(res, 200, { ok: true });
    }

    if (action === 'applyAI') {
      const mode = body.mode === 'append' ? 'append' : 'replace';
      const title = clean(body.title, 90) || 'AI 추천 체크리스트';
      const nickname = clean(body.nickname, 50) || 'AI';
      const items = Array.isArray(body.items) ? body.items.slice(0, 35) : [];
      if (!items.length) return send(res, 400, { error: 'AI items are required' });

      await sql`DELETE FROM checklist_checks WHERE item_id LIKE 'ai-%'`;
      await sql`DELETE FROM checklist_custom_items WHERE item_id LIKE 'ai-%' OR item_id LIKE '__meta_%'`;
      if (mode === 'replace') await sql`DELETE FROM checklist_checks`;

      await sql`INSERT INTO checklist_custom_items (item_id, text, created_by) VALUES ('__meta_mode__', ${mode}, ${nickname})`;
      await sql`INSERT INTO checklist_custom_items (item_id, text, created_by) VALUES ('__meta_title__', ${title}, ${nickname})`;

      const stamp = Date.now();
      let index = 0;
      for (const raw of items) {
        const section = clean(raw.section, 35) || '✨ AI 추천';
        const text = clean(raw.text, 55);
        const reason = clean(raw.reason, 60);
        if (!text) continue;
        const id = `ai-${stamp}-${index++}`;
        const stored = clean(`${section}|||${text}|||${reason}`, 100);
        await sql`INSERT INTO checklist_custom_items (item_id, text, created_by) VALUES (${id}, ${stored}, ${nickname})`;
      }
      return send(res, 200, { ok: true });
    }

    if (action === 'restoreDefault') {
      await sql`DELETE FROM checklist_checks WHERE item_id LIKE 'ai-%'`;
      await sql`DELETE FROM checklist_custom_items WHERE item_id LIKE 'ai-%' OR item_id LIKE '__meta_%'`;
      return send(res, 200, { ok: true });
    }

    return send(res, 400, { error: 'Unknown action' });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Server error' });
  }
};
