require('dotenv').config();
const express = require('express');
const cors = require('cors');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();

app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
  res.send('✅ Backend Donate đang chạy!');
});

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

    const response = await fetch('https://card24h.com/api/charging', {
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
    res.status(500).json({ success: false, message: 'Lỗi server, vui lòng thử lại sau' });
  }
});

app.get('/api/callback', (req, res) => {
  const { status, request_id, message, amount, card_type, card_amount } = req.query;

  console.log('📩 Callback nhận được:', { status, request_id, message, amount, card_type, card_amount });

  if (status == 1) {
    console.log(`✅ Thẻ ${card_type} ${card_amount}đ thành công. Request: ${request_id}`);
  } else {
    console.log(`❌ Thẻ thất bại. Request: ${request_id}. Lý do: ${message}`);
  }

  res.status(200).send('OK');
});

app.post('/api/callback', (req, res) => {
  console.log('📩 Callback POST:', req.body);
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
});
