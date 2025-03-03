const Api = require("./api.js");

class AllianceInfo {

    constructor(sqlInstance) {
        this.sql = sqlInstance;
        this.api = new Api();
    }

    async getAllianceInfo() {
        
    }
}
