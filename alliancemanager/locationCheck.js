require('dotenv').config();

class LocationCheck {

    constructor(sql, api) {
        this.sql = sql;
        this.api = api;
    };

    async getLocation(kingdomId, managerToken) {
        const locationResponse = await this.api.request(
            "https://api-lok-live.leagueofkingdoms.com/api/alliance/member/fo",
            {"targetId": kingdomId},
            {
                "x-access-token": managerToken,
                "Content-Type": "application/json",
            }
        );

        // console.log(locationResponse);

        if (locationResponse.status === 200 && locationResponse.data && locationResponse.data.fo && locationResponse.data.fo.loc) {
            return locationResponse.data.fo.loc[0];
        } else {
            console.log("Error getting location: ", locationResponse.err);
        }
        return null;
    }

    async checkLocation(kingdomId, managerToken) {

        // console.log("Checking location for kingdom: ", kingdomId);
        const location = await this.getLocation(kingdomId, managerToken);
        
        // console.log("continent: ", location);

        if (location && location > 99999) {
            // console.log("Location is valid: ", location);
            return true;
        } else {
            console.log("User is not in CvC: ", location);
            return false;
        }
    }
}

module.exports = LocationCheck;

//example
async function runExample() {
    const connection = mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

    connection.connect(function (err) {
        if (err) throw err;
        console.log("Connected!1");
    }
    );

    console.log("Running example");

    const locationCheck = new LocationCheck(connection);
    // console.log("got class");
    console.log(await locationCheck.checkLocation("61e8e329e3713210902f0d53", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2MWUwM2RkYzM2YmY1NTIzMGJlYzQ0MjMiLCJraW5nZG9tSWQiOiI2MWUwM2RkYzM2YmY1NTIzMGJlYzQ0MjQiLCJ3b3JsZElkIjoxMSwidmVyc2lvbiI6MTc3NSwiYXV0aFR5cGUiOiJnb29nbGUiLCJwbGF0Zm9ybSI6IndlYiIsInRpbWUiOjE3Mjc3MzE4NDU2OTQsImNsaWVudFhvciI6IjAiLCJpcCI6Ijk0LjIyNS42Ny4zIiwiaWF0IjoxNzI3NzMxODQ1LCJleHAiOjE3MjgzMzY2NDUsImlzcyI6Im5vZGdhbWVzLmNvbSIsInN1YiI6InVzZXJJbmZvIn0.ORTUhBZGo9zgtnZIePoIFp1hkqvIxngSTGEmqCjWO7I"));

    connection.end();
}

// runExample().then(() => process.exit(0)).catch(() => process.exit(1));
