const axios = require("axios");
const { Client, Events, GatewayIntentBits } = require("discord.js");
const SpeedCheck = require("./speedcheck.js");
const Api = require("../general/api.js");
const MasteryCheck = require("./masterycheck.js");
const ShrineCheck = require("./shrineCheck.js");
const UpdateInfo = require("./updateinfo.js");
const HelpCheck = require("./helpCheck.js");
const AcceptCheck = require("./acceptCheck.js");
const R4Check = require("./r4check.js");
// const LocationCheck = require("./locationCheck.js");

class AllianceManager {
  constructor(options, sql, runningAlliances, acceptRequestLock) {

    // Credentials
    this.token = options.token;
    this.runningAlliances = runningAlliances;
    this.acceptRequestLock = acceptRequestLock;
    this.discordClient = new Client({
      intents: [GatewayIntentBits.Guilds],
    });
    this.discordToken = "MTI5ODk2ODI5MzI2NDMzMDgxMg.GDcLFk.aJTF1L1xQnV5unkUx2jYddUdmNLwmjjKHsebCE";
    this.discordClient.login(this.discordToken);
    this.discordClient.once(Events.ClientReady, () => {
      console.log("Discord client ready");
      this.accept();
    });

    // Initialize classes
    this.sql = sql; // zkM38hcy4ANj

    this.api = new Api(this.sql);

    this.helpCheck = new HelpCheck(this.sql);
    this.acceptCheck = new AcceptCheck(this.sql);

    this.shrineCheck = new ShrineCheck(this.api);

    this.updateInfo = new UpdateInfo(this.sql, this.api);
    this.masteryCheck = new MasteryCheck(this.sql, this.api);
    this.speedCheck = new SpeedCheck(this.sql, this.api);
    this.r4Check = new R4Check(this.sql, this.api);
    // this.locationCheck = new LocationCheck(this.sql, this.api);

    // Initialize alliance settings
    this.managerId = options.settings.managerId;
    this.allianceId = options.settings.allianceId;
    this.allianceTag = options.settings.allianceTag;
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
    this.guild = null;
    this.acceptLogChannel = "945404350229000252";
    this.rejectLogChannel = "945404350229000252";
    // setInterval(() => this.accept(), (this.interval || 60) * 1000); //mauro v2.1
  }

  async acceptRequest(kid, token) {
    console.log("accepting start");
    return this.acceptRequestLock.acquire('acceptRequest', async () => {
      const acceptResponse = await this.api.request(
        "https://api-lok-live.leagueofkingdoms.com/api/alliance/request/accept",
        { kingdomId: kid },
        {
          "x-access-token": token,
          "Content-Type": "application/json",
        }
      );
      console.log("accepting end");
      return acceptResponse;
    });
  }

  async kick(token, maxkick, cvcmode, titleGrace) {
    console.log("kick function");
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
          console.log(helping);

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

            console.log(await this.helpCheck.checkHelp(kingdomid, titleGrace));

            if (await this.helpCheck.checkHelp(kingdomid, titleGrace)) {
              this.discordClient.channels.cache
                .get(this.acceptLogChannel)
                .send(
                  `**${this.allianceTag}**\nTried to kick: ${kingdomname}, last online: ${members[counter].lastLogined} but has requested title in the last ${this.titleGrace} minutes`
                );
              maxkick++;
              continue;
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
                  `**${this.allianceTag}**\nKicked: ${kingdomname}, last online: ${members[counter].lastLogined}`
                );
              console.log(`kicked ${kingdomname} from ${this.allianceTag}`);
            }
            counter += 1;

