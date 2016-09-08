var fs = require('fs');
var util = require('util');
var Eris = require('eris');
var moment = require('moment-timezone');
var path = require('path');
var https = require('https');
var bu = require('./util.js');
var tags = require('./tags.js');
var reload = require('require-reload')(require)
var request = require('request')
var Promise = require('promise')

var Cleverbot = require('cleverbot-node');
cleverbot = new Cleverbot;

var e = module.exports = {};
var avatars;
var vars;
var config;
var emitter
var bot;
var db
var VERSION

e.requireCtx = require

// A list of command modules
var commands = {}
// A list of command names/descriptions for each alias or subcommand
var commandList = {}

/**
 * Initializes every command found in the dcommands directory - hooray for modules!
 */
function initCommands() {
    var fileArray = fs.readdirSync(path.join(__dirname, 'dcommands'));
    for (var i = 0; i < fileArray.length; i++) {

        var commandFile = fileArray[i]
        if (/.+\.js$/.test(commandFile)) {
            var commandName = commandFile.match(/(.+)\.js$/)[1]
            loadCommand(commandName);
            console.log(`${i < 10 ? ' ' : ''}${i}.`, 'Loading command module ', commandName)
        } else {
            console.log('     Skipping non-command ', commandFile);

        }
    }
}


/**
 * Reloads a specific command
 * @param commandName - the name of the command to reload (String)
 */
function reloadCommand(commandName) {
    if (commands[commandName]) {
        console.log(`${1 < 10 ? ' ' : ''}${1}.`, 'Reloading command module ', commandName)
        if (commands[commandName].shutdown)
            commands[commandName].shutdown()
        commands[commandName] = reload(`./dcommands/${commandName}.js`)
        buildCommand(commandName);
    }
}

/**
 * Unloads a specific command
 * @param commandName - the name of the command to unload (String)
 */
function unloadCommand(commandName) {
    if (commands[commandName]) {
        console.log(`${1 < 10 ? ' ' : ''}${1}.`, 'Unloading command module ', commandName)

        if (commands[commandName].sub) {
            for (var subCommand in commands[commandName].sub) {
                console.log(`    Unloading ${commandName}'s subcommand`, subCommand)
                delete commandList[subCommand];
            }
        }
        delete commandList[commandName];
        if (commands[commandName].alias) {
            for (var ii = 0; ii < commands[commandName].alias.length; ii++) {
                console.log(`    Unloading ${commandName}'s alias`, commands[commandName].alias[ii])
                delete commandList[commands[commandName].alias[ii]]
            }
        }
    }
}

/**
 * Loads a specific command
 * @param commandName - the name of the command to load (String)
 */
function loadCommand(commandName) {

    commands[commandName] = require(`./dcommands/${commandName}.js`)
    if (commands[commandName].isCommand) {
        buildCommand(commandName);
    } else {
        console.log('     Skipping non-command ', commandName + '.js');
    }
}

// Refactored a major part of loadCommand and reloadCommand into this
function buildCommand(commandName) {
    commands[commandName].init(bot);
    var command = {
        name: commandName,
        usage: commands[commandName].usage,
        info: commands[commandName].info,
        hidden: commands[commandName].hidden,
        category: commands[commandName].category
    }
    if (commands[commandName].sub) {
        for (var subCommand in commands[commandName].sub) {
            console.log(`    Loading ${commandName}'s subcommand`, subCommand)

            commandList[subCommand] = {
                name: commandName,
                usage: commands[commandName].sub[subCommand].usage,
                info: commands[commandName].sub[subCommand].info,
                hidden: commands[commandName].hidden,
                category: commands[commandName].category
            }
        }
    }
    commandList[commandName] = command;
    if (commands[commandName].alias) {
        for (var ii = 0; ii < commands[commandName].alias.length; ii++) {
            console.log(`    Loading ${commandName}'s alias`, commands[commandName].alias[ii])
            commandList[commands[commandName].alias[ii]] = command
        }
    }
}

var debug = false;
var warn = true;
var error = true;

/**
 * Initializes the bot
 * @param v - the version number (String)
 * @param topConfig - the config file (Object)
 * @param em - the event emitter (EventEmitter)
 * @param database - the sqlite3 database (Database)
 */
