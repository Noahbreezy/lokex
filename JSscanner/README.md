# JSscanner - Standalone Scanner

This is a standalone version of the League of Kingdoms scanner that can be deployed on a separate server.

## Directory Structure

```
JSscanner/
├── encryption/          # Encryption module for XOR/Base64 operations
│   ├── encryption.js
│   └── readXorMessage.js
├── general/            # General utility modules
│   ├── api.js          # API client with proxy support and WebSocket connections
│   ├── accountInfo.js  # Account login and profile management
│   └── decodeJWT.js    # JWT token decoding
├── database/           # Database module
│   └── sql.js          # SQL queries and database operations
├── scanner.js          # Core scanner implementation
├── startScanner.js     # Scanner manager (launches scanners on schedule)
├── testScanBlocks.js   # Test utility for scanning blocks
├── testProxyWs.js      # Test utility for proxy WebSocket (deprecated)
└── README.md          # This file
```

## Requirements

- **Node.js** (v14 or higher)
- **MySQL/MariaDB** database
- **NPM packages**: See [Installation](#installation)

## Installation

### 1. Copy Files to Server
Copy the entire `JSscanner` folder to your new server.

### 2. Install Dependencies
```bash
cd JSscanner
npm install discord.js https-proxy-agent axios websocket mysql2 node-cron dotenv jsonwebtoken
```

Or create a `package.json` if one doesn't exist:
```bash
npm init -y
npm install discord.js https-proxy-agent axios websocket mysql2 node-cron dotenv jsonwebtoken
```

### 3. Environment Configuration
Create a `.env` file in the JSscanner folder with the following variables:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=lokex

# Game API Configuration
TOKEN=your_scanner_token_here
SCANNER_TEST_TOKEN=your_scanner_token_here

# XOR Encryption (optional)
XOR_PASS=your_xor_password_here

# Discord Bot (optional)
DISCORD_TOKEN=your_discord_token_here

# Scanner Configuration (optional)
SCANNER_DEBUG=false
DEBUG_SCANNER=false
SCANNER_BATCH_DELAY_MS=25
SCANNER_BATCH_TIMEOUT_MS=3000
SCANNER_USE_PROXIES=true
SCANNER_RANK_PROXIES=false
SCANNER_RANK_PROXY_COUNT=25
SCANNER_RANK_PROXY_TIMEOUT_MS=20000
SCANNER_RANK_PROXY_CONCURRENCY=5

# LOK API Base URL (if different)
LOK_API_URL=https://api-lok-live.leagueofkingdoms.com
LOK_WS_BASE=wss://socf-lok-live.leagueofkingdoms.com/socket.io/?EIO=4&transport=websocket
```

## Usage

### Start Scanner Manager
The scanner manager will launch scanners automatically on a schedule (at :10 and :40 of every hour):

```bash
node startScanner.js
```

### Manual Scanner Test
To test the scanner with a specific guild and continent:

```bash
node -e "
const Scanner = require('./scanner.js');
new Scanner({ guildId: 'your_guild_id', continent: 'your_continent_id' });
"
```

### Test Block Scanning
To test scanning a specific block:

```bash
node testScanBlocks.js
```

## Database Requirements

The scanner expects the following database tables and procedures. Ensure your database is properly set up with:

- `scanner_settings` - Scanner configuration per guild
- `proxies` - List of proxy servers
- `bot_accounts` - Bot account information
- The ability to store mine/object data from scanning

## Key Features

- **Proxy Support**: Routes requests through proxy servers to avoid IP bans
- **WebSocket Scanning**: Connects to the game's WebSocket to scan continents
- **XOR Encryption**: Supports encrypted communication with the game API
- **Automatic Scheduling**: Runs on a cron schedule (configurable)
- **Discord Integration**: Optional Discord bot alerts (requires DISCORD_TOKEN)
- **Global Pause**: Automatically pauses all scanners for 2 hours on 403 errors

## Core Modules

### scanner.js
Main scanner class that:
- Connects to WebSocket with proxy support
- Fetches zone data sequentially in batches
- Handles encryption/decryption
- Manages reconnection on failure
- Stores scanned objects

### startScanner.js  
Scanner manager that:
- Fetches subscribed continents from database
- Launches scanner instances for each (guild, continent)
- Updates scanner tokens before each run
- Clears old mine data

### api.js
API client that:
- Makes HTTP requests with proxy support
- Manages WebSocket connections
- Ranks proxies by performance
- Handles rate limiting and errors

### encryption.js
Encryption utilities for:
- XOR encryption/decryption
- Base64 encoding/decoding
- Message handling

### sql.js
Database interface with methods for:
- Fetching scanner tokens
- Managing proxy lists
- Storing/retrieving objects and mines
- Querying guild and alliance data

## Troubleshooting

### Connection Issues
- Verify database credentials in `.env`
- Check that proxies are working (if using proxies)
- Ensure TOKEN environment variable is set

### Encryption Errors
- Verify XOR_PASS is correct if using encryption
- Check that regionHash matches encrypted data

### Proxy Issues
- Test proxy connectivity: `curl -x http://proxy:3128 https://example.com`
- Enable SCANNER_DEBUG for verbose proxy logs
- Use SCANNER_RANK_PROXIES=1 to test proxy speeds

## Performance Notes

- Batch size: 9 zones per request (configurable)
- Batch delay: 25ms between requests (configurable)
- Default timeout: 3000ms per batch (configurable)
- Max concurrent scanners: Limited by available proxies and memory

## Support

This is a standalone version for deployment. All original code is unchanged. Refer to the main project documentation for additional help.
