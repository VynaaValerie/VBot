import fetch from "node-fetch"

// In-memory storage for active game sessions
const gameSessions = new Map()
const gameMessageIds = new Map() // Track game question message IDs

// Game configuration
const GAMES = {
    asahotak: {
        name: 'Asah Otak',
        apiEndpoint: 'games/allgames/asahotak',
        type: 'riddle'
    },
    family100: {
        name: 'Family 100',
        apiEndpoint: 'games/allgames/family100',
        type: 'multiple_choice'
    },
    kuisislami: {
        name: 'Kuis Islami',
        apiEndpoint: 'games/allgames/kuisislami',
        type: 'riddle'
    },
    kuismerdeka: {
        name: 'Kuis Merdeka',
        apiEndpoint: 'games/allgames/kuismerdeka',
        type: 'riddle'
    },
    siapakahaku: {
        name: 'Siapakah Aku',
        apiEndpoint: 'games/allgames/siapakahaku',
        type: 'riddle'
    },
    tebakkata: {
        name: 'Tebak Kata',
        apiEndpoint: 'games/allgames/tebakkata',
        type: 'riddle'
    }
}

// Get session key for a user
function getSessionKey(senderJid, chatId = null) {
    return chatId ? `${chatId}_game` : `${senderJid}_game`
}

// Initialize or get game session
export function initGameSession(senderJid, gameType, chatId = null, messageId = null) {
    const key = getSessionKey(senderJid, chatId)
    gameSessions.set(key, {
        senderJid,
        gameType,
        startTime: Date.now(),
        answered: false,
        messageId
    })
    
    // Store message ID mapping
    if (messageId) {
        gameMessageIds.set(messageId, key)
    }
    
    return key
}

// Check if message ID is a game question
export function isGameQuestionReply(messageId) {
    return gameMessageIds.has(messageId)
}

// Get active game session
export function getGameSession(senderJid, chatId = null) {
    const key = getSessionKey(senderJid, chatId)
    return gameSessions.get(key)
}

// Get game session by message ID (for replies)
export function getGameSessionByMessageId(messageId) {
    const key = gameMessageIds.get(messageId)
    return key ? gameSessions.get(key) : null
}

// Clear game session and message mapping
export function clearGameSession(senderJid, chatId = null) {
    const key = getSessionKey(senderJid, chatId)
    const session = gameSessions.get(key)
    
    if (session && session.messageId) {
        gameMessageIds.delete(session.messageId)
    }
    
    gameSessions.delete(key)
}

// Get all active sessions (for cleanup if needed)
export function getAllGameSessions() {
    return gameSessions
}

// Fetch game question from API
export async function getGameQuestion(gameType, apiUrl, apiKey) {
    try {
        if (!GAMES[gameType]) {
            throw new Error(`Game type "${gameType}" tidak ditemukan`)
        }

        const endpoint = GAMES[gameType].apiEndpoint
        const url = `${apiUrl}/${endpoint}?apikey=${apiKey}`

        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`)
        }

        const data = await response.json()
        if (!data.status || !data.data) {
            throw new Error('Invalid API response')
        }

        return data.data
    } catch (error) {
        console.error('Error fetching game question:', error)
        throw error
    }
}

// Format game question for display
export function formatGameQuestion(gameData, gameType) {
    const game = GAMES[gameType]
    let text = `🎮 *${game.name} #${gameData.index || 0}*\n\n`

    text += `❓ *Pertanyaan:*\n${gameData.question}\n\n`

    if (game.type === 'multiple_choice' && gameData.options) {
        text += `*Pilihan Jawaban:*\n`
        gameData.options.forEach((option, idx) => {
            text += `${String.fromCharCode(65 + idx)}) ${option}\n`
        })
        text += `\n💬 _Jawab dengan: !jawab A (atau B, C, D, E)_\n\n`
    } else {
        text += `💬 _Jawab dengan: !jawab <jawaban>_\n\n`
    }

    text += `*Opsi:*\n`
    text += `📝 !jawab <jawaban> - Jawab pertanyaan\n`
    text += `⏰ !ada_waktu - Minta waktu lebih\n`
    text += `😭 !nyerah - Menyerah\n`
    text += `🆘 !bantuan - Lihat jawaban (Berakhir game)\n\n`
    text += `⏱ Waktu: Unlimited | Points: 1 poin jika benar`

    return text
}

// Check answer
export function checkAnswer(userAnswer, correctAnswer, gameType) {
    // Normalize answers
    const userAnswerNormalized = userAnswer.toUpperCase().trim()
    const correctAnswerNormalized = correctAnswer.toUpperCase().trim()

    // For multiple choice, check if it's A, B, C, D, E format
    if (GAMES[gameType].type === 'multiple_choice') {
        if (/^[A-E]$/.test(userAnswerNormalized)) {
            // User gave letter choice, return the letter
            return userAnswerNormalized === correctAnswerNormalized ? 'correct' : 'wrong'
        }
    }

    // For riddles, do fuzzy matching
    if (similarity(userAnswerNormalized, correctAnswerNormalized) > 0.7) {
        return 'correct'
    }

    return 'wrong'
}

// Simple string similarity checker
function similarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1

    if (longer.length === 0) return 1.0

    const editDistance = getEditDistance(longer, shorter)
    return (longer.length - editDistance) / longer.length
}

