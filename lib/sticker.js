import fs from "fs"
import { tmpdir } from "os"
import Crypto from "crypto"
import ff from "fluent-ffmpeg"
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg"
import webp from "node-webpmux"
import path from "path"
import { exec } from "child_process"
import util from "util"
const execPromise = util.promisify(exec)

ff.setFfmpegPath(ffmpegInstaller.path)

const VF_IMAGE_NO_CROP =
  "scale=512:512:force_original_aspect_ratio=decrease," +
  "pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000"

const VF_VIDEO_NO_CROP =
  "scale=512:512:force_original_aspect_ratio=decrease," +
  "pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000," +
  "fps=15"

async function imageToWebp(media) {
  const tmpFileOut = path.join(
    tmpdir(),
    `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
  )
  const tmpFileIn = path.join(
    tmpdir(),
    `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.jpg`
  )

  fs.writeFileSync(tmpFileIn, media)

  await new Promise((resolve, reject) => {
    ff(tmpFileIn)
      .on("error", reject)
      .on("end", () => resolve(true))
      .addOutputOptions([
        "-vcodec",
        "libwebp",
        "-vf",
        VF_IMAGE_NO_CROP,
        "-lossless",
        "1",
        "-qscale",
        "80",
        "-preset",
        "picture",
        "-loop",
        "0",
        "-an",
        "-vsync",
        "0"
      ])
      .toFormat("webp")
      .save(tmpFileOut)
  })

  const buff = fs.readFileSync(tmpFileOut)
  fs.unlinkSync(tmpFileOut)
  fs.unlinkSync(tmpFileIn)
  return buff
}

async function videoToWebp(media) {
  const tmpFileOut = path.join(
    tmpdir(),
    `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
  )
  const tmpFileIn = path.join(
    tmpdir(),
    `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.mp4`
  )

  fs.writeFileSync(tmpFileIn, media)

  await new Promise((resolve, reject) => {
    ff(tmpFileIn)
      .on("error", reject)
      .on("end", () => resolve(true))
      .addOutputOptions([
        "-vcodec",
        "libwebp",
        "-vf",
        VF_VIDEO_NO_CROP,
        "-lossless",
        "0",
        "-qscale",
        "70",
        "-preset",
        "default",
        "-loop",
        "0",
        "-an",
        "-vsync",
        "0",
        "-t",
        "8"
      ])
      .toFormat("webp")
      .save(tmpFileOut)
  })

  const buff = fs.readFileSync(tmpFileOut)
  fs.unlinkSync(tmpFileOut)
  fs.unlinkSync(tmpFileIn)
  return buff
}

async function createAnimatedSticker(mediaBuffer, metadata) {
  const tmpFileIn = path.join(
    tmpdir(),
    `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
  )
  const tmpFileOut = path.join(
    tmpdir(),
    `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}_animated.webp`
  )
  
  fs.writeFileSync(tmpFileIn, mediaBuffer)
  
  try {
    const img = new webp.Image()
    await img.load(tmpFileIn)
    
    const json = {
      "sticker-pack-id": `https://zenzapi.xyz`,
      "sticker-pack-name": metadata.packname || "Vynaa Sticker",
      "sticker-pack-publisher": metadata.author || "VynaaValerie",
      "emojis": metadata.categories ? metadata.categories : [""]
    }
    
    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
      0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ])
    const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8")
    const exif = Buffer.concat([exifAttr, jsonBuff])
    exif.writeUIntLE(jsonBuff.length, 14, 4)
    
    img.exif = exif
    await img.save(tmpFileOut)
    
    const resultBuffer = fs.readFileSync(tmpFileOut)
    fs.unlinkSync(tmpFileIn)
    fs.unlinkSync(tmpFileOut)
    
    return resultBuffer
  } catch (error) {
    console.error("Error creating animated sticker, fallback to static:", error)
    
    const staticPath = await writeExifImg(mediaBuffer, metadata)
    const staticBuffer = fs.readFileSync(staticPath)
    
    fs.unlinkSync(tmpFileIn)
    fs.unlinkSync(staticPath)
    
    return staticBuffer
  }
}

