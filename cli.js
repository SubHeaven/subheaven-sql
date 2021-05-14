const project = require('./index');
const argParse = require('subheaven-arg');
require('dotenv').config();

const test_init = async() => {
    console.log("Inicializando banco de dados")
    let initialized = await project.init();
    if (initialized) {
        console.log("Banco de dados inicializado com sucesso!");
        console.log(project.schemas);
        return true;
    } else {
        console.log("Houve algum erro ao inicializar o banco");
        return false;
    }
}

const insertContato = async(data) => {
    let result = await project.insert('contatos', data);
    console.log(result);
}

const test = async() => {
    console.log("Adicionando primeiro contato");
    await insertContato({
        nome: 'Contato 1',
        telefone: '11 91111-1111'
    });
    console.log("Adicionando segundo contato");
    await insertContato({
        nome: 'Contato 2',
        telefone: '22 92222-2222'
    });
    console.log("Adicionando terceiro contato");
    await insertContato({
        nome: 'Contato 3',
        telefone: '33 93333-3333'
    });
}

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
        } else {
            // await test_init();
            await test();
        }
    }
})();