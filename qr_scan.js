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
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
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
  if (!scanning) return;

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code) {
      resultEl.textContent = "QR Code: " + code.data;
      resultEl.classList.add("flash");

      stopCamera(); // auto stop after detection

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