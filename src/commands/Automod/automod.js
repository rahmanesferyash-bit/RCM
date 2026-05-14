import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import {
  getAutomodSettings,
  saveAutomodSettings,
  addBannedWord,
  removeBannedWord,
} from '../../services/automodService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure automatic moderation')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s =>
      s.setName('setup')
        .setDescription('Configure automod settings')
        .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable automod').setRequired(true))
        .addBooleanOption(o => o.setName('filter_links').setDescription('Delete messages containing URLs'))
        .addBooleanOption(o => o.setName('filter_invites').setDescription('Delete Discord invite links'))
        .addChannelOption(o => o.setName('log_channel').setDescription('Channel to log automod actions'))
        .addBooleanOption(o => o.setName('warn_on_violation').setDescription('Send a warning message to the user (default: true)'))
    )
    .addSubcommand(s =>
      s.setName('addword')
        .setDescription('Add a banned word or phrase')
        .addStringOption(o => o.setName('word').setDescription('Word or phrase to ban').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('removeword')
        .setDescription('Remove a banned word or phrase')
        .addStringOption(o => o.setName('word').setDescription('Word or phrase to remove').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('listwords')
        .setDescription('List all banned words')
    )
    .addSubcommand(s =>
      s.setName('exempt')
        .setDescription('Exempt a role or channel from automod')
        .addRoleOption(o => o.setName('role').setDescription('Role to exempt'))
        .addChannelOption(o => o.setName('channel').setDescription('Channel to exempt'))
    )
    .addSubcommand(s =>
      s.setName('status')
        .setDescription('View current automod configuration')
    ),

  category: 'Automod',

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;

      if (sub === 'setup') {
        const enabled = interaction.options.getBoolean('enabled');
        const filterLinks = interaction.options.getBoolean('filter_links');
        const filterInvites = interaction.options.getBoolean('filter_invites');
        const logChannel = interaction.options.getChannel('log_channel');
        const warnOnViolation = interaction.options.getBoolean('warn_on_violation');

        const patch = { enabled };
        if (filterLinks !== null) patch.filterLinks = filterLinks;
        if (filterInvites !== null) patch.filterInvites = filterInvites;
        if (logChannel) patch.logChannelId = logChannel.id;
        if (warnOnViolation !== null) patch.warnOnViolation = warnOnViolation;

        await saveAutomodSettings(client, guildId, patch);

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              [
                `**Status:** ${enabled ? '✅ Enabled' : '❌ Disabled'}`,
                filterLinks !== null ? `**Filter Links:** ${filterLinks ? '✅' : '❌'}` : null,
                filterInvites !== null ? `**Filter Invites:** ${filterInvites ? '✅' : '❌'}` : null,
                logChannel ? `**Log Channel:** <#${logChannel.id}>` : null,
              ].filter(Boolean).join('\n'),
              '🛡️ Automod Updated',
            ),
          ],
        });
        return;
      }

      if (sub === 'addword') {
        const word = interaction.options.getString('word', true);
        const added = await addBannedWord(client, guildId, word);
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            added
              ? successEmbed(`Added **${word}** to the banned words list.`, '✅ Word Banned')
              : errorEmbed(`**${word}** is already on the banned words list.`),
          ],
        });
        return;
      }

      if (sub === 'removeword') {
        const word = interaction.options.getString('word', true);
        const removed = await removeBannedWord(client, guildId, word);
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            removed
              ? successEmbed(`Removed **${word}** from the banned words list.`, '✅ Word Removed')
              : errorEmbed(`**${word}** was not found in the banned words list.`),
          ],
        });
        return;
      }

      if (sub === 'listwords') {
        const settings = await getAutomodSettings(client, guildId);
        if (!settings.bannedWords.length) {
          await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({ title: '🔤 Banned Words', description: 'No banned words configured. Use `/automod addword` to add some.', color: 'info' })],
          });
          return;
        }
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: `🔤 Banned Words (${settings.bannedWords.length})`,
              description: settings.bannedWords.map(w => `\`${w}\``).join(', '),
              color: 'primary',
            }),
          ],
        });
        return;
      }

      if (sub === 'exempt') {
        const role = interaction.options.getRole('role');
        const channel = interaction.options.getChannel('channel');
        if (!role && !channel) {
          await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Please provide a role or channel to exempt.')],
          });
          return;
        }
        const settings = await getAutomodSettings(client, guildId);
        const patch = {};
        const added = [];
        if (role && !settings.exemptRoles.includes(role.id)) {
          patch.exemptRoles = [...settings.exemptRoles, role.id];
          added.push(`Role: ${role}`);
        }
        if (channel && !settings.exemptChannels.includes(channel.id)) {
          patch.exemptChannels = [...settings.exemptChannels, channel.id];
          added.push(`Channel: <#${channel.id}>`);
        }
        if (!added.length) {
          await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Already exempted.')] });
          return;
        }
        await saveAutomodSettings(client, guildId, patch);
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(added.join('\n'), '✅ Exemptions Added')],
        });
        return;
      }

      if (sub === 'status') {
        const settings = await getAutomodSettings(client, guildId);
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: '🛡️ Automod Configuration',
              color: settings.enabled ? 'success' : 'error',
              fields: [
                { name: 'Status', value: settings.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Filter Links', value: settings.filterLinks ? '✅' : '❌', inline: true },
                { name: 'Filter Invites', value: settings.filterInvites ? '✅' : '❌', inline: true },
                { name: 'Warn on Violation', value: settings.warnOnViolation ? '✅' : '❌', inline: true },
                { name: 'Log Channel', value: settings.logChannelId ? `<#${settings.logChannelId}>` : 'None', inline: true },
                { name: 'Banned Words', value: settings.bannedWords.length ? String(settings.bannedWords.length) : 'None', inline: true },
                { name: 'Exempt Roles', value: settings.exemptRoles.length ? settings.exemptRoles.map(id => `<@&${id}>`).join(', ') : 'None', inline: false },
                { name: 'Exempt Channels', value: settings.exemptChannels.length ? settings.exemptChannels.map(id => `<#${id}>`).join(', ') : 'None', inline: false },
              ],
            }),
          ],
        });
      }
    } catch (err) {
      logger.error('Automod command error:', err);
      await handleInteractionError(interaction, err, { subtype: 'automod_failed' });
    }
  },
};
