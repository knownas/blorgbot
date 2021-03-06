/*
 * @Author: stupid cat
 * @Date: 2017-05-07 18:54:06
 * @Last Modified by: stupid cat
 * @Last Modified time: 2017-12-15 15:03:11
 *
 * This project uses the AGPLv3 license. Please read the license file before using/adapting any of the code.
 */

const Builder = require('../structures/TagBuilder'),
    bbEngine = require('../structures/BBTagEngine');

module.exports =
    Builder.AutoTag('repeat')
        .withAlias('loop')
        .withArgs(a => [a.require('text'), a.require('amount')])
        .withDesc('Repeats `text` `amount` times. `text` will be interpreted as BBTag code')
        .withExample(
            '{repeat;e;10}',
            'eeeeeeeeee'
        ).resolveArgs(1)
        .whenArgs('0-1', Builder.errors.notEnoughArguments)
        .whenArgs(2, async function (subtag, context, args) {
            let fallback = bu.parseInt(context.scope.fallback),
                amount = bu.parseInt(args[1]),
                result = '';


            if (isNaN(amount)) amount = fallback;
            if (isNaN(amount)) return Builder.errors.notANumber(subtag, context);

            if (amount < 0) return Builder.util.error(subtag, context, 'Cant be negative');

            for (let i = 0; i < amount; i++) {
                context.state.repeats += 1;
                if (context.state.repeats > 1500) {
                    result += Builder.errors.tooManyLoops(subtag, context);
                    break;
                }
                result += await bbEngine.execute(args[0], context);
                if (context.state.return != 0)
                    break;
            }
            return result;
        }).whenDefault(Builder.errors.tooManyArguments)
        .build();