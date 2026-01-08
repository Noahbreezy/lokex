const axios = require("axios");
const SpeedCheck = require("./speedcheck.js");
const MasteryCheck = require("./masterycheck.js");
const ShrineCheck = require("./shrineCheck.js");
const UpdateInfo = require("./updateinfo.js");
const HelpCheck = require("./helpCheck.js");
const AcceptCheck = require("./acceptCheck.js");
const R4Check = require("./r4check.js");
const AccountLimitCheck = require("./accountLimitCheck.js");
const MedalDistributor = require("./distributeMedals.js");
// const LocationCheck = require("./locationCheck.js");

class AllianceManager {
  static configureDiscord(discordClient, discordReady = Promise.resolve()) {
    AllianceManager.sharedDiscordClient = discordClient;
    AllianceManager.sharedDiscordReady = discordReady || Promise.resolve();
  }

  constructor(options, sql, acceptRequestLock, api, discordClient, discordReady) {

    // Credentials
    this.token = options.token;
    this.acceptRequestLock = acceptRequestLock;
    if (discordClient && !AllianceManager.sharedDiscordClient) {
      AllianceManager.configureDiscord(discordClient, discordReady);
    }

    const sharedClient = discordClient || AllianceManager.sharedDiscordClient;
    const sharedReady = discordReady || AllianceManager.sharedDiscordReady;

    if (!sharedClient) {
      throw new Error("Discord client instance is required");
    }

    this.discordClient = sharedClient;
    this.discordReady = sharedReady || Promise.resolve();

    // Initialize classes
    this.sql = sql; // zkM38hcy4ANj

    this.api = api;

    this.helpCheck = new HelpCheck(this.sql);
    this.acceptCheck = new AcceptCheck(this.sql);

    this.shrineCheck = new ShrineCheck(this.api);

    this.updateInfo = new UpdateInfo(this.sql, this.api);
    this.masteryCheck = new MasteryCheck(this.sql, this.api);
    this.speedCheck = new SpeedCheck(this.sql, this.api);
    this.r4Check = new R4Check(this.sql, this.api);
    this.accountLimitCheck = new AccountLimitCheck(this.sql);
  this.medalDistributor = new MedalDistributor(this.sql, this.api, this.discordClient);
  this.managerRank = null;
  this.canDistributeMedals = false;
    // this.locationCheck = new LocationCheck(this.sql, this.api);

    // Initialize alliance settings
    this.managerId = options.settings.managerId;
    this.allianceId = options.settings.allianceId;
    this.allianceTag = options.settings.allianceTag;
    this.castle = null;
    this.power = null;
    this.kills = null;
    this.speed = null;
    this.mastery = null;
    this.verification = null;
    this.interval = options.settings.interval || null;
    this.accepting = null;
    this.kicking = null;
    this.maxkick = null;
    this.cvcmode = null;
    this.titleGrace = 0;
    this.guild = options.settings.guild;
    this.acceptLogChannel = "945404350229000252";
    this.rejectLogChannel = "945404350229000252";
    // setInterval(() => this.accept(), (this.interval || 60) * 1000); //mauro v2.1

    const startAcceptLoop = () => this.accept();

    if (
      (typeof this.discordClient.isReady === "function" && this.discordClient.isReady()) ||
      this.discordClient.readyAt
    ) {
      setTimeout(startAcceptLoop, 0);
    } else {
      this.discordReady
        .then(() => setTimeout(startAcceptLoop, 0))
        .catch((error) => {
          console.error(`${this.allianceTag}: Failed to start accept loop after Discord ready`, error);
        });
    }
  }

  async acceptRequest(kid, token) {
    // console.log("accepting start");
    return this.acceptRequestLock.acquire('acceptRequest', async () => {
      const acceptResponse = await this.api.request(
        "https://api-lok-live.leagueofkingdoms.com/api/alliance/request/accept",
        { kingdomId: kid },
        {
          "x-access-token": token,
          "Content-Type": "application/json",
        }
      );
      // console.log("accepting end");
      return acceptResponse;
    });
  }

