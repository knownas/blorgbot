const BaseCommand = require('../structures/BaseCommand');

var changeChannel = '222199986123833344';
const roleId = '239399475263700992';
const betaRoleId = '268577839639560192'; // temp role for testing

class PatchCommand extends BaseCommand {
    constructor() {
        super({
            name: 'patch',
            category: bu.CommandType.CAT,
            usage: 'patch [features] [flags]',
            info: 'Makes a patch note',
            flags: [{ flag: 'f', word: 'fixes', desc: 'The bug fixes of the patch.' },
            { flag: 'n', word: 'notes', desc: 'Other notes.' }]
        });
    }

    async execute(msg, words, text) {
        if (msg.author.id != bu.CAT_ID) {
            return;
        }
        let input = bu.parseInput(this.flags, words, true);
        let channel = await bot.getChannel(changeChannel);
        let role = channel.guild.roles.get(config.general.isbeta ? betaRoleId : roleId);
        let content = role.mention;
        let embed = {
            author: {
                name: `Version ${await bu.getVersion()}`
            },
            fields: [],
            color: bu.avatarColours[bu.avatarId]
        };
        if (input.undefined.length > 0) {
            embed.title = 'New Features and Changes';
            embed.description = input.undefined.join(' ');
        };
        if (input.f && input.f.length > 0) {
            embed.fields.push({
                name: 'Bug Fixes',
                value: input.f.join(' ')
            });
        };
        if (input.n && input.n.length > 0) {
            embed.fields.push({
                name: 'Other Notes',
                value: input.n.join(' ')
            });
        };

        await role.edit({
            mentionable: true
        });
        console.info(embed);
        await bu.send(changeChannel, {
            content,
            embed
        });
        await role.edit({
            mentionable: false
        });

        let changelogs = await r.table('vars').get('changelog');
        if (changelogs) {
            for (const guild in changelogs.guilds) {
                const channel = changelogs.guilds[guild];
                try {
                    await bu.send(channel, {
                        embed
                    });
                } catch (err) {
                    delete changelogs.guilds[guild];
                    //console.error('Changelog Patch:', err.message);
                }
            }
        }
        await bu.send(msg, 'Done! Sent to', Object.keys(changelogs.guilds).length, 'guilds.');
        await r.table('vars').get('changelog').replace(changelogs);
    }
}

module.exports = PatchCommand;
