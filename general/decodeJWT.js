const jwt = require('jsonwebtoken');

class DecodeJWT {

  async decodeToken(token) {
    const decoded = jwt.decode(token);
    return decoded;
  }
}

module.exports = DecodeJWT;

//Example usage

async function runExample() {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2MWUwM2RkYzM2YmY1NTIzMGJlYzQ0MjMiLCJraW5nZG9tSWQiOiI2MWUwM2RkYzM2YmY1NTIzMGJlYzQ0MjQiLCJ3b3JsZElkIjoxMSwidmVyc2lvbiI6MTc3NSwiYXV0aFR5cGUiOiJnb29nbGUiLCJwbGF0Zm9ybSI6IndlYiIsInRpbWUiOjE3Mjg4MTM1MzM3OTIsImNsaWVudFhvciI6IjAiLCJpcCI6Ijk0LjIyNS42Ny4zIiwiaWF0IjoxNzI4ODEzNTMzLCJleHAiOjE3Mjk0MTgzMzMsImlzcyI6Im5vZGdhbWVzLmNvbSIsInN1YiI6InVzZXJJbmZvIn0.V6CHjB7pIaP9j0MRTT6scgWNq1-u__g4xjNRZlytpS8';
    const jwt = new DecodeJWT();
    const decodedToken = jwt.decodeToken(token);
    console.log(decodedToken);
}

// runExample().then(() => process.exit(0)).catch(() => process.exit(1));