            if (counter >= members.length) {
              break;
            }
          }

          if (x < maxkick && cvcmode) {

            let teller = 0;
            console.log("online members: ", onlineMembers);
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
                    `**${this.allianceTag}**\nTried to kick: ${kingdomname}, last online: ${onlineMembers[teller].lastLogined} but has requested title in the last ${this.titleGrace} minutes`
                  );
                maxkick++;
                continue;
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
                    `**${this.allianceTag}**\nKicked: ${kingdomname}, last online: ${onlineMembers[teller].lastLogined}`
                  );
                console.log(`kicked ${kingdomname} from ${this.allianceTag}`);
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
      console.log("manager: ", this.allianceTag);

      const tokenResponse = (await this.sql.getManagerToken(this.allianceId));
      const roleFlag = await this.sql.checkManagerRole(this.managerId);
      console.log("role: ", roleFlag);
      // console.log("token: ", tokenResponse);
      if (!roleFlag || tokenResponse === undefined || tokenResponse.length === 0 || !(await this.r4Check.checkR4(tokenResponse[0].token, this.managerId, this.allianceId))) {
        console.error(`Manager token not found or not R4. Closing AllianceManager instance for ${this.allianceTag}.`);
        this.runningAlliances.delete(this.allianceId);
        await this.sql.setManagerIdle(this.managerId);
        return;
      }

      const token = tokenResponse[0].token;
      // console.log("token: ", token);

      const allianceSettings = (await this.sql.getAllianceSettings(this.allianceId))[0];
      //console.log("alliance settings: ", allianceSettings);
      // console.log("alliance id: ", this.allianceId);
      const logChannels = (await this.sql.getGuildLogChannelsByAlliance(this.allianceId))[0];
      // console.log("logchannels: ", logChannels);
      // console.log(settingsQueryResponse)
      // console.log("log channels: ", logChannels);

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

      const mailAccountToken = await this.sql.getRandomManagerTokenFromGuild(this.guild);
      // console.log("mail token: ", mailAccountToken);

      // console.log("token: ", token);

      // // Check whether the alliance has the research shrine A3
      // const researchAlliance = await this.shrineCheck.checkResearch(token);

      // if (researchAlliance === true) {
      //   new Helper(token);
      // }

      if (!this.accepting) {
        setTimeout(
          () => this.accept(),
          (this.interval || 60) * 1000
        ); //mauro v2.1
        return;
      }

      console.log("accept function", this.allianceTag);
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
            console.log(allianceInfoResponse.data.alliance.numMembers);
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

              const blacklisted = await this.sql.isKingdomBlacklisted(kid);

              if (blacklisted) {
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
                    }**\nRejected: ${name}, power: ${this.addThousandSeparator(
                      power
                    )} blacklisted\nmore info coming soon`
                  );
                console.log(`rejected by blacklist: ${name}`);
                continue;
              }

              let acceptFlag = false;
              if (!this.acceptCheck.checkAccept(kid)) { // If already accepted in the past 5 seconds, don't accept again.
                console.log("already accepted");
                acceptFlag = true;
                continue;
              }

              if (acceptFlag) {
                console.log("already accepted but still continuing... fix code");
              }

              const titles = await this.sql.getLastTitleUsers();

              const holders = titles.map(title => title.kingdomId);
              // console.log('holders: ', holders);

              if (holders.includes(kid)) {
                const acceptResponse = await this.acceptRequest(kid, token);

                if (
                  acceptResponse.status === 200 &&
                  acceptResponse.data.result
                ) {

                  await this.sql.addAcceptLog(kid, name);

                  this.discordClient.channels.cache
                    .get(this.acceptLogChannel)
                    .send(
                      `**${this.allianceTag
                      }**\nAccepted by title: ${name}, power: ${this.addThousandSeparator(
                        power
                      )}\nmore info coming soon`
                    );
                  console.log(`accepted by title: ${name}`);
                  numtkn++;
                  continue;
                }
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

                await this.api.request(
                  "https://api-lok-live.leagueofkingdoms.com/api/mail/send",
                  new URLSearchParams({
                    json: JSON.stringify({
                      toName: name,
                      subject: `Rejected from ${this.allianceTag}`,
                      content: `You have been rejected because your power is too low, minimum requirement is ${powerlimit / 1000000}m power`
                    })
                  }),
                  { "x-access-token": mailAccountToken }
                );

                this.discordClient.channels.cache
                  .get(this.rejectLogChannel)
                  .send(
                    `**${this.allianceTag
                    }**\nRejected: ${name}, power: ${this.addThousandSeparator(
                      power
                    )} not enough power\nmore info coming soon`
                  );
                console.log(`rejected by power: ${name}`);
                continue;
              }

              const speedlimit = this.speed || 0;
              if (speedlimit > 0) {
                const playerSpeed =
                  await this.speedCheck.treasureSpeedCheck(
                    token,
                    kid
                  );

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
                        content: `You have been rejected because your speed is too low, minimum requirement is ${speedlimit}% speed (cav + troops)`
                      })
                    }),
                    { "x-access-token": mailAccountToken }
                  );
                  console.log(`rejected by speed: ${name}`);

                  console.log(speedResp.data);

                  this.discordClient.channels.cache
                    .get(this.rejectLogChannel)
                    .send(
                      `**${this.allianceTag
                      }**\nRejected: ${name}, speed: ${playerSpeed} not enough speed\nmore info coming soon`
                    );
                  continue;
                }
              }

              const verified = await this.sql.isKingdomVerified(kid);

              if (this.verification && !verified) {
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
                      content: "You have been rejected because you aren't verified on discord"
                    })
                  }),
                  { "x-access-token": mailAccountToken }
                );

                this.discordClient.channels.cache
                  .get(this.rejectLogChannel)
                  .send(
                    `**${this.allianceTag
                    }**\nRejected: ${name}, power: ${this.addThousandSeparator(
                      power
                    )} not verified\nmore info coming soon`
                  );
                console.log(
                  `rejected by discord verification: ${name}`
                );
                continue;
              }

              let playerKills = 0;

              try {
                playerKills = (await this.sql.getKingdomKills(kid))[0].kills;
              } catch (error) {
                console.log("cannot find kills, updating data");
                await this.updateInfo.updateInfo(token, kid);
              }

              if (this.kills > playerKills) {
                await this.updateInfo.updateInfo(token, kid);
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
                      content: `You have been rejected because you don't meet the required amount of kills. (${this.kills})`
                    })
                  }),
                  { "x-access-token": mailAccountToken }
                );

                this.discordClient.channels.cache
                  .get(this.rejectLogChannel)
                  .send(
                    `**${this.allianceTag
                    }**\nRejected: ${name}, power: ${this.addThousandSeparator(
                      power
                    )} not enough kills.\nmore info coming soon`
                  );
                console.log(`rejected by kills: ${name}`);
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
                  `rejected by mastery: ${name}`
                );

                this.discordClient.channels.cache
                  .get(this.rejectLogChannel)
                  .send(
                    `**${this.allianceTag
                    }**\nRejected: ${name}, power: ${this.addThousandSeparator(
                      power
                    )} incorrect mastery\nmore info coming soon`
                  );

                console.log(this.mastery);

                try {
                  const masteryMailResponse = await this.api.request(
                    "https://api-lok-live.leagueofkingdoms.com/api/mail/send",
                    new URLSearchParams({
                      json: JSON.stringify({
                        toName: name,
                        subject: `Rejected from ${this.allianceTag}`,
                        content: `${Math.floor(Date.now())} \n You have been rejected because you don't have the correct mastery. The minimum mastery is:
                            \n- Infantry: ${this.mastery.infantry}
                            \n- Ranged: ${this.mastery.ranged}
                            \n- Cavalry: ${this.mastery.cavalry}
                            \n- Combat: ${this.mastery.combat}
                            \n- Monster: ${this.mastery.monster}
                            \n- Governor: ${this.mastery.governor}`
                      }),
                    }),
                    { "x-access-token": mailAccountToken }
                  );

                  // console.log(masteryMailResponse.data);
                } catch (error) {
                  console.log("Error sending mastery rejection mail:", error);
                  console.log(error.response.data);
                }

                continue;
              }

              if (!this.acceptCheck.checkAccept(kid)) {
                continue;
              }

              if (numtkn < 99) {
                const acceptResponse = await this.acceptRequest(kid, token);

                if (
                  acceptResponse.status === 200 &&
                  acceptResponse.data.result
                ) {

                  await this.sql.addAcceptLog(kid, name);

                  this.discordClient.channels.cache
                    .get(this.acceptLogChannel)
                    .send(
                      `**${this.allianceTag
                      }**\nAccepted: ${name}, power: ${this.addThousandSeparator(
                        power
                      )}\nmore info coming soon`
                    );
                  console.log(`accepted: ${name}`);
                  numtkn++;
                } else {
                  console.log("error accepting");
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

                  this.discordClient.channels.cache
                    .get(this.rejectLogChannel)
                    .send(
                      `**${this.allianceTag
                      }**\nRejected: ${name}, power: ${this.addThousandSeparator(
                        power
                      )} already in an alliance\nmore info coming soon`
                    );
                  console.log(
                    `rejected by already in alliance: ${name}`
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
              console.log(allianceInfoResponse.data.alliance.numMembers);
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

module.exports = AllianceManager;