e.init = (v, topConfig, em, database) => {
    VERSION = v
    db = database
    emitter = em;
    config = topConfig;

    if (fs.existsSync(path.join(__dirname, 'vars.json'))) {
        var varsFile = fs.readFileSync(path.join(__dirname, 'vars.json'), 'utf8');
        vars = JSON.parse(varsFile);
    } else {
        vars = {
            save: "fs.writeFile(path.join(__dirname, 'vars.json'), JSON.stringify(vars, null, 4));",
            reload: "fs.readFile(path.join(__dirname, 'vars.json'), 'utf8', function (err, data) {\nif (err) throw err;\nvars = JSON.parse(data);\n});"
        };
        saveVars();
    }

    e.bot = bot = new Eris.Client(config.discord.token, {
        autoReconnect: true,
        disableEveryone: true,
        disableEvents: {
            //PRESENCE_UPDATE: true,
            //   VOICE_STATE_UPDATE: true,
            TYPING_START: true
        }
    });

    bu.init(bot);
    bu.bot = bot;
    bu.db = database;
    bu.config = config
    bu.emitter = em
    bu.VERSION = v
    bu.startTime = startTime
    bu.vars = vars;
    tags.init(bot)

    /**
     * EventEmitter stuff
     */
    emitter.on('discordMessage', (message, attachment) => {
        if (attachment)
            bu.sendMessageToDiscord(config.discord.channel, message, attachment)
        else
            bu.sendMessageToDiscord(config.discord.channel, message);
    })

    emitter.on('discordTopic', (topic) => {
        bot.editChannel(config.discord.channel, {
            topic: topic
        });
    })

    emitter.on('eval', (msg, text) => {
        eval1(msg, text)
    })
    emitter.on('eval2', (msg, text) => {
        eval2(msg, text)
    })

    emitter.on('reloadCommand', (commandName) => {
        reloadCommand(commandName)
    });
    emitter.on('loadCommand', (commandName) => {
        loadCommand(commandName)
    });
    emitter.on('unloadCommand', (commandName) => {
        unloadCommand(commandName)
    });
    emitter.on('saveVars', () => {
        saveVars()
    })

    avatars = JSON.parse(fs.readFileSync(path.join(__dirname, `avatars${config.general.isbeta ? '' : 2}.json`), 'utf8'));
    e.bot = bot;


    bot.on('debug', function (message, id) {
        if (debug)
            console.log(`[${moment().format(`MM/DD HH:mm:ss`)}][DEBUG][${id}] ${message}`);
    })

    bot.on('warn', function (message, id) {
        if (warn)
            console.log(`[${moment().format(`MM/DD HH:mm:ss`)}][WARN][${id}] ${message}`);
    })

    bot.on('error', function (err, id) {
        if (error)
            console.log(`[${moment().format(`MM/DD HH:mm:ss`)}][ERROR][${id}] ${err.stack}`);
    })

    bot.on("ready", function () {
        console.log("Ready!");
        console.log("I am a beautiful person. I have to go to school today.");

        gameId = bu.getRandomInt(0, 4);
        if (config.general.isbeta)
            avatarId = 4;
        else
            avatarId = 0;
        switchGame();
        switchAvatar();
        postStats();
    });


    bot.on('guildMemberAdd', function (guild, member) {
        bu.guildSettings.get(guild.id, 'greeting').then(val => {
            if (val) {
                var message = tags.processTag({
                    channel: guild.defaultChannel,
                    author: member.user,
                    member: member
                }, val, '');
                bu.sendMessageToDiscord(guild.defaultChannel.id, message);
            }
        })

    });

    bot.on('guildMemberRemove', function (guild, member) {
        bu.guildSettings.get(guild.id, 'farewell').then(val => {
            if (val) {
                var message = tags.processTag({
                    channel: guild.defaultChannel,
                    author: member.user,
                    member: member
                }, val, '');
                bu.sendMessageToDiscord(guild.defaultChannel.id, message);
            }
        })
    });

    bot.on('guildMemberRemove', (guild, member) => {
        try {
            if (member.id === bot.user.id) {
                postStats();
                console.log('removed from guild');
                bu.sendMessageToDiscord(`205153826162868225`, `I was removed from the guild \`${guild
                    .name}\` (\`${guild.id}\`)!`);
                db.query(`update guild set active='false' where guildid=?`, [guild.id])
            }
        } catch (err) {
            console.log(err.stack);
        }
    });

    bot.on('guildCreate', (guild) => {
        postStats();
        function firstTime() {
            var message = `I was added to the guild \`${guild.name}\` (\`${guild.id}\`)!`
            bu.sendMessageToDiscord(`205153826162868225`, message);
            if (bot.guilds.size % 100 == 0) {
                bu.sendMessageToDiscord(`205153826162868225`, `:tada: I'm now in ${bot.guilds.size} guilds! :tada:`);
            }
            console.log('WHY')
            var message2 = `Hi! My name is blargbot, a multifunctional discord bot here to serve you! 
- :computer:  For command information, please do \`${bu.config.discord.defaultPrefix}help\`!
- :loudspeaker: For Bot Commander commands, please make sure you have a role titled \`Bot Commander\`.
- :tools: For Admin commands, please make sure you have a role titled \`Admin\`.
If you are the owner of this server, here are a few things to know.
- :speech_left: To enable modlogging, please do create a channel for me to log in and do \`${bu.config.discord.defaultPrefix}modlog\`
- :see_no_evil: To mark channels as NSFW, please go to them and do \`${bu.config.discord.defaultPrefix}nsfw\`.
- :exclamation: To change my command prefix, please do \`${bu.config.discord.defaultPrefix}setprefix <anything>\`.

:question: If you have any questions, comments, or concerns, please do \`${bu.config.discord.defaultPrefix}suggest <suggestion>\`. Thanks!
:thumbsup: I hope you enjoy my services! :thumbsup:`
            bu.sendMessageToDiscord(guild.id, message2)
            db.query(`insert into guild (guildid) values (?)
            on duplicate key update active=1`, [guild.id])
        }
        console.log('added to guild');
        db.query(`select active from guild where guildid = ?`, [guild.id], (err, rows) => {
            if (!rows[0]) {
                firstTime()
            } else {
                if (!rows[0].active) {
                    firstTime()
                }
            }
        })
    });

    bot.on('messageUpdate', (msg, oldmsg) => {
        if (msg.author.id == bot.user.id) {
            console.log(`Message ${msg.id} was updated to '${msg.content}''`)
        }
    })

    bot.on('guildBanAdd', (guild, user) => {
        var mod
        if (bu.bans[guild.id] && bu.bans[guild.id][user.id]) {
            mod = bot.users.get(bu.bans[guild.id][user.id])
            delete bu.bans[guild.id][user.id]
        }
        bu.logAction(guild, user, mod, 'Ban')
    })
    bot.on('guildBanRemove', (guild, user) => {
        var mod
        if (bu.unbans[guild.id] && bu.unbans[guild.id][user.id]) {
            mod = bot.users.get(bu.unbans[guild.id][user.id])
            delete bu.unbans[guild.id][user.id]
        }
        bu.logAction(guild, user, mod, 'Unban')
    })

    bot.on('messageDelete', (msg) => {
        if (commandMessages.indexOf(msg.id) > -1) {
            bu.guildSettings.get(msg.channel.guild.id, 'deletenotif').then(val => {
                if (val != '0')
                    bu.sendMessageToDiscord(msg.channel.id, `**${msg.member.nick ? msg.member.nick : msg.author.username}** deleted their command message.`)
                commandMessages.splice(commandMessages.indexOf(msg.id), 1)
            })
        }

    })

    bot.on("messageCreate", function (msg) {
        if (msg.channel.id != '194950328393793536')
            if (msg.author.id == bot.user.id) {
                if (msg.channel.guild)
                    console.log(`[DIS] ${msg.channel.guild.name} (${msg.channel.guild.id})> ${msg.channel.name} `
                        + `(${msg.channel.id})> ${msg.author.username}> ${msg.content} (${msg.id})`)
                else
                    console.log(`[DIS] PM> ${msg.channel.name} (${msg.channel.id})> `
                        + `${msg.author.username}> ${msg.content} (${msg.id})`)
            }
        if (msg.channel.id === config.discord.channel) {
            if (!(msg.author.id == bot.user.id && msg.content.startsWith("\u200B"))) {
                var message;
                if (msg.content.startsWith('_') && msg.content.endsWith('_'))
                    message = ` * ${msg.member.nick ? msg.member.nick : msg.author.username} ${msg.cleanContent
                        .substring(1, msg.cleanContent.length - 1)}`;
                else {
                    if (msg.author.id == bot.user.id) {
                        message = `${msg.cleanContent}`;
                    } else {
                        message = `\<${msg.member.nick ? msg.member.nick : msg.author.username}\> ${msg.cleanContent}`;
                    }
                }
                console.log(`[DIS] ${message}`);
                var attachUrl = '';
                if (msg.attachments.length > 0) {
                    console.log(util.inspect(msg.attachments[0]));
                    attachUrl += " " + msg.attachments[0].url;
                }
                sendMessageToIrc(message + attachUrl);
            }
        }

        var prefix = config.discord.defaultPrefix
        //   bu.guildSettings.get(msg.channel.guild.id, 'prefix').then(val => {


        if (msg.author.id !== bot.user.id) {
            bu.guildSettings.get(msg.channel.guild ? msg.channel.guild.id : '', 'prefix').then(val => {
                var prefix = undefined;
                if (msg.channel.guild) {
                    if (val) prefix = val;
                } else {
                    prefix = ''
                }

                if (msg.content.toLowerCase().startsWith('blargbot')) {
                    var index = msg.content.toLowerCase().indexOf('t')
                    //     console.log(index)
                    prefix = msg.content.substring(0, index + 1);
                    //   console.log(`'${prefix}'`)
                } else if (msg.content.toLowerCase().startsWith(bu.config.discord.defaultPrefix)) {
                    //    var index = msg.content.toLowerCase().indexOf('t')
                    //     console.log(index)
                    prefix = bu.config.discord.defaultPrefix;
                    //   console.log(`'${prefix}'`)
                }

                bu.isBlacklistedChannel(msg.channel.id).then(blacklisted => {

                    if (blacklisted &&
                        msg.content.replace(prefix, '').split(' ')[0].toLowerCase() != 'blacklist') {
                        return;
                    }

                    processUser(msg);
                    if (msg.content.indexOf('(╯°□°）╯︵ ┻━┻') > -1 && msg.channel.guild.id == '110373943822540800' && !msg.author.bot) {
                        var flipMessage = '';
                        if (bot.user.id == '134133271750639616') {
                            var seed = bu.getRandomInt(0, 3);
                            switch (seed) {
                                case 0:
                                    flipMessage = 'Whoops! Let me get that for you ┬──┬﻿ ¯\\\\_(ツ)'
                                    break;
                                case 1:
                                    flipMessage = '(ヘ･_･)ヘ┳━┳ What are you, an animal?'
                                    break;
                                case 2:
                                    flipMessage = 'Can you not? ヘ(´° □°)ヘ┳━┳'
                                    break;
                                case 3:
                                    flipMessage = 'Tables are not meant to be flipped ┬──┬ ノ( ゜-゜ノ)'
                                    break;
                            }
                        } else {
                            var seed = bu.getRandomInt(0, 3);
                            switch (seed) {
                                case 0:
                                    flipMessage = '(ﾉ´･ω･)ﾉ ﾐ ┸━┸ Wheee!'
                                    break;
                                case 1:
                                    flipMessage = '┻━┻ ︵ヽ(`Д´)ﾉ︵﻿ ┻━┻ Get these tables out of my face!'
                                    break;
                                case 2:
                                    flipMessage = '┻━┻ミ＼(≧ﾛ≦＼) Hey, catch!'
                                    break;
                                case 3:
                                    flipMessage = 'Flipping tables with elegance! (/¯◡ ‿ ◡)/¯ ~ ┻━┻'
                                    break;
                            }
                        }
                        bu.sendMessageToDiscord(msg.channel.id, flipMessage);
                    }

                    if (msg.content.indexOf('┬─┬﻿ ノ( ゜-゜ノ)') > -1 && msg.channel.guild.id == '110373943822540800' && !msg.author.bot) {
                        var flipMessage = '';
                        if (bot.user.id == '134133271750639616') {
                            var seed = bu.getRandomInt(0, 3);
                            switch (seed) {
                                case 0:
                                    flipMessage = '┬──┬﻿ ¯\\\\_(ツ) A table unflipped is a table saved!'
                                    break;
                                case 1:
                                    flipMessage = '┣ﾍ(≧∇≦ﾍ)… (≧∇≦)/┳━┳ Unflip that table!'
                                    break;
                                case 2:
                                    flipMessage = 'Yay! Cleaning up! ┣ﾍ(^▽^ﾍ)Ξ(ﾟ▽ﾟ*)ﾉ┳━┳'
                                    break;
                                case 3:
                                    flipMessage = 'ヘ(´° □°)ヘ┳━┳ Was that so hard?'
                                    break;
                            }
                        } else {
                            var seed = bu.getRandomInt(0, 3);
                            switch (seed) {
                                case 0:
                                    flipMessage = '(ﾉ´･ω･)ﾉ ﾐ ┸━┸ Here comes the entropy!'
                                    break;
                                case 1:
                                    flipMessage = 'I\'m sorry, did you just pick that up? ༼ﾉຈل͜ຈ༽ﾉ︵┻━┻'
                                    break;
                                case 2:
                                    flipMessage = 'Get back on the ground! (╯ರ ~ ರ）╯︵ ┻━┻'
                                    break;
                                case 3:
                                    flipMessage = 'No need to be so serious! (ﾉ≧∇≦)ﾉ ﾐ ┸━┸'
                                    break;
                            }
                        }
                        bu.sendMessageToDiscord(msg.channel.id, flipMessage);
                    }
                    var commandExecuted = false;
                    if (msg.content.startsWith(`<@${bot.user.id}>`) || msg.content.startsWith(`<@!${bot.user.id}>`)) {
                        console.log('lel');
                        var cleanContent = msg.content.replace(/<@!?[0-9]{17,21}>/, '').trim()
                        commandExecuted = handleDiscordCommand(msg.channel, msg.author, cleanContent, msg)
                        if (!commandExecuted) {
                            Cleverbot.prepare(function () {
                                cleverbot.write(cleanContent, function (response) {
                                    bot.sendChannelTyping(msg.channel.id);
                                    setTimeout(function () {
                                        bu.sendMessageToDiscord(msg.channel.id, response.message);
                                    }, 1500)
                                });
                            });
                        }
                    }

                    if (msg.content.startsWith(prefix)) {
                        var command = msg.content.replace(prefix, '').trim();
                        console.log(`${prefix} ${command}`);
                        try {
                            commandExecuted = handleDiscordCommand(msg.channel, msg.author, command, msg);
                        } catch (err) {
                            console.log(err.stack);
                        }
                    } else {
                        if (msg.author.id == bu.CAT_ID && msg.content.indexOf('discord.gg') == -1) {
                            var prefixes = ["!", "@", "#", "$", "%", "^", "&", "*", ")", "-", "_", "=", "+", "}", "]", "|", ";", ":", "'", ">", "?", "/", "."];
                            if (!msg.content || (prefixes.indexOf(msg.content.substring(0, 1)) == -1) && !msg.content.startsWith('kek!') && !msg.content.startsWith('blarg!') && msg.channel.guild) {
                                db.query(`SELECT id, content from catchat order by id desc limit 1`, (err, row) => {

                                    if (err)
                                        console.log(err.stack)
                                    if ((row[0] && row[0].content != msg.content) || msg.content == '') {
                                        var content = msg.content;
                                        while (/<@!?[0-9]{17,21}>/.test(content)) {
                                            content = content.replace(/<@!?[0-9]{17,21}>/, '@' + bu.getUserFromName(msg, content.match(/<@!?([0-9]{17,21})>/)[1], true).username)
                                        }
                                        var statement = `insert into catchat (content, attachment, msgid, channelid, guildid, msgtime, nsfw) values (?, ?, ?, ?, ?, NOW(), ?)`
                                        var nsfw = 0;
                                        db.query(`select channelid from channel where channelid = ?`, [msg.channel.id], (err, row) => {
                                            if (row[0]) {
                                                nsfw = 1;
                                            }
                                            db.query(statement,
                                                [content, msg.attachments[0] ? msg.attachments[0].url : 'none', msg.id,
                                                    msg.channel.id, msg.channel.guild.id, nsfw]);
                                        })


                                    }
                                })
                            }
                        }

                    }
                    if (msg.channel.guild) {
                        if (commandExecuted)
                            bu.guildSettings.get(msg.channel.id, 'deletenotif').then(val => {
                                if (val != '0') {
                                    commandMessages.push(msg.id)
                                    if (commandMessages.length > 100) {
                                        commandMessages.shift();
                                    }
                                }
                            })

                        db.query(`UPDATE user set lastcommand=?, lastcommanddate=NOW() where userid=?`,
                            [cleanContent, msg.author.id]);
                        //}
                    }
                })

            })
        }
        if (msg.channel.id != '204404225914961920') {
            var statement = `insert into chatlogs (content, attachment, userid, msgid, channelid, guildid, msgtime, nsfw, mentions) 
            values (?, ?, (select userid from user where userid = ?), ?, ?, ?, NOW(), ?, ?)`
            var nsfw = 0;
            db.query(`select channelid from channel where channelid = ? and nsfw = true`, [msg.channel.id], (err, row) => {
                if (row[0]) {
                    nsfw = 1;
                }
                var mentions = ''
                for (var i = 0; i < msg.mentions.length; i++) {
                    mentions += msg.mentions[i].username + ',';
                }
                db.query(statement, [msg.content, msg.attachments[0] ? msg.attachments[0].url : 'none',
                    msg.author.id, msg.id, msg.channel.id, msg.channel.guild.id, nsfw, mentions]);
            })

        }


    });
    initCommands();
    bot.connect();

}


