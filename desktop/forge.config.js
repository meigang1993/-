const path = require('node:path');

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'succubus-kill',
    name: 'SuccubusKill',
    extraResource: [path.resolve(__dirname, '../publish')],
    ignore: [
      /^\/out(?:\/|$)/,
      /^\/tests(?:\/|$)/,
      /^\/scripts(?:\/|$)/,
      /^\/README\.md$/,
    ],
  },
  makers: [],
};