async function writeExifImg(media, metadata) {
  const wMedia = await imageToWebp(media)
  const tmpFileIn = path.join(
    tmpdir(),
    `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
  )
  const tmpFileOut = path.join(
    tmpdir(),
    `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
  )
  fs.writeFileSync(tmpFileIn, wMedia)

  if (metadata.packname || metadata.author) {
    const img = new webp.Image()
    const json = {
      "sticker-pack-id": `https://zenzapi.xyz`,
      "sticker-pack-name": metadata.packname,
      "sticker-pack-publisher": metadata.author,
      "emojis": metadata.categories ? metadata.categories : [""]
    }
    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
      0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ])
    const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8")
    const exif = Buffer.concat([exifAttr, jsonBuff])
    exif.writeUIntLE(jsonBuff.length, 14, 4)

    await img.load(tmpFileIn)
    fs.unlinkSync(tmpFileIn)
    img.exif = exif
    await img.save(tmpFileOut)
    return tmpFileOut
  }

  return tmpFileIn
}

async function writeExifVid(media, metadata) {
  const wMedia = await videoToWebp(media)
  const tmpFileIn = path.join(
    tmpdir(),
    `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
  )
  const tmpFileOut = path.join(
    tmpdir(),
    `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
  )
  fs.writeFileSync(tmpFileIn, wMedia)

  if (metadata.packname || metadata.author) {
    const img = new webp.Image()
    const json = {
      "sticker-pack-id": `https://zenzapi.xyz`,
      "sticker-pack-name": metadata.packname,
      "sticker-pack-publisher": metadata.author,
      "emojis": metadata.categories ? metadata.categories : [""]
    }
    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
      0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ])
    const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8")
    const exif = Buffer.concat([exifAttr, jsonBuff])
    exif.writeUIntLE(jsonBuff.length, 14, 4)

    await img.load(tmpFileIn)
    fs.unlinkSync(tmpFileIn)
    img.exif = exif
    await img.save(tmpFileOut)
    return tmpFileOut
  }

  return tmpFileIn
}

async function writeExif(media, metadata) {
  const isAnimated = media.mimetype.includes('webp') || 
                    media.mimetype.includes('gif') || 
                    media.mimetype.includes('video')
  
  if (isAnimated) {
    try {
      const animatedBuffer = await createAnimatedSticker(media.data, metadata)
      
      const tmpFileOut = path.join(
        tmpdir(),
        `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
      )
      
      fs.writeFileSync(tmpFileOut, animatedBuffer)
      return tmpFileOut
    } catch (error) {
      console.error("Error creating animated sticker, fallback:", error)
    }
  }
  
  const wMedia = /webp/.test(media.mimetype)
    ? media.data
    : /image/.test(media.mimetype)
      ? await imageToWebp(media.data)
      : /video/.test(media.mimetype)
        ? await videoToWebp(media.data)
        : ""

  const tmpFileIn = path.join(
    tmpdir(),
    `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
  )
  const tmpFileOut = path.join(
    tmpdir(),
    `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`
  )
  fs.writeFileSync(tmpFileIn, wMedia)

  if (metadata.packname || metadata.author) {
    const img = new webp.Image()
    const json = {
      "sticker-pack-id": `https://zenzapi.xyz`,
      "sticker-pack-name": metadata.packname,
      "sticker-pack-publisher": metadata.author,
      "emojis": metadata.categories ? metadata.categories : [""]
    }
    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
      0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ])
    const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8")
    const exif = Buffer.concat([exifAttr, jsonBuff])
    exif.writeUIntLE(jsonBuff.length, 14, 4)

    await img.load(tmpFileIn)
    fs.unlinkSync(tmpFileIn)
    img.exif = exif
    await img.save(tmpFileOut)
    return tmpFileOut
  }

  return tmpFileIn
}

export { 
  imageToWebp, 
  videoToWebp, 
  writeExifImg, 
  writeExifVid, 
  writeExif,
  createAnimatedSticker 
}
