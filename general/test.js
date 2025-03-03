const sqlFunctions = require('../database/sql.js');
const sql = new sqlFunctions();

async function runTest() {
    console.log(await sql.getRoles());
}

runTest();