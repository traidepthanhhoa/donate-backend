// ================================
// CẤU HÌNH API
// ================================
// Thay URL dưới đây bằng URL backend của bạn.
// Ví dụ: https://ten-backend.onrender.com
const API_BASE_URL = "https://donate-api-v4h1.onrender.com";

const form = document.getElementById("cardForm");
const submitBtn = document.getElementById("submitBtn");
const alertBox = document.getElementById("alert");
const resultBox = document.getElementById("result");
const resultIcon = document.getElementById("resultIcon");
const resultTitle = document.getElementById("resultTitle");
const resultMessage = document.getElementById("resultMessage");
const requestIdBox = document.getElementById("requestId");

function showAlert(message) {
  alertBox.hidden = false;
  alertBox.className = "alert error";
  alertBox.textContent = message;
}

function hideAlert() {
  alertBox.hidden = true;
  alertBox.textContent = "";
}

function showResult({ success, message, request_id }) {
  resultBox.hidden = false;
  resultBox.className = success ? "result" : "result error";
  resultIcon.textContent = success ? "✓" : "!";
  resultTitle.textContent = success ? "Đã gửi thẻ" : "Gửi thẻ thất bại";
  resultMessage.textContent = message || "Không có thông báo.";
  requestIdBox.textContent = request_id ? `Request ID: ${request_id}` : "";
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.classList.toggle("loading", loading);
  document.querySelector(".btn-text").textContent = loading
    ? "Đang gửi..."
    : "Gửi thẻ";
}

function cleanNumeric(value) {
  return value.replace(/\s+/g, "").trim();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideAlert();
  resultBox.hidden = true;

  const loaithe = document.getElementById("loaithe").value;
  const menhgia = document.getElementById("menhgia").value;
  const seri = cleanNumeric(document.getElementById("seri").value);
  const mathe = cleanNumeric(document.getElementById("mathe").value);

  if (!loaithe || !menhgia || !seri || !mathe) {
    showAlert("Vui lòng nhập đầy đủ thông tin thẻ.");
    return;
  }

  if (!/^\d+$/.test(seri) || !/^\d+$/.test(mathe)) {
    showAlert("Serial và mã thẻ chỉ được chứa chữ số.");
    return;
  }

  setLoading(true);

  try {
    const response = await fetch(`${API_BASE_URL}/api/nap-the`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        loaithe,
        menhgia,
        seri,
        mathe
      })
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`Backend trả về dữ liệu không hợp lệ (HTTP ${response.status}).`);
    }

    if (!response.ok && !data) {
      throw new Error(`Backend báo lỗi HTTP ${response.status}.`);
    }

    showResult({
      success: Boolean(data.success),
      message: data.message || "Không có thông báo từ server.",
      request_id: data.request_id
    });

    if (!data.success) {
      return;
    }

    // Xóa dữ liệu thẻ sau khi gửi thành công.
    document.getElementById("seri").value = "";
    document.getElementById("mathe").value = "";
  } catch (error) {
    console.error("Donate API error:", error);

    showAlert(
      "Không thể kết nối tới máy chủ. Hãy kiểm tra URL backend, CORS hoặc trạng thái Render."
    );
  } finally {
    setLoading(false);
  }
});
