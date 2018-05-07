var e = module.exports = {};







e.init = () => {
    e.category = bu.CommandType.IMAGE;
};

e.requireCtx = require;

e.isCommand = false;
e.hidden = false;
e.usage = 'object &lt;text&gt;';
e.info = `OBJECTION!`;
e.longinfo = `<p>OBJECTION!</p>`;

e.execute = async function(msg, words) {

    let code = bu.genEventCode();
    let buffer = await bu.awaitEvent({
        cmd: 'img',
        command: 'objection',
        code: code,
        message: words.slice(1).join(' ')
    });
    bu.send(msg, undefined, {
        file: buffer,
        name: 'OBJECTION.gif'
    });
};