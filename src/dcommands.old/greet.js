var e = module.exports = {};

var bbEngine = require('../structures/BBTagEngine');

e.init = () => {
    e.category = bu.CommandType.ADMIN;
};
e.requireCtx = require;

e.isCommand = true;
e.hidden = false;
e.usage = 'greet [message]';
e.info = 'Sets a greeting for when users join.';
e.longinfo = `<p>Sets a greeting for any new user who joins your guild. You can use the <a href="/tags/">tagging system</a>
        for more customization. For
        example:</p>

<pre><code>User&gt; blargbot greet Welcome, **{username}**. Please read #rules.
blargbot&gt; Greeting set. Simulation: Welcome, **User**. Please read #rules.
</code></pre>`;

e.flags = [{
    flag: 'c',
    word: 'channel',
    desc: 'The channel to put the greeting in.'
}];

e.execute = async function (msg, words) {
    let input = bu.parseInput(e.flags, words);
    if (input.undefined.length == 0) {
        bu.guildSettings.remove(msg.channel.guild.id, 'greeting').then(() => {
            bu.send(msg, 'Disabled greetings');
        });
        return;
    }
    var greeting = input.undefined.join(' ');
    await bu.guildSettings.set(msg.channel.guild.id, 'greeting', greeting);
    let suffix = '';
    let channelStr = input.c ? input.c.join(' ') : msg.channel.id;
    if (/[0-9]{17,23}/.test(channelStr)) {
        let channel = channelStr.match(/([0-9]{17,23})/)[1];
        if (!bot.getChannel(channel)) {
            suffix = `A channel could not be found from the channel input, so this message will go into the default channel. `;
        } else if (bot.channelGuildMap[channel] != msg.guild.id) {
            suffix = `The channel must be on this guild! `;
        } else {
            await bu.guildSettings.set(msg.guild.id, 'greetchan', channel);
            suffix = `This greeting will be outputted in <#${channel}>. `;
        }
    }
    await bbEngine.runTag({
        msg,
        tagContent: greeting,
        input: '',
        isCC: true,
        author: msg.author.id,
        modResult(context, result) { return 'Greeting set. ' + suffix + 'Simulation:\n' + result; }
    });
};