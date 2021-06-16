const fs = require('fs');
const log = require('debug')('subheaven:sql');
const { Sequelize, DataTypes, Deferrable, Op } = require('sequelize');
const json5 = require('json5');
require('subheaven-tools').init();

const env = require('subheaven-env');
env.addParams([
    { name: 'SUB_SQL_DIALECT', description: 'A sequelize dialect option.', required: true, sample: 'sqlite' },
    { name: 'SUB_SQL_STORAGE', description: 'The path of database or the option :memory: for a in memory database.', required: true, sample: ':memory:' },
    { name: 'SUB_SQL_SCHEMAS', description: 'The path of the schemas folder.', required: true, sample: './schemas' }
]);
env.config();

exports.update_database = async() => {
    await this.sequelize.sync({ alter: true });
}

exports.hasForeign = async(schema) => {
    let result = null;
    await Object.keys(schema).forEachAsync(async key => {
        if (schema[key].foreign) {
            result = {
                model: schema[key].foreign.model,
                key: key
            }
        }
    });
    return result;
}

exports.loadSchemaFiles = async() => {
    let filenames = fs.readdirSync(process.env.SUB_SQL_SCHEMAS, { withFileTypes: true });
    let loaded_schemas = [];
    await filenames.forEachAsync(async filename => {
        if (filename.isFile() && ['json', 'json5'].indexOf(filename.name.split('.').pop().toLowerCase()) > -1) {
            let base_schema = json5.parse(fs.readFileSync(`${process.env.SUB_SQL_SCHEMAS}/${filename.name}`, 'utf8'));
            let table_name = filename.name.split('.');
            table_name.pop();
            table_name = table_name.join('.');
            let has_foreign = await this.hasForeign(base_schema);
            loaded_schemas.push({
                table_name: table_name,
                schema: base_schema,
                foreign: has_foreign
            })
        }
    });
    return loaded_schemas;
}

exports.loadSchemas = async() => {
    log("Carregando schemas");
    this.schemas = {};
    let type_map = {
        string: DataTypes.STRING,
        text: DataTypes.TEXT,
        integer: DataTypes.INTEGER,
        time: DataTypes.TIME,
        date: DataTypes.DATEONLY,
        datetime: DataTypes.DATE,
        float: DataTypes.FLOAT,
        boolean: DataTypes.BOOLEAN
    }
    let fk_map = {
        immediate: Deferrable.INITIALLY_IMMEDIATE,
        deferred: Deferrable.INITIALLY_DEFERRED,
        not: Deferrable.NOT
    }
    let field_maker = {
        type: async(field, value) => {
            if (value) {
                field['type'] = type_map[value];
            }
            return field;
        },
        primary: async(field, value) => {
            if (value) {
                field['type'] = type_map.integer;
                field['autoIncrement'] = true;
                field['allowNull'] = false;
                field['primaryKey'] = true;
            }
            return field;
        },
        required: async(field, value) => {
            field['allowNull'] = value ? false : true;
            return field;
        },
        default: async(field, value) => {
            field['defaultValue'] = value;
            return field;
        },
        unique: async(field, value) => {
            field['unique'] = value;
            return field;
        },
        comment: async(field, value) => {
            field['comment'] = value;
            return field;
        },
        foreign: async(field, value) => {
            if (value) {
                field['model'] = value.model;
                field['key'] = value.key;
                field['deferrable'] = fk_map[value.rule];
            }
            return field;
        }
    }

    let loaded_schemas = await this.loadSchemaFiles();

    while (loaded_schemas.length > 0) {
        if (!loaded_schemas[0].foreign || this.sequelize.models[loaded_schemas[0].foreign.model]) {
            let base_schema = loaded_schemas[0].schema;
            let schema = {};
            if (loaded_schemas[0].foreign) {
                base_schema.fields[loaded_schemas[0].foreign.key].foreign.model = this.sequelize.models[loaded_schemas[0].foreign.model];
            }
            await Object.keys(base_schema.fields).forEachAsync(async fieldname => {
                if (fieldname.substring(0, 1) !== '_') {
                    let field = {};
                    await Object.keys(base_schema.fields[fieldname]).forEachAsync(async key => {
                        if (field_maker[key]) {
                            field = await field_maker[key](field, base_schema.fields[fieldname][key])
                        }
                    });
                    schema[fieldname] = field;
                }
            });
            this.schemas[loaded_schemas[0].table_name] = base_schema;
            this.sequelize.define(loaded_schemas[0].table_name, schema);
            loaded_schemas.splice(0, 1);
        }
    }

    await this.update_database();
};

exports.init = async() => {
    try {
        if (!this.sequelize) {
            log("Inicializando o modulo subheaven-sql");
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
            log("modulo inicializado. Esquemas:");
            log(JSON.stringify(this.schemas, null, 4));
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

exports.update = async(name, query, data, mantainSequelize = false) => {
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

exports.delete = async(name, query) => {
    log(`Excluindo um registro da tabela ${name}. Query: ${JSON.stringify(query)}`);
    if (await this.init()) {
        let count = await this.sequelize.models[name].destroy({ where: query });
        let noum = count == 1 ? 'registro excluído' : 'registros excluídos';
        log(`Registro excluido com sucesso. ${count} ${noum}!`);
        return count;
    }
}