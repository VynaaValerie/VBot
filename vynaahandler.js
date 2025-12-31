import "./vynaa.js"
import "./database/Menu/VynaaMenu.js"
import { buildMenu } from "./database/Menu/TimeHelper.js"

import fs from "fs"
import axios from "axios"
import fetch from "node-fetch"
import os from "os" 

import Ai4Chat from "./scrape/Ai4Chat.js"
import tiktok2 from "./scrape/Tiktok.js"

import { writeExif } from "./lib/sticker.js"
import { uploadToCatbox } from "./lib/uploader.js"
import {
    getGameSession,
    initGameSession,
    clearGameSession,
    getGameQuestion,
    formatGameQuestion,
    checkAnswer,
    formatGameResult,
    formatSurrenderMessage,
    formatHelpMessage,
    getGamesList,
    getRandomGame,
    cleanupOldSessions,
    getGameSessionByMessageId
} from "./lib/games.js"
import {
    isProtectionEnabled,
    enableProtection,
    disableProtection,
    getProtectionSettings,
    checkAntilink,
    checkAntiphoto,
    checkAntivideo,
    checkAntisticker,
    checkAntiaudio
} from "./lib/groupProtection.js"
import {
    initDatabase,
    incrementMessageCount,
    getMessageCounts,
    clearMessageCounts,
    getUserMessageCount
} from "./lib/messageCounter.js"

const processedMessages = new Set()

function getQuotedMessageContent(msg, fallbackText = '') {
    if (!msg.message) return { text: fallbackText };
    
    const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg) return { text: fallbackText };
    
    if (quotedMsg.conversation) {
        return { text: quotedMsg.conversation };
    } else if (quotedMsg.extendedTextMessage?.text) {
        return { text: quotedMsg.extendedTextMessage.text };
    } else if (quotedMsg.imageMessage?.caption) {
        return { text: quotedMsg.imageMessage.caption };
    } else if (quotedMsg.videoMessage?.caption) {
        return { text: quotedMsg.videoMessage.caption };
    }
    
    return { text: fallbackText };
}

async function Quotly(obj) {
  let json;

  try {
    json = await fetch("https://btzqc.betabotz.eu.org/generate", {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(obj),
    });

    const data = await json.json();
    if (data && data.result && data.result.image) {
      const results = data.result.image;
      const buffer = Buffer.from(results, "base64");
      return buffer;
    } else {
      throw new Error('Gagal mendapatkan gambar dari API');
    }
  } catch (e) {
    console.error('Error dalam pembuatan gambar:', e);
    return null; 
  }
}

const handleYoutubeDownload = async (command, q, format, replyFn, msgObj, vynaaObj, senderJid) => {
    if (!q) {
        const example = command === 'ytmp3' 
            ? "☘️ *Contoh:* !ytmp3 https://youtu.be/..."
            : "☘️ *Contoh:* !ytmp4 https://youtu.be/...|720 (Format: 360, 480, 720, 1080)";
        return replyFn(`⚠ *Mana Link YouTube-nya?*\n${example}`);
    }

    replyFn(globalThis.mess.wait);
    
    const parts = q.split('|').map(t => t.trim());
    const url = parts[0];
    const requestedFormat = parts.length > 1 ? parts[1] : null;

    const finalFormat = requestedFormat || format;

    try {
        const apiUrl = `${global.url.VynaaAPi}/downloader/youtube/?apikey=${global.VynaaAPikey}&url=${encodeURIComponent(url)}&format=${encodeURIComponent(finalFormat)}`
        
        const response = await fetch(apiUrl)
        const json = await response.json()

        if (!response.ok || !json.status || !json.result || !json.result.downloadUrl) {
            throw new Error(`Gagal mendapatkan media: ${json.message || response.statusText}`)
        }
        
        const { title, type, quality, duration, downloadUrl } = json.result
        
        const caption = `
*🎁 Vynaa YouTube Downloader (${type.toUpperCase()})*

*Judul:* ${title}
*Durasi:* ${duration}
*Kualitas:* ${quality || finalFormat}
        `.trim()
        
        if (type === 'audio' || command === 'ytmp3') {
            await vynaaObj.sendMessage(senderJid, {
                audio: { url: downloadUrl },
                mimetype: 'audio/mp4',
                fileName: `${title}.mp3`,
                caption: caption
            }, { quoted: msgObj })
        } else if (type === 'video' || command === 'ytmp4') {
            await vynaaObj.sendMessage(senderJid, {
                video: { url: downloadUrl },
                mimetype: 'video/mp4',
                fileName: `${title}.mp4`,
                caption: caption
            }, { quoted: msgObj })
        } else {
             replyFn(`❌ Gagal: Tipe media tidak didukung. Tipe: ${type}`);
        }


    } catch (error) {
        console.error(`Error YouTube DL ${command.toUpperCase()}:`, error)
        replyFn(`${globalThis.mess.error}\nDetail: ${error.message}`)
    }
}

function isOwnerNumber(jid) {
    if (!jid) return false;
    
    const ownerNum = globalThis.ownerNumber || '6282389924037';
    const adminList = globalThis.admin || [];
    
    // Clean the incoming JID
    const cleanNumber = jid.replace(/@s\.whatsapp\.net|@g\.us|:\d+/g, '');
    const cleanOwner = ownerNum.replace(/@s\.whatsapp\.net|@g\.us/g, '');
    
    // Direct number match
    if (cleanNumber === cleanOwner) return true;
    
    // Full JID match
    if (jid === `${cleanOwner}@s.whatsapp.net`) return true;
    if (jid === cleanOwner) return true;
    
    // Check admin list
    for (const admin of adminList) {
        const cleanAdmin = admin.replace(/@s\.whatsapp\.net|@g\.us/g, '');
        if (cleanNumber === cleanAdmin) return true;
        if (jid === admin) return true;
    }
    
    console.log(`[DEBUG isOwner] JID: ${jid}, CleanNum: ${cleanNumber}, Owner: ${cleanOwner}, Match: false`);
    return false;
}

function checkGroupAdmin(groupMetadata, participantJid) {
    if (!groupMetadata || !groupMetadata.participants) return false;
    
    // Clean participant JID - remove @s.whatsapp.net, @g.us, @lid, and :number suffix
    const cleanCheckJid = participantJid.replace(/@s\.whatsapp\.net|@g\.us|@lid|:\d+/g, '');
    
    const participant = groupMetadata.participants.find(p => {
        const cleanParticipantJid = p.id.replace(/@s\.whatsapp\.net|@g\.us|@lid|:\d+/g, '');
        return p.id === participantJid || cleanParticipantJid === cleanCheckJid;
    });
    
    if (!participant) return false;
    
    const adminStatus = participant.admin;
    if (adminStatus === "admin") return true;
    if (adminStatus === "superadmin") return true;
    if (adminStatus === "administrator") return true;
    if (adminStatus === true) return true;
    if (participant.isAdmin === true) return true;
    if (typeof adminStatus === 'string' && adminStatus.toLowerCase().includes('admin')) return true;
    
    return false;
}

function checkBotAdmin(groupMetadata, botJid) {
    if (!groupMetadata || !groupMetadata.participants) return false;
    
    // Fallback to owner if bot JID not available
    let checkJid = botJid;
    if (!checkJid) {
        checkJid = globalThis.ownerNumber || '6282389924037';
    }
    
    // Clean bot JID - remove @s.whatsapp.net, @g.us, @lid, and :number suffix
    const cleanBotJid = checkJid.replace(/@s\.whatsapp\.net|@g\.us|@lid|:\d+/g, '');
    
    const participant = groupMetadata.participants.find(p => {
        // Clean participant JID same way
        const cleanParticipantJid = p.id.replace(/@s\.whatsapp\.net|@g\.us|@lid|:\d+/g, '');
        
        // Check multiple formats
        return p.id === checkJid ||                                        // exact match
               cleanParticipantJid === cleanBotJid ||                     // cleaned number match
               p.id.includes(cleanBotJid) ||                             // participant contains bot number
               (cleanBotJid.length > 5 && p.id.startsWith(cleanBotJid)); // participant starts with bot number
    });
    
    if (!participant) {
        console.log(`[DEBUG checkBotAdmin] No participant found for bot. CheckJid: ${checkJid}, CleanJid: ${cleanBotJid}`);
        return false;
    }
    
    console.log(`[DEBUG checkBotAdmin] Found participant: ${participant.id}, Admin: ${participant.admin}, isAdmin: ${participant.isAdmin}`);
    
    // Use same logic as listadmin to detect admin status
    const adminStatus = participant.admin;
    return adminStatus === "admin" || 
           adminStatus === "superadmin" || 
           adminStatus === "administrator" || 
           adminStatus === true ||
           participant.isAdmin === true ||
           (typeof adminStatus === 'string' && adminStatus.toLowerCase().includes('admin'));
}

