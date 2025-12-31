import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, getContentType, downloadContentFromMessage, DisconnectReason } from "@whiskeysockets/baileys"
import pino from "pino"
import chalk from "chalk"
import readline from "readline"
import path from "path"
import { fileURLToPath } from "url"
import os from "os"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const usePairingCode = true
let reconnectAttempts = 0
const maxReconnectAttempts = 5

async function question(prompt) {
  process.stdout.write(prompt)
  const r1 = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    r1.question("", (ans) => {
      r1.close()
      resolve(ans)
    })
  })
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(
    path.resolve(__dirname, "../VynaaSesi")
  )

  const { version, isLatest } = await fetchLatestBaileysVersion()
  console.log(`Vynaa Using WA v${version.join(".")}, isLatest: ${isLatest}`)

  const vynaa = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: !usePairingCode,
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    version,
    syncFullHistory: true,
    generateHighQualityLinkPreview: true,
    getMessage: async (key) => {
      return { message: null }
    }
  })

  if (usePairingCode && !vynaa.authState.creds.registered) {
    try {
      const phoneNumber = await question("☘️ Masukan Nomor Yang Diawali Dengan 62 :\n")
      const code = await vynaa.requestPairingCode(phoneNumber.trim())
      console.log(`🎁 Pairing Code : ${code}`)
    } catch (err) {
      console.error("Failed to get pairing code:", err)
    }
  }

  vynaa.ev.on("creds.update", saveCreds)

  vynaa.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update
    
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      
      console.log(chalk.red(`❌  Koneksi Terputus (${statusCode})`))
      
      if (shouldReconnect && reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++
        const delay = Math.min(1000 * reconnectAttempts, 10000)
        console.log(chalk.yellow(`⏳  Mencoba Menyambung Ulang dalam ${delay/1000}s... (${reconnectAttempts}/${maxReconnectAttempts})`))
        setTimeout(connectToWhatsApp, delay)
      } else if (statusCode === DisconnectReason.loggedOut) {
        console.log(chalk.red("❌  Sesi Logout! Silakan hapus folder VynaaSesi dan pairing ulang."))
      } else {
        console.log(chalk.red("❌  Gagal menyambung setelah beberapa percobaan."))
      }
    } else if (connection === "open") {
      reconnectAttempts = 0
      console.log(chalk.green("✔  Bot Berhasil Terhubung Ke WhatsApp"))
    }
  })

  vynaa.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0]
    if (!msg.message) return

    const remoteJid = msg.key.remoteJid
    const isGroup = remoteJid.endsWith("@g.us")
    const senderJid = isGroup ? msg.key.participant : remoteJid
    const pushname = msg.pushName || "VynaaValerie"

    const messageType = getContentType(msg.message)
    let body = ""
    let mediaType = null

    switch (messageType) {
      case "conversation":
        body = msg.message.conversation
        break
      case "extendedTextMessage":
        body = msg.message.extendedTextMessage.text
        break
      case "imageMessage":
        mediaType = "Image"
        body = msg.message.imageMessage.caption || ""
        break
      case "videoMessage":
        mediaType = "Video"
        body = msg.message.videoMessage.caption || ""
        break
      case "stickerMessage":
        mediaType = "Sticker"
        break
      case "audioMessage":
        mediaType = "Audio"
        break
      case "documentMessage":
        mediaType = "Document"
        break
      default:
        body = ""
    }

    if (!body.trim() && !mediaType) return

    const listColor = ["red", "green", "yellow", "magenta", "cyan", "white", "blue"]
    const randomColor = listColor[Math.floor(Math.random() * listColor.length)]
    const logTag = mediaType ? `[${mediaType}]` : ""

    console.log(
      chalk.yellow.bold("Credit : VynaaValerie"),
      chalk.green.bold("[ WhatsApp]"),
      chalk[randomColor](pushname),
      chalk[randomColor](" : "),
      chalk.magenta.bold(`${logTag}`),
      chalk.white(` ${body}`)
    )

    const { default: handler } = await import("../vynaahandler.js")
    handler(vynaa, m, { 
      body, 
      mediaType, 
      remoteJid,
      senderJid,
      isGroup,
      pushname, 
      download: downloadContentFromMessage 
    })
  })
}

export default connectToWhatsApp
