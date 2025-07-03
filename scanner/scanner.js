const { Client, Events, GatewayIntentBits } = require("discord.js");
const Encryption = require("../encryption/encryption.js");
const base64 = require("base64-js");
require('dotenv').config();

class Scanner {
  constructor(options, sql, api) {
    this.config = {
      WEBSOCKET_URL: "wss://socf-lok-live.leagueofkingdoms.com/socket.io/?EIO=4&transport=websocket",
      ZONE_COUNT: 4096,
      BATCH_SIZE: 9,
    };

    this.shrines = [
      { type: "A Shrine", fromx: 872, fromy: 1128, tox: 920, toy: 1176, tag: "R2NG" },
      { type: "A Shrine", fromx: 1128, fromy: 1128, tox: 1176, toy: 1176, tag: "R4NG" },
      { type: "B Shrine", fromx: 1384, fromy: 1128, tox: 1432, toy: 1176, tag: "R2NG" },
      { type: "B Shrine", fromx: 1128, fromy: 1384, tox: 1176, toy: 1432, tag: "R2NG" },
      { type: "B Shrine", fromx: 872, fromy: 1384, tox: 920, toy: 1432, tag: "R4NG" },
      { type: "B Shrine", fromx: 616, fromy: 1384, tox: 664, toy: 1432, tag: "VEKS" },
      { type: "B Shrine", fromx: 1384, fromy: 1384, tox: 1432, toy: 1432, tag: "LGD$" },
      { type: "B Shrine", fromx: 616, fromy: 1128, tox: 664, toy: 1176, tag: "VEKL" },
      { type: "C Shrine", fromx: 1640, fromy: 1128, tox: 1688, toy: 1176, tag: "R4NG" },
      { type: "C Shrine", fromx: 872, fromy: 1640, tox: 920, toy: 1688, tag: "R4NG" },
      { type: "C Shrine", fromx: 360, fromy: 1640, tox: 408, toy: 1688, tag: "VEKS" },
      { type: "C Shrine", fromx: 360, fromy: 1384, tox: 408, toy: 1432, tag: "LGD$" },
      { type: "C Shrine", fromx: 616, fromy: 1640, tox: 664, toy: 1688, tag: "LGD$" },
      { type: "C Shrine", fromx: 1128, fromy: 1640, tox: 1176, toy: 1688, tag: "GuHg" },
      { type: "C Shrine", fromx: 1384, fromy: 1640, tox: 1432, toy: 1688, tag: "GuHg" },
      { type: "C Shrine", fromx: 1640, fromy: 1384, tox: 1688, toy: 1432, tag: "VEKL" },
      { type: "C Shrine", fromx: 1640, fromy: 1640, tox: 1688, toy: 1688, tag: "VEKL" },
      { type: "C Shrine", fromx: 360, fromy: 1128, tox: 408, toy: 1176, tag: "VEKS" },
      { type: "Congress", fromx: 1000, fromy: 1000, tox: 1048, toy: 1048, tag: "R1NG" },
    ];

    this.discordClient = new Client({
      intents: [GatewayIntentBits.Guilds],
    });
    this.discordToken = process.env.DISCORD_TOKEN;
    this.discordClient.login(this.discordToken);
    this.discordClient.once(Events.ClientReady, () => {
      console.log("Discord client ready");
      this.run();
    });
    this.api = api;
    this.encryption = new Encryption();
    this.sql = sql;
    this.wsConnection = null;
    this.token = null;
    this.xorPassword = options.xorPassword || "";
    this.zoneNumbers = [];
    this.objects = [];
    this.zoneIndex = 0;
    this.batchCount = 0;
    this.isFinished = false;
    this.currentGuild = options.guildId || null;
    this.currentContinent = options.continent || null;
    this.logChannels = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
  }

  async getLocation(x, y) {
    const shrine = this.shrines.find(
      (item) => x >= item.fromx && x <= item.tox && y >= item.fromy && y <= item.toy
    );
    if (shrine) return `${shrine.tag} ${shrine.type}`;
    if (x >= 1800 || y > 1800 || x < 250 || y < 250) return "Green Zone";
    return "";
  }

  async processWebSocketData(data) {
    // Calculate progress
    const zonesProcessed = Math.min(this.zoneIndex, this.config.ZONE_COUNT);
    const percent = ((zonesProcessed / this.config.ZONE_COUNT) * 100).toFixed(1);
    console.log(
        `Processing ${data.length} objects from ${this.currentContinent} websocket (${percent}% done)`
    );
    this.objects.push(...data);
  }

