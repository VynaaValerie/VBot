import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

global.VynaaAPikey = 'TARO_apikeymu';  //ambil di web 
global.url = { VynaaAPi: 'https://vynaa.web.id' };

globalThis.ownerNumber = '6282389924037';
globalThis.admin = [
  '6282389924037@s.whatsapp.net',
  '6282389924037',
  '242137790681132@lid',
  '242137790681132'
];

globalThis.spackname = 'VynaaValerie Bot';
globalThis.sauthor = 'VynaaValerie';

globalThis.prefix = ['#', '.', '!', '/'];
globalThis.noprefix = false;

globalThis.MenuImage = path.join(__dirname, './database/image/VynaaAPi.jpeg');

globalThis.mess = {
    wait: '☕ *One Moment, Please*',
    error: '⚠ *Gagal Saat Melakukan Proses*',
    default: '📑 *Perintah Tidak Dikenali*',
    admin: '⚠ *Perintah Ini Hanya Bisa Digunakan Oleh Admin*',
    group: '⚠ *Perintah Ini Hanya Bisa Digunakan Di Dalam Grup*',
    owner: '⚠ *Perintah Ini Hanya Bisa Digunakan Oleh Owner*',
    botAdmin: '⚠ *Bot Harus Menjadi Admin Untuk Menggunakan Fitur Ini*'
};
