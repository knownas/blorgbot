const BaseCommand = require('../structures/BaseCommand');

class PollCommand extends BaseCommand {
    constructor() {
        super({
            name: 'poll',
            category: bu.CommandType.GENERAL,
            usage: 'poll <question> [flags]',
            info: 'Creates a poll for the given question and duration. If no duration is given, defaults to 60 seconds. If emojis are given, they will be used as options for the poll.',
            flags: [ { flag: 't',
    word: 'time',
    desc: 'How long before the poll expires, formatted as \'1 day 2 hours 3 minutes and 4 seconds\', \'1d2h3m4s\', or some other combination.' },
  { flag: 'e',
    word: 'emojis',
    desc: 'The emojis to apply to the poll.' },
  { flag: 'd',
    word: 'description',
    desc: 'The description of the poll.' },
  { flag: 'c',
    word: 'colour',
    desc: 'The colour of the poll (in HEX).' },
  { flag: 'a',
    word: 'announce',
    desc: 'If specified, it will make an announcement. Requires the proper permissions.' },
  { flag: 's',
    word: 'strict',
    desc: 'If specified, only accept reactions that were in the initial list.' } ]
        });
    }

    async execute(msg, words, text) {
    let choices = ['👍', '👎'];
    let input = bu.parseInput(this.flags, words, true);
    if (input.undefined.length >= 1) {
        if (input.e) {
            choices = input.e;
        }
        let time = dep.moment.duration(60, 's');
        if (input.t) {
            time = bu.parseDuration(input.t.join(' '));
        }
        if (time.asMilliseconds() <= 0) {
            bu.send(msg, `The length of a poll can't be less than 0 seconds!`);
            return;
        }
        if (!input.c) input.c = [];
        let color = bu.parseColor(input.c[0]);
        if (color === null)
            color = bu.getRandomInt(0, 0xffffff);
        let endTime = dep.moment(msg.timestamp).add(time);
        let title = input.undefined.join(' ');
        let message = {
            embed: {
                title,
                footer: {
                    text: 'The poll will expire',
                    icon_url: 'https://discord.gold/17021816cm.png'
                },
                timestamp: endTime,
                color: color
            }
        };
        if (input.d) {
            message.embed.description = input.d.join(' ');
        }
        let channel = msg.channel.id,
            roleId, role;
        if (input.a) {
            let storedGuild = await bu.getGuild(msg.guild.id);
            if (storedGuild.hasOwnProperty('announce')) {
                if ((await bu.canExecuteCommand(msg, 'announce', true))[0]) {
                    channel = storedGuild.announce.channel;
                    roleId = storedGuild.announce.role;
                    role = msg.guild.roles.get(roleId);
                    if (!role) {
                        roleId = undefined;
                        role = undefined;
                        channel = msg.channel.id;
                    } else if (role.name == '@everyone') {
                        message.content = '@everyone';
                        message.disableEveryone = false;
                    } else {
                        message.content = role.mention;
                    }
                }
            }
        }
        if (role) {
            try {
                await role.edit({
                    mentionable: true
                });
            } catch (err) {
                console.error(err);
            }
        }
        let msg2 = await bu.send(channel, message);
        if (role) {
            try {
                await role.edit({
                    mentionable: false
                });
            } catch (err) {
                console.error(err);
            }
        }
        for (let choice of choices) {
            choice = choice.replace(/[<>]/g, '');
            try {
                await bot.addMessageReaction(msg2.channel.id, msg2.id, choice);
            } catch (err) {
                //NO-OP
                //   console.error(err);
            }
        }
        await r.table('events').insert({
            title: title,
            type: 'poll',
            channel: channel,
            msg: msg2.id,
            endtime: r.epochTime(endTime.unix()),
            color: color,
            roleId,
            strict: input.s ? choices.map(m => {
                if (/[0-9]{17,23}/.test(m))
                    return m.match(/([0-9]{17,23})/)[0];
                return m;
            }) : undefined
        });
    } else {
        bu.send(msg, 'Incorrect usage! Do `b!help poll` for more information.');
    }
    }
}

module.exports = PollCommand;
