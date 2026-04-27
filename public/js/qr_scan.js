//qr_scan.js
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const restartBtn = document.getElementById("restartBtn");
const fileInput = document.getElementById("fileInput");
const resultEl = document.getElementById("result");



let stream = null;
let scanning = false;
let rafId = null;

async function startCamera() {
  try {
    // JS：要求攝影機解析度
    stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 3200 },
          height: { ideal: 2400 }
        }
    });
    video.srcObject = stream;
    scanning = true;
    resultEl.textContent = "Scanning...";
    startBtn.disabled = true;
    stopBtn.disabled = false;
    restartBtn.disabled = true;
    scanLoop();
  } catch (err) {
    alert("Error accessing camera: " + err.message);
  }
}

function stopCamera() {
  scanning = false;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (stream) {
    video.srcObject = null;
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  video.pause();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  restartBtn.disabled = false;
}

function restartCamera() {
  stopCamera();
  startCamera();
}

function scanLoop() {
  if (!scanning) return; //如果 scanning 是 false（攝影機已停止），直接結束函式，不繼續執行。

  if (video.readyState === video.HAVE_ENOUGH_DATA) { //確認攝影機已準備好，有足夠的影像資料可以處理。還沒準備好就跳過這次，等下一幀。
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height); //把攝影機當前這一幀的畫面繪製到 canvas 上，從座標 (0,0) 開始畫，填滿整個 canvas。

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height); //從 canvas 取出像素資料（每個像素的 RGBA 值），存入 imageData。
    const code = jsQR(imageData.data, imageData.width, imageData.height); //把像素資料交給 jsQR 函式庫分析，嘗試辨識 QR 碼。找到 QR 碼則回傳物件，找不到則回傳 null。

    if (code) { //如果 jsQR 成功辨識到 QR 碼（code 不是 null）才執行以下動作。
      resultEl.textContent = "QR Code: " + code.data; //在頁面上顯示掃描到的 QR 碼內容（例如 QR Code: http://localhost:3000/use_machine/1）。
      resultEl.classList.add("flash"); //css

      stopCamera(); // 停止攝影機，不再繼續掃描。
      const scannedMachineId = new URL(code.data).pathname.split('/').pop(); // 從 URL 中提取機台 ID: 分三步:
      // 1. new URL(code.data) 會把掃描到的 QR 碼內容（假設是 URL）解析成一個 URL 物件。
      // 2. .pathname 會取出 URL 中的路徑部分（例如 /use_machine/1）。
      // 3. .split('/').pop() 會把路徑以 '/' 分割成陣列，然後取最後一個元素（例如 '1'），這就是機台 ID。
      if (scannedMachineId !== expectedMachineId) {
        alert(`掃描錯誤！請掃描${expectedMachineId}號機器的QR碼。`);
        return;
      }
      window.location.href = code.data;
      setTimeout(() => resultEl.classList.remove("flash"), 1000);
      return;
    }
  }
  rafId = requestAnimationFrame(scanLoop);
}

function scanImageFile(file) {
  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code) {
      resultEl.textContent = "QR Code (from file): " + code.data;
      resultEl.classList.add("flash");
      setTimeout(() => resultEl.classList.remove("flash"), 1000);
    } else {
      resultEl.textContent = "No QR code found in image.";
    }
  };
  img.src = URL.createObjectURL(file);
}

startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
restartBtn.addEventListener("click", restartCamera);
fileInput.addEventListener("change", e => {
  if (e.target.files.length > 0) {
    scanImageFile(e.target.files[0]);
  }
});