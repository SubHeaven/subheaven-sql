const fs = require('fs');
const log = require('debug')('subheaven:sql');
const { Sequelize, DataTypes, Op } = require('sequelize');
const json5 = require('json5');
const tools = require('subheaven-tools');

exports.update_database = async() => {
    await this.sequelize.sync({ alter: true });
}

const checkIfEnvIsConfigured = async() => {
    let params_needed = [
        'SUB_SQL_DIALECT',
        'SUB_SQL_STORAGE',
        'SUB_SQL_SCHEMAS'
    ];
    let params_loaded = Object.keys(process.env);
    return params_needed.every(elem => params_loaded.includes(elem));
}

exports.checkConfig = async() => {
    if (await checkIfEnvIsConfigured()) {
        return true
    } else {
        console.log("");
        console.log('Environment params not found! Please, edit or create a .env file in your project folder with the following params:');
        console.log('    SUB_SQL_DIALECT: A sequelize dialect option ');
        console.log('    SUB_SQL_STORAGE: the path of database or the option :memory: for a in memory database. ');
        console.log('    SUB_SQL_SCHEMAS: the path of the schemas folder. ');
        console.log("");
        console.log('Example:');
        console.log('SUB_SQL_DIALECT=sqlite');
        console.log('SUB_SQL_STORAGE=:memory:');
        console.log('SUB_SQL_SCHEMAS=./schemas');
        process.exit(1);
    }
}

exports.loadSchemas = async() => {
    log("Carregando schemas");
    if (await this.checkConfig()) {
        log("Config carregado");
        this.schemas = {};
        let type_map = {
            string: DataTypes.STRING,
            integer: DataTypes.INTEGER,
            time: DataTypes.TIME,
            date: DataTypes.DATEONLY,
            datetime: DataTypes.DATE,
            float: DataTypes.FLOAT
        }
        let filenames = fs.readdirSync(process.env.SUB_SQL_SCHEMAS, { withFileTypes: true });
        await filenames.forEachAsync(async(filename, index) => {
            if (filename.isFile() && ['json', 'json5'].indexOf(filename.name.split('.').pop().toLowerCase()) > -1) {
                log(`    - ${filename.name}`);
                let schema = json5.parse(fs.readFileSync(`${process.env.SUB_SQL_SCHEMAS}/${filename.name}`, 'utf8'));
                await Object.keys(schema).forEachAsync(key => {
                    if (typeof schema[key] === 'object') {
                        schema[key]['type'] = type_map[schema[key]['type']]
                    } else {
                        schema[key] = type_map[schema[key]]
                    }
                });
                let table_name = filename.name.split('.');
                table_name.pop();
                table_name = table_name.join('.');
                this.schemas[table_name] = schema;
                let debug = this.sequelize.define(table_name, schema);
            }
        });
        await exports.update_database();
    }
};