/**
 * Reloads the misc variables object
 */
function reloadVars() {
    fs.readFileSync(path.join(__dirname, 'vars.json'), 'utf8', function (err, data) {
        if (err) throw err;
        vars = JSON.parse(data);
    });
}

/**
 * Saves the misc variables to a file
 */
function saveVars() {
    fs.writeFileSync(path.join(__dirname, 'vars.json'), JSON.stringify(vars, null, 4));
}

var gameId;
/**
 * Switches the game the bot is playing
 * @param forced - if true, will not set a timeout (Boolean)
 */
function switchGame(forced) {
    var name = '';
    var oldId = gameId;
    while (oldId == gameId) {
        gameId = bu.getRandomInt(0, 6);
    }
    switch (gameId) {
        case 0:
            name = `with ${bot.users.size} users!`;
            break;
        case 1:
            name = `in ${bot.guilds.size} guilds!`;
            break;
        case 2:
            name = `in ${Object.keys(bot.channelGuildMap).length} channels!`
            break;
        case 3:
            name = `with tiny bits of string!`;
            break;
        case 4:
            name = `with delicious fish!`;
            break;
        case 5:
            name = `on version ${bu.VERSION}!`;
            break;
        case 6:
            name = `type 'blargbot help'!`
            break;
    }
    bot.editGame({
        name: name
    });
    if (!forced)
        setTimeout(function () {
            switchGame();
        }, 60000);
}

