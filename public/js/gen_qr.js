// gen_qr.js
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const machines = [
  { id: 1, name: 'M01' },
  { id: 2, name: 'M02' },
  { id: 3, name: 'M03' },
  { id: 4, name: 'M04' },
  { id: 5, name: 'M05' },
  { id: 6, name: 'M06' },
];

const BASE_URL = 'http://localhost:3000';

for (const machine of machines) {
  const url = `${BASE_URL}/use_machine/${machine.id}`;
  const filePath = path.join(__dirname, `qrcode_machine_${machine.id}.png`);
  await QRCode.toFile(filePath, url);
  console.log(`✅ ${machine.name} QR 碼已產生：${filePath}`);
}