exports.init = async() => {
    try {
        if (!this.sequelize) {
            this.sequelize = new Sequelize({
                dialect: process.env.SUB_SQL_DIALECT,
                storage: process.env.SUB_SQL_STORAGE,
                logging: false
            });

            try {
                await this.sequelize.authenticate();
            } catch (e) {
                throw e
            }

            await this.loadSchemas();
            // this.update_database();
        }
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

exports.query_map = {
    '$eq': Op.eq,
    '$neq': Op.eq,
    '$gt': Op.eq,
    '$gte': Op.eq,
    '$lt': Op.eq,
    '$lte': Op.eq,
}

exports.convertToSequelizeQuery = async query => {
    let new_query = {};
    await Object.keys(query).forEachAsync(async key => {
        let new_value = typeof query[key] === 'object' ? await this.convertToSequelizeQuery(query[key]) : query[key];
        let new_key = this.query_map[key] ? this.query_map[key] : key;
        new_query = {...new_query, [new_key]: new_value };
        // new_query = {...new_query, [this.query_map[key] ? this.query_map[key] : key]: value };
    });
    return new_query;
};

exports.find = async(name, query, mantainSequelize = false) => {
    log("Fazendo uma consulta. Filtro:")
    log(`    ${json5.stringify(query)}`);
    if (await this.init()) {
        if (typeof query === 'undefined' || query == {}) {
            let dataset = await this.sequelize.models[name].findAll();
            let result = [];
            await dataset.forEachAsync(async item => {
                mantainSequelize ? result.push(item) : result.push(item.dataValues);
            });
            log(`Consulta realizada com sucesso! ${result.length} dados retornados.`);
            return result;
        } else {
            let q = await this.convertToSequelizeQuery(query);
            let dataset = await this.sequelize.models[name].findAll({ where: q });
            let result = [];
            await dataset.forEachAsync(async item => {
                mantainSequelize ? result.push(item) : result.push(item.dataValues);
            });
            log(`Consulta realizada com sucesso! ${result.length} dados retornados.`);
            return result;
        }
    }
}

exports.findOne = async(name, query, mantainSequelize = false) => {
    log("Fazendo uma consulta. Filtro:")
    log(`    ${json5.stringify(query)}`);
    if (await this.init()) {
        if (typeof query === 'undefined' || query == {}) {
            let dataset = await this.sequelize.models[name].findAll();
            let result = [];
            await dataset.forEachAsync(async item => {
                mantainSequelize ? result.push(item) : result.push(item.dataValues);
            });
            if (result.length > 0) {
                log(`Consulta realizada com sucesso! Informação encontrada.`);
                return result[0];
            } else {
                log(`Consulta realizada com sucesso! Nenhuma informação encontrada.`);
                return null;
            }
        } else {
            let q = await this.convertToSequelizeQuery(query);
            let dataset = await this.sequelize.models[name].findAll({ where: q });
            let result = [];
            await dataset.forEachAsync(async item => {
                mantainSequelize ? result.push(item) : result.push(item.dataValues);
            });
            if (result.length > 0) {
                log(`Consulta realizada com sucesso! Informação encontrada.`);
                return result[0];
            } else {
                log(`Consulta realizada com sucesso! Nenhuma informação encontrada.`);
                return null;
            }
        }
    }
}

exports.findByPk = async(name, id, mantainSequelize = false) => {
    log(`Consultando um registro pela chave primária. Tabela = ${name}, ID = ${id}.`);
    if (await this.init()) {
        let data = await this.sequelize.models[name].findByPk(id);
        log(`Consulta realizada com sucesso!`);
        return mantainSequelize ? data : data.dataValues;
    }
}

exports.insert = async(name, data, mantainSequelize = false) => {
    log(`inserindo um registro na tabela ${name}.`);
    if (await this.init()) {
        let new_data = await this.sequelize.models[name].create(data);
        log(`Registro inserido com sucesso.`);
        log(new_data.toJSON());
        return mantainSequelize ? new_data : new_data.dataValues;
    }
}

exports.update = async(name, query, data) => {
    log(`Alterando dados na tabela ${name}, filtro:`);
    log(JSON.stringify(query));
    if (await this.init()) {
        let dataset = await this.find(name, query, mantainSequelize = true);
        let count = 0;
        await dataset.forEachAsync(async item => {
            await Object.keys(data).forEachAsync(key => {
                item[key] = data[key];
            });
            item.save();
            count++;
        });
        let noum = count == 1 ? 'registro alterado' : 'registros alterados';
        log(`Update feito com sucesso. ${count} ${noum}!`);
        return count;
    }
}

exports.delete = async(name, query, mantainSequelize = false) => {
    log(`Excluindo um registro da tabela ${name}. Query: ${JSON.stringify(query)}`);
    if (await this.init()) {
        let count = await this.sequelize.models[name].destroy({ where: query });
        let noum = count == 1 ? 'registro excluído' : 'registros excluídos';
        log(`Registro excluido com sucesso. ${count} ${noum}!`);
        return count;
    }
}