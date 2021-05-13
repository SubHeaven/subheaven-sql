const project = require('./index');
const argParse = require('subheaven-arg');
require('dotenv').config();

argParse.init("subheaven-sql", "Cumprimenta alguém");
argParse.boolean("show-config", "Mostra a configuração atual de banco de dados");
(async() => {
    if (argParse.validate()) {
        if (params.show_config) {
            if (await project.checkConfig()) {
                console.log('Environment params found:');
                console.log(`SUB_SQL_DIALECT=${process.env.SUB_SQL_DIALECT}`);
                console.log(`SUB_SQL_STORAGE=${process.env.SUB_SQL_STORAGE}`);
                console.log(`SUB_SQL_SCHEMAS=${process.env.SUB_SQL_SCHEMAS}`);
            }
        }
    }
})();