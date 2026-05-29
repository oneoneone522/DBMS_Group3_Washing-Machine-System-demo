// gen_qr.js
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const machines = Array.from({ length: 42 }, (_, i) => ({
  id: i + 1,
  name: `M${String(i + 1).padStart(2, '0')}`,
}));

const BASE_URL = 'http://localhost:3000';

for (const machine of machines) {
  const url = `${BASE_URL}/use_machine/${machine.id}`;
  const filePath = path.join(__dirname, `qrcode_machine_${machine.id}.png`);
  await QRCode.toFile(filePath, url);
  console.log(`✅ ${machine.name} QR 碼已產生：${filePath}`);
}