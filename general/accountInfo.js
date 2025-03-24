const DecodeJWT = require("../general/decodeJWT.js");
const Encryption = require("../encryption/encryption.js");

class AccountInfo {

  constructor(sqlInstance, api) {
    this.sql = sqlInstance;
    this.api = api;
    this.jwt = new DecodeJWT();
    this.encryption = new Encryption();
  }

  async getAccountId(token) {
    const decodedToken = await this.jwt.decodeToken(token);
    return decodedToken.kingdomId;
  }

  async login(email, password) {
    let loginResponse;
    try {
      console.log(email, password);
      loginResponse = await this.api.request(
        "https://lok-api-live.leagueofkingdoms.com/api/auth/login",
        new URLSearchParams({
          json: JSON.stringify({
            authType: "email",
            email: email,
            password: password,
            deviceInfo: {
              OS: "Windows 10",
              country: "USA",
              language: "English",
              bundle: "",
              version: "1.1789.164.245", //1.1758.157.241
              platform: "web",
              pushId: "",
              build: "global",
            },
          }),
        })
      );
    } catch (err) {
      console.log("response: ", loginResponse);
      console.log("Couldn't log in: ", err.response.data);
      return false;
    }

    if (loginResponse.status === 200) {
      const xorPass = (await this.encryption.decryptBase64(loginResponse.data.regionHash)).split('-')[1];
      return {token: loginResponse.data.token, xorPass: xorPass};
    } else {
      return false;
    }
  }

  async getProfile(token) {
    let profileResponse;
    const xorPass = (await this.sql.getXORPass())[0].value;
    const encodedString = await this.encryption.createXorMessage(JSON.stringify({}), xorPass);

    try {
      profileResponse = await this.api.request(
        "https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/my",
        { json: encodedString },
        {
          "x-access-token": token,
          "Content-Type": "application/json",
        }
      );
      const decryptedResponse = await this.encryption.decryptXorMessage(profileResponse.data, xorPass);
      profileResponse = JSON.parse(decryptedResponse);
    } catch (err) {
      if (profileResponse && profileResponse.data) {
        console.log("response: ", await this.encryption.decryptXorMessage(profileResponse.data, xorPass));
      } else {
        console.log("response: ", profileResponse);
      }
      return false;
    }

    if (profileResponse.result) {
      return profileResponse.profile;
    } else {
      return false;
    }
  }

  async collectInfo(email, password) {
    console.log(email, password);
    const token = (await this.login(email, password)).token;
    if (!token) return false;

    const profile = await this.getProfile(token);
    console.log(profile);
    if (!profile) return false;

    const accountInfo = {
      name: profile.name,
      email: email,
      password: password,
      token: token,
      kingdomId: await this.getAccountId(token),
      allianceid: (profile.alliance && profile.alliance._id) || "",
      alliancetag: (profile.alliance && profile.alliance.tag) || "",
    };

    return accountInfo;
  }

  async getProfileInfo(token) {
    let profileResponse;
    try {

      const xorPass = (await this.sql.getXORPass())[0].value;
      const encodedString = await this.encryption.createXorMessage(JSON.stringify({}), xorPass);

      profileResponse = await this.api.request(
        "https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/my",
        { json: encodedString },
        {
          "x-access-token": token,
          "Content-Type": "application/json",
        }
      );
      const decryptedResponse = await this.encryption.decryptXorMessage(profileResponse.data, xorPass);
      profileResponse = JSON.parse(decryptedResponse);
    } catch (err) {
      if (profileResponse && profileResponse.data) {
        console.log("response: ", await this.encryption.decryptXorMessage(profileResponse.data, xorPass));
      } else {
        console.log("response: ", profileResponse);
      }
      return false;
    }

    if (profileResponse.result) {
      const accountInfo = {
        name: profileResponse.profile.name,
        allianceid: (profileResponse.profile.alliance && profileResponse.profile.alliance._id) || "",
        alliancetag: (profileResponse.profile.alliance && profileResponse.profile.alliance.tag) || "",
      };
      return accountInfo;
    } else {
      return false;
    };
  }

  async updateSingleBotToken(kingdomId) {
    const account = await this.sql.getAccountLogin(kingdomId);
    const token = await this.login(account.email, account.password);
    if (token) {
      await this.sql.updateBotToken(token, kingdomId);
    }
  }

  // Get a player's location if in the manager's alliance
  async getMemberLocation(token, kingdomId) {

    let locationResponse;
    try {
      locationResponse = await this.api.request(
        'https://api-lok-live.leagueofkingdoms.com/api/alliance/member/fo',
        { targetId: kingdomId },
        {
          'x-access-token': token,
          'Content-Type': 'application/json',
        }
      );

      if (!locationResponse.data.fo) {
        return false;
      }

      const location = [
        locationResponse.data.fo.loc[0],
        locationResponse.data.fo.loc[1],
        locationResponse.data.fo.loc[2]
      ];

      return location;
    } catch (error) {
      console.log(locationResponse.data);
      console.error('Error fetching member location:', error);
      return false;
    }
  }

