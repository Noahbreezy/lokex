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

    if (loginResponse.status === 200 && loginResponse.data?.token) {
      const regionHash = loginResponse.data?.regionHash;

      // regionHash may be an empty string; treat that as "no encryption".
      if (typeof regionHash === 'string' && regionHash.length > 0) {
        console.log(regionHash);
        const xorPass = (await this.encryption.decryptBase64(regionHash)).split('-')[1];
        // Keep DB in sync: regionHash present => XOR required.
        try { await this.sql.updateXORPass(xorPass || ''); } catch (_) {}
        return { token: loginResponse.data.token, xorPass: xorPass, encryptionRequired: true };
      }

      // No regionHash => no XOR pass is produced and subsequent requests are plain JSON.
      // Clear DB value to prevent using a stale XOR pass for outgoing requests.
      try { await this.sql.updateXORPass(''); } catch (_) {}
      return { token: loginResponse.data.token, xorPass: null, encryptionRequired: false };
    }

    return false;
  }

  async getProfile(token) {
    let profileResponse;
    const xorPass = (await this.sql.getXORPass())?.[0]?.value || null;
    const body = await this.encryption.buildRequestBody({}, xorPass);

    try {
      profileResponse = await this.api.request(
        "https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/my",
        body,
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
    const token = (await this.login(email, password))?.token;
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

      const xorPass = (await this.sql.getXORPass())?.[0]?.value || null;
      const body = await this.encryption.buildRequestBody({}, xorPass);

      profileResponse = await this.api.request(
        "https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/my",
        body,
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
    const account = (await this.sql.getAccountLogin(kingdomId))[0];
    const { token, xorPass } = (await this.login(account.email, account.password)) || {};
    if (token) {
      await this.sql.updateBotToken(token, kingdomId);
      // XOR state is persisted inside login().
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
    const xorPass = (await this.sql.getXORPass())?.[0]?.value || null;

    const body = await this.encryption.buildRequestBody({ kingdomId: String(kingdomId) }, xorPass);

    let basicPlayerInfoResponse;
    let historyPlayerInfoResponse;

    try {
      basicPlayerInfoResponse = await this.api.request(
        'https://api-lok-live.leagueofkingdoms.com/api/kingdom/profile/other',
        body,
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
    const canAccessLocations = r4Flag === true || (r4Flag && typeof r4Flag === 'object' && r4Flag.hasRank);
    if (canAccessLocations) {
      // console.log('Is R4: can get locations');
      location = await this.getMemberLocation(token, kingdomId);
    }

    const guild = await this.sql.getAllianceGuild(allianceId);

    // console.log(await this.encryption.decryptXorMessage(basicPlayerInfoResponse.data, xorPass));

    const basicPlayerInfo = await (JSON.parse(await this.encryption.decryptXorMessage(basicPlayerInfoResponse.data, xorPass))).profile;
    const historyPlayerInfo = historyPlayerInfoResponse.data.history;

    const safeNumber = (value, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };

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
        level: safeNumber(basicPlayerInfo.level),
        lord: safeNumber(basicPlayerInfo.lord && basicPlayerInfo.lord.level),
        power: safeNumber(basicPlayerInfo.power),
        kills: safeNumber(basicPlayerInfo.kill),
        death: safeNumber(historyPlayerInfo?.stats?.battle?.death),
        victory: safeNumber(historyPlayerInfo?.stats?.battle?.victory),
        defeat: safeNumber(historyPlayerInfo?.stats?.battle?.defeated),
        gathering: safeNumber(historyPlayerInfo?.stats?.economy?.gathering),
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
        level: safeNumber(basicPlayerInfo.level),
        lord: safeNumber(basicPlayerInfo.lord && basicPlayerInfo.lord.level),
        power: safeNumber(basicPlayerInfo.power),
        kills: safeNumber(basicPlayerInfo.kill),
        death: safeNumber(historyPlayerInfo?.stats?.battle?.death),
        victory: safeNumber(historyPlayerInfo?.stats?.battle?.victory),
        defeat: safeNumber(historyPlayerInfo?.stats?.battle?.defeated),
        gathering: safeNumber(historyPlayerInfo?.stats?.economy?.gathering),
        cont: null,
        x: null,
        y: null,
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