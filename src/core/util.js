/*
 * @Author: stupid cat
 * @Date: 2017-05-07 19:37:01
 * @Last Modified by: stupid cat
 * @Last Modified time: 2018-05-11 09:02:49
 *
 * This project uses the AGPLv3 license. Please read the license file before using/adapting any of the code.
 */

var bu = module.exports = {};

const EventEmitter = require('eventemitter3');

global.cluster = require('./cluster.js');

bu.emitter = new EventEmitter();
bu.init = () => {
    global.r = require('rethinkdbdash')({
        host: config.db.host,
        db: config.db.database,
        password: config.db.password,
        user: config.db.user,
        port: config.db.port,
        max: 50,
        buffer: 5,
        timeoutError: 10000
    });
    bu.trello = new dep.Trello(config.general.trellokey, config.general.trellotoken);
    const Manager = require('./Manager.js');
    global.UtilManager = new Manager('utils');
    bu.registerChangefeed();
};

var changefeed;

bu.registerChangefeed = async () => {
    registerSubChangefeed('guild', 'guildid', bu.guildCache);
    registerSubChangefeed('user', 'userid', bu.userCache);
    registerSubChangefeed('tag', 'name', bu.tagCache);
    registerGlobalChangefeed();
}

async function registerGlobalChangefeed() {
    try {
        console.info('Registering a global changefeed!');
        changefeed = await r.table('vars').changes({
            squash: true
        }).run((err, cursor) => {
            if (err) return console.error(err);
            cursor.on('error', err => {
                console.error(err);
            });
            cursor.on('data', data => {
                if (data.new_val && data.new_val.varname == 'tagVars')
                    bu.globalVars = data.new_val.values;
            });
        });
        changefeed.on('end', registerGlobalChangefeed);
    } catch (err) {
        console.warn(`Failed to register a global changefeed, will try again in 10 seconds.`);
        setTimeout(registerGlobalChangefeed, 10000);
    }
}

async function registerSubChangefeed(type, idName, cache) {
    try {
        console.info('Registering a ' + type + ' changefeed!');
        changefeed = await r.table(type).changes({
            squash: true
        }).run((err, cursor) => {
            if (err) return console.error(err);
            cursor.on('error', err => {
                console.error(err);
            });
            cursor.on('data', data => {
                if (data.new_val) {
                    // Return if user or guild is not on thread OR cache
                    if (idName === 'guildid' && (!cache[data.new_val[idName]] && !bot.guilds.get(data.new_val[idName])))
                        return;
                    if (idName === 'userid' && (!cache[data.new_val[idName]] && !bot.users.get(data.new_val[idName])))
                        return;
                    cache[data.new_val[idName]] = data.new_val;
                } else delete cache[data.old_val[idName]];
            });
        });
        changefeed.on('end', () => registerSubChangefeed(type, idName, cache));
    } catch (err) {
        console.warn(`Failed to register a ${type} changefeed, will try again in 10 seconds.`);
        setTimeout(() => registerSubChangefeed(type, idName, cache), 10000);
    }
}