var avatarId;
/**
 * Switches the avatar
 * @param forced - if true, will not set a timeout (Boolean)
 */
function switchAvatar(forced) {
    bot.editSelf({ avatar: avatars[avatarId] });
    avatarId++;
    if (avatarId == 8)
        avatarId = 0;
    if (!forced)
        setTimeout(function () {
            switchAvatar();
        }, 300000);
}

var commandMessages = []

function handleDiscordCommand(channel, user, text, msg) {
    return new Promise((fulfill, reject) => {
        var words = text.replace(/ +/g, ' ').split(' ');

        if (msg.channel.guild)
            console.log(`[DIS] Command '${text}' executed by ${user.username} (${user.id}) on server ${msg.channel.guild.name} (${msg.channel.guild.id}) on channel ${msg.channel.name} (${msg.channel.id}) Message ID: ${msg.id}`);
        else
            console.log(`[DIS] Command '${text}' executed by ${user.username} (${user.id}) in a PM on channel ${msg.channel.name} (${msg.channel.id}) Message ID: ${msg.id}`);

        if (msg.author.bot) {
            fulfill(false)
        }
        if (msg.channel.guild) {
            bu.ccommand.get(msg.channel.guild ? msg.channel.guild.id : '', words[0]).then(val => {
                if (val) {
                    var command = text.replace(words[0], '').trim();

                    var response = tags.processTag(msg, val, command);
                    if (response !== "null") {
                        bu.sendMessageToDiscord(channel.id, response);
                    }
                    fulfill(true)
                } else {
                    if (config.discord.commands[words[0]] != null) {
                        bu.sendMessageToDiscord(channel.id, `${
                            config.discord.commands[words[0]]
                                .replace(/%REPLY/, `<@${user.id}>`)}`);
                        fulfill(true)

                    }

                    if (words[0].toLowerCase() == 'help') {
                        if (words.length > 1) {
                            var message = '';
                            if (commandList.hasOwnProperty(words[1]) && !commandList[words[1]].hidden
                                && bu.CommandType.properties[commandList[words[1]].category].requirement(msg)) {
                                message = `Command Name: ${commandList[words[1]].name}
Usage: \`${commandList[words[1]].usage}\`
${commandList[words[1]].info}`;
                            } else {
                                message = `No description could be found for command \`${words[1]}\`.`;
                            }
                            bu.sendMessageToDiscord(channel.id, message);
                        } else {
                            var commandsString = "```xl\nGeneral Commands:\n help";
                            var generalCommands = []
                            var otherCommands = {}
                            for (var command in commandList) {
                                if (!commandList[command].hidden) {
                                    if (commandList[command].category == bu.CommandType.GENERAL) {
                                        generalCommands.push(command);
                                    }
                                    else {
                                        if (!otherCommands[commandList[command].category])
                                            otherCommands[commandList[command].category] = []
                                        otherCommands[commandList[command].category].push(command)
                                    }
                                }
                            }
                            generalCommands.sort()
                            for (var i = 0; i < generalCommands.length; i++) {
                                commandsString += `, ${generalCommands[i]}`;
                            }
                            for (var category in otherCommands) {
                                if (bu.CommandType.properties[category].requirement(msg)) {
                                    otherCommands[category].sort()
                                    var otherCommandList = otherCommands[category]
                                    commandsString += `\n${bu.CommandType.properties[category].name} Commands:\n`
                                    for (var i = 0; i < otherCommandList.length; i++) {
                                        commandsString += `${i == 0 ? ' ' : ', '}${otherCommandList[i]}`;
                                    }
                                }
                            }
                            db.query(`select commandname from ccommand where guildid = ?`,
                                [msg.channel.guild ? msg.channel.guild.id : ''], (err, rows) => {
                                    if (rows.length > 0) {
                                        var ccommandsString = "Custom Commands:\n";
                                        var helpCommandList = [];
                                        var i = 0;
                                        for (var key in rows) {
                                            helpCommandList[i] = rows[key].commandname;
                                            i++;
                                        }
                                        helpCommandList.sort();
                                        for (i = 0; i < helpCommandList.length; i++) {
                                            ccommandsString += `${i == 0 ? ' ' : ', '}${helpCommandList[i]}`;
                                        }
                                        commandsString += `\n${ccommandsString}`
                                    }

                                    commandsString += '```'

                                    bu.sendMessageToDiscord(channel.id, `${commandsString}\n${!msg.channel.guild
                                        ? 'Not all of these commands work in DMs.\n'
                                        : ''
                                        }For more information about commands, do \`help <commandname>\` or visit http://blarg.stupidcat.me/commands.html`);
                                })
                        }
                        fulfill(true)
                    } else {
                        if (commandList.hasOwnProperty(words[0].toLowerCase())) {
                            console.log(words[0])
                            if (bu.CommandType.properties[commandList[words[0].toLowerCase()].category].perm) {
                                if (!bu.hasPerm(msg, bu.CommandType.properties[commandList[words[0].toLowerCase()].category].perm)) {
                                    fulfill(false)
                                    return;
                                }
                            }
                            commands[commandList[words[0].toLowerCase()].name].execute(msg, words, text);
                            fulfill(true)
                        }
                    }
                }
            })

        }


    });




    //return false;
}

