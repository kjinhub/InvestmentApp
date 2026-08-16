module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  if (!process.env.OPENAI_API_KEY) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: 'OPENAI_API_KEY is not configured' }));
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const situation = String(body.situation || '').trim();
    if (!situation) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: '상황을 입력해주세요.' }));
    }

    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.responses.create({
      model: 'gpt-5.6',
      input: [
        {
          role: 'system',
          content: '사용자가 설명한 여행, 외출, 행사, 활동 상황에 맞는 실용적인 준비물 체크리스트를 한국어로 만든다. 과도하게 많은 항목은 피하고 실제로 챙길 가능성이 높은 준비물 위주로 구성한다. 카테고리는 3~7개, 전체 항목은 보통 10~30개로 한다. 사용자가 언급하지 않은 개인 건강정보나 민감정보를 추측하지 않는다.'
        },
        {
          role: 'user',
          content: `다음 상황에 맞는 준비물 체크리스트를 만들어줘.\n\n${situation}`
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'packing_checklist',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'items'],
            properties: {
              title: { type: 'string' },
              items: {
                type: 'array',
                minItems: 1,
                maxItems: 35,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['section', 'text', 'reason'],
                  properties: {
                    section: { type: 'string' },
                    text: { type: 'string' },
                    reason: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    });

    const data = JSON.parse(response.output_text);
    res.statusCode = 200;
    return res.end(JSON.stringify(data));
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'AI 체크리스트 생성에 실패했습니다.' }));
  }
};
