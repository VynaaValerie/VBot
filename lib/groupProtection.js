import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTECTION_FILE = './database/groupProtection.json';

function loadProtectionData() {
    try {
        if (fs.existsSync(PROTECTION_FILE)) {
            return JSON.parse(fs.readFileSync(PROTECTION_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading protection data:', e);
    }
    return {};
}

function saveProtectionData(data) {
    try {
        fs.writeFileSync(PROTECTION_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving protection data:', e);
    }
}

const protectionData = loadProtectionData();

export function getProtectionSettings(groupId) {
    if (!protectionData[groupId]) {
        protectionData[groupId] = {
            antilink: false,
            antiphoto: false,
            antivideo: false,
            antisticker: false,
            antiaudio: false,
            welcome: false,
            goodbye: false
        };
    }
    return protectionData[groupId];
}

export function isProtectionEnabled(groupId, type) {
    const settings = getProtectionSettings(groupId);
    return settings[type] === true;
}

export function enableProtection(groupId, type) {
    const settings = getProtectionSettings(groupId);
    settings[type] = true;
    protectionData[groupId] = settings;
    saveProtectionData(protectionData);
    return true;
}

export function disableProtection(groupId, type) {
    const settings = getProtectionSettings(groupId);
    settings[type] = false;
    protectionData[groupId] = settings;
    saveProtectionData(protectionData);
    return false;
}

export function checkAntilink(text) {
    if (!text) return false;
    const linkRegex = /(https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+|t\.me\/[^\s]+|bit\.ly\/[^\s]+|tinyurl\.com\/[^\s]+)/gi;
    return linkRegex.test(text);
}

export function checkAntiphoto(messageType) {
    return messageType === 'imageMessage' || messageType === 'Image';
}

export function checkAntivideo(messageType) {
    return messageType === 'videoMessage' || messageType === 'Video';
}

export function checkAntisticker(messageType) {
    return messageType === 'stickerMessage' || messageType === 'Sticker';
}

export function checkAntiaudio(messageType) {
    return messageType === 'audioMessage' || messageType === 'Audio';
}

export function getAllProtectionStatus(groupId) {
    const settings = getProtectionSettings(groupId);
    return `
*🛡️ Group Protection Status*

├ Antilink: ${settings.antilink ? '✅ ON' : '❌ OFF'}
├ Antiphoto: ${settings.antiphoto ? '✅ ON' : '❌ OFF'}
├ Antivideo: ${settings.antivideo ? '✅ ON' : '❌ OFF'}
├ Antisticker: ${settings.antisticker ? '✅ ON' : '❌ OFF'}
└ Antiaudio: ${settings.antiaudio ? '✅ ON' : '❌ OFF'}

*Commands:*
.antilink on/off
.antiphoto on/off
.antivideo on/off
.antisticker on/off
.antiaudio on/off
    `.trim();
}