var messageLogs = [];
var messageI = 0;

/**
 * Function to be called manually (through eval) to generate logs for any given channel
 * @param channelid - channel id (String)
 * @param msgid - id of starting message (String)
 * @param times - number of times to repeat the cycle (int)
 */
function createLogs(channelid, msgid, times) {
    if (messageI < times)
        bot.getMessages(channelid, 100, msgid).then((kek) => {
            console.log(`finished ${messageI + 1}/${times}`);
            for (var i = 0; i < kek.length; i++) {
                messageLogs.push(`${kek[i].author.username}> ${kek[i].author.id}> ${kek[i].content}`);
            }
            messageI++;
            setTimeout(() => {
                createLogs(channelid, kek[kek.length - 1].id, times);
            }, 5000);
        });
    else {
    }
}

/**
 * Function to be used with createLogs
 * @param name - file name (String)
 */
function saveLogs(name) {
    messageI = 0;
    fs.writeFile(path.join(__dirname, name), JSON.stringify(messageLogs, null, 4));
}

/**
 * Posts stats about the bot to https://bots.discord.pw
 */
function postStats() {
    var stats = JSON.stringify({
        server_count: bot.guilds.size
    });

    var options = {
        hostname: 'bots.discord.pw',
        method: 'POST',
        port: 443,
        path: `/api/bots/${bot.user.id}/stats`,
        headers: {
            "User-Agent": "blargbot/1.0 (ratismal)",
            "Authorization": vars.botlisttoken,
            "Content-Type": 'application/json',
            'Content-Length': Buffer.byteLength(stats)
        }
    };
    console.log('Posting to abal')
    var req = https.request(options, function (res) {
        var body = '';
        res.on('data', function (chunk) {
            console.log(chunk);
            body += chunk;
        });

        res.on('end', function () {
            console.log("body: " + body);
        });

        res.on('error', function (thing) {
            console.log(`Result error occurred! ${thing}`);
        })
    });
    req.on('error', function (err) {
        console.log(`Request error occurred! ${err}`);
    });
    req.write(stats);
    req.end();

    if (!config.general.isbeta) {
        console.log('Posting to matt')

        request.post({
            "url": "https://www.carbonitex.net/discord/data/botdata.php",
            "headers": { "content-type": "application/json" }, "json": true,
            body: {
                "key": config.general.carbontoken,
                "servercount": bot.guilds.size
            }
        })
    }
}