  async kick(token, maxkick, cvcmode, titleGrace) {
    // console.log("kick function: ", this.allianceTag);
    try {
      const membersListResponse = await this.api.request(
        "https://api-lok-live.leagueofkingdoms.com/api/alliance/members/list",
        { allianceId: "" },
        {
          "x-access-token": token,
          "Content-Type": "application/json",
        }
      );

      if (membersListResponse.status === 200) {
        const helpListResponse = await this.api.request(
          "https://api-lok-live.leagueofkingdoms.com/api/alliance/help/list",
          {},
          {
            "x-access-token": token,
            "Content-Type": "application/json",
          }
        );

        if (helpListResponse.status === 200) {
          const helping = helpListResponse.data.otherTasks.map(
            (task) => task.kingdomId
          );
          // console.log("helping", helping);

          const membersol = membersListResponse.data.members;
          const members3 = [...membersol];

          // console.log(members3[4].members);

          members3[4].members.sort((a, b) => { // using R1 (5th item in the members list)
            return (
              new Date(a.lastLogined) - new Date(b.lastLogined)
            );
          });

          const members = members3[4].members.filter(
            (member) => !member.logined
          );

          const onlineMembers = members3[4].members.filter(
            (member) => member.logined //&& !this.locationCheck.checkLocation(member.kingdomId, token)
          );

          // let maxkick = 3;
          let counter = 0;
          let x = 0;

          for (x = 0; x < members.length && x < maxkick; x++) {
            // const lastlogin = new Date(members[x].lastLogined);
            // const current = new Date();
            const kingdomid = members[counter].kingdomId;
            const kingdomname = members[counter].name;

            // console.log(await this.helpCheck.checkHelp(kingdomid, titleGrace));

            if (await this.helpCheck.checkHelp(kingdomid, titleGrace)) {
              this.discordClient.channels.cache
                .get(this.acceptLogChannel)
                .send(
                  `**${this.allianceTag}**\nTried to kick: ${kingdomname} (${kingdomid}), last online: ${members[counter].lastLogined} but has requested title in the last ${this.titleGrace} minutes`
                );
              maxkick++;
              continue;
            }

            if (this.canDistributeMedals) {
              if (this.canDistributeMedals) {
                await this.medalDistributor.distributeMedalsForKingdom(
                  kingdomid.toString(),
                  this.guild,
                  token
                );
              } else {
                // console.log(`${this.allianceTag}: Skipping medal distribution for ${kingdomname} (${kingdomid}) because manager rank is ${this.managerRank ?? "unknown"}.`);
              }
            } else {
              // console.log(`${this.allianceTag}: Skipping medal distribution for ${kingdomname} (${kingdomid}) because manager rank is ${this.managerRank ?? "unknown"}.`);
            }

            const disbandResponse = await this.api.request(
              "https://api-lok-live.leagueofkingdoms.com/api/alliance/member/disband",
              { memberKingdomId: kingdomid },
              {
                "x-access-token": token,
                "Content-Type": "application/json",
              }
            );

            // console.log(disbandResponse.data.result);

            if (
              disbandResponse.data &&
              !disbandResponse.data.result
            ) {
              console.log(disbandResponse.data);
              if (disbandResponse.data.err && disbandResponse.data.err.code === "during_rally") {
                console.log(`still in rally: ${kingdomid}`);
              } else {
                console.log(`false kick ${kingdomid}`);
              }
              x -= 1;
            }

            if (
              disbandResponse.status === 200 &&
              disbandResponse.data.result
            ) {
              this.discordClient.channels.cache
                .get(this.acceptLogChannel)
                .send(
                  `**${this.allianceTag}**\nKicked: ${kingdomname} (${kingdomid}), last online: ${members[counter].lastLogined}`
                );
              console.log(`kicked ${kingdomname} (${kingdomid}) from ${this.allianceTag}`);
            }
            counter += 1;

            if (counter >= members.length) {
              break;
            }
          }

          if (x < maxkick && cvcmode) {

            let teller = 0;
            // console.log("online members: ", onlineMembers);
            // kicking even online members if not in rally
            for (let y = 0; y < onlineMembers.length; y++) {
              const kingdomid = onlineMembers[teller].kingdomId;
              const kingdomname = onlineMembers[teller].name;

              // console.log("kicking: ", kingdomid);
              // console.log("grace: ", titleGrace);

              if (await this.helpCheck.checkHelp(kingdomid, titleGrace)) {
                this.discordClient.channels.cache
                  .get(this.acceptLogChannel)
                  .send(
                    `**${this.allianceTag}**\nTried to kick: ${kingdomname} (${kingdomid}), last online: ${onlineMembers[teller].lastLogined} but has requested title in the last ${this.titleGrace} minutes`
                  );
                maxkick++;
                continue;
              }

              await this.medalDistributor.distributeMedalsForKingdom(
                kingdomid.toString(),
                this.guild,
                token
              );

              const disbandResponse = await this.api.request(
                "https://api-lok-live.leagueofkingdoms.com/api/alliance/member/disband",
                { memberKingdomId: kingdomid },
                {
                  "x-access-token": token,
                  "Content-Type": "application/json",
                }
              );

              // console.log(disbandResponse.data.result);

              if (disbandResponse.data && !disbandResponse.data.result) {
                y -= 1;
                // console.log(`false kick ${kingdomid}`);
              }

              if (
                disbandResponse.status === 200 &&
                disbandResponse.data.result
              ) {
                this.discordClient.channels.cache
                  .get(this.acceptLogChannel)
                  .send(
                    `**${this.allianceTag}**\nKicked: ${kingdomname} (${kingdomid}), last online: ${onlineMembers[teller].lastLogined}`
                  );
                console.log(`kicked ${kingdomname} (${kingdomid}) from ${this.allianceTag}`);
              }

              teller += 1;

              if (x + y >= maxkick) {
                break;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error in kick function: ", error);
    }
  }

  async accept() {
    try {
      //mauro v2.1
      // console.log("manager: ", this.allianceTag);
      let tokenResponseFlag = false;

      const tokenResponse = (await this.sql.getManagerToken(this.allianceId));
      if (tokenResponse.length === 0) {
        console.log("token: ", tokenResponse.length === 0, this.allianceTag);
        tokenResponseFlag = true;
        tokenResponse.push({ token: null });
      }
      // console.log('test sub', this.guild);
      const subscriptionFlagInfo = await this.sql.checkSubscriptionValid(this.guild, "1");
      // console.log('test sub2', subscriptionFlagInfo);

  const roleFlag = await this.sql.checkManagerRole(this.managerId);
  const r4Status = await this.r4Check.checkR4(tokenResponse[0].token, this.managerId, this.allianceId);
  const r4Flag = r4Status?.hasRank === true;
  this.managerRank = r4Status?.rank ?? null;
  this.canDistributeMedals = r4Status?.isR5 === true;


      if (tokenResponseFlag || !roleFlag || tokenResponse === undefined || !r4Flag || !subscriptionFlagInfo) {
        console.log("sending error message");
        let errorMessage = `Closing AllianceManager instance for ${this.allianceTag}. Reason: `;

        if (!roleFlag) {
          errorMessage += "Role flag is false";
        } else if (tokenResponse === undefined) {
          errorMessage += "Token response is undefined";
        } else if (tokenResponse.length === 0) {
          errorMessage += "Token response is empty";
        } else if (!subscriptionFlagInfo) {
          errorMessage += "No valid subscription found";
        } else if (!r4Flag) {
          errorMessage += "R4/R5 check failed";
        } else {
          errorMessage += "Unknown";
        }

        console.error(errorMessage);
        await this.sql.setAllianceStatusToInactive(this.allianceId);
        await this.sql.setManagerIdle(this.managerId);
        return;
      }

      const token = tokenResponse[0].token;

      const allianceSettings = (await this.sql.getAllianceSettings(this.allianceId))[0];
      //console.log("alliance settings: ", allianceSettings);
      // console.log("alliance id: ", this.allianceId);
      const logChannels = (await this.sql.getGuildLogChannelsByAlliance(this.allianceId))[0];
      // console.log("logchannels: ", logChannels);
      // console.log(settingsQueryResponse)
      // console.log("log channels: ", logChannels);

      this.castle = allianceSettings.castle;
      this.power = allianceSettings.power;
      this.kills = allianceSettings.kills;
      this.speed = allianceSettings.speed;
      this.mastery = {
        combat: allianceSettings.combat,
        monster: allianceSettings.monster,
        infantry: allianceSettings.infantry,
        cavalry: allianceSettings.cavalry,
        ranged: allianceSettings.ranged,
        governor: allianceSettings.governor,
      };
      this.verification = allianceSettings.verified === 1 ? true : false;
      this.interval = allianceSettings.interval < 30 ? 30 : allianceSettings.interval;
      this.accepting = allianceSettings.accept === 1 ? true : false;
      this.kicking = allianceSettings.kick === 1 ? true : false;
      this.maxkick = allianceSettings.maxkick;
      this.cvcmode = allianceSettings.cvcmode === 1 ? true : false;
      this.titleGrace = allianceSettings.titlegrace;
      this.guild = allianceSettings.guild;
      this.acceptLogChannel = logChannels.accept_log_channel;
      this.rejectLogChannel = logChannels.reject_log_channel;

      const mailAccountToken = (await this.sql.getRandomManagerTokenFromGuild(this.guild))[0].token;
      // console.log("mail token: ", mailAccountToken);

      // console.log("token: ", token);

      // // Check whether the alliance has the research shrine A3
      // const researchAlliance = await this.shrineCheck.checkResearch(token);

      // if (researchAlliance === true) {
      //   new Helper(token);
      // }

      const requirementMessage = `
      All the requirements for ${this.allianceTag} are:
      - Power: ${this.power / 1000000}m
      - Kills: ${this.kills}
      - Speed: ${this.speed}%
      - Mastery:
        - Infantry: ${this.mastery.infantry}
        - Ranged: ${this.mastery.ranged}
        - Cavalry: ${this.mastery.cavalry}
        - Combat: ${this.mastery.combat}
        - Monster: ${this.mastery.monster}
        - Governor: ${this.mastery.governor}
      - Discord verification: ${this.verification ? "Required" : "Not required"}
      `

      if (!this.accepting) {
        setTimeout(
          () => this.accept(),
          (this.interval || 60) * 1000
        ); //mauro v2.1
        return;
      }

      // console.log("accept function", this.allianceTag);
      try {
        const requestListResponse = await this.api.request(
          "https://api-lok-live.leagueofkingdoms.com/api/alliance/request/list",
          {},
          {
            "x-access-token": token,
            "Content-Type": "application/json",
          }
        );

        // console.log(requestListResponse.data);

        if (
          requestListResponse.status === 200 &&
          requestListResponse.data &&
          requestListResponse.data.requestList &&
          requestListResponse.data.requestList.length > 0
        ) {
          const allianceInfoResponse = await this.api.request(
            "https://api-lok-live.leagueofkingdoms.com/api/alliance/info/my",
            {},
            {
              "x-access-token": token,
              "Content-Type": "application/json",
            }
          );

          if (allianceInfoResponse.status === 200) {
            // console.log(allianceInfoResponse.data.alliance.numMembers);
            let numtkn = allianceInfoResponse.data.alliance.numMembers;

            if (numtkn >= 99 && this.kicking) {
              await this.kick(token, this.maxkick, this.cvcmode, this.titleGrace);
            }

            if (!this.accepting) {
              setTimeout(
                () => this.accept(),
                (this.interval || 60) * 1000
              ); //mauro v2.1
              return;
            }

            for (
              let xx = 0;
              xx < requestListResponse.data.requestList.length;
              xx++
            ) {
              const kid = requestListResponse.data.requestList[xx]["_id"];
              const name = requestListResponse.data.requestList[xx].name;
              const power = requestListResponse.data.requestList[xx].power;

              let blacklisted = await this.sql.isKingdomBlacklisted(kid, this.guild);

              if (blacklisted) {
                blacklisted = blacklisted[0];
                const dateexp = new Date(blacklisted.expiration);
                const permanent =
                  dateexp > new Date("2030-01-01");
                const ditim = this.formatDateTime(dateexp);

                await this.api.request(
                  "https://api-lok-live.leagueofkingdoms.com/api/alliance/request/deny",
                  { kingdomId: kid },
                  {
                    "x-access-token": token,
                    "Content-Type": "application/json",
                  }
                );

                await this.api.request(
                  "https://api-lok-live.leagueofkingdoms.com/api/mail/send",
                  new URLSearchParams({
                    json: JSON.stringify({
                      toName: name,
                      subject: `Rejected from ${this.allianceTag}`,
                      content: `You have been rejected because you are ${permanent ? "permanent " : ""}blacklisted${!permanent ? " until " + ditim : ""} for the reason: ${blacklisted.description}`
                    })
                  }),
                  { "x-access-token": mailAccountToken }
                );

                this.discordClient.channels.cache
                  .get(this.rejectLogChannel)
                  .send(
                    `**${this.allianceTag
                    }**\nRejected: ${name} (${kid}), power: ${this.addThousandSeparator(
                      power
                    )} blacklisted\n`
                  );
                console.log(`rejected from ${this.allianceTag} by blacklist: ${name} (${kid})`);
                continue;
              }

              let acceptFlag = false;
              if (!this.acceptCheck.checkAccept(kid)) { // If already accepted in the past 5 seconds, don't accept again.
                // console.log("already accepted");
                acceptFlag = true;
                continue;
              }

              if (acceptFlag) {
                console.log("already accepted but still continuing... fix code");
              }

              let membersListResponse = null;
              const maxEntryRaw = await this.sql.getAllianceMaxEntry(this.allianceId, this.guild);
              const maxEntry = Number(maxEntryRaw);
              if (Number.isFinite(maxEntry) && maxEntry > 0) {
                const linkedKingdoms = await this.sql.checkOtherVerifiedKingdoms(kid, this.guild);
                if (linkedKingdoms && linkedKingdoms.length) {
                  let allianceMembers = [];

                  try {
                    membersListResponse = await this.api.request(
                      "https://api-lok-live.leagueofkingdoms.com/api/alliance/members/list",
                      { allianceId: "" },
                      {
                        "x-access-token": token,
                        "Content-Type": "application/json",
                      }
                    );

                    if (
                      membersListResponse.status === 200 &&
                      membersListResponse.data &&
                      Array.isArray(membersListResponse.data.members)
                    ) {
                      allianceMembers = membersListResponse.data.members;
                    } else {
                      console.warn(
                        `${this.allianceTag}: alliance member list response missing data while checking account limits`
                      );
                    }
                  } catch (fetchError) {
                    console.error(
                      `${this.allianceTag}: failed to fetch alliance members for account limit check`,
                      fetchError
                    );
                  }

                  const limitStatus = await this.accountLimitCheck.hasReachedLimit(
                    this.guild,
                    this.allianceId,
                    linkedKingdoms,
                    allianceMembers,
                    maxEntry
                  );

                  if (limitStatus.reached) {
                    await this.api.request(
                      "https://api-lok-live.leagueofkingdoms.com/api/alliance/request/deny",
                      { kingdomId: kid },
                      {
                        "x-access-token": token,
                        "Content-Type": "application/json",
                      }
                    );

                    const matchingNames = limitStatus.matchingKingdoms
                      .map((kingdom) => kingdom.kingdomName)
                      .slice(0, 5)
                      .join(", ");

                    await this.api.request(
                      "https://api-lok-live.leagueofkingdoms.com/api/mail/send",
                      new URLSearchParams({
                        json: JSON.stringify({
                          toName: name,
                          subject: `Rejected from ${this.allianceTag}`,
                          content: `You have been rejected because your Discord account already has ${limitStatus.activeCount} kingdom(s) in ${this.allianceTag}. The maximum allowed is ${limitStatus.maxEntry}.
                                    Existing kingdoms: ${matchingNames || "Hidden"}
                                    \n${requirementMessage}`,
                        }),
                      }),
                      { "x-access-token": mailAccountToken }
                    );

                    this.discordClient.channels.cache
                      .get(this.rejectLogChannel)
                      .send(
                        `**${this.allianceTag}**\nRejected: ${name} (${kid}), linked accounts limit reached (${limitStatus.activeCount}/${limitStatus.maxEntry}).`
                      );
                    console.log(
                      `rejected from ${this.allianceTag} by account limit: ${name} (${kid})`
                    );
                    continue;
                  }
                }
              }

              const titles = await this.sql.getLastTitleUsers(this.guild);

              const holders = titles.map(title => title.kingdomId);
              // console.log('holders: ', holders);

              if (holders.includes(kid)) {
                const acceptResponse = await this.acceptRequest(kid, token);

                if (
                  acceptResponse.status === 200 &&
                  acceptResponse.data.result
                ) {

                  await this.sql.addAcceptLog(kid, name);
                  if (this.canDistributeMedals) {
                    await this.medalDistributor.distributeMedalsForKingdom(
                      kid.toString(),
                      this.guild,
                      token
                    );
                  } else {
                    // console.log(`${this.allianceTag}: Skipping medal distribution for ${name} (${kid}) because manager rank is ${this.managerRank ?? "unknown"}.`);
                  }

                  this.discordClient.channels.cache
                    .get(this.acceptLogChannel)
                    .send(
                      `**${this.allianceTag
                      }**\nAccepted by title: ${name} (${kid}), power: ${this.addThousandSeparator(
                        power
                      )}\n`
                    );
                  console.log(`accepted into ${this.allianceTag} by title: ${name} (${kid})`);
                  numtkn++;
                  continue;
                }
              }

              let playerKills = 0;
              try {
                playerKills = (await this.sql.getKingdomKills(kid))[0].kills;
              } catch (error) {
                console.log(`${this.allianceTag}: cannot find kills for ${kid}, updating data`);
                await this.updateInfo.updateInfo(token, kid, this.allianceId, this.allianceTag);
              }

              if (this.kills > playerKills) {
                await this.updateInfo.updateInfo(token, kid, this.allianceId, this.allianceTag);
                await this.api.request(
                  "https://api-lok-live.leagueofkingdoms.com/api/alliance/request/deny",
                  { kingdomId: kid },
                  {
                    "x-access-token": token,
                    "Content-Type": "application/json",
                  }
                );

                await this.api.request(
                  "https://api-lok-live.leagueofkingdoms.com/api/mail/send",
                  new URLSearchParams({
                    json: JSON.stringify({
                      toName: name,
                      subject: `Rejected from ${this.allianceTag}`,
                      content: `You have been rejected because you don't meet the required amount of kills. (${this.kills})
                      \n${requirementMessage}`
                    })
                  }),
                  { "x-access-token": mailAccountToken }
                );

                this.discordClient.channels.cache
                  .get(this.rejectLogChannel)
                  .send(
                    `**${this.allianceTag
                    }**\nRejected: ${name} (${kid}), power: ${this.addThousandSeparator(
                      power
                    )} not enough kills.\n`
                  );
                console.log(`rejected from ${this.allianceTag} by kills: ${name} (${kid})`);
                continue;
              }

              const powerlimit = this.power || 0;
              if (power < powerlimit) {
                await this.api.request(
                  "https://api-lok-live.leagueofkingdoms.com/api/alliance/request/deny",
                  { kingdomId: kid },
                  {
                    "x-access-token": token,
                    "Content-Type": "application/json",
                  }
                );

                const powerResponse = await this.api.request(
                  "https://api-lok-live.leagueofkingdoms.com/api/mail/send",
                  new URLSearchParams({
                    json: JSON.stringify({
                      toName: name,
                      subject: `Rejected from ${this.allianceTag}`,
                      content: `You have been rejected because your power is too low, minimum requirement is ${powerlimit / 1000000}m power
                      \n${requirementMessage}`
                    })
                  }),
                  { "x-access-token": mailAccountToken }
                );

                // console.log("powerResponse: ", powerResponse.data);

                this.discordClient.channels.cache
                  .get(this.rejectLogChannel)
                  .send(
                    `**${this.allianceTag
                    }**\nRejected: ${name} (${kid}), power: ${this.addThousandSeparator(
                      power
                    )} not enough power\n`
                  );
                console.log(`rejected from ${this.allianceTag} by power: ${name} (${kid})`);
                continue;
              }

              const speedlimit = this.speed || 0;
              if (speedlimit > 0) {
                const playerSpeed =
                  await this.speedCheck.treasureSpeedCheck(
                    token,
                    kid
                  );
                // console.log(`Speed check for ${name} (${kid}) in ${this.allianceTag}: ${playerSpeed}% (required: ${speedlimit}%)`);
                if (playerSpeed < speedlimit) {
                  await this.api.request(
                    "https://api-lok-live.leagueofkingdoms.com/api/alliance/request/deny",
                    { kingdomId: kid },
                    {
                      "x-access-token": token,
                      "Content-Type": "application/json",
                    }
                  );

                  const speedResp = await this.api.request(
                    "https://api-lok-live.leagueofkingdoms.com/api/mail/send",
                    new URLSearchParams({
                      json: JSON.stringify({
                        toName: name,
                        subject: `Rejected from ${this.allianceTag}`,
                        content: `You have been rejected because your speed is too low, minimum requirement is ${speedlimit}% speed (cav + troops)
                      \n${requirementMessage}`
                      })
                    }),
                    { "x-access-token": mailAccountToken }
                  );
                  console.log(`rejected from ${this.allianceTag} by speed: ${name} (${kid})`);

                  // console.log(speedResp.data);

                  this.discordClient.channels.cache
                    .get(this.rejectLogChannel)
                    .send(
                      `**${this.allianceTag
                      }**\nRejected: ${name} (${kid}), speed: ${playerSpeed} not enough speed\n`
                    );
                  continue;
                }
              }

              const verified = await this.sql.isKingdomVerified(kid, this.guild);
              const subscriptionFlagInfoVerified = await this.sql.checkSubscriptionValid(this.guild, "2");

              // console.log("verification:", this.verification, !verified, subscriptionFlagInfoVerified);

              if (this.verification && !verified && subscriptionFlagInfoVerified) {
                await this.api.request(
                  "https://api-lok-live.leagueofkingdoms.com/api/alliance/request/deny",
                  { kingdomId: kid },
                  {
                    "x-access-token": token,
                    "Content-Type": "application/json",
                  }
                );

                await this.api.request(
                  "https://api-lok-live.leagueofkingdoms.com/api/mail/send",
                  new URLSearchParams({
                    json: JSON.stringify({
                      toName: name,
                      subject: `Rejected from ${this.allianceTag}`,
                      content: `You have been rejected because you aren't verified on discord
                      \n${requirementMessage}`
                    })
                  }),
                  { "x-access-token": mailAccountToken }
                );

                this.discordClient.channels.cache
                  .get(this.rejectLogChannel)
                  .send(
                    `**${this.allianceTag
                    }**\nRejected: ${name} (${kid}), power: ${this.addThousandSeparator(
                      power
                    )} not verified\n`
                  );
                console.log(
                  `rejected from ${this.allianceTag} by discord verification: ${name} (${kid})`
                );
                continue;
              }

              const masteryCheck = await this.masteryCheck.checkMastery(token, kid, this.allianceId);
              if (!masteryCheck) {
                await this.api.request(
                  "https://api-lok-live.leagueofkingdoms.com/api/alliance/request/deny",
                  { kingdomId: kid },
                  {
                    "x-access-token": token,
                    "Content-Type": "application/json",
                  }
                );

                console.log(
                  `rejected from ${this.allianceTag} by mastery: ${name} (${kid})`
                );

                this.discordClient.channels.cache
                  .get(this.rejectLogChannel)
                  .send(
                    `**${this.allianceTag
                    }**\nRejected: ${name} (${kid}), power: ${this.addThousandSeparator(
                      power
                    )} incorrect mastery\n`
                  );

                // console.log(this.mastery);

                try {
                  const masteryMailResponse = await this.api.request(
                    "https://api-lok-live.leagueofkingdoms.com/api/mail/send",
                    new URLSearchParams({
                      json: JSON.stringify({
                        toName: name,
                        subject: `Rejected from ${this.allianceTag}`,
                        content: `You have been rejected because you don't have the correct mastery. The minimum mastery is:
                      \n${requirementMessage}`
                      }),
                    }),
                    { "x-access-token": mailAccountToken }
                  );

                  // console.log(masteryMailResponse.data);
                } catch (error) {
                  console.log(`${this.allianceTag}: Error sending mastery rejection mail for ${kid}:`, error);
                  console.log(error.response.data);
                }

                continue;
              }

              let kingdomLevel = 0;
              try {
                kingdomLevel = (await this.sql.getKingdomLevel(kid))[0].level;
              } catch (error) {
                console.log(`${this.allianceTag}: cannot find kingdom level for ${kid}, updating data`);
                await this.updateInfo.updateInfo(token, kid, this.allianceId, this.allianceTag);
              }
              if (this.castle > kingdomLevel) {
                await this.api.request(
                  "https://api-lok-live.leagueofkingdoms.com/api/alliance/request/deny",
                  { kingdomId: kid },
                  {
                    "x-access-token": token,
                    "Content-Type": "application/json",
                  }
                );

                console.log(`rejected from ${this.allianceTag} by castle level: ${name} (${kid})`);

                this.discordClient.channels.cache
                  .get(this.rejectLogChannel)
                  .send(
                    `**${this.allianceTag
                    }**\nRejected: ${name} (${kid}), level: ${kingdomLevel} castle level too low\n`
                  );

                try {
                  const castleMailResponse = await this.api.request(
                    "https://api-lok-live.leagueofkingdoms.com/api/mail/send",
                    new URLSearchParams({
                      json: JSON.stringify({
                        toName: name,
                        subject: `Rejected from ${this.allianceTag}`,
                        content: `You have been rejected because your castle level is too low. The minimum requirement is ${this.castle}
                      \n${requirementMessage}`
                      }),
                    }),
                    { "x-access-token": mailAccountToken }
                  );

                  // console.log(castleMailResponse.data);
                } catch (error) {
                  console.log(`${this.allianceTag}: Error sending castle rejection mail for ${kid}:`, error);
                  console.log(error.response.data);
                }

                continue;
              }

              if (!this.acceptCheck.checkAccept(kid)) {
                continue;
              }

              // console.log(`Attempting to accept ${name} (${kid}) into ${this.allianceTag}...`);
              if (numtkn < 99) {
                const acceptResponse = await this.acceptRequest(kid, token);
                // console.log('acceptResponse:', acceptResponse.data);

                if (
                  acceptResponse.status === 200 &&
                  acceptResponse.data.result
                ) {

                  await this.sql.addAcceptLog(kid, name);
                  console.log(`accepted in ${this.allianceTag}: ${name} (${kid})`);
                  numtkn++;
                  if (this.canDistributeMedals) {
                    await this.medalDistributor.distributeMedalsForKingdom(
                      kid.toString(),
                      this.guild,
                      token
                    );
                  } else {
                    // console.log(`${this.allianceTag}: Skipping medal distribution for ${name} (${kid}) because manager rank is ${this.managerRank ?? "unknown"}.`);
                  }

                  // console.log(this.discordClient.channels.cache.get(this.acceptLogChannel));

                  this.discordClient.channels.cache
                    .get(this.acceptLogChannel)
                    .send(
                      `**${this.allianceTag
                      }**\nAccepted: ${name} (${kid}), power: ${this.addThousandSeparator(
                        power
                      )}\n`
                    );
                } else {
                  console.log(`error accepting ${name} (${kid}) into ${this.allianceTag}`);
                  console.log(acceptResponse.data);

                  await this.api.request(
                    "https://api-lok-live.leagueofkingdoms.com/api/alliance/request/deny",
                    { kingdomId: kid },
                    {
                      "x-access-token": token,
                      "Content-Type": "application/json",
                    }
                  );

                  // console.log(denied.data);

                  // this.discordClient.channels.cache
                  //   .get(this.rejectLogChannel)
                  //   .send(
                  //     `**${this.allianceTag
                  //     }**\nRejected: ${name}, power: ${this.addThousandSeparator(
                  //       power
                  //     )} already in an alliance\n`
                  //   );
                  console.log(
                    `rejected from ${this.allianceTag} by already in alliance: ${name} (${kid})`
                  );
                }
              }
            }
          }
        } else {
          const allianceInfoResponse = await this.api.request(
            "https://api-lok-live.leagueofkingdoms.com/api/alliance/info/my",
            {},
            {
              "x-access-token": token,
              "Content-Type": "application/json",
            }
          );

          if (allianceInfoResponse.status === 200) {
            // console.log(allianceInfoResponse.data);
            let numtkn = allianceInfoResponse.data.alliance.numMembers;

            if (numtkn === 100 && this.kicking) {
              console.log(`${this.allianceTag}: ${allianceInfoResponse.data.alliance.numMembers}`);
              await this.kick(token, this.maxkick, this.cvcmode, this.titleGrace);
            }
          }
        }
      } catch (error) {
        console.error("Error in accept function: ", error);
      }
    } catch { }
    setTimeout(() => this.accept(), (this.interval || 60) * 1000); //mauro v2.1
  }

  addThousandSeparator(number) {
    const numberString = number.toString();
    let result = "";
    let count = 0;

    for (let i = numberString.length - 1; i >= 0; i--) {
      result = numberString[i] + result;
      count++;
      if (count % 3 === 0 && i !== 0) {
        result = "." + result;
      }
    }

    return result;
  }

  formatDateTime(data) {
    const date = new Date(data);
    const options = { day: "2-digit", month: "long", year: "numeric" };
    const hours = ("0" + date.getHours()).slice(-2);
    const minutes = ("0" + date.getMinutes()).slice(-2);
    const seconds = ("0" + date.getSeconds()).slice(-2);

    return (
      date.toLocaleDateString("en-US", options) +
      ` ${hours}:${minutes}:${seconds}`
    );
  }
}

AllianceManager.sharedDiscordClient = null;
AllianceManager.sharedDiscordReady = Promise.resolve();

module.exports = AllianceManager;
