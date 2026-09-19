require('dotenv').config();
const express = require('express');
const cors = require('cors');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();

app.use(express.json());
app.use(cors());

// Route kiểm tra server
app.get('/', (req, res) => {
  res.send('✅ Backend Donate đang chạy!');
});

// ============================================
// ROUTE 1: Nhận thẻ từ frontend → Gửi lên Card24h
// ============================================
app.post('/api/nap-the', async (req, res) => {
  const { loaithe, menhgia, seri, mathe } = req.body;

  if (!loaithe || !menhgia || !seri || !mathe) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin thẻ' });
  }

  const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  try {
    const body = {
      partner_id: process.env.PARTNER_ID,
      partner_key: process.env.PARTNER_KEY,
      card_type: loaithe.toUpperCase(),
      card_amount: parseInt(menhgia),
      card_serial: seri.trim(),
      card_code: mathe.trim(),
      request_id: requestId
    };

    console.log('📤 Gửi lên Card24h:', { ...body, partner_key: '***HIDDEN***' });

    const response = await fetch('https://card24h.com/chargingws/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const result = await response.json();
    console.log('📥 Card24h trả về:', result);

    if (result.status === 1 || result.errorCode === 0 || result.success === true) {
      return res.json({
        success: true,
        message: `Đã gửi thẻ ${parseInt(menhgia).toLocaleString('vi-VN')}đ, chờ xử lý...`,
        request_id: requestId
      });
    }

    return res.json({
      success: false,
      message: result.message || 'Thẻ không hợp lệ hoặc đã được sử dụng',
      request_id: requestId
    });

  } catch (error) {
    console.error('❌ Lỗi gọi API Card24h:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server: ' + (error.message || 'Unknown error'),
      debug: {
        error_name: error.name,
        error_message: error.message
      }
    });
  }
});

// ============================================
// ROUTE 2: Callback từ Card24h gọi về
// ============================================
app.get('/api/callback', (req, res) => {
  const { status, request_id, message, amount, card_type, card_amount } = req.query;
  console.log('📩 Callback nhận được:', { status, request_id, message, amount, card_type, card_amount });
  res.status(200).send('OK');
});

app.post('/api/callback', (req, res) => {
  console.log('📩 Callback POST:', req.body);
  res.status(200).send('OK');
});

// ============================================
// ROUTE 3: DEBUG - Kiểm tra kết nối Card24h
// Mở: https://donate-api-v4h1.onrender.com/api/test
// ============================================
app.get('/api/test', async (req, res) => {
  const debug = {
    timestamp: new Date().toISOString(),
    env: {
      PARTNER_ID: process.env.PARTNER_ID ? '✅ Có' : '❌ THIẾU',
      PARTNER_KEY: process.env.PARTNER_KEY ? '✅ Có (dài ' + process.env.PARTNER_KEY.length + ')' : '❌ THIẾU',
      PORT: process.env.PORT || '3000',
      NODE_VERSION: process.version
    },
    card24h_test: null,
    card24h_error: null
  };

  try {
    const body = {
      partner_id: process.env.PARTNER_ID,
      partner_key: process.env.PARTNER_KEY,
      card_type: 'VIETTEL',
      card_amount: 10000,
      card_serial: '123456789',
      card_code: '123456789012',
      request_id: 'test_' + Date.now()
    };

    console.log('🧪 [TEST] Gửi lên Card24h');

    const response = await fetch('https://card24h.com/chargingws/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const rawText = await response.text();

    debug.card24h_test = {
      url: 'https://card24h.com/api/charging',
      http_status: response.status,
      raw_response: rawText.slice(0, 1000)
    };

    try {
      debug.card24h_test.parsed_json = JSON.parse(rawText);
    } catch (e) {
      debug.card24h_test.json_parse_error = e.message;
    }

  } catch (err) {
    debug.card24h_error = {
      name: err.name,
      message: err.message,
      code: err.code
    };
    console.error('❌ [TEST] Lỗi:', err);
  }

  res.json(debug);
});

// ============================================
// Khởi động server
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
});