var lastUserStatsKek;

/**
 * Gets information about a bot - test function
 * @param id - id of bot
 */
function fml(id) {
    var options = {
        hostname: 'bots.discord.pw',
        method: 'GET',
        port: 443,
        path: `/api/bots/${id}`,
        headers: {
            "User-Agent": "blargbot/1.0 (ratismal)",
            "Authorization": vars.botlisttoken
        }
    };

    var req = https.request(options, function (res) {
        var body = '';
        res.on('data', function (chunk) {
            console.log(chunk);
            body += chunk;
        });

        res.on('end', function () {
            console.log("body: " + body);
            lastUserStatsKek = JSON.parse(body);
        });

        res.on('error', function (thing) {
            console.log(`Result Error: ${thing}`);
        })
    });
    req.on('error', function (err) {
        console.log(`Request Error: ${err}`);
    });
    req.end();

}

/**
 * Displays the contents of a function
 * @param msg - message
 * @param text - command text
 */
function eval2(msg, text) {
    if (msg.author.id === bu.CAT_ID) {
        var commandToProcess = text.replace("eval2 ", "");
        console.log(commandToProcess);
        try {
            bu.sendMessageToDiscord(msg.channel.id, `\`\`\`js
${eval(`${commandToProcess}.toString()`)}
\`\`\``);
        } catch (err) {
            bu.sendMessageToDiscord(msg.channel.id, err.message);
        }
    } else {
        bu.sendMessageToDiscord(msg.channel.id, `You don't own me!`);
    }
}