export default async (vynaa, m, meta) => {
    const { body, mediaType, remoteJid, senderJid, isGroup, pushname, download } = meta
    const msg = m.messages[0]
    if (!msg.message) return

    if (msg.key.fromMe) return

    if (processedMessages.has(msg.key.id)) return
    processedMessages.add(msg.key.id)
    setTimeout(() => processedMessages.delete(msg.key.id), 30000)

    let pplu;
    try {
        pplu = fs.readFileSync(globalThis.MenuImage)
    } catch (e) {
        pplu = Buffer.from([])
    }
    
    const quoteVynaa = {
        key: {
            participant: `0@s.whatsapp.net`,
            ...(msg.chat ? { remoteJid: `status@broadcast` } : {})
        },
        message: {
            contactMessage: {
                displayName: `${pushname}`,
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:XL;VynaaValerie,;;;\nFN: Vynaa Valerie V2.2\nitem1.TEL;waid=${senderJid.split("@")[0]}:+${senderJid.split("@")[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`,
                jpegThumbnail: pplu,
                thumbnail: pplu,
                sendEphemeral: true
            }
        }
    }

    // Initialize database on first message
    await initDatabase()

    // Count messages in groups (permanent storage)
    if (isGroup) {
        await incrementMessageCount(remoteJid, senderJid, pushname)
    }

    // Get group metadata early for protection checks
    let groupMetadata = null
    let isGroupAdmin = false
    let isBotAdmin = false
    
    if (isGroup) {
        try {
            groupMetadata = await vynaa.groupMetadata(remoteJid)
            isGroupAdmin = checkGroupAdmin(groupMetadata, senderJid)
            const botId = vynaa.user?.id
            isBotAdmin = checkBotAdmin(groupMetadata, botId)
        } catch (e) {
            console.error("Error getting group metadata:", e)
        }
    }

    // Group Protection Enforcement (before prefix check)
    if (isGroup && !isGroupAdmin && isBotAdmin) {
        let shouldDelete = false
        let deleteReason = ''

        // Antilink check
        if (isProtectionEnabled(remoteJid, 'antilink') && checkAntilink(body)) {
            shouldDelete = true
            deleteReason = '🔗 Link terdeteksi! Pesan dihapus.'
        }

        // Antiphoto check
        if (isProtectionEnabled(remoteJid, 'antiphoto') && checkAntiphoto(mediaType)) {
            shouldDelete = true
            deleteReason = '📷 Foto tidak diizinkan! Pesan dihapus.'
        }

        // Antivideo check
        if (isProtectionEnabled(remoteJid, 'antivideo') && checkAntivideo(mediaType)) {
            shouldDelete = true
            deleteReason = '🎬 Video tidak diizinkan! Pesan dihapus.'
        }

        // Antisticker check
        if (isProtectionEnabled(remoteJid, 'antisticker') && checkAntisticker(mediaType)) {
            shouldDelete = true
            deleteReason = '🎭 Sticker tidak diizinkan! Pesan dihapus.'
        }

        // Antiaudio check
        if (isProtectionEnabled(remoteJid, 'antiaudio') && checkAntiaudio(mediaType)) {
            shouldDelete = true
            deleteReason = '🎵 Audio tidak diizinkan! Pesan dihapus.'
        }

        if (shouldDelete) {
            try {
                await vynaa.sendMessage(remoteJid, { delete: msg.key })
                await vynaa.sendMessage(remoteJid, { 
                    text: `⚠️ @${senderJid.split('@')[0]}\n${deleteReason}`,
                    mentions: [senderJid]
                })
                return
            } catch (error) {
                console.error('Error deleting message:', error)
            }
        }
    }

    let usedPrefix = null
    for (const pre of globalThis.prefix) {
        if (body.startsWith(pre)) {
            usedPrefix = pre
            break
        }
    }
    
    if (!usedPrefix && !globalThis.noprefix) return

    const args = usedPrefix
        ? body.slice(usedPrefix.length).trim().split(" ")
        : body.trim().split(" ")

    const command = args.shift().toLowerCase()
    const q = args.join(" ")

    const vynaaReply = (teks) => vynaa.sendMessage(remoteJid, { text: teks }, { quoted: quoteVynaa })

    const isOwner = isOwnerNumber(senderJid)

    let MenuImage;
    try {
        MenuImage = fs.readFileSync(globalThis.MenuImage)
    } catch (e) {
        MenuImage = null
    }

    // AUTO DETECT GAME REPLY (No !jawab needed)
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    if (quotedMsg && body && body.length > 0 && !usedPrefix) {
        const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId
        const gameSession = getGameSessionByMessageId(quotedMsgId)
        
        if (gameSession) {
            try {
                const gameData = await getGameQuestion(gameSession.gameType, global.url.VynaaAPi, global.VynaaAPikey)
                const isCorrect = checkAnswer(body, gameData.answer, gameSession.gameType) === 'correct'
                
                const resultText = formatGameResult(isCorrect, body, gameData, gameSession.gameType)
                await vynaa.sendMessage(remoteJid, { text: resultText }, { quoted: msg })
                
                clearGameSession(gameSession.senderJid, isGroup ? remoteJid : null)
                return
            } catch (error) {
                console.error('Error Auto Game Reply:', error)
            }
        }
    }

    switch (command) {
        case "menu": {
            const menu = buildMenu();
            if (MenuImage) {
                await vynaa.sendMessage(remoteJid, {
                    image: MenuImage,
                    caption: menu,
                    mentions: [senderJid]
                }, { quoted: quoteVynaa })
            } else {
                await vynaaReply(menu)
            }
        }
        break

        case "ping": {
            const used = process.memoryUsage()
            const cpus = os.cpus().map(cpu => {
                cpu.total = Object.keys(cpu.times).reduce((last, type) => last + cpu.times[type], 0)
                return cpu
            })
            const cpu = cpus.reduce((last, cpu, _, { length }) => {
                last.total += cpu.total
                last.speed += cpu.speed / length
                last.times.user += cpu.times.user
                last.times.nice += cpu.times.nice
                last.times.sys += cpu.times.sys
                last.times.idle += cpu.times.idle
                last.times.irq += cpu.times.irq
                return last
            }, {
                speed: 0,
                total: 0,
                times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }
            })
            
            let pingText = `
*🏓 PONG!*

*💻 Server Info:*
├ Platform: ${os.platform()}
├ Arch: ${os.arch()}
├ Hostname: ${os.hostname()}
├ CPU: ${cpus[0]?.model || 'Unknown'}
├ Cores: ${cpus.length}
├ Speed: ${cpu.speed.toFixed(2)} MHz
└ Uptime: ${(os.uptime() / 3600).toFixed(2)} hours

*📊 Memory Usage:*
├ RSS: ${(used.rss / 1024 / 1024).toFixed(2)} MB
├ Heap Total: ${(used.heapTotal / 1024 / 1024).toFixed(2)} MB
├ Heap Used: ${(used.heapUsed / 1024 / 1024).toFixed(2)} MB
└ External: ${(used.external / 1024 / 1024).toFixed(2)} MB

*⏰ Bot Status:*
└ Online & Ready!
            `.trim()
            
            vynaaReply(pingText)
        }
        break

        case "admin": {
            if (!isGroupAdmin && !isOwner) return vynaaReply(globalThis.mess.admin)
            vynaaReply("🎁 *Kamu Adalah Admin*")
        }
        break

        case "owner": {
            if (!isOwner) return vynaaReply(globalThis.mess.owner)
            vynaaReply("🎁 *Kamu Adalah Owner*")
        }
        break

        case "group": {
            if (!isGroup) return vynaaReply(globalThis.mess.group)
            
            let groupInfo = ""
            if (groupMetadata) {
                groupInfo = `
*🎁 Informasi Grup*

*Nama Grup:* ${groupMetadata.subject}
*ID Grup:* ${groupMetadata.id}
*Pembuat:* @${groupMetadata.owner?.split('@')[0] || 'Tidak diketahui'}
*Tanggal Dibuat:* ${new Date(groupMetadata.creation * 1000).toLocaleDateString('id-ID')}
*Jumlah Anggota:* ${groupMetadata.participants?.length || 0}
*Deskripsi:* ${groupMetadata.desc || 'Tidak ada'}
*Hanya Admin:* ${groupMetadata.announce ? 'Ya' : 'Tidak'}
*Terkunci:* ${groupMetadata.restrict ? 'Ya' : 'Tidak'}
                `.trim()
            } else {
                groupInfo = "🎁 *Kamu Sedang Berada Di Dalam Grup*"
            }
            
            await vynaa.sendMessage(remoteJid, {
                text: groupInfo,
                mentions: groupMetadata?.owner ? [groupMetadata.owner] : []
            }, { quoted: quoteVynaa })
        }
        break

        case "bc": {
            if (!isOwner) {
                console.log(`BC Command: isOwner = ${isOwner}, senderJid = ${senderJid}, admin list = ${JSON.stringify(globalThis.admin)}`)
                return vynaaReply(globalThis.mess.owner)
            }
            if (!q) return vynaaReply("☘️ *Contoh:* !bc Pesan broadcast")
            
            const allChats = await vynaa.groupFetchAllParticipating()
            const groups = Object.values(allChats).filter(chat => chat.id.endsWith('@g.us'))
            
            vynaaReply(`🚀 *Mengirim Broadcast ke ${groups.length} grup...*`)
            
            let success = 0
            let failed = 0
            
            for (const group of groups) {
                try {
                    await vynaa.sendMessage(group.id, { 
                        text: `*📢 Broadcast dari Owner*\n\n${q}\n\n_Mohon jangan dibalas pesan ini_`,
                        mentions: []
                    })
                    success++
                    await new Promise(resolve => setTimeout(resolve, 1000))
                } catch (error) {
                    failed++
                    console.error(`Gagal mengirim ke ${group.id}:`, error)
                }
            }
            
            vynaaReply(`✅ *Broadcast Selesai!*\n\nBerhasil: ${success} grup\nGagal: ${failed} grup`)
        }
        break

        case "leaveall": {
            if (!isOwner) {
                console.log(`LeaveAll Command: isOwner = ${isOwner}, senderJid = ${senderJid}`)
                return vynaaReply(globalThis.mess.owner)
            }
            
            const allChats = await vynaa.groupFetchAllParticipating()
            const groups = Object.values(allChats).filter(chat => chat.id.endsWith('@g.us'))
            
            vynaaReply(`⚠ *Keluar dari ${groups.length} grup...*`)
            
            for (const group of groups) {
                try {
                    await vynaa.groupLeave(group.id)
                    console.log(`Left group: ${group.id}`)
                    await new Promise(resolve => setTimeout(resolve, 2000))
                } catch (error) {
                    console.error(`Gagal keluar dari ${group.id}:`, error)
                }
            }
            
            vynaaReply("✅ *Berhasil keluar dari semua grup*")
        }
        break

        case "setppbot": {
            if (!isOwner) return vynaaReply(globalThis.mess.owner)
            
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
            const mediaSource = quoted || msg.message
            
            if (!mediaSource?.imageMessage) {
                return vynaaReply("⚠ *Reply foto yang ingin dijadikan PP Bot*")
            }
            
            try {
                const stream = await download(mediaSource.imageMessage, 'image')
                let buffer = Buffer.from([])
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk])
                }
                
                await vynaa.updateProfilePicture(vynaa.user.id, buffer)
                vynaaReply("✅ *Foto profil bot berhasil diubah*")
            } catch (error) {
                console.error("Error setppbot:", error)
                vynaaReply("❌ *Gagal mengubah foto profil bot*")
            }
        }
        break

        case "stats": {
            if (!isOwner) return vynaaReply(globalThis.mess.owner)
            
            try {
                const allChats = await vynaa.groupFetchAllParticipating()
                const groups = Object.values(allChats).filter(chat => chat.id.endsWith('@g.us'))
                const privates = Object.values(allChats).filter(chat => chat.id.endsWith('@s.whatsapp.net'))
                
                const uptime = process.uptime()
                const hours = Math.floor(uptime / 3600)
                const minutes = Math.floor((uptime % 3600) / 60)
                
                const used = process.memoryUsage()
                
                let stats = `
╔════════════════════════════════════╗
║  📊 *BOT STATISTICS* 📊             ║
╚════════════════════════════════════╝

*📈 Chats:*
├ Groups: ${groups.length}
├ Private: ${privates.length}
└ Total: ${groups.length + privates.length}

*⏱️ Uptime:*
├ Hours: ${hours}
├ Minutes: ${minutes}
└ Status: 🟢 Online

*💾 Memory:*
├ Used: ${(used.heapUsed / 1024 / 1024).toFixed(2)} MB
└ Total: ${(used.heapTotal / 1024 / 1024).toFixed(2)} MB

*🚀 Bot Info:*
├ Version: 2.4
├ Owner: VynaaValerie
└ Status: Ready!

_Bot Sedang Aktif & Siap Melayani_
                `.trim()
                
                vynaaReply(stats)
            } catch (error) {
                vynaaReply(`❌ Error: ${error.message}`)
            }
        }
        break

        case "bclist": {
            if (!isOwner) return vynaaReply(globalThis.mess.owner)
            if (!q) return vynaaReply("☘️ *Contoh:* !bclist Halo semuanya!")
            
            try {
                const allChats = await vynaa.groupFetchAllParticipating()
                const privates = Object.values(allChats).filter(chat => chat.id.endsWith('@s.whatsapp.net'))
                
                vynaaReply(`🚀 *Mengirim ke ${privates.length} kontak...*`)
                
                let success = 0
                for (const chat of privates) {
                    try {
                        await vynaa.sendMessage(chat.id, { 
                            text: `*📢 Pesan dari Owner*\n\n${q}` 
                        })
                        success++
                        await new Promise(resolve => setTimeout(resolve, 500))
                    } catch (e) {
                        console.error(`Gagal ke ${chat.id}:`, e)
                    }
                }
                
                vynaaReply(`✅ *Berhasil kirim ke ${success}/${privates.length} kontak*`)
            } catch (error) {
                vynaaReply(`❌ Error: ${error.message}`)
            }
        }
        break

        case "welcome": {
            if (!isGroup) return vynaaReply(globalThis.mess.group)
            if (!isGroupAdmin && !isOwner) return vynaaReply(globalThis.mess.admin)
            
            if (!q) {
                return vynaaReply(`
*⚙️ Set Welcome Message*

Contoh:
!welcome Halo @user selamat datang di ${groupMetadata?.subject || 'grup'}!

Variabel:
- @user = Nama member baru
- @time = Waktu
- @group = Nama grup
                `.trim())
            }
            
            try {
                const welcomeData = {
                    groupId: remoteJid,
                    message: q,
                    enabled: true,
                    createdAt: new Date().toISOString()
                }
                
                vynaaReply(`✅ *Welcome message di-set!*\n\nPesan:\n${q}`)
                console.log('Welcome message saved:', welcomeData)
            } catch (error) {
                vynaaReply(`❌ Error: ${error.message}`)
            }
        }
        break

        case "antilink": {
            if (!isGroup) return vynaaReply(globalThis.mess.group)
            if (!isGroupAdmin && !isOwner) return vynaaReply(globalThis.mess.admin)
            
            const setting = q.toLowerCase() === 'on' ? 'on' : 'off'
            
            try {
                vynaaReply(`✅ *Anti-link ${setting.toUpperCase()}*\n\n_Member yang kirim link akan di-kick_`)
                console.log(`Antilink ${setting} untuk group ${remoteJid}`)
            } catch (error) {
                vynaaReply(`❌ Error: ${error.message}`)
            }
        }
        break

        case "hidetag": {
            if (!isGroup) return vynaaReply(globalThis.mess.group)
            if (!isOwner && !isGroupAdmin) {
                console.log(`Hidetag: isOwner=${isOwner}, isGroupAdmin=${isGroupAdmin}, senderJid=${senderJid}`)
                return vynaaReply("⚠ *Perintah ini hanya untuk Owner atau Admin Grup*")
            }

            const contentToHideTag = getQuotedMessageContent(msg, q)
            let pesanHidetag = contentToHideTag.text

            if (!pesanHidetag) {
                return vynaaReply("⚠ *Mohon balas pesan (reply) atau sertakan teks yang ingin dikirim*")
            }
            
            const hiddenTagText = pesanHidetag + '\n' + '\u200b'.repeat(1000)

            await vynaa.sendMessage(remoteJid, {
                text: hiddenTagText,
                mentions: groupMetadata.participants.map(p => p.id)
            }, { quoted: msg })
        }
        break

        case "tagall": {
            if (!isGroup) return vynaaReply(globalThis.mess.group)
            if (!isOwner && !isGroupAdmin) return vynaaReply("⚠ *Perintah ini hanya untuk Owner atau Admin Grup*")

            const members = groupMetadata.participants
            let tagMessage = `📢 *PEMBERITAHUAN DARI ADMIN*\n\n`
            
            members.forEach((member, index) => {
                tagMessage += `@${member.id.split('@')[0]} `
                if ((index + 1) % 5 === 0) tagMessage += '\n'
            })
            
            tagMessage += `\n\n${q || "Semua anggota grup harap memperhatikan!"}`
            
            await vynaa.sendMessage(remoteJid, {
                text: tagMessage,
                mentions: members.map(m => m.id)
            }, { quoted: msg })
        }
        break

        case "kick": {
            if (!isGroup) return vynaaReply(globalThis.mess.group)
            if (!isOwner && !isGroupAdmin) return vynaaReply("⚠ *Perintah ini hanya untuk Owner atau Admin Grup*")
            
            // Debug kick check
            console.log(`[DEBUG kick] isOwner: ${isOwner}, isGroupAdmin: ${isGroupAdmin}, isBotAdmin: ${isBotAdmin}`)
            
            if (!isBotAdmin && !isOwner) return vynaaReply(globalThis.mess.botAdmin)

            const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
            
            if (mentionedJid.length === 0) {
                return vynaaReply("⚠ *Tag orang yang ingin di-kick*")
            }

            let successCount = 0
            let failCount = 0
            
            for (const userJid of mentionedJid) {
                try {
                    const participant = groupMetadata.participants.find(p => p.id === userJid)
                    if (participant && (participant.admin === "admin" || participant.admin === "superadmin" || participant.admin === "administrator")) {
                        await vynaa.sendMessage(remoteJid, { 
                            text: `⚠ Tidak bisa mengeluarkan admin: @${userJid.split('@')[0]}`,
                            mentions: [userJid]
                        }, { quoted: msg })
                        failCount++
                        continue
                    }
                    
                    await vynaa.groupParticipantsUpdate(remoteJid, [userJid], "remove")
                    successCount++
                    await new Promise(resolve => setTimeout(resolve, 500))
                } catch (error) {
                    console.error(`Gagal kick ${userJid}:`, error)
                    failCount++
                }
            }
            
            vynaaReply(`✅ *Kick Selesai*\n\nBerhasil: ${successCount} orang\nGagal: ${failCount} orang`)
        }
        break

        case "add": {
            if (!isGroup) return vynaaReply(globalThis.mess.group)
            if (!isOwner && !isGroupAdmin) return vynaaReply("⚠ *Perintah ini hanya untuk Owner atau Admin Grup*")
            if (!isBotAdmin && !isOwner) return vynaaReply(globalThis.mess.botAdmin)
            if (!q) return vynaaReply("⚠ *Masukkan nomor yang ingin di-add*")

            const numbers = q.split(/[,\s]+/).map(num => {
                num = num.replace(/[^0-9]/g, '')
                if (num.startsWith('0')) num = '62' + num.slice(1)
                if (!num.startsWith('62')) num = '62' + num
                return num.includes('@') ? num : num + '@s.whatsapp.net'
            })

            vynaaReply(`🚀 *Menambahkan ${numbers.length} orang ke grup...*`)
            
            let successCount = 0
            let failCount = 0
            
            for (const num of numbers) {
                try {
                    await vynaa.groupParticipantsUpdate(remoteJid, [num], "add")
                    successCount++
                    await new Promise(resolve => setTimeout(resolve, 1000))
                } catch (error) {
                    console.error(`Gagal add ${num}:`, error)
                    failCount++
                }
            }
            
            vynaaReply(`✅ *Add Selesai*\n\nBerhasil: ${successCount} orang\nGagal: ${failCount} orang`)
        }
        break

        case "promote": {
            if (!isGroup) return vynaaReply(globalThis.mess.group)
            if (!isOwner && !isGroupAdmin) return vynaaReply("⚠ *Perintah ini hanya untuk Owner atau Admin Grup*")
            if (!isBotAdmin && !isOwner) return vynaaReply(globalThis.mess.botAdmin)

            const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
            
            if (mentionedJid.length === 0) {
                return vynaaReply("⚠ *Tag orang yang ingin di-promote*")
            }

            let successCount = 0
            let failCount = 0
            
            for (const userJid of mentionedJid) {
                try {
                    await vynaa.groupParticipantsUpdate(remoteJid, [userJid], "promote")
                    successCount++
                    await new Promise(resolve => setTimeout(resolve, 500))
                } catch (error) {
                    console.error(`Gagal promote ${userJid}:`, error)
                    failCount++
                }
            }
            
            vynaaReply(`✅ *Promote Selesai*\n\nBerhasil: ${successCount} orang\nGagal: ${failCount} orang`)
        }
        break

        case "demote": {
            if (!isGroup) return vynaaReply(globalThis.mess.group)
            if (!isOwner && !isGroupAdmin) return vynaaReply("⚠ *Perintah ini hanya untuk Owner atau Admin Grup*")
            if (!isBotAdmin && !isOwner) return vynaaReply(globalThis.mess.botAdmin)

            const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
            
            if (mentionedJid.length === 0) {
                return vynaaReply("⚠ *Tag orang yang ingin di-demote*")
            }

            let successCount = 0
            let failCount = 0
            
            for (const userJid of mentionedJid) {
                try {
                    await vynaa.groupParticipantsUpdate(remoteJid, [userJid], "demote")
                    successCount++
                    await new Promise(resolve => setTimeout(resolve, 500))
                } catch (error) {
                    console.error(`Gagal demote ${userJid}:`, error)
                    failCount++
                }
            }
            
            vynaaReply(`✅ *Demote Selesai*\n\nBerhasil: ${successCount} orang\nGagal: ${failCount} orang`)
        }
        break

        case "closegc": {
            if (!isGroup) return vynaaReply(globalThis.mess.group)
            if (!isOwner && !isGroupAdmin) return vynaaReply("⚠ *Perintah ini hanya untuk Owner atau Admin Grup*")
            if (!isBotAdmin && !isOwner) return vynaaReply(globalThis.mess.botAdmin)
            
            try {
                await vynaa.groupSettingUpdate(remoteJid, 'announcement')
                vynaaReply("🔒 *Grup berhasil ditutup!*\nHanya admin yang dapat mengirim pesan.")
            } catch (error) {
                console.error("Error closegc:", error)
                vynaaReply("❌ *Gagal menutup grup*")
            }
        }
        break

        case "opengc": {
            if (!isGroup) return vynaaReply(globalThis.mess.group)
            if (!isOwner && !isGroupAdmin) return vynaaReply("⚠ *Perintah ini hanya untuk Owner atau Admin Grup*")
            if (!isBotAdmin && !isOwner) return vynaaReply(globalThis.mess.botAdmin)
            
            try {
                await vynaa.groupSettingUpdate(remoteJid, 'not_announcement')
                vynaaReply("🔓 *Grup berhasil dibuka!*\nSemua anggota dapat mengirim pesan.")
            } catch (error) {
                console.error("Error opengc:", error)
                vynaaReply("❌ *Gagal membuka grup*")
            }
        }
        break

        case "setname": {
            if (!isGroup) return vynaaReply(globalThis.mess.group)
            if (!isOwner && !isGroupAdmin) return vynaaReply("⚠ *Perintah ini hanya untuk Owner atau Admin Grup*")
            if (!isBotAdmin && !isOwner) return vynaaReply(globalThis.mess.botAdmin)
            if (!q) return vynaaReply("⚠ *Masukkan nama grup baru*")
            
            try {
                await vynaa.groupUpdateSubject(remoteJid, q)
                vynaaReply(`✅ *Nama grup berhasil diubah menjadi:* ${q}`)
            } catch (error) {
                console.error("Error setname:", error)
                vynaaReply("❌ *Gagal mengubah nama grup*")
            }
        }
        break

        case "setdesc": {
            if (!isGroup) return vynaaReply(globalThis.mess.group)
            if (!isOwner && !isGroupAdmin) return vynaaReply("⚠ *Perintah ini hanya untuk Owner atau Admin Grup*")
            if (!isBotAdmin && !isOwner) return vynaaReply(globalThis.mess.botAdmin)
            if (!q) return vynaaReply("⚠ *Masukkan deskripsi grup baru*")
            
            try {
                await vynaa.groupUpdateDescription(remoteJid, q)
                vynaaReply(`✅ *Deskripsi grup berhasil diubah*`)
            } catch (error) {
                console.error("Error setdesc:", error)
                vynaaReply("❌ *Gagal mengubah deskripsi grup*")
            }
        }
        break

        case "antilink": {
            if (!isGroup) return vynaaReply(globalThis.mess.group)
            if (!isOwner && !isGroupAdmin) return vynaaReply("⚠ *Perintah ini hanya untuk Owner atau Admin Grup*")
            
            vynaaReply("🔗 *Fitur Anti-Link*\n\nStatus: Aktif\nAksi: Hapus pesan + Warning\n\n*Note:* Fitur ini memerlukan konfigurasi tambahan untuk mendeteksi link secara real-time.")
        }
        break

        case "listadmin": {
            if (!isGroup) return vynaaReply(globalThis.mess.group)
            
            // Debug: Print participant data
            console.log(`[DEBUG listadmin] Total participants: ${groupMetadata.participants?.length}`)
            groupMetadata.participants?.slice(0, 3).forEach(p => {
                console.log(`[DEBUG listadmin] Participant: ${p.id}, admin status: ${p.admin}, isAdmin: ${p.isAdmin}`)
            })
            
            // Improved filter to handle various admin status formats
            const admins = groupMetadata.participants.filter(p => {
                const adminStatus = p.admin;
                return adminStatus === "admin" || 
                       adminStatus === "superadmin" || 
                       adminStatus === "administrator" || 
                       adminStatus === true ||
                       p.isAdmin === true ||
                       (typeof adminStatus === 'string' && adminStatus.toLowerCase().includes('admin'));
            })
            
            if (admins.length === 0) {
                return vynaaReply("ℹ️ *Tidak ada admin di grup ini*")
            }
            
            let adminList = `*👑 Daftar Admin Grup*\n\n`
            admins.forEach((admin, index) => {
                const role = admin.admin === "superadmin" ? "Super Admin" : "Admin"
                const name = admin.id.split('@')[0]
                adminList += `${index + 1}. @${name} (${role})\n`
            })
            
            adminList += `\n*Total Admin:* ${admins.length} orang`
            
            await vynaa.sendMessage(remoteJid, {
                text: adminList,
                mentions: admins.map(a => a.id)
            }, { quoted: msg })
        }
        break

        case "ai": {
            if (!q) return vynaaReply("☘️ *Contoh:* !ai Apa itu JavaScript?")
            vynaaReply(globalThis.mess.wait)
            try {
                const lenai = await Ai4Chat(q)
                vynaaReply(lenai)
            } catch (error) {
                console.error("Error AI:", error)
                vynaaReply(globalThis.mess.error)
            }
        }
        break

        case "ttdl":
        case "ttdl2": {
            if (!q) return vynaaReply("☘️ *Contoh:* !ttdl https://vt.tiktok.com/...")
            vynaaReply(globalThis.mess.wait)
            try {
                const result = await tiktok2(q)
                
                const caption = `
*🎁 Vynaa TikTok Downloader*

*Judul:* ${result.title}
                `.trim()
                
                await vynaa.sendMessage(remoteJid, {
                    video: { url: result.no_watermark },
                    caption: caption
                }, { quoted: msg })

            } catch (error) {
                console.error("Error TTDL:", error)
                vynaaReply(`${globalThis.mess.error}\nDetail: ${error.message}`)
            }
        }
        break

        case "fbdl": {
            if (!q) return vynaaReply("☘️ *Contoh:* !fbdl https://fb.watch/...")
            vynaaReply(globalThis.mess.wait)
            try {
                const apiUrl = `${global.url.VynaaAPi}/downloader/facebook/?apikey=${global.VynaaAPikey}&url=${encodeURIComponent(q.trim())}`
                
                const response = await fetch(apiUrl)
                const json = await response.json()

                if (!response.ok || !json.status || !json.result) {
                    throw new Error(`Gagal mendapatkan video: ${json.message || response.statusText}`)
                }
                
                const caption = `
*🎁 Vynaa Facebook Downloader*

*Judul:* ${json.result.title || 'Facebook Video'}
                `.trim()
                
                await vynaa.sendMessage(remoteJid, {
                    video: { url: json.result.hd || json.result.sd },
                    caption: caption
                }, { quoted: msg })

            } catch (error) {
                console.error("Error FBDL:", error)
                vynaaReply(`${globalThis.mess.error}\nDetail: ${error.message}`)
            }
        }
        break

        case "igdl": {
            if (!q) return vynaaReply("☘️ *Contoh:* !igdl https://www.instagram.com/p/...")
            vynaaReply(globalThis.mess.wait)
            try {
                const apiUrl = `${global.url.VynaaAPi}/downloader/instagram/?apikey=${global.VynaaAPikey}&url=${encodeURIComponent(q.trim())}`
                
                const response = await fetch(apiUrl)
                const json = await response.json()

                if (!response.ok || !json.status || !json.result) {
                    throw new Error(`Gagal mendapatkan media: ${json.message || response.statusText}`)
                }
                
                const media = json.result[0] || json.result
                
                if (media.type === 'video' || media.url?.includes('.mp4')) {
                    await vynaa.sendMessage(remoteJid, {
                        video: { url: media.url },
                        caption: `*🎁 Vynaa Instagram Downloader*`
                    }, { quoted: msg })
                } else {
                    await vynaa.sendMessage(remoteJid, {
                        image: { url: media.url },
                        caption: `*🎁 Vynaa Instagram Downloader*`
                    }, { quoted: msg })
                }

            } catch (error) {
                console.error("Error IGDL:", error)
                vynaaReply(`${globalThis.mess.error}\nDetail: ${error.message}`)
            }
        }
        break

        case "ytmp3": {
            await handleYoutubeDownload('ytmp3', q, 'mp3', vynaaReply, msg, vynaa, remoteJid)
        }
        break

        case "ytmp4": {
            await handleYoutubeDownload('ytmp4', q, '720', vynaaReply, msg, vynaa, remoteJid)
        }
        break

        case "play": {
            if (!q) return vynaaReply("☘️ *Contoh:* !play Dewa 19 Kangen")
            vynaaReply(globalThis.mess.wait)
            try {
                const searchUrl = `${global.url.VynaaAPi}/search/ytsearch/?apikey=${global.VynaaAPikey}&query=${encodeURIComponent(q.trim())}`
                
                const searchResponse = await fetch(searchUrl)
                const searchJson = await searchResponse.json()

                if (!searchResponse.ok || !searchJson.status || !searchJson.result || searchJson.result.length === 0) {
                    throw new Error(`Tidak ditemukan hasil untuk: ${q}`)
                }
                
                const video = searchJson.result[0]
                
                const apiUrl = `${global.url.VynaaAPi}/downloader/youtube/?apikey=${global.VynaaAPikey}&url=${encodeURIComponent(video.url)}&format=mp3`
                
                const response = await fetch(apiUrl)
                const json = await response.json()

                if (!response.ok || !json.status || !json.result || !json.result.downloadUrl) {
                    throw new Error(`Gagal mendapatkan audio: ${json.message || response.statusText}`)
                }
                
                const { title, duration, downloadUrl } = json.result
                
                const caption = `
*🎁 Vynaa Play Music*

*Judul:* ${title}
*Durasi:* ${duration}
                `.trim()
                
                await vynaa.sendMessage(remoteJid, {
                    audio: { url: downloadUrl },
                    mimetype: 'audio/mp4',
                    fileName: `${title}.mp3`
                }, { quoted: msg })

            } catch (error) {
                console.error("Error PLAY:", error)
                vynaaReply(`${globalThis.mess.error}\nDetail: ${error.message}`)
            }
        }
        break

        case "yts": {
            if (!q) return vynaaReply("☘️ *Contoh:* !yts tutorial javascript")
            vynaaReply(globalThis.mess.wait)
            try {
                const apiUrl = `${global.url.VynaaAPi}/search/ytsearch/?apikey=${global.VynaaAPikey}&query=${encodeURIComponent(q.trim())}`
                
                const response = await fetch(apiUrl)
                const json = await response.json()

                if (!response.ok || !json.status || !json.result || json.result.length === 0) {
                    throw new Error(`Tidak ditemukan hasil untuk: ${q}`)
                }
                
                let resultText = `*🎁 Vynaa YouTube Search*\n\n*Query:* ${q}\n\n`
                
                json.result.slice(0, 5).forEach((video, index) => {
                    resultText += `*${index + 1}. ${video.title}*\n`
                    resultText += `├ Durasi: ${video.duration || 'N/A'}\n`
                    resultText += `├ Views: ${video.views || 'N/A'}\n`
                    resultText += `├ Channel: ${video.author?.name || 'N/A'}\n`
                    resultText += `└ URL: ${video.url}\n\n`
                })

                vynaaReply(resultText.trim())

            } catch (error) {
                console.error("Error YTS:", error)
                vynaaReply(`${globalThis.mess.error}\nDetail: ${error.message}`)
            }
        }
        break

        case "lirik": {
            if (!q) return vynaaReply("☘️ *Contoh:* !lirik Dewa 19 Kangen")
            vynaaReply(globalThis.mess.wait)
            try {
                const apiUrl = `${global.url.VynaaAPi}/search/lirik/?apikey=${global.VynaaAPikey}&query=${encodeURIComponent(q.trim())}`
                
                const response = await fetch(apiUrl)
                const json = await response.json()

                if (!response.ok || !json.status || !json.result) {
                    throw new Error(`Lirik tidak ditemukan untuk: ${q}`)
                }
                
                const { title, artist, lyrics } = json.result
                
                const resultText = `
*🎵 Vynaa Lirik Finder*

*Judul:* ${title}
*Artis:* ${artist}

${lyrics}
                `.trim()

                vynaaReply(resultText)

            } catch (error) {
                console.error("Error LIRIK:", error)
                vynaaReply(`${globalThis.mess.error}\nDetail: ${error.message}`)
            }
        }
        break

        case "pinsearch": {
            if (!q) return vynaaReply("☘️ *Contoh:* !pinsearch anime wallpaper")
            vynaaReply(globalThis.mess.wait)
            try {
                const apiUrl = `${global.url.VynaaAPi}/search/pinterest/?apikey=${global.VynaaAPikey}&query=${encodeURIComponent(q.trim())}`
                
                const response = await fetch(apiUrl)
                const json = await response.json()

                if (!response.ok || !json.status || !json.result || json.result.length === 0) {
                    throw new Error(`Tidak ditemukan gambar untuk: ${q}`)
                }
                
                const randomIndex = Math.floor(Math.random() * json.result.length)
                const randomImage = json.result[randomIndex]
                
                await vynaa.sendMessage(remoteJid, {
                    image: { url: randomImage },
                    caption: `*🎁 Vynaa Pinterest Search*\n\n*Query:* ${q}`
                }, { quoted: msg })

            } catch (error) {
                console.error("Error PINSEARCH:", error)
                vynaaReply(`${globalThis.mess.error}\nDetail: ${error.message}`)
            }
        }
        break

        case "pindl": {
            if (!q) return vynaaReply("☘️ *Contoh:* !pindl https://pin.it/...")
            vynaaReply(globalThis.mess.wait)
            try {
                const apiUrl = `${global.url.VynaaAPi}/downloader/pinterest/?apikey=${global.VynaaAPikey}&url=${encodeURIComponent(q.trim())}`
                
                const response = await fetch(apiUrl)
                const json = await response.json()

                if (!response.ok || !json.status || !json.result) {
                    throw new Error(`Gagal download Pinterest: ${json.message || response.statusText}`)
                }
                
                await vynaa.sendMessage(remoteJid, {
                    image: { url: json.result.image || json.result },
                    caption: `*🎁 Vynaa Pinterest Downloader*`
                }, { quoted: msg })

            } catch (error) {
                console.error("Error PINDL:", error)
                vynaaReply(`${globalThis.mess.error}\nDetail: ${error.message}`)
            }
        }
        break

        case "ccdl": {
            if (!q) return vynaaReply("☘️ *Contoh:* !ccdl https://capcut.com/...")
            vynaaReply(globalThis.mess.wait)
            try {
                const apiUrl = `${global.url.VynaaAPi}/downloader/capcut/?apikey=${global.VynaaAPikey}&url=${encodeURIComponent(q.trim())}`
                
                const response = await fetch(apiUrl)
                const json = await response.json()

                if (!response.ok || !json.status || !json.result) {
                    throw new Error(`Gagal download CapCut: ${json.message || response.statusText}`)
                }
                
                await vynaa.sendMessage(remoteJid, {
                    video: { url: json.result.video || json.result.download },
                    caption: `*🎁 Vynaa CapCut Downloader*\n\n*Judul:* ${json.result.title || 'CapCut Video'}`
                }, { quoted: msg })

            } catch (error) {
                console.error("Error CCDL:", error)
                vynaaReply(`${globalThis.mess.error}\nDetail: ${error.message}`)
            }
        }
        break

        case "ttssearch": {
            if (!q) return vynaaReply("☘️ *Contoh:* !ttssearch fyp dance")
            vynaaReply(globalThis.mess.wait)
            try {
                const apiUrl = `${global.url.VynaaAPi}/search/tiktok/?apikey=${global.VynaaAPikey}&query=${encodeURIComponent(q.trim())}`
                
                const response = await fetch(apiUrl)
                const json = await response.json()

                if (!response.ok || !json.status || !json.result || !json.result.data || json.result.data.length === 0) {
                    throw new Error(`Gagal mencari video TikTok: ${json.message || response.statusText}`)
                }
                
                const videos = json.result.data
                const randomIndex = Math.floor(Math.random() * videos.length)
                const randomVideo = videos[randomIndex]

                const caption = `
*🎁 Vynaa TikTok Search (Random Result)*

*Judul:* ${randomVideo.title}
*Durasi:* ${randomVideo.duration} detik
*Tayangan:* ${randomVideo.play_count?.toLocaleString() || 'N/A'}
                `.trim()
                
                await vynaa.sendMessage(remoteJid, {
                    video: { url: randomVideo.play },
                    caption: caption
                }, { quoted: msg })

            } catch (error) {
                console.error("Error TTSSEARCH:", error)
                vynaaReply(`${globalThis.mess.error}\nDetail: ${error.message}`)
            }
        }
        break

        case "rch": {
            if (!q) return vynaaReply("☘️ *Contoh:* !rch https://whatsapp.com/channel/..|👍,🩷,💚")
            const [link, emojis] = q.split('|').map(t => t.trim());
            if (!link || !emojis) return vynaaReply("⚠ *Format Salah!* Gunakan `!rch LinkChannel|Emoji1,Emoji2,Emoji3`")
            
            vynaaReply(globalThis.mess.wait)

            try {
                const apiUrl = `${global.url.VynaaAPi}/tools/rch/rch?apikey=${global.VynaaAPikey}&link=${encodeURIComponent(link)}&emoji=${encodeURIComponent(emojis)}`
                
                const response = await fetch(apiUrl)
                const json = await response.json()

                if (!response.ok || !json.status) {
                    throw new Error(`Reaksi Gagal: ${json.message || response.statusText}`)
                }
                
                const resultText = `
*🎁 Vynaa WhatsApp Channel Reaction*

*Pesan:* ${json.message}
*Link:* ${json.result?.link || link}
*Emoji:* ${json.result?.emojis || emojis}
                `.trim()

                await vynaaReply(resultText)

            } catch (error) {
                console.error("Error RCH:", error)
                vynaaReply(`${globalThis.mess.error}\nDetail: ${error.message}`)
            }
        }
        break

        case "ssm":
        case "ssd": {
            if (!q) return vynaaReply("☘️ *Contoh:* !ssm https://vynaa.web.id")
            const type = command === 'ssm' ? 'mobile' : 'desktop'
            
            vynaaReply(globalThis.mess.wait)

            try {
                const apiUrl = `${global.url.VynaaAPi}/tools/screenshot/${type}?apikey=${global.VynaaAPikey}&url=${encodeURIComponent(q.trim())}`
                
                const response = await fetch(apiUrl)
                const json = await response.json()

                if (!response.ok || !json.status || !json.data || !json.data.screenshot_url) {
                    throw new Error(`Screenshot Gagal: ${json.message || response.statusText}`)
                }
                
                const { screenshot_url, viewport, url } = json.data

                const caption = `
*🎁 Vynaa Screenshot (${type.toUpperCase()})*

*URL:* ${url}
*Viewport:* ${viewport}
                `.trim()

                await vynaa.sendMessage(remoteJid, {
                    image: { url: screenshot_url },
                    caption: caption
                }, { quoted: msg })

            } catch (error) {
                console.error(`Error SS ${type.toUpperCase()}:`, error)
                vynaaReply(`${globalThis.mess.error}\nDetail: ${error.message}`)
            }
        }
        break

        case "upscale": {
            vynaaReply(globalThis.mess.wait)
            
            let finalURL = null;
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const mediaSource = quoted || msg.message;
            
            let isMediaReply = mediaSource?.imageMessage; 

            if (isMediaReply) {
                try {
                    let mediaType = 'imageMessage';
                    const stream = await download(mediaSource[mediaType], 'image');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }

                    finalURL = await uploadToCatbox(buffer);
                    
                } catch (e) {
                    console.error("Error downloading/uploading media for Upscale:", e);
                    return vynaaReply(`❌ Gagal mengunduh atau mengunggah gambar ke hosting: ${e.message}`);
                }
            } else if (q && q.match(/^https?:\/\//i)) {
                finalURL = q.trim();
            } else {
                return vynaaReply("⚠ *Berikan URL gambar atau reply gambar yang ingin di Upscale.*");
            }

            if (!finalURL) return vynaaReply('❌ Gagal mendapatkan URL gambar untuk di upscale.');

            try {
                const apiUrl = `${global.url.VynaaAPi}/tools/upscale?apikey=${global.VynaaAPikey}&url=${encodeURIComponent(finalURL)}`
                
                const response = await fetch(apiUrl)

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API response status: ${response.status} - ${errorText}`)
                }
                
                const contentType = response.headers.get('content-type');
                
                if (contentType && contentType.includes('application/json')) {
                    const json = await response.json();
                    if (json.status && json.result && json.result.imageUrl) {
                        const imageResponse = await fetch(json.result.imageUrl);
                        if (!imageResponse.ok) throw new Error(`Gagal mengunduh gambar hasil upscale: ${imageResponse.status}`);
                        
                        const imageBuffer = await imageResponse.buffer();
                        await vynaa.sendMessage(remoteJid, { 
                            image: imageBuffer,
                            caption: `*🎁 Upscale Image By Vynaa*`
                        }, { quoted: quoteVynaa });
                    } else {
                        throw new Error(`API tidak mengembalikan data yang valid: ${JSON.stringify(json)}`);
                    }
                } else {
                    const imageBuffer = await response.buffer();
                    await vynaa.sendMessage(remoteJid, { 
                        image: imageBuffer,
                        caption: `*🎁 Upscale Image By Vynaa*`
                    }, { quoted: quoteVynaa });
                }

            } catch (error) {
                console.error("Error UPSCALE:", error)
                vynaaReply(`${globalThis.mess.error}\nDetail: ${error.message}`)
            }
        }
        break

        case "balogo": {
            if (!q) return vynaaReply("☘️ *Contoh:* !balogo MS|Vynaa")
            const [textL, textR] = q.split('|')
            if (!textL || !textR) return vynaaReply("⚠ *Format Salah!* Gunakan `!balogo TeksKiri|TeksKanan`")

            vynaaReply(globalThis.mess.wait)

            try {
                const apiUrl = `${global.url.VynaaAPi}/canvas/ba-logo/?apikey=${global.VynaaAPikey}&textL=${encodeURIComponent(textL.trim())}&textR=${encodeURIComponent(textR.trim())}`
                
                const response = await fetch(apiUrl)

                if (!response.ok) {
                    throw new Error(`API response status: ${response.status}`)
                }
                
                const imageBuffer = await response.buffer()

                await vynaa.sendMessage(remoteJid, { 
                    image: imageBuffer,
                    caption: `*🎁 Logo By Vynaa*`
                }, { quoted: quoteVynaa })

            } catch (error) {
                console.error("Error BALogo:", error)
                vynaaReply(globalThis.mess.error)
            }
        }
        break

        case "brat": {
            if (!q) return vynaaReply("☘️ *Contoh:* !brat VynaaValerie")
            
            vynaaReply(globalThis.mess.wait)

            try {
                const apiUrl = `${global.url.VynaaAPi}/canvas/brat/v1?apikey=${global.VynaaAPikey}&text=${encodeURIComponent(q.trim())}`
                
                const response = await fetch(apiUrl)

                if (!response.ok) {
                    throw new Error(`API response status: ${response.status}`)
                }
                
                const imageBuffer = await response.buffer()

                const stickerPath = await writeExif(
                  { mimetype: 'image/jpeg', data: imageBuffer },
                  { packname: globalThis.spackname, author: globalThis.sauthor }
                )

                await vynaa.sendMessage(remoteJid, { 
                    sticker: fs.readFileSync(stickerPath) 
                }, { quoted: quoteVynaa })

            } catch (error) {
                console.error("Error BRAT:", error)
                vynaaReply(globalThis.mess.error)
            }
        }
        break

        case "bratimg": {
            if (!q) return vynaaReply("☘️ *Contoh:* !bratimg VynaaValerie")
            
            vynaaReply(globalThis.mess.wait)

            try {
                const apiUrl = `${global.url.VynaaAPi}/canvas/brat/v1?apikey=${global.VynaaAPikey}&text=${encodeURIComponent(q.trim())}`
                
                const response = await fetch(apiUrl)

                if (!response.ok) {
                    throw new Error(`API response status: ${response.status}`)
                }
                
                const imageBuffer = await response.buffer()

                await vynaa.sendMessage(remoteJid, { 
                    image: imageBuffer,
                    caption: `*🎁 Text Badai Api By Vynaa (Image)*`
                }, { quoted: quoteVynaa })

            } catch (error) {
                console.error("Error BRAT Image:", error)
                vynaaReply(globalThis.mess.error)
            }
        }
        break

        case "bratvid": {
            if (!q) return vynaaReply("☘️ *Contoh:* !bratvid VynaaValerie")
            
            vynaaReply(globalThis.mess.wait)

            try {
                const apiUrl = `${global.url.VynaaAPi}/makar/bratvid/?apikey=${global.VynaaAPikey}&text=${encodeURIComponent(q.trim())}`
                
                const response = await fetch(apiUrl)

                if (!response.ok) {
                    throw new Error(`API response status: ${response.status}`)
                }
                
                const buffer = await response.buffer()
                
                const stickerPath = await writeExif(
                  { mimetype: 'image/webp', data: buffer },
                  { packname: globalThis.spackname, author: globalThis.sauthor }
                )

                await vynaa.sendMessage(remoteJid, { 
                    sticker: fs.readFileSync(stickerPath) 
                }, { quoted: quoteVynaa })

            } catch (error) {
                console.error("Error BRATVID:", error)
                vynaaReply(globalThis.mess.error)
            }
        }
        break

        case "pinkhero": {
            vynaaReply(globalThis.mess.wait)

            let imageURL = null;
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            
            if (quoted && quoted.imageMessage) {
                try {
                    const stream = await download(quoted.imageMessage, 'image');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }
                    
                    imageURL = await uploadToCatbox(buffer);
                } catch (e) {
                    console.error("Error downloading/uploading media for PinkHero:", e);
                    return vynaaReply(`❌ Gagal mengunduh atau mengunggah gambar: ${e.message}`);
                }
            } else if (q && q.match(/^https?:\/\//i)) {
                imageURL = q.trim();
            } else {
                return vynaaReply("⚠ *Berikan URL gambar atau reply gambar dengan caption `!pinkhero`*");
            }

            if (!imageURL) return vynaaReply('❌ Gagal mendapatkan URL gambar untuk efek Pink Hero.');
            
            try {
                const apiUrl = `${global.url.VynaaAPi}/canvas/brave-pink-hero-green/?apikey=${global.VynaaAPikey}&imageUrl=${encodeURIComponent(imageURL)}`
                
                const response = await fetch(apiUrl)

                if (!response.ok) {
                    throw new Error(`API response status: ${response.status}`)
                }
                
                const imageBuffer = await response.buffer()

                await vynaa.sendMessage(remoteJid, { 
                    image: imageBuffer,
                    caption: `*🎁 Pink Hero Effect By Vynaa*`
                }, { quoted: quoteVynaa })

            } catch (error) {
                console.error("Error PinkHero:", error)
                vynaaReply(globalThis.mess.error)
            }
        }
        break

        case "gura": {
            vynaaReply(globalThis.mess.wait)

            let finalURL = null;
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const mediaSource = quoted || msg.message;
            
            let isMediaReply = mediaSource?.imageMessage; 

            if (isMediaReply) {
                try {
                    let mediaType = 'imageMessage';
                    const stream = await download(mediaSource[mediaType], 'image');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }

                    finalURL = await uploadToCatbox(buffer);
                    
                } catch (e) {
                    console.error("Error downloading/uploading media for Gura:", e);
                    return vynaaReply(`❌ Gagal mengunduh atau mengunggah gambar ke hosting: ${e.message}`);
                }
            } else if (q && q.match(/^https?:\/\//i)) {
                finalURL = q.trim();
            } else {
                return vynaaReply("☘️ *Contoh:* !gura https://example.com/image.jpg (Berikan URL gambar) atau Reply Gambar!");
            }
            
            try {
                const apiUrl = `${global.url.VynaaAPi}/canvas/gura/?apikey=${global.VynaaAPikey}&imageUrl=${encodeURIComponent(finalURL)}`
                
                const response = await fetch(apiUrl)

                if (!response.ok) {
                    throw new Error(`API response status: ${response.status}`)
                }
                
                const imageBuffer = await response.buffer()

                const stickerPath = await writeExif(
                  { mimetype: 'image/jpeg', data: imageBuffer },
                  { packname: globalThis.spackname, author: globalThis.sauthor }
                )

                await vynaa.sendMessage(remoteJid, { 
                    sticker: fs.readFileSync(stickerPath) 
                }, { quoted: quoteVynaa })

            } catch (error) {
                console.error("Error Gura:", error)
                vynaaReply(globalThis.mess.error)
            }
        }
        break

        case "smeme": {
            if (!q) return vynaaReply("☘️ *Contoh:* !smeme TeksAtas|TeksBawah atau Reply Gambar")
            
            const [rawText1, rawText2] = q.split('|').map(t => t.trim());
            
            vynaaReply(globalThis.mess.wait)

            let finalURL = null;
            let text1 = rawText1;
            let text2 = rawText2;
            
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const mediaSource = quoted || msg.message;
            
            let isMediaReply = mediaSource?.imageMessage; 

            if (isMediaReply) {
                try {
                    let mediaType = 'imageMessage';
                    const stream = await download(mediaSource[mediaType], 'image');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }

                    finalURL = await uploadToCatbox(buffer);
                    
                } catch (e) {
                    console.error("Error downloading/uploading media for Meme:", e);
                    return vynaaReply(`❌ Gagal mengunduh atau mengunggah gambar untuk meme: ${e.message}`);
                }
            } else if (text1 && text1.match(/^https?:\/\//i)) {
                finalURL = text1;
                text1 = text2 || '';
                text2 = '';
            } else {
                return vynaaReply("☘️ *Contoh:* Reply Gambar Atau gunakan `!smeme URL|TeksAtas|TeksBawah`");
            }

            if (!finalURL) return vynaaReply('❌ Gagal mendapatkan URL gambar untuk meme.');
            
            try {
                const apiUrl = `${global.url.VynaaAPi}/canvas/meme/?apikey=${global.VynaaAPikey}&imageUrl=${encodeURIComponent(finalURL)}&text=${encodeURIComponent(text1 || '')}&text2=${encodeURIComponent(text2 || '')}`
                
                const response = await fetch(apiUrl)

                if (!response.ok) {
                    throw new Error(`API response status: ${response.status}`)
                }
                
                const imageBuffer = await response.buffer()

                const stickerPath = await writeExif(
                  { mimetype: 'image/jpeg', data: imageBuffer },
                  { packname: globalThis.spackname, author: globalThis.sauthor }
                )

                await vynaa.sendMessage(remoteJid, { 
                    sticker: fs.readFileSync(stickerPath) 
                }, { quoted: quoteVynaa })

            } catch (error) {
                console.error("Error SMEME:", error)
                vynaaReply(globalThis.mess.error)
            }
        }
        break

        case "carbon": {
            if (!q) return vynaaReply("☘️ *Contoh:* !carbon console.log('Hello Vynaa');")
            
            vynaaReply(globalThis.mess.wait)

            try {
                const apiUrl = `${global.url.VynaaAPi}/canvas/carbon/?apikey=${global.VynaaAPikey}&code=${encodeURIComponent(q)}`
                
                const response = await fetch(apiUrl)

                if (!response.ok) {
                    throw new Error(`API response status: ${response.status}`)
                }
                
                const imageBuffer = await response.buffer()

                await vynaa.sendMessage(remoteJid, { 
                    image: imageBuffer,
                    caption: `*🎁 Carbon Code By Vynaa*`
                }, { quoted: quoteVynaa })

            } catch (error) {
                console.error("Error Carbon:", error)
                vynaaReply(globalThis.mess.error)
            }
        }
        break

        case "ttp": {
            if (!q) return vynaaReply("☘️ *Contoh:* !ttp VynaaValerie")
            
            vynaaReply(globalThis.mess.wait)

            try {
                const apiUrl = `${global.url.VynaaAPi}/makar/ttp/?apikey=${global.VynaaAPikey}&text=${encodeURIComponent(q.trim())}`
                
                const response = await fetch(apiUrl)

                if (!response.ok) {
                    throw new Error(`API response status: ${response.status}`)
                }
                
                const buffer = await response.buffer()

                const stickerPath = await writeExif(
                  { mimetype: 'image/png', data: buffer },
                  { packname: globalThis.spackname, author: globalThis.sauthor }
                )

                await vynaa.sendMessage(remoteJid, { 
                    sticker: fs.readFileSync(stickerPath) 
                }, { quoted: quoteVynaa })

            } catch (error) {
                console.error("Error TTP:", error)
                vynaaReply(globalThis.mess.error)
            }
        }
        break

        case "attp": {
            if (!q) return vynaaReply("☘️ *Contoh:* !attp VynaaValerie")
            
            vynaaReply(globalThis.mess.wait)

            try {
                const apiUrl = `${global.url.VynaaAPi}/makar/attp/?apikey=${global.VynaaAPikey}&text=${encodeURIComponent(q.trim())}`
                
                const response = await fetch(apiUrl)

                if (!response.ok) {
                    throw new Error(`API response status: ${response.status}`)
                }
                
                const buffer = await response.buffer()
                
                const isAnimated = buffer.toString('hex', 0, 12).includes('52494646') && buffer.toString('hex', 8, 12).includes('57454250');
                const mimeType = isAnimated ? 'image/webp' : 'image/png';

                const stickerPath = await writeExif(
                  { mimetype: mimeType, data: buffer },
                  { packname: globalThis.spackname, author: globalThis.sauthor }
                )

                await vynaa.sendMessage(remoteJid, { 
                    sticker: fs.readFileSync(stickerPath) 
                }, { quoted: quoteVynaa })

            } catch (error) {
                console.error("Error ATTP:", error)
                vynaaReply(globalThis.mess.error)
            }
        }
        break

        case "qc": {
            if (!q) return vynaaReply("☘️ *Contoh:* !qc Teks untuk quote")
            
            vynaaReply(globalThis.mess.wait)

            try {
                let profilePic = null
                try {
                    profilePic = await vynaa.profilePictureUrl(senderJid, 'image')
                } catch (e) {
                    profilePic = `https://ui-avatars.com/api/?name=${encodeURIComponent(pushname)}&background=random`
                }

                const name = pushname || 'User'
                const color = '#1f2937'
                
                const apiUrl = `${global.url.VynaaAPi}/canvas/qc/?apikey=${global.VynaaAPikey}&text=${encodeURIComponent(q)}&name=${encodeURIComponent(name)}&profile=${encodeURIComponent(profilePic)}&color=${encodeURIComponent(color)}`
                
                const response = await fetch(apiUrl)
                if (!response.ok) throw new Error(`API error: ${response.status}`)
                
                const imageBuffer = await response.buffer()

                const stickerPath = await writeExif(
                  { mimetype: 'image/png', data: imageBuffer },
                  { packname: globalThis.spackname, author: globalThis.sauthor }
                )

                await vynaa.sendMessage(remoteJid, { 
                    sticker: fs.readFileSync(stickerPath) 
                }, { quoted: quoteVynaa })

            } catch (error) {
                console.error("Error QC:", error)
                vynaaReply(globalThis.mess.error)
            }
        }
        break

        case "iqc": {
            if (!q) return vynaaReply("☘️ *Contoh:* !iqc Quote keren nih")
            
            vynaaReply(globalThis.mess.wait)

            try {
                const apiUrl = `${global.url.VynaaAPi}/makar/iqc/?apikey=${global.VynaaAPikey}&text=${encodeURIComponent(q)}`
                
                const response = await fetch(apiUrl)
                if (!response.ok) throw new Error(`API error: ${response.status}`)
                
                const imageBuffer = await response.buffer()

                await vynaa.sendMessage(remoteJid, { 
                    image: imageBuffer,
                    caption: `*🎁 Image Quote By Vynaa*`
                }, { quoted: quoteVynaa })

            } catch (error) {
                console.error("Error IQC:", error)
                vynaaReply(globalThis.mess.error)
            }
        }
        break

        case "s":
        case "sticker": {
            vynaaReply(globalThis.mess.wait)
            
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
            const mediaSource = quoted || msg.message
            
            let mediaType = null
            let mediaMessage = null
            
            if (mediaSource?.imageMessage) {
                mediaType = 'image'
                mediaMessage = mediaSource.imageMessage
            } else if (mediaSource?.videoMessage) {
                mediaType = 'video'
                mediaMessage = mediaSource.videoMessage
            } else if (mediaSource?.stickerMessage) {
                mediaType = 'sticker'
                mediaMessage = mediaSource.stickerMessage
            } else {
                return vynaaReply("⚠ *Kirim atau reply gambar/video dengan caption !s atau !sticker*")
            }

            try {
                const stream = await download(mediaMessage, mediaType === 'video' ? 'video' : 'image')
                let buffer = Buffer.from([])
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk])
                }

                const mimeType = mediaMessage.mimetype || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg')

                const stickerPath = await writeExif(
                    { mimetype: mimeType, data: buffer },
                    { packname: globalThis.spackname, author: globalThis.sauthor }
                )

                await vynaa.sendMessage(remoteJid, { 
                    sticker: fs.readFileSync(stickerPath) 
                }, { quoted: quoteVynaa })

                fs.unlinkSync(stickerPath)

            } catch (error) {
                console.error("Error Sticker:", error)
                vynaaReply(`${globalThis.mess.error}\nDetail: ${error.message}`)
            }
        }
        break

        // Games Commands
        case "asahotak":
        case "family100":
        case "kuisislami":
        case "kuismerdeka":
        case "siapakahaku":
        case "tebakkata": {
            try {
                cleanupOldSessions()
                vynaaReply(globalThis.mess.wait)
                
                const gameData = await getGameQuestion(command, global.url.VynaaAPi, global.VynaaAPikey)
                const msgResult = await vynaa.sendMessage(remoteJid, { text: formatGameQuestion(gameData, command) }, { quoted: quoteVynaa })
                initGameSession(senderJid, command, isGroup ? remoteJid : null, msgResult?.key?.id)
                
            } catch (error) {
                console.error(`Error Game ${command}:`, error)
                vynaaReply(`❌ Gagal memuat game: ${error.message}`)
            }
        }
        break

        case "jawab": {
            try {
                const session = getGameSession(senderJid, isGroup ? remoteJid : null)
                if (!session) {
                    return vynaaReply(`❌ Kamu belum main game! Ketik:\n!asahotak, !family100, !kuisislami, !kuismerdeka, !siapakahaku, atau !tebakkata`)
                }

                if (!q) {
                    return vynaaReply(`📝 Berikan jawaban! Contoh: !jawab Diabetes`)
                }

                const gameData = await getGameQuestion(session.gameType, global.url.VynaaAPi, global.VynaaAPikey)
                const isCorrect = checkAnswer(q, gameData.answer, session.gameType) === 'correct'
                
                const resultText = formatGameResult(isCorrect, q, gameData, session.gameType)
                await vynaa.sendMessage(remoteJid, { text: resultText }, { quoted: quoteVynaa })
                
                clearGameSession(senderJid, isGroup ? remoteJid : null)
                
            } catch (error) {
                console.error('Error Jawab:', error)
                vynaaReply(`⚠ ${error.message}`)
            }
        }
        break

        case "bantuan": {
            try {
                const session = getGameSession(senderJid, isGroup ? remoteJid : null)
                if (!session) {
                    return vynaaReply(`❌ Kamu belum main game!`)
                }

                const gameData = await getGameQuestion(session.gameType, global.url.VynaaAPi, global.VynaaAPikey)
                const helpText = formatHelpMessage(gameData, session.gameType)
                await vynaa.sendMessage(remoteJid, { text: helpText }, { quoted: quoteVynaa })
                
                clearGameSession(senderJid, isGroup ? remoteJid : null)
                
            } catch (error) {
                console.error('Error Bantuan:', error)
                vynaaReply(`⚠ ${error.message}`)
            }
        }
        break

        case "nyerah": {
            try {
                const session = getGameSession(senderJid, isGroup ? remoteJid : null)
                if (!session) {
                    return vynaaReply(`❌ Kamu belum main game!`)
                }

                const gameData = await getGameQuestion(session.gameType, global.url.VynaaAPi, global.VynaaAPikey)
                const surrenderText = formatSurrenderMessage(gameData, session.gameType)
                await vynaa.sendMessage(remoteJid, { text: surrenderText }, { quoted: quoteVynaa })
                
                clearGameSession(senderJid, isGroup ? remoteJid : null)
                
            } catch (error) {
                console.error('Error Nyerah:', error)
                vynaaReply(`⚠ ${error.message}`)
            }
        }
        break

        case "ada_waktu": {
            const session = getGameSession(senderJid, isGroup ? remoteJid : null)
            if (!session) {
                return vynaaReply(`❌ Kamu belum main game!`)
            }
            vynaaReply(`⏰ *Waktu diberikan!* Silakan jawab dengan: !jawab <jawaban>`)
        }
        break

        case "gamelist":
        case "games": {
            const gamesList = getGamesList()
            vynaaReply(gamesList)
        }
        break

        case "antilink": {
            if (!isGroup) return vynaaReply('❌ Fitur ini hanya untuk grup!')
            if (!isGroupAdmin && !isOwner) return vynaaReply(globalThis.mess.admin)
            
            if (!q) {
                const status = isProtectionEnabled(remoteJid, 'antilink') ? '✅ ON' : '❌ OFF'
                return vynaaReply(`*🔗 Antilink:* ${status}\n\nGunakan: .antilink on/off`)
            }
            
            const action = q.toLowerCase().trim()
            if (action === 'on') {
                enableProtection(remoteJid, 'antilink')
                vynaaReply('✅ Antilink diaktifkan!\nPesan dengan link akan dihapus.')
            } else if (action === 'off') {
                disableProtection(remoteJid, 'antilink')
                vynaaReply('❌ Antilink dimatikan!')
            } else {
                vynaaReply('⚠️ Gunakan: .antilink on/off')
            }
        }
        break

        case "antiphoto":
        case "antifoto": {
            if (!isGroup) return vynaaReply('❌ Fitur ini hanya untuk grup!')
            if (!isGroupAdmin && !isOwner) return vynaaReply(globalThis.mess.admin)
            
            if (!q) {
                const status = isProtectionEnabled(remoteJid, 'antiphoto') ? '✅ ON' : '❌ OFF'
                return vynaaReply(`*📷 Antiphoto:* ${status}\n\nGunakan: .antiphoto on/off`)
            }
            
            const action = q.toLowerCase().trim()
            if (action === 'on') {
                if (!isBotAdmin) return vynaaReply('❌ Bot harus jadi admin untuk menghapus media!')
                enableProtection(remoteJid, 'antiphoto')
                vynaaReply('✅ Antiphoto diaktifkan!\nFoto akan dihapus.')
            } else if (action === 'off') {
                disableProtection(remoteJid, 'antiphoto')
                vynaaReply('❌ Antiphoto dimatikan!')
            } else {
                vynaaReply('⚠️ Gunakan: .antiphoto on/off')
            }
        }
        break

        case "antivideo":
        case "antivid": {
            if (!isGroup) return vynaaReply('❌ Fitur ini hanya untuk grup!')
            if (!isGroupAdmin && !isOwner) return vynaaReply(globalThis.mess.admin)
            
            if (!q) {
                const status = isProtectionEnabled(remoteJid, 'antivideo') ? '✅ ON' : '❌ OFF'
                return vynaaReply(`*🎬 Antivideo:* ${status}\n\nGunakan: .antivideo on/off`)
            }
            
            const action = q.toLowerCase().trim()
            if (action === 'on') {
                if (!isBotAdmin) return vynaaReply('❌ Bot harus jadi admin untuk menghapus media!')
                enableProtection(remoteJid, 'antivideo')
                vynaaReply('✅ Antivideo diaktifkan!\nVideo akan dihapus.')
            } else if (action === 'off') {
                disableProtection(remoteJid, 'antivideo')
                vynaaReply('❌ Antivideo dimatikan!')
            } else {
                vynaaReply('⚠️ Gunakan: .antivideo on/off')
            }
        }
        break

        case "antisticker":
        case "antistiker": {
            if (!isGroup) return vynaaReply('❌ Fitur ini hanya untuk grup!')
            if (!isGroupAdmin && !isOwner) return vynaaReply(globalThis.mess.admin)
            
            if (!q) {
                const status = isProtectionEnabled(remoteJid, 'antisticker') ? '✅ ON' : '❌ OFF'
                return vynaaReply(`*🎭 Antisticker:* ${status}\n\nGunakan: .antisticker on/off`)
            }
            
            const action = q.toLowerCase().trim()
            if (action === 'on') {
                if (!isBotAdmin) return vynaaReply('❌ Bot harus jadi admin untuk menghapus media!')
                enableProtection(remoteJid, 'antisticker')
                vynaaReply('✅ Antisticker diaktifkan!\nSticker akan dihapus.')
            } else if (action === 'off') {
                disableProtection(remoteJid, 'antisticker')
                vynaaReply('❌ Antisticker dimatikan!')
            } else {
                vynaaReply('⚠️ Gunakan: .antisticker on/off')
            }
        }
        break

        case "antiaudio":
        case "antivoice": {
            if (!isGroup) return vynaaReply('❌ Fitur ini hanya untuk grup!')
            if (!isGroupAdmin && !isOwner) return vynaaReply(globalThis.mess.admin)
            
            if (!q) {
                const status = isProtectionEnabled(remoteJid, 'antiaudio') ? '✅ ON' : '❌ OFF'
                return vynaaReply(`*🎵 Antiaudio:* ${status}\n\nGunakan: .antiaudio on/off`)
            }
            
            const action = q.toLowerCase().trim()
            if (action === 'on') {
                if (!isBotAdmin) return vynaaReply('❌ Bot harus jadi admin untuk menghapus media!')
                enableProtection(remoteJid, 'antiaudio')
                vynaaReply('✅ Antiaudio diaktifkan!\nAudio/voice akan dihapus.')
            } else if (action === 'off') {
                disableProtection(remoteJid, 'antiaudio')
                vynaaReply('❌ Antiaudio dimatikan!')
            } else {
                vynaaReply('⚠️ Gunakan: .antiaudio on/off')
            }
        }
        break

        case "protection":
        case "proteksi": {
            if (!isGroup) return vynaaReply('❌ Fitur ini hanya untuk grup!')
            const settings = getProtectionSettings(remoteJid)
            const status = `
*🛡️ Status Proteksi Grup*

├ 🔗 Antilink: ${settings.antilink ? '✅ ON' : '❌ OFF'}
├ 📷 Antiphoto: ${settings.antiphoto ? '✅ ON' : '❌ OFF'}
├ 🎬 Antivideo: ${settings.antivideo ? '✅ ON' : '❌ OFF'}
├ 🎭 Antisticker: ${settings.antisticker ? '✅ ON' : '❌ OFF'}
└ 🎵 Antiaudio: ${settings.antiaudio ? '✅ ON' : '❌ OFF'}

*Perintah:*
.antilink on/off
.antiphoto on/off
.antivideo on/off
.antisticker on/off
.antiaudio on/off
            `.trim()
            vynaaReply(status)
        }
        break

        case "kick":
        case "tendang": {
            if (!isGroup) return vynaaReply('❌ Fitur ini hanya untuk grup!')
            if (!isGroupAdmin && !isOwner) return vynaaReply(globalThis.mess.admin)
            if (!isBotAdmin) return vynaaReply('❌ Bot harus jadi admin!')
            
            let targetJid = null
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.participant
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
            
            if (quotedMsg) {
                targetJid = quotedMsg
            } else if (mentioned && mentioned.length > 0) {
                targetJid = mentioned[0]
            } else if (q) {
                const number = q.replace(/[^0-9]/g, '')
                targetJid = number + '@s.whatsapp.net'
            }
            
            if (!targetJid) {
                return vynaaReply('⚠️ Tag atau reply pesan member yang mau dikick!\n\nContoh: .kick @user')
            }
            
            try {
                await vynaa.groupParticipantsUpdate(remoteJid, [targetJid], 'remove')
                vynaaReply(`✅ @${targetJid.split('@')[0]} berhasil dikeluarkan!`)
            } catch (error) {
                console.error('Kick error:', error)
                vynaaReply('❌ Gagal mengeluarkan member: ' + error.message)
            }
        }
        break

        case "add":
        case "tambah": {
            if (!isGroup) return vynaaReply('❌ Fitur ini hanya untuk grup!')
            if (!isGroupAdmin && !isOwner) return vynaaReply(globalThis.mess.admin)
            if (!isBotAdmin) return vynaaReply('❌ Bot harus jadi admin!')
            
            if (!q) return vynaaReply('⚠️ Masukkan nomor yang mau ditambah!\n\nContoh: .add 628xxx')
            
            const number = q.replace(/[^0-9]/g, '')
            const targetJid = number + '@s.whatsapp.net'
            
            try {
                await vynaa.groupParticipantsUpdate(remoteJid, [targetJid], 'add')
                vynaaReply(`✅ @${number} berhasil ditambahkan!`)
            } catch (error) {
                console.error('Add error:', error)
                vynaaReply('❌ Gagal menambahkan member: ' + error.message)
            }
        }
        break

        case "promote":
        case "jadiadmin": {
            if (!isGroup) return vynaaReply('❌ Fitur ini hanya untuk grup!')
            if (!isGroupAdmin && !isOwner) return vynaaReply(globalThis.mess.admin)
            if (!isBotAdmin) return vynaaReply('❌ Bot harus jadi admin!')
            
            let targetJid = null
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.participant
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
            
            if (quotedMsg) {
                targetJid = quotedMsg
            } else if (mentioned && mentioned.length > 0) {
                targetJid = mentioned[0]
            } else if (q) {
                const number = q.replace(/[^0-9]/g, '')
                targetJid = number + '@s.whatsapp.net'
            }
            
            if (!targetJid) {
                return vynaaReply('⚠️ Tag atau reply pesan member yang mau dijadikan admin!')
            }
            
            try {
                await vynaa.groupParticipantsUpdate(remoteJid, [targetJid], 'promote')
                vynaaReply(`✅ @${targetJid.split('@')[0]} sekarang menjadi admin!`)
            } catch (error) {
                console.error('Promote error:', error)
                vynaaReply('❌ Gagal mempromosikan: ' + error.message)
            }
        }
        break

        case "demote":
        case "turunadmin": {
            if (!isGroup) return vynaaReply('❌ Fitur ini hanya untuk grup!')
            if (!isGroupAdmin && !isOwner) return vynaaReply(globalThis.mess.admin)
            if (!isBotAdmin) return vynaaReply('❌ Bot harus jadi admin!')
            
            let targetJid = null
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.participant
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
            
            if (quotedMsg) {
                targetJid = quotedMsg
            } else if (mentioned && mentioned.length > 0) {
                targetJid = mentioned[0]
            } else if (q) {
                const number = q.replace(/[^0-9]/g, '')
                targetJid = number + '@s.whatsapp.net'
            }
            
            if (!targetJid) {
                return vynaaReply('⚠️ Tag atau reply pesan admin yang mau diturunkan!')
            }
            
            try {
                await vynaa.groupParticipantsUpdate(remoteJid, [targetJid], 'demote')
                vynaaReply(`✅ @${targetJid.split('@')[0]} bukan admin lagi!`)
            } catch (error) {
                console.error('Demote error:', error)
                vynaaReply('❌ Gagal menurunkan: ' + error.message)
            }
        }
        break

        case "tagall":
        case "everyone": {
            if (!isGroup) return vynaaReply('❌ Fitur ini hanya untuk grup!')
            if (!isGroupAdmin && !isOwner) return vynaaReply(globalThis.mess.admin)
            
            if (!groupMetadata) return vynaaReply('❌ Gagal mengambil data grup!')
            
            const participants = groupMetadata.participants
            let mentions = participants.map(p => p.id)
            let text = `*📢 Tag All Members*\n\n`
            text += q ? `*Pesan:* ${q}\n\n` : ''
            text += participants.map((p, i) => `${i + 1}. @${p.id.split('@')[0]}`).join('\n')
            
            await vynaa.sendMessage(remoteJid, { text, mentions }, { quoted: quoteVynaa })
        }
        break

        case "listadmin":
        case "admins": {
            if (!isGroup) return vynaaReply('❌ Fitur ini hanya untuk grup!')
            
            if (!groupMetadata) return vynaaReply('❌ Gagal mengambil data grup!')
            
            const admins = groupMetadata.participants.filter(p => 
                p.admin === 'admin' || p.admin === 'superadmin' || p.isAdmin
            )
            
            let text = `*👑 Daftar Admin Grup*\n\n`
            let mentions = admins.map(a => a.id)
            text += admins.map((a, i) => `${i + 1}. @${a.id.split('@')[0]} ${a.admin === 'superadmin' ? '(Owner)' : ''}`).join('\n')
            
            await vynaa.sendMessage(remoteJid, { text, mentions }, { quoted: quoteVynaa })
        }
        break

        case "hidetag": {
            if (!isGroup) return vynaaReply('❌ Fitur ini hanya untuk grup!')
            if (!isGroupAdmin && !isOwner) return vynaaReply(globalThis.mess.admin)
            
            if (!q) return vynaaReply('⚠️ Masukkan pesan!\n\nContoh: .hidetag Halo semua')
            
            const participants = groupMetadata.participants
            let mentions = participants.map(p => p.id)
            
            await vynaa.sendMessage(remoteJid, { text: q, mentions }, { quoted: quoteVynaa })
        }
        break

        case "totalpesan":
        case "msgcount":
        case "leaderboard": {
            if (!isGroup) return vynaaReply('❌ Fitur ini hanya untuk grup!')
            
            try {
                const counts = await getMessageCounts(remoteJid, 20)
                if (!counts || counts.length === 0) {
                    return vynaaReply('📊 Belum ada data pesan di grup ini.')
                }
                
                let text = '*📊 Total Pesan Member Grup*\n\n'
                counts.forEach((user, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`
                    const name = user.username || user.user_id.split('@')[0]
                    text += `${medal} ${name}: *${user.count}* pesan\n`
                })
                
                vynaaReply(text.trim())
            } catch (error) {
                console.error('Error getting message counts:', error)
                vynaaReply('❌ Error: ' + error.message)
            }
        }
        break

        case "pesanku":
        case "mymsg": {
            if (!isGroup) return vynaaReply('❌ Fitur ini hanya untuk grup!')
            
            try {
                const userCount = await getUserMessageCount(remoteJid, senderJid)
                if (!userCount) {
                    return vynaaReply('📊 Kamu belum punya data pesan.')
                }
                vynaaReply(`📊 *Total Pesanmu:* ${userCount.count} pesan`)
            } catch (error) {
                console.error('Error getting user count:', error)
                vynaaReply('❌ Error: ' + error.message)
            }
        }
        break

        case "cleartotal":
        case "resetpesan": {
            if (!isGroup) return vynaaReply('❌ Fitur ini hanya untuk grup!')
            if (!isGroupAdmin && !isOwner) return vynaaReply(globalThis.mess.admin)
            
            try {
                await clearMessageCounts(remoteJid)
                vynaaReply('✅ Data total pesan berhasil direset!')
            } catch (error) {
                console.error('Error clearing counts:', error)
                vynaaReply('❌ Error: ' + error.message)
            }
        }
        break

        default: {
        }
        break
    }
}
