# JSscanner Standalone - Quick Setup Guide

## What's Included

✓ **Scanner core files** - scanner.js, startScanner.js  
✓ **Test utilities** - testScanBlocks.js, testProxyWs.js  
✓ **All dependencies** - encryption, api, database, accountInfo modules  
✓ **Package configuration** - package.json, .env.example  
✓ **Documentation** - README.md (this guide)

## 3-Step Deployment

### Step 1: Install Dependencies
```bash
cd JSscanner
npm install
```

This installs:
- `discord.js` - Discord integration
- `axios` - HTTP client
- `websocket` - WebSocket support
- `mysql2` - Database connection
- `node-cron` - Task scheduling
- `https-proxy-agent` - Proxy support
- `dotenv` - Environment configuration
- `jsonwebtoken` - JWT token handling

### Step 2: Configure Environment
```bash
cp .env.example .env
# Edit .env with your database credentials and tokens
nano .env
```

**Required settings:**
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` - Your database
- `TOKEN` - Your scanner bot token

**Optional but recommended:**
- `DISCORD_TOKEN` - For Discord alerts
- `XOR_PASS` - If using encryption
- `SCANNER_USE_PROXIES` - Set to true if using proxies

### Step 3: Run Scanner
```bash
node startScanner.js
```

The scanner will:
1. Connect to your database
2. Fetch continents with active subscriptions
3. Launch scanner instances automatically
4. Continue running with scheduled scans at :10 and :40 of each hour

## File Structure Explanation

```
encryption/
  ├── encryption.js          # XOR/Base64 crypto operations
  └── readXorMessage.js      # Message decryption helper

general/
  ├── api.js                 # HTTP + WebSocket API client
  ├── accountInfo.js         # Login and profile management
  └── decodeJWT.js           # Token decoding

database/
  └── sql.js                 # All database queries & operations

scanner.js                   # Core scanner (WebSocket, zone scanning)
startScanner.js              # Scheduler (launches scanners)
testScanBlocks.js            # Debug utility
testProxyWs.js               # Proxy test (deprecated)
```

## Usage Examples

### Check Database Connection
```bash
node -e "const Sql = require('./database/sql.js'); const sql = new Sql(); sql.checkConnection() || console.log('Connected');"
```

### Test a Single Scanner
```bash
node -e "
const Scanner = require('./scanner.js');
new Scanner({ 
  guildId: '12345',      // Your guild ID
  continent: 11          // Your continent ID
});
"
```

### Enable Debug Logging
```bash
SCANNER_DEBUG=1 node startScanner.js
```

### Test Proxy Performance
```bash
SCANNER_RANK_PROXIES=1 TOKEN=your_token node startScanner.js
```

## Troubleshooting

**"Cannot find module"**  
→ Run `npm install` again to ensure all packages are installed

**"Database connection refused"**  
→ Verify DB_HOST, DB_USER, DB_PASSWORD in .env, test with: `mysql -h DB_HOST -u DB_USER -p DB_NAME`

**"Scanner not connecting"**  
→ Check TOKEN is valid, enable SCANNER_DEBUG=true for logs

**"Proxy connection failed"**  
→ Test proxy with: `curl -x http://proxy_ip:3128 https://example.com`

## Important Notes

- **No code changes** - All files are exact copies from the main project
- **Database required** - Must have the same schema as main project
- **Relative imports** - File paths are self-contained within JSscanner folder
- **Environment variables** - Configuration via .env file (never commit credentials)
- **Tokens** - Ensure bot tokens have proper permissions in game

## Support Resources

- Check `/home/c24/lokex/JSscanner/README.md` for detailed documentation
- Review log output for error messages (enable DEBUG if needed)
- Ensure database tables exist: `scanner_settings`, `proxies`, `bot_accounts`, etc.

---

**Version**: 1.0.0 (Standalone)  
**Last Updated**: 2026-03-12  
**Status**: Ready for deployment
