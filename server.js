require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

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
    // Tạo chữ ký theo đúng thứ tự: partner_key + code + command + partner_id + request_id + serial + telco
    // Nguồn: Tài liệu Postman Card24h [citation:5]
    const sign = crypto.createHash('md5')
      .update(process.env.PARTNER_KEY + mathe + 'charging' + process.env.PARTNER_ID + requestId + seri + loaithe.toUpperCase())
      .digest('hex');

    // Gửi dạng form-urlencoded (KHÔNG phải JSON)
    const formData = new URLSearchParams({
      partner_id: process.env.PARTNER_ID,
      request_id: requestId,
      code: mathe,
      serial: seri,
      telco: loaithe.toUpperCase(),
      amount: menhgia,
      command: 'charging',
      callback_sign: sign
    });

    console.log('📤 Gửi lên Card24h:', { partner_id: process.env.PARTNER_ID, request_id: requestId, telco: loaithe.toUpperCase(), amount: menhgia });

    // Endpoint đúng: https://card24h.com/chargingws/v2
    const response = await fetch('https://card24h.com/chargingws/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    const rawText = await response.text();
    console.log('📥 Card24h trả về (raw):', rawText);

    let result;
    try {
      result = JSON.parse(rawText);
    } catch (e) {
      // Nếu Card24h trả về text thường (ví dụ: "1|Thành công")
      result = { message: rawText };
    }

    // Xử lý kết quả: Card24h có thể trả về status=1, errorCode=0, hoặc các mã lỗi 3xx
    // Mã lỗi phổ biến: 323 = Sai chữ ký, 321 = Merchant không tồn tại [citation:5]
    if (result.status === 1 || result.errorCode === 0 || (rawText && rawText.includes('1|'))) {
      return res.json({
        success: true,
        message: `Đã gửi thẻ ${parseInt(menhgia).toLocaleString('vi-VN')}đ, chờ xử lý...`,
        request_id: requestId
      });
    }

    return res.json({
      success: false,
      message: result.message || rawText || 'Thẻ không hợp lệ hoặc đã được sử dụng',
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
// ROUTE 2: Callback từ Card24h gọi về (GET)
// ============================================
app.get('/api/callback', (req, res) => {
  const { status, request_id, message, amount, card_type, card_amount } = req.query;
  console.log('📩 Callback GET nhận được:', { status, request_id, message, amount, card_type, card_amount });
  res.status(200).send('OK');
});

// ============================================
// ROUTE 3: Callback từ Card24h gọi về (POST)
// ============================================
app.post('/api/callback', (req, res) => {
  console.log('📩 Callback POST nhận được:', req.body);
  res.status(200).send('OK');
});

// ============================================
// ROUTE 4: DEBUG - Kiểm tra kết nối Card24h
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
    const requestId = 'test_' + Date.now();
    const seri = '123456789';
    const mathe = '123456789012';
    const loaithe = 'VIETTEL';

    // Tạo chữ ký
    const sign = crypto.createHash('md5')
      .update(process.env.PARTNER_KEY + mathe + 'charging' + process.env.PARTNER_ID + requestId + seri + loaithe)
      .digest('hex');

    const formData = new URLSearchParams({
      partner_id: process.env.PARTNER_ID,
      request_id: requestId,
      code: mathe,
      serial: seri,
      telco: loaithe,
      amount: '10000',
      command: 'charging',
      callback_sign: sign
    });

    console.log('🧪 [TEST] Gửi lên Card24h');

    const response = await fetch('https://card24h.com/chargingws/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    const rawText = await response.text();

    debug.card24h_test = {
      url: 'https://card24h.com/chargingws/v2',
      http_status: response.status,
      raw_response: rawText.slice(0, 2000)
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
