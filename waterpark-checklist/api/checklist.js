const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  try {
    if (!process.env.DATABASE_URL) {
      return send(res, 500, { error: 'DATABASE_URL is not configured' });
    }

    if (req.method === 'GET') {
      const checks = await sql`
        SELECT item_id, nickname
        FROM checklist_checks
        ORDER BY created_at ASC
      `;
      const customItems = await sql`
        SELECT item_id, text, created_by, created_at
        FROM checklist_custom_items
        ORDER BY created_at ASC
      `;
      return send(res, 200, { checks, customItems });
    }

    if (req.method !== 'POST') {
      return send(res, 405, { error: 'Method not allowed' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = body.action;

    if (action === 'check') {
      const itemId = String(body.itemId || '').trim();
      const nickname = String(body.nickname || '').trim();
      if (!itemId || !nickname) return send(res, 400, { error: 'itemId and nickname are required' });
      await sql`
        INSERT INTO checklist_checks (item_id, nickname)
        VALUES (${itemId}, ${nickname})
        ON CONFLICT (item_id, nickname) DO NOTHING
      `;
      return send(res, 200, { ok: true });
    }

    if (action === 'uncheck') {
      const itemId = String(body.itemId || '').trim();
      const nickname = String(body.nickname || '').trim();
      if (!itemId || !nickname) return send(res, 400, { error: 'itemId and nickname are required' });
      await sql`
        DELETE FROM checklist_checks
        WHERE item_id = ${itemId} AND nickname = ${nickname}
      `;
      return send(res, 200, { ok: true });
    }

    if (action === 'addItem') {
      const itemId = String(body.itemId || '').trim();
      const text = String(body.text || '').trim();
      const nickname = String(body.nickname || '').trim();
      if (!itemId || !text || !nickname) return send(res, 400, { error: 'itemId, text and nickname are required' });
      await sql`
        INSERT INTO checklist_custom_items (item_id, text, created_by)
        VALUES (${itemId}, ${text}, ${nickname})
        ON CONFLICT (item_id) DO NOTHING
      `;
      return send(res, 200, { ok: true });
    }

    if (action === 'deleteItem') {
      const itemId = String(body.itemId || '').trim();
      if (!itemId) return send(res, 400, { error: 'itemId is required' });
      await sql`DELETE FROM checklist_checks WHERE item_id = ${itemId}`;
      await sql`DELETE FROM checklist_custom_items WHERE item_id = ${itemId}`;
      return send(res, 200, { ok: true });
    }

    if (action === 'checkAll') {
      const nickname = String(body.nickname || '').trim();
      const itemIds = Array.isArray(body.itemIds) ? body.itemIds.map(v => String(v).trim()).filter(Boolean) : [];
      if (!nickname || itemIds.length === 0) return send(res, 400, { error: 'nickname and itemIds are required' });
      for (const itemId of itemIds) {
        await sql`
          INSERT INTO checklist_checks (item_id, nickname)
          VALUES (${itemId}, ${nickname})
          ON CONFLICT (item_id, nickname) DO NOTHING
        `;
      }
      return send(res, 200, { ok: true });
    }

    if (action === 'reset') {
      await sql`DELETE FROM checklist_checks`;
      return send(res, 200, { ok: true });
    }

    return send(res, 400, { error: 'Unknown action' });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Server error' });
  }
};
