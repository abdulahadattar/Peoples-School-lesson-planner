const { google } = require('googleapis');
// just a quick script to test batchUpdate payload
console.log(JSON.stringify({
  requests: [
    {
      repeatCell: {
        range: {
          sheetId: 0,
          startRowIndex: 1,
          startColumnIndex: 3, // D
          endColumnIndex: 10 // K
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: "NUMBER",
              pattern: "0"
            }
          }
        },
        fields: "userEnteredFormat.numberFormat"
      }
    }
  ]
}));