  async processAndSaveData(data) {
    try {
      // Only keep cmines and dsa mines
      const filtered = data.filter(item =>
        item.code === 20100105 || item.code === 20100106
      );

      console.log(`Saving ${filtered.length} cmines/dsa objects to database`);

      // Prepare all mine objects for bulk insert
      const mines = filtered.map(item => {
        const { _id, loc, level, code, expired, param, occupied } = item;
        const [continent, x, y] = loc;
        const zone = Math.floor(x / 32) + 64 * Math.floor(y / 32);

        return {
          fid: _id,
          zone,
          code,
          continent: this.currentContinent,
          guild: this.currentGuild,
          x,
          y,
          level,
          value: param?.value || 0,
          expired: toMysqlDatetime(item.expired),
          location: null, // or set if you have a location string
          allianceTag: occupied?.allianceTag || null,
          kingdomId: occupied?.id || null,
          name: occupied?.name || null,
          targetValue: occupied?.targetValue || null,
          diff: occupied ? (param?.value || 0) - (occupied.targetValue || 0) : null,
          started: toMysqlDatetime(item.occupied?.started),
          ended: toMysqlDatetime(item.occupied?.ended),
        };
      });

      // Use the bulk insert function
      await this.sql.insertMineDataBulk(mines);

      // Continue with any post-processing
      await this.elaborateAndCompare(filtered);

    } catch (error) {
      console.error(`Error processing and saving data for guild ${this.currentGuild}, continent ${this.currentContinent}:`, error);
    }
  }

  async handleIllegalMining(record) {
    try {
      const isIllegal = await this.sql.checkIllegalMine(record._id, record.occupied?.id, this.currentGuild);
      if (!isIllegal) {
        const illegalRecord = {
          fid: record._id,
          code: record.code,
          name: record.occupied?.name,
          x: record.x,
          y: record.y,
          allianceTag: record.occupied?.allianceTag,
          started: record.started,
          kingdomId: record.occupied?.id,
          level: record.level,
          value: record.param?.value,
          continent: this.currentContinent,
          guild: this.currentGuild,
        };
        console.log("saving illegal mine record");
        await Promise.all([
          this.sql.insertIllegalMine(illegalRecord),
          this.sendDiscordNotification(record)
        ]);
      }
    } catch (error) {
      console.error(`Error handling illegal mining for guild ${this.currentGuild}:`, error);
    }
  }

  async elaborateAndCompare(records) {
    try {
      const whitelistRows = await this.sql.getWhitelist(this.currentGuild, this.currentContinent);
      console.log(`Found ${whitelistRows.length} whitelist entries for guild ${this.currentGuild}, continent ${this.currentContinent}`);
      const whitelist = whitelistRows.reduce((acc, row) => {
        acc[row.kingdomid] = acc[row.kingdomid]
          ? {
            ...acc[row.kingdomid],
            cmine: Math.max(acc[row.kingdomid].cmine, row.cmine),
            dsa: Math.max(acc[row.kingdomid].dsa, row.dsa),
          }
          : row;
        return acc;
      }, {});
      // console.log("Whitelist: ", whitelist);

      // Filter records that are not allowed
      console.log(`Filtering illegal mines for guild ${this.currentGuild}, continent ${this.currentContinent}`);
      const illegalCandidates = records.filter(record => {
        if (
          record.occupied?.name &&
          record.level > 1 &&
          (record.code === 20100105 || record.level > 2)
        ) {
          const whitelistEntry = whitelist[record.occupied?.id];
          if (whitelistEntry) {
            const cmine = Number(whitelistEntry.cmine);
            const dsa = Number(whitelistEntry.dsa);
            if (record.code === 20100105 && cmine >= record.level) return false;
            if (record.code === 20100106 && dsa >= record.level) return false;
          }
          return true;
        }
        return false;
      });

      // Bulk check which are already reported
      const fids = illegalCandidates.map(r => r._id);
      const alreadyReported = await this.sql.checkIllegalMinesBulk(fids, this.currentGuild);
      const newIllegals = illegalCandidates.filter(r => !alreadyReported.includes(r._id));

      // Prepare records for bulk insert
      const illegalRecords = newIllegals.map(record => ({
        fid: record._id,
        code: record.code,
        name: record.occupied?.name,
        x: record.loc[1],
        y: record.loc[2],
        allianceTag: record.occupied?.allianceTag,
        started: record.started,
        kingdomId: record.occupied?.id,
        level: record.level,
        value: record.param?.value,
        continent: this.currentContinent,
        guild: this.currentGuild,
      }));

      if (illegalRecords.length) {
        await this.sql.insertIllegalMinesBulk(illegalRecords);
        console.log(`Inserted ${illegalRecords.length} new illegal mines.`);
        // Send Discord notifications for each new illegal mine
        for (const record of newIllegals) {
          // console.log("record: ", record);
          await this.sendDiscordNotification({
            code: record.code,
            name: record.occupied?.name,
            level: record.level,
            x: record.loc?.[1],
            y: record.loc?.[2],
            value: record.param?.value,
            allianceTag: record.occupied?.allianceTag,
            id: record.occupied?.id,
            started: record.occupied?.started,
          });
        }
      }

    } catch (error) {
      console.error(`Error in elaborateAndCompare for guild ${this.currentGuild}, continent ${this.currentContinent}:`, error);
    }
  }