  // Get all the information about a player in the manager's alliance
  async getMemberProfileInfo(token, allianceId, kingdomId, r4Flag) {
    const xorPass = (await this.sql.getXORPass())[0].value;

    const b64EncryptedKingdomId = await this.encryption.createXorMessage(`{"kingdomId": "${kingdomId}"}`, xorPass);

    let basicPlayerInfoResponse;
    let historyPlayerInfoResponse;

    try {
      basicPlayerInfoResponse = await this.api.request(
        'https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/other',
        { json: b64EncryptedKingdomId },
        {
          'x-access-token': token,
          'Content-Type': 'application/json',
        }
      );
    } catch (error) {
      console.log('Error getting player info: ', error);
      console.log('Error response: ', await this.encryption.decryptXorMessage(error.response.data, xorPass));
      return;
    }

    try {
      historyPlayerInfoResponse = await this.api.request(
        'https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/other/history',
        { kingdomId: kingdomId },
        {
          'x-access-token': token,
          'Content-Type': 'application/json',
        }
      );
    } catch (error) {
      console.log('Error getting player info: ', error);
      console.log('Error response: ', await this.encryption.decryptXorMessage(error.response.data, xorPass));
      return;
    }

    let location = false;
    // console.log('R4 Flag: ', r4Flag);
    if (r4Flag) {
      // console.log('Is R4: can get locations');
      location = await this.getMemberLocation(token, kingdomId);
    }

    const guild = await this.sql.getAllianceGuild(allianceId);

    // console.log(await this.encryption.decryptXorMessage(basicPlayerInfoResponse.data, xorPass));

    const basicPlayerInfo = await (JSON.parse(await this.encryption.decryptXorMessage(basicPlayerInfoResponse.data, xorPass))).profile;
    const historyPlayerInfo = historyPlayerInfoResponse.data.history;

    // console.log(`Basic Player Info of kingdomId ${kingdomId}: `, basicPlayerInfo);
    // console.log('History Player Info: ', historyPlayerInfo);
    
    // Combine the required fields into a single object
    let values;
    let playerInfo;
    if (location) {

      playerInfo = {
        allianceId: basicPlayerInfo.alliance._id,
        allianceTag: basicPlayerInfo.alliance.tag,
        kingdomId: kingdomId,
        name: basicPlayerInfo.name,
        level: basicPlayerInfo.level,
        lord: basicPlayerInfo.lord.level,
        power: basicPlayerInfo.power,
        kills: basicPlayerInfo.kill,
        death: historyPlayerInfo.stats.battle.death,
        victory: historyPlayerInfo.stats.battle.victory,
        defeat: historyPlayerInfo.stats.battle.defeated,
        gathering: historyPlayerInfo.stats.economy.gathering,
        cont: location[0],
        x: location[1],
        y: location[2],
        guild: guild
      };
  
      values = [
        playerInfo.allianceId,
        playerInfo.allianceTag,
        playerInfo.kingdomId,
        playerInfo.name,
        playerInfo.level,
        playerInfo.lord,
        playerInfo.power,
        playerInfo.kills,
        playerInfo.death,
        playerInfo.victory,
        playerInfo.defeat,
        playerInfo.gathering,
        playerInfo.cont,
        playerInfo.x,
        playerInfo.y,
        guild
      ];

    } else {
      
      playerInfo = {
        allianceId: basicPlayerInfo.alliance._id,
        allianceTag: basicPlayerInfo.alliance.tag,
        kingdomId: kingdomId,
        name: basicPlayerInfo.name,
        level: basicPlayerInfo.level,
        lord: basicPlayerInfo.lord.level,
        power: basicPlayerInfo.power,
        kills: basicPlayerInfo.kill,
        death: historyPlayerInfo.stats.battle.death,
        victory: historyPlayerInfo.stats.battle.victory,
        defeat: historyPlayerInfo.stats.battle.defeated,
        gathering: historyPlayerInfo.stats.economy.gathering,
        cont: location[0],
        x: location[1],
        y: location[2],
        guild: guild
      };
  
      values = [
        playerInfo.allianceId,
        playerInfo.allianceTag,
        playerInfo.kingdomId,
        playerInfo.name,
        playerInfo.level,
        playerInfo.lord,
        playerInfo.power,
        playerInfo.kills,
        playerInfo.death,
        playerInfo.victory,
        playerInfo.defeat,
        playerInfo.gathering,
        playerInfo.cont,
        playerInfo.x,
        playerInfo.y,
        guild
      ];
    }

    return values;
  }

}

module.exports = AccountInfo;