/**
 * Evaluates code
 * @param msg - message (Message)
 * @param text - command text (String)
 */
function eval1(msg, text) {
    if (msg.author.id === bu.CAT_ID) {
        var commandToProcess = text.replace("eval ", "");
        if (commandToProcess.startsWith('```js') && commandToProcess.endsWith('```'))
            commandToProcess = commandToProcess.substring(6, commandToProcess.length - 3);
        else if (commandToProcess.startsWith('```') && commandToProcess.endsWith('```'))
            commandToProcess = commandToProcess.substring(4, commandToProcess.length - 3);
        try {
            bu.sendMessageToDiscord(msg.channel.id, `Input:
\`\`\`js
${commandToProcess}
\`\`\`
Output:
\`\`\`js
${commandToProcess == '1/0' ? 1 : eval(commandToProcess)}
\`\`\``);
            if (commandToProcess.indexOf('vars') > -1) {
                saveVars();
            }

        } catch (err) {
            bu.sendMessageToDiscord(msg.channel.id, `An error occured!
\`\`\`js
${err.stack}
\`\`\``);
        }
    } else {
        bu.sendMessageToDiscord(msg.channel.id, `You don't own me!`);
    }
}

/**
 * Processes a user into the database
 * @param msg - message (Message)
 */
function processUser(msg) {
    try {
        db.query('SELECT userid as id, username from user where userid=?', [msg.author.id], (err, row) => {
            if (!row || !row[0]) {
                console.log(`inserting user ${msg.author.id} (${msg.author.username})`)
                db.query(`insert into user (userid, username, lastspoke, isbot, lastchannel, messagecount)`
                    + `values (?, ?, NOW(), ?, ?, 1)`,
                    [msg.author.id, msg.author.username, msg.author.bot ? 1 : 0, msg.channel.id]);
                db.query(`insert into username (userid, username) values (?, ?)`,
                    [msg.author.id, msg.author.username]);
            } else {
                if (row[0].username != msg.author.username) {
                    db.query(`update user set username = ?, lastspoke = NOW(), lastchannel=?, `
                        + `messagecount=messagecount + 1 where userid = ?`,
                        [msg.author.username, msg.channel.id, msg.author.id]);
                    db.query(`insert into username (userid, username, namedate) `
                        + `values (?, ?, NOW())`,
                        [msg.author.id, msg.author.username]);
                } else {
                    db.query(`update user set lastspoke = NOW(), lastchannel=?, `
                        + `messagecount=messagecount + 1 where userid = ?`,
                        [msg.channel.id, msg.author.id]);
                }
            }
        });
    } catch (err) {
        console.log(err)
    }

}


var startTime = moment();

/**
 * Sends a message to irc
 * @param msg - the message to send (String)
 */
function sendMessageToIrc(msg) {
    emitter.emit('ircMessage', msg)
}