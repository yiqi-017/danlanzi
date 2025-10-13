const path = require('path');

// 项目根目录外的 dlz-database 目录
const dataPath = path.normalize(
  path.resolve(process.cwd(), '..', 'dlz-database')
);

module.exports = { dataPath };


