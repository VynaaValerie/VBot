# Vynaa Valerie Bot

## Overview

Vynaa Valerie Bot is a multi-platform messaging bot primarily designed for WhatsApp, with optional Telegram support. The bot provides various features including AI chat capabilities, media downloading (TikTok, YouTube), sticker creation with animation support, interactive games, and group protection/moderation tools. The project is built with Node.js using ES modules and connects to WhatsApp via the Baileys library.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Entry Point
- **VynaaSet.js** serves as the main entry point that conditionally starts WhatsApp and/or Telegram bots based on configuration flags
- Uses dynamic imports to load platform-specific bot implementations

### Bot Configuration
- **vynaa.js** contains global configuration including:
  - API keys and endpoints (VynaaAPi)
  - Owner/admin phone numbers for authorization
  - Command prefixes (#, ., !, /)
  - Customizable response messages
  - Sticker pack metadata

### Message Handling
- **vynaahandler.js** is the central message handler that:
  - Imports all configuration and menu systems
  - Loads scrapers for external services (AI4Chat, TikTok)
  - Integrates sticker creation, file uploading, and games
  - Implements group protection features (anti-link, anti-photo, anti-video, anti-sticker, anti-audio)
  - Tracks message counts via PostgreSQL database

### WhatsApp Connection
- Uses **@whiskeysockets/baileys** library for WhatsApp Web API connection
- Session data stored in **VynaaSesi/** directory containing:
  - Authentication credentials (creds.json)
  - Device lists for connected users
  - App state sync data
  - Pre-keys for encryption
  - LID (Linked ID) mappings

### Feature Modules (lib/)
- **sticker.js** - Sticker creation with EXIF metadata using node-webpmux and ffmpeg
- **uploader.js** - File uploading to Catbox
- **games.js** - Interactive game session management
- **groupProtection.js** - Group moderation features
- **messageCounter.js** - PostgreSQL-based message statistics

### External Scrapers (scrape/)
- **Ai4Chat.js** - AI chat integration
- **Tiktok.js** - TikTok video downloading

## Recent Changes (December 2025)

### Group Protection Features
- **Antilink** - Detects and deletes messages with links (WhatsApp, Telegram, shortened URLs)
- **Antiphoto** - Blocks and deletes photos from non-admin members
- **Antivideo** - Blocks and deletes videos from non-admin members
- **Antisticker** - Blocks and deletes stickers from non-admin members
- **Antiaudio** - Blocks and deletes voice notes/audio from non-admin members

Commands: `.antilink on/off`, `.antiphoto on/off`, `.antivideo on/off`, `.antisticker on/off`, `.antiaudio on/off`, `.protection`

### Owner/Admin Management Features
- **Kick** - Remove member from group (`.kick @user`)
- **Add** - Add member to group (`.add 628xxx`)
- **Promote** - Make member admin (`.promote @user`)
- **Demote** - Remove admin status (`.demote @user`)
- **Tagall** - Tag all members (`.tagall [message]`)
- **Listadmin** - Show list of group admins
- **Hidetag** - Send message with hidden mentions

### Permanent Message Counter
PostgreSQL-based message counting system that tracks all group messages permanently.
- `.totalpesan` / `.leaderboard` - Show top 20 message senders
- `.pesanku` - Check your own message count
- `.cleartotal` - Reset all message counts (admin only)

### Menu System (database/Menu/)
- **VynaaMenu.js** - Menu definitions
- **TimeHelper.js** - Menu building utilities with time-based greetings

## External Dependencies

### Messaging Platform APIs
- **@whiskeysockets/baileys** - WhatsApp Web API client for bot connectivity
- **Groq SDK** - AI/LLM integration for chat features

### Media Processing
- **@ffmpeg-installer/ffmpeg** - FFmpeg binary for media conversion
- **fluent-ffmpeg** - FFmpeg wrapper for video/audio processing
- **node-webpmux** - WebP manipulation for animated stickers
- **file-type** - File type detection

### Database
- **pg (PostgreSQL)** - Database for message counting and persistent storage
- Database initialization and queries handled in lib/messageCounter.js

### External APIs
- **VynaaAPi** (https://vynaa.web.id) - Custom API for various bot features
- **Catbox** - File hosting service for uploads
- **node-simipro** - Additional utility functions

### HTTP & Utilities
- **axios** & **node-fetch** - HTTP clients for API requests
- **form-data** - Multipart form handling for file uploads
- **ytdl-core** - YouTube video downloading

### Console Output
- **chalk** - Terminal styling
- **figlet** - ASCII art text generation
- **pino** - Logging library