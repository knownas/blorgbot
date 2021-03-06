/*
 * @Author: stupid cat
 * @Date: 2017-05-21 00:22:32
 * @Last Modified by: stupid cat
 * @Last Modified time: 2018-03-19 14:13:57
 *
 * This project uses the AGPLv3 license. Please read the license file before using/adapting any of the code.
 */

const Builder = require('../structures/TagBuilder');

module.exports =
    Builder.CCommandTag('rolecreate')
        .requireStaff()
        .withArgs(a => [
            a.require('name'),
            a.optional('color'),
            a.optional('permissions'),
            a.optional('mentionable'),
            a.optional('hoisted')
        ])
        .withDesc('Creates a role with the given information. ' +
            '`color` can be a [HTML color](https://www.w3schools.com/colors/colors_names.asp), hex, (r,g,b) or a valid color number. ' +
            'Provide `permissions` as a number, which can be calculated [here](https://discordapi.com/permissions.html) ' +
            '`hoisted` is if the role should be displayed separately from other roles ' +
            '`color` defaults to #000000 (uncolored role), `permissions` defaults to 0, `mentionable` defaults to false, `hoisted` defaults to false. ' +
            'Returns the new role\'s ID.')
        .withExample(
            '{rolecreate;Super Cool Role!;ff0000;0;false;true}',
            '11111111111111111'
        )
        .whenArgs(0, Builder.errors.notEnoughArguments)
        .whenArgs('1-5', async function (subtag, context, args) {
            let errors = [],
                options = {
                    name: args[0],
                    color: bu.parseColor(args[1]) || 0,
                    permissions: bu.parseInt(args[2] || 0),
                    mentionable: bu.parseBoolean(args[3], false),
                    hoisted: bu.parseBoolean(args[4], false)
                };

            if (isNaN(options.permissions))
                return Builder.util.error(subtag, context, 'Permissions not a number');

            try {
                let role = await context.guild.createRole(options, `Created with a custom command command, executed by user: ${context.user.id}`);
                if (!context.guild.roles.get(role.id))
                    context.guild.roles.add(role);
                return role.id;
            } catch (err) {
                console.error(err.stack);
                return Builder.util.error(subtag, context, 'Failed to create role: no perms');
            }
        })
        .whenDefault(Builder.errors.tooManyArguments)
        .build();

