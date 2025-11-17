const express = require('express');
const https = require('https');

const router = express.Router();

// 文本违规检测
// GET /api/detect?text=要检测的文本
router.get('/', async (req, res) => {
  try {
    const { text } = req.query;
    if (!text || !String(text).trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Query parameter "text" is required'
      });
    }

    const encodedText = encodeURIComponent(String(text));
    const url = `https://v2.xxapi.cn/api/detect?text=${encodedText}`;

    const fetchFromExternal = () =>
      new Promise((resolve, reject) => {
        const reqHttps = https.get(url, (resp) => {
          let data = '';

          resp.on('data', (chunk) => {
            data += chunk;
          });

          resp.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve(json);
            } catch (e) {
              reject(new Error('Invalid JSON from external API'));
            }
          });
        });

        reqHttps.on('error', (err) => reject(err));
        reqHttps.setTimeout(5000, () => {
          reqHttps.destroy(new Error('Request timeout'));
        });
      });

    const result = await fetchFromExternal();
		const payload = (result && typeof result === 'object' && result.data && typeof result.data === 'object')
			? result.data
			: result;

    return res.json({
      status: 'success',
      message: 'Text detection completed',
			is_prohibited: !!(payload && payload.is_prohibited),
      data: {
				text: payload && payload.text,
				is_prohibited: payload && payload.is_prohibited,
				confidence: payload && payload.confidence,
				max_variant: payload && payload.max_variant,
				triggered_variants: (payload && payload.triggered_variants) || []
      },
      raw: result // 如不需要可移除
    });
  } catch (error) {
    console.error('文本违规检测失败:', error);
    return res.status(502).json({
      status: 'error',
      message: 'Failed to detect text via external service',
      error: error.message
    });
  }
});

module.exports = router;