  async sendDiscordNotification({ code, name, level, x, y, value, allianceTag, id, started }) {
    console.log(`Sending Discord notification for code ${code}, name ${name}, level ${level}, x ${x}, y ${y}, value ${value}, allianceTag ${allianceTag}, id ${id}, started ${started}`);
    const resourceMap = {
      20100105: {
        type: "Crystal",
        title: "CMine",
        typeb: "crystals",
        tag: "1203026349678141481",
        img: "./scanner/fo_20100105_1.png",
        compensation: `${level * 100}m RSS`,
      },
      20100106: {
        type: "DSA",
        title: "DSA",
        typeb: "DSA",
        tag: "1203026389821947914",
        img: "./scanner/fo_20100106_1.png",
        compensation: `${level * 20} DST`,
      },
    };

    const resource = resourceMap[code] || {};

    try {
      this.logChannels = await this.sql.getGuildLogChannels(this.currentGuild);
      if (!this.logChannels) {
        console.log(`No log channels configured for guild ${this.currentGuild}`);
      }

      const guildChannels = this.logChannels[0];
      const channelId = code === 20100105
        ? guildChannels.cmine_whitelist_channel
        : guildChannels.dsa_whitelist_channel;

      if (!channelId) {
        throw new Error(`No ${code === 20100105 ? 'cmine' : 'dsa'} whitelist channel configured for guild ${this.currentGuild}`);
      }

      const discordId = (await this.sql.getVerifiedDiscordId(id, this.currentGuild))[0]?.discordId || null;
      const discordTag = discordId ? `<@${discordId}>` : "";

      // Ensure miningStart is in epoch seconds (UTC)
      let miningStart = 0;
      if (started) {
        const date = new Date(started);
        if (!isNaN(date.getTime())) {
          miningStart = Math.floor(date.getTime() / 1000);
        }
      }
      const currentTimestamp = Math.floor(Date.now() / 1000);

      // Fix: Default value to 0 if undefined/null
      console.log(`Value: ${value}`);
      const safeValue = (typeof value === "number" && !isNaN(value)) ? value : 0;

      const channel = await this.discordClient.channels.fetch(channelId);
      await channel.send({
        content: `## **${discordTag || `[${allianceTag}] ${name}`} is illegally mining a ${resource.type} Mine Lv. ${level} at ${x}:${y} with ${safeValue.toLocaleString()} ${resource.typeb} inside**\n\n` +
          `Criminal: [${allianceTag}] ${name} ${discordTag}\n\n` +
          `Mining started at: <t:${miningStart}:F> (<t:${miningStart}:R>)\n\n`,
        files: [resource.img],
      });
    } catch (error) {
      console.error(`Error sending Discord notification for guild ${this.currentGuild}:`, error);
    }
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async setupWebSocket(guild, continent) {
    this.currentGuild = guild;
    this.currentContinent = continent;

    console.log(`Setting up WebSocket for guild ${guild}, continent ${continent}`);

    return new Promise((resolve, reject) => {
      const url = `${this.config.WEBSOCKET_URL}&token=${this.token}`;

      this.api.connectWebSocket(url, {
        onConnect: (connection) => {
          this.wsConnection = connection;
          this.reconnectAttempts = 0;
          console.log(`WebSocket Client Connected for guild ${guild}, continent ${continent}`);

          this.encryption.createXorMessage(JSON.stringify({ token: this.token }), this.xorPassword)
            .then(encoded => {
              const message = `42["/field/enter/v3", "${encoded}"]`;
              console.log(`Sending initial message: ${message}`);
              connection.sendUTF(message);
              // DO NOT resolve here! Wait until scan is finished.
            })
            .catch(error => {
              console.error("Error encoding token:", error);
              reject(error);
            });
        },
        onMessage: async (message, connection) => {
          try {
            // Only process utf8 messages
            if (message.type !== "utf8") return;

            // Only process messages that start with 42[
            if (!message.utf8Data.startsWith("42[")) return;

            let parsed;
            try {
              parsed = JSON.parse(message.utf8Data.substring(2));
            } catch (e) {
              console.error("Failed to parse WebSocket message as JSON array:", message.utf8Data, e);
              return;
            }

            const [event, data] = parsed;

            if (event === "/field/objects/v4") {
              let decompressed, decrypted, decoded;
              try {
                // 1. Gunzip the packs
                decompressed = await this.encryption.decodeGunzip(data.packs);

                // 2. Use decryptXorMessage on the base64 string
                decrypted = await this.encryption.decryptXorMessage(decompressed.toString(), this.xorPassword);

                // 3. Parse the decrypted JSON
                decoded = JSON.parse(decrypted);
              } catch (e) {
                console.error("Failed to decode/decrypt/parse /field/objects/v4:", e, { decompressed, decrypted, data });
                return;
              }

              await this.processWebSocketData(decoded.objects);

              // --- NEW LOGIC: Only finish when all zones are processed ---
              if (this.isFinished || this.zoneIndex >= this.config.ZONE_COUNT) {
                console.log(`${continent}: 100%`);
                await this.processAndSaveData(this.objects);
                connection.close();
                resolve();
                return;
              }

              //await this.delay(200);
              const zonesSubset = this.zoneNumbers.slice(this.zoneIndex, this.zoneIndex + this.config.BATCH_SIZE);
              this.zoneIndex += this.config.BATCH_SIZE;
              this.batchCount++;

              if (zonesSubset.length < this.config.BATCH_SIZE || this.zoneIndex >= this.config.ZONE_COUNT) {
                this.isFinished = true;
              }

              const payload = JSON.stringify({ world: this.currentContinent, zones: JSON.stringify(zonesSubset) });
              const encoded = await this.encryption.createXorMessage(payload, this.xorPassword);
              const message = `42["/zone/enter/list/v4", "${encoded}"]`;
              // console.log(`Sending zone batch message: ${message}`);
              connection.sendUTF(message);
            } else if (event === "/field/enter/v3") {
              this.batchCount = 1;
              await this.delay(1000);
              const zonesSubset = this.zoneNumbers.slice(this.zoneIndex, this.zoneIndex + this.config.BATCH_SIZE);
              this.zoneIndex += this.config.BATCH_SIZE;

              if (zonesSubset.length < this.config.BATCH_SIZE) this.isFinished = true;

              const payload = JSON.stringify({ world: this.currentContinent, zones: JSON.stringify(zonesSubset) });
              const encoded = await this.encryption.createXorMessage(payload, this.xorPassword);
              const messageToSend = `42["/zone/enter/list/v4", "${encoded}"]`;
              console.log(`Sending zone batch message after enter: ${messageToSend}`);
              connection.sendUTF(messageToSend);
            } else {
              // Ignore other events, or log if you want
              // console.log("Unhandled WebSocket event:", event);
            }
          } catch (error) {
            console.error(`Error processing WebSocket message for guild ${guild}, continent ${continent}:`, error);
          }
        },
        onError: (error) => {
          console.error(`WebSocket Connect Error for guild ${guild}, continent ${continent}:`, error.message);
          if (!this.isFinished && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
              this.api.connectWebSocket(url, {
                onConnect: this.api.options?.onConnect,
                onMessage: this.api.options?.onMessage,
                onError: this.api.options?.onError,
                onClose: this.api.options?.onClose,
                useProxy: true,
              }).catch(err => console.error(`Reconnect failed: ${err.message}`));
            }, 2000);
          } else {
            reject(error);
          }
        },
        onClose: () => {
          console.log(`WebSocket Connection Closed for guild ${guild}, continent ${continent}`);
          if (!this.isFinished && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
              this.api.connectWebSocket(url, {
                onConnect: this.api.options?.onConnect,
                onMessage: this.api.options?.onMessage,
                onError: this.api.options?.onError,
                onClose: this.api.options?.onClose,
                useProxy: true,
              }).catch(err => console.error(`Reconnect failed: ${err.message}`));
            }, 2000);
          }
        },
        useProxy: true,
      }).catch(error => {
        console.error(`WebSocket Connection Failed for guild ${guild}, continent ${continent}:`, error);
        reject(error);
      });
    });
  }

  async scanContinent(guild, continent) {
    console.log("scanning continent:", continent);
    try {
      this.zoneNumbers = Array.from({ length: this.config.ZONE_COUNT + 1 }, (_, i) => i);
      this.objects = [];
      this.zoneIndex = 0;
      this.batchCount = 0;
      this.isFinished = false;
      this.reconnectAttempts = 0;

      const tokens = await this.sql.getScannerTokens(guild);
      if (tokens.length === 0) {
        throw new Error(`No scanner token found for guild ${guild}`);
      }
      this.token = tokens[0].token;

      const xorPass = (await this.sql.getXORPass())[0]?.value || ".0d172qwfg634.";
      if (xorPass) this.xorPassword = xorPass;

      await this.setupWebSocket(guild, continent);
      console.log("webhook ready");
    } catch (error) {
      console.error(`Error scanning continent ${continent} for guild ${guild}:`, error);
      throw error;
    }
  }

  async start() {
    try {
      const guildContinents = [{ guild_id: this.currentGuild, continent: this.currentContinent }];

      const concurrencyLimit = 3;
      const queue = guildContinents.slice();
      const activePromises = new Set();

      while (queue.length > 0 || activePromises.size > 0) {
        while (queue.length > 0 && activePromises.size < concurrencyLimit) {
          const { guild_id, continent } = queue.shift();
          console.log(`Starting scan for guild ${guild_id}, continent ${continent}`);

          const promise = this.scanContinent(guild_id, continent)
            .catch(error => {
              console.error(`Scan failed for guild ${guild_id}, continent ${continent}:`, error);
            })
            .finally(() => {
              activePromises.delete(promise);
            });

          activePromises.add(promise);
        }

        if (activePromises.size > 0) {
          await Promise.race(activePromises);
        }
      }
    } catch (error) {
      console.error("Bot startup error:", error);
      throw error;
    } finally {
      if (this.wsConnection) {
        this.wsConnection.close();
        this.wsConnection = null;
      }
    }
  }

  calculateNextRunDelay() {
    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();

    // Target times are :15 and :45 every hour
    const targetMinutes = [15, 45];

    // Find the next target minute in this hour
    let nextMinute = targetMinutes.find(min => min > currentMinute);
    let nextHour = currentHour;

    if (nextMinute === undefined) {
      // No target minute left in this hour, go to next hour
      nextMinute = targetMinutes[0];
      nextHour = (currentHour + 1) % 24;
    }

    // Calculate the target time
    const nextRun = new Date(now);
    nextRun.setHours(nextHour);
    nextRun.setMinutes(nextMinute);
    nextRun.setSeconds(0);
    nextRun.setMilliseconds(0);

    let delay = nextRun.getTime() - now.getTime();
    // If delay is negative or zero, add 30 minutes (should not happen, but just in case)
    if (delay <= 0) {
      // If we're at 23:59 and next run is 00:15, this will fix the negative delay
      delay += 30 * 60 * 1000;
      // If still negative (shouldn't happen), add 24 hours
      if (delay <= 0) {
        delay += 24 * 60 * 60 * 1000;
      }
    }
    return delay;
  }

  scheduleNextRun() {
    const delay = this.calculateNextRunDelay();
    console.log(`Scheduling next run in ${Math.round(delay / 1000)} seconds`);

    setTimeout(async () => {
      try {
        await this.start();
      } catch (error) {
        console.error("Scheduled scan error:", error);
      } finally {
        // Schedule the next run after completion
        this.scheduleNextRun();
      }
    }, delay);
  }

  async run() {
    await this.start();
    this.scheduleNextRun();
  }
}

function toMysqlDatetime(dateStr) {
  if (!dateStr) return null;
  // Remove 'T' and 'Z', keep only up to seconds
  return dateStr.replace('T', ' ').replace('Z', '').split('.')[0];
}

module.exports = Scanner;