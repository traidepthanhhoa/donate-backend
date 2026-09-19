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
// Hàm tạo chữ ký MD5 theo tài liệu Card24h
// Thứ tự: partner_key + code + command + partner_id + request_id + serial + telco
// ============================================
function taoChuKy(partnerKey, code, command, partnerId, requestId, serial, telco) {
  return crypto.createHash('md5')
    .update(partnerKey + code + command + partnerId + requestId + serial + telco)
    .digest('hex');
}

// ============================================
// ROUTE 1: Nhận thẻ từ frontend → Gửi lên Card24h
// ============================================
app.post('/api/nap-the', async (req, res) => {
  const { loaithe, menhgia, seri, mathe } = req.body;

  if (!loaithe || !menhgia || !seri || !mathe) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin thẻ' });
  }

  const partnerId = process.env.PARTNER_ID;
  const partnerKey = process.env.PARTNER_KEY;
  const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const telco = loaithe.toUpperCase();
  const code = mathe.trim();
  const serial = seri.trim();
  const amount = String(menhgia);

  try {
    // Tạo chữ ký
    const sign = taoChuKy(partnerKey, code, 'charging', partnerId, requestId, serial, telco);

    // Tạo form-urlencoded body
    const formData = new URLSearchParams();
    formData.append('partner_id', partnerId);
    formData.append('request_id', requestId);
    formData.append('code', code);
    formData.append('serial', serial);
    formData.append('telco', telco);
    formData.append('amount', amount);
    formData.append('command', 'charging');
    formData.append('callback_sign', sign);
    formData.append('callback_url', 'https://donate-api-v4h1.onrender.com/api/callback');

    console.log('📤 Gửi lên Card24h:', {
      partner_id: partnerId,
      request_id: requestId,
      telco: telco,
      amount: amount,
      serial: serial.slice(0, 4) + '***',
      code: code.slice(0, 4) + '***'
    });

    // Endpoint đúng theo tài liệu: webcuoc.vn (KHÔNG phải card24h.com)
    const response = await fetch('http://webcuoc.vn/chargingws/v2', {
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
      result = { message: rawText };
    }

    // Card24h trả về status = 1 là thành công
    if (result.status === 1) {
      return res.json({
        success: true,
        message: `Đã gửi thẻ ${parseInt(menhgia).toLocaleString('vi-VN')}đ, chờ xử lý...`,
        request_id: requestId
      });
    }

    // Map mã lỗi phổ biến
    const errorMessages = {
      102: 'Dữ liệu gửi lên không đúng định dạng',
      307: 'Thẻ đã tồn tại trong hệ thống',
      311: 'Thẻ sai định dạng',
      320: 'Dữ liệu gửi lên không đủ',
      321: 'Merchant không tồn tại hoặc không hoạt động',
      323: 'Sai chữ ký (kiểm tra lại thứ tự tham số)',
      324: 'Merchant sai IP đăng ký'
    };

    const errorMsg = errorMessages[result.status] || result.message || 'Thẻ không hợp lệ hoặc đã được sử dụng';

    return res.json({
      success: false,
      message: `${errorMsg} (mã ${result.status})`,
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
  console.log('📩 Callback GET nhận được:', {
    status, request_id, message, amount, card_type, card_amount
  });

  if (String(status) === '1') {
    console.log(`✅ Thẻ ${card_type} ${card_amount}đ thành công. Request: ${request_id}`);
  } else {
    console.log(`❌ Thẻ thất bại. Request: ${request_id}. Lý do: ${message}`);
  }

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
    card24h_error: null,
    request_sent: null
  };

  try {
    const partnerId = process.env.PARTNER_ID;
    const partnerKey = process.env.PARTNER_KEY;
    const requestId = 'test_' + Date.now();
    const telco = 'VIETTEL';
    const code = '123456789012';
    const serial = '123456789';
    const amount = '10000';

    // Tạo chữ ký
    const sign = taoChuKy(partnerKey, code, 'charging', partnerId, requestId, serial, telco);

    const formData = new URLSearchParams();
    formData.append('partner_id', partnerId);
    formData.append('request_id', requestId);
    formData.append('code', code);
    formData.append('serial', serial);
    formData.append('telco', telco);
    formData.append('amount', amount);
    formData.append('command', 'charging');
    formData.append('callback_sign', sign);
    formData.append('callback_url', 'https://donate-api-v4h1.onrender.com/api/callback');

    console.log('🧪 [TEST] Gửi lên Card24h');

    const response = await fetch('http://webcuoc.vn/chargingws/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    const rawText = await response.text();

    debug.request_sent = {
      url: 'http://webcuoc.vn/chargingws/v2',
      method: 'POST',
      content_type: 'application/x-www-form-urlencoded',
      body_preview: formData.toString().replace(sign, '***SIGN***')
    };

    debug.card24h_test = {
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