// Calculate edit distance (Levenshtein)
function getEditDistance(s1, s2) {
    const costs = []
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j
            } else if (j > 0) {
                let newValue = costs[j - 1]
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
                }
                costs[j - 1] = lastValue
                lastValue = newValue
            }
        }
        if (i > 0) costs[s2.length] = lastValue
    }
    return costs[s2.length]
}

// Format game result
export function formatGameResult(isCorrect, answer, gameData, gameType) {
    const game = GAMES[gameType]
    let text = `\n🎮 *Hasil ${game.name}*\n\n`

    if (isCorrect) {
        text += `✅ *BENAR!*\n`
        text += `📝 *Jawaban:* ${gameData.answer}\n`
        text += `🏆 *+1 Poin*\n`
    } else {
        text += `❌ *SALAH!*\n`
        text += `📝 *Jawaban Kamu:* ${answer}\n`
        text += `✅ *Jawaban Benar:* ${gameData.answer}\n`
    }

    if (gameData.description) {
        text += `\n📚 *Penjelasan:*\n${gameData.description}\n`
    }

    text += `\n_Ketik !play untuk bermain lagi_`

    return text
}

// Format surrender message
export function formatSurrenderMessage(gameData, gameType) {
    const game = GAMES[gameType]
    let text = `\n😭 *Kamu Menyerah di ${game.name}*\n\n`
    text += `📝 *Pertanyaan:* ${gameData.question}\n`
    text += `✅ *Jawaban:* ${gameData.answer}\n`

    if (gameData.description) {
        text += `\n📚 *Penjelasan:*\n${gameData.description}\n`
    }

    text += `\n_Ketik !play untuk bermain lagi_`

    return text
}

// Format help message (show answer)
export function formatHelpMessage(gameData, gameType) {
    const game = GAMES[gameType]
    let text = `\n🆘 *Bantuan ${game.name}*\n\n`
    text += `📝 *Pertanyaan:* ${gameData.question}\n`
    text += `✅ *Jawaban:* ${gameData.answer}\n`

    if (gameData.description) {
        text += `\n📚 *Penjelasan:*\n${gameData.description}\n`
    }

    text += `\n_Game telah berakhir. Ketik !play untuk bermain lagi_`

    return text
}

// Get list of available games
export function getGamesList() {
    let text = `🎮 *Daftar Game Tersedia*\n\n`
    Object.entries(GAMES).forEach(([key, game]) => {
        text += `• *${game.name}* - \`!${key}\`\n`
    })
    text += `\n💬 Ketik command untuk mulai bermain!`
    return text
}

// Get random game
export function getRandomGame() {
    const keys = Object.keys(GAMES)
    return keys[Math.floor(Math.random() * keys.length)]
}

// Session cleanup (remove sessions older than 30 minutes)
export function cleanupOldSessions() {
    const now = Date.now()
    const thirtyMinutes = 30 * 60 * 1000

    for (const [key, session] of gameSessions.entries()) {
        if (now - session.startTime > thirtyMinutes) {
            gameSessions.delete(key)
        }
    }
}
