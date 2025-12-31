// Helper untuk mengambil informasi waktu dan ucapan dengan timezone Asia/Jakarta
const TIMEZONE = 'Asia/Jakarta';

export function getTimeGreeting() {
    const formatter = new Intl.DateTimeFormat('id-ID', { 
        timeZone: TIMEZONE,
        hour: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(new Date());
    const hour = parseInt(parts.find(p => p.type === 'hour').value);
    
    if (hour >= 5 && hour < 11) {
        return 'Selamat Pagi ☀️';
    } else if (hour >= 11 && hour < 15) {
        return 'Selamat Siang 🌤️';
    } else if (hour >= 15 && hour < 19) {
        return 'Selamat Sore 🌅';
    } else {
        return 'Selamat Malam 🌙';
    }
}

export function getCurrentTime() {
    const now = new Date().toLocaleString('id-ID', { 
        timeZone: TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    return now;
}

export function getCurrentDay() {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const formatter = new Intl.DateTimeFormat('id-ID', {
        timeZone: TIMEZONE,
        weekday: 'long'
    });
    const dayName = formatter.format(new Date());
    
    // Match dengan array days
    const dayIndex = days.findIndex(d => d === dayName);
    return dayIndex !== -1 ? days[dayIndex] : dayName;
}

export function getFullDateTime() {
    const day = getCurrentDay();
    const dateStr = new Date().toLocaleString('id-ID', { 
        timeZone: TIMEZONE,
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    const time = getCurrentTime();
    return `${day}, ${dateStr} • ${time}`;
}

export function buildMenu() {
    const greeting = getTimeGreeting();
    const time = getCurrentTime();
    const day = getCurrentDay();
    
    return `${greeting}

⏰ ${time} | 📅 ${day}

━━━━━━━━━━━━━━━━━━━━
VYNAA VALERIE BOT
━━━━━━━━━━━━━━━━━━━━

🏠 MENU UTAMA
!menu
!ping
!ai
!admin
!owner

⚙️ OWNER
!bc
!bclist
!leaveall
!setppbot
!stats

👥 GROUP
!group
!tagall
!hidetag
!kick
!tendang
!add
!tambah
!promote
!jadiadmin
!demote
!turunadmin
!closegc
!opengc
!setname
!setdesc
!welcome
!listadmin
!admins

🛡️ PROTECTION
!antilink
!antiphoto
!antifoto
!antivideo
!antivid
!antisticker
!antistiker
!antiaudio
!antivoice
!protection
!proteksi

📊 STATS
!totalpesan
!msgcount
!leaderboard
!pesanku
!mymsg
!cleartotal
!resetpesan

📥 DOWNLOADER
!ytmp3
!ytmp4
!ttdl
!ttdl2
!fbdl
!igdl
!play
!pindl
!ccdl
!ttssearch

🔍 SEARCH
!yts
!lirik
!pinsearch
!rch
!ssm
!ssd
!upscale

🎮 GAMES
!asahotak
!family100
!kuisislami
!kuismerdeka
!siapakahaku
!tebakkata
!jawab
!bantuan
!nyerah
!ada_waktu
!gamelist
!games

🎨 CREATOR
!s
!sticker
!ttp
!attp
!qc
!iqc
!carbon
!smeme
!balogo
!brat
!bratimg
!bratvid
!gura
!pinkhero

━━━━━━━━━━━━━━━━━━━━
Owner: VynaaValerie
🔗 vynaa.web.id
━━━━━━━━━━━━━━━━━━━━`;
}