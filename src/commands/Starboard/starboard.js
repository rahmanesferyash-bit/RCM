import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { getStarboardSettings, saveStarboardSettings } from '../../services/starboardService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('starboard')
    .setDescription('Configure the starboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s =>
      s.setName('setup')
        .setDescription('Set up the starboard channel')
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('Channel to post starred messages in')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName('threshold')
            .setDescription('Number of ⭐ reactions needed (default: 3)')
            .setMinValue(1).setMaxValue(50)
        )
        .addStringOption(o =>
          o.setName('emoji')
            .setDescription('Reaction emoji to use (default: ⭐)')
        )
        .addBooleanOption(o =>
          o.setName('self_star')
            .setDescription('Allow users to star their own messages (default: false)')
        )
    )
    .addSubcommand(s =>
      s.setName('threshold')
        .setDescription('Change the star threshold')
        .addIntegerOption(o =>
          o.setName('count').setDescription('Minimum stars needed').setRequired(true).setMinValue(1).setMaxValue(50)
        )
    )
    .addSubcommand(s =>
      s.setName('toggle')
        .setDescription('Enable or disable the starboard')
        .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('ignore')
        .setDescription('Ignore a channel from being starred')
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('Channel to ignore')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName('status')
        .setDescription('View starboard configuration')
    ),

  category: 'Starboard',

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;

      if (sub === 'setup') {
        const channel = interaction.options.getChannel('channel', true);
        const threshold = interaction.options.getInteger('threshold') ?? 3;
        const emoji = interaction.options.getString('emoji') ?? '⭐';
        const selfStar = interaction.options.getBoolean('self_star') ?? false;

        await saveStarboardSettings(client, guildId, {
          enabled: true,
          channelId: channel.id,
          threshold,
          emoji,
          selfStar,
        });

        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              `**Channel:** <#${channel.id}>\n**Threshold:** ${threshold} ${emoji}\n**Self-star:** ${selfStar ? 'Allowed' : 'Not allowed'}`,
              '⭐ Starboard Set Up',
            ),
          ],
        });
        return;
      }

      if (sub === 'threshold') {
        const count = interaction.options.getInteger('count', true);
        await saveStarboardSettings(client, guildId, { threshold: count });
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`Star threshold set to **${count}**.`, '✅ Threshold Updated')],
        });
        return;
      }

      if (sub === 'toggle') {
        const enabled = interaction.options.getBoolean('enabled', true);
        const settings = await getStarboardSettings(client, guildId);
        if (enabled && !settings.channelId) {
          await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Set a starboard channel first using `/starboard setup`.')],
          });
          return;
        }
        await saveStarboardSettings(client, guildId, { enabled });
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`Starboard is now **${enabled ? 'enabled' : 'disabled'}**.`, '✅ Starboard Toggled')],
        });
        return;
      }

      if (sub === 'ignore') {
        const channel = interaction.options.getChannel('channel', true);
        const settings = await getStarboardSettings(client, guildId);
        if (settings.ignoredChannels.includes(channel.id)) {
          await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(`<#${channel.id}> is already ignored.`)],
          });
          return;
        }
        await saveStarboardSettings(client, guildId, {
          ignoredChannels: [...settings.ignoredChannels, channel.id],
        });
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(`<#${channel.id}> will no longer be starred.`, '✅ Channel Ignored')],
        });
        return;
      }

      if (sub === 'status') {
        const settings = await getStarboardSettings(client, guildId);
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: '⭐ Starboard Configuration',
              color: settings.enabled ? 'success' : 'error',
              fields: [
                { name: 'Status', value: settings.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Channel', value: settings.channelId ? `<#${settings.channelId}>` : 'Not set', inline: true },
                { name: 'Threshold', value: `${settings.threshold} ${settings.emoji}`, inline: true },
                { name: 'Self-star', value: settings.selfStar ? 'Allowed' : 'Not allowed', inline: true },
                { name: 'Ignored Channels', value: settings.ignoredChannels.length ? settings.ignoredChannels.map(id => `<#${id}>`).join(', ') : 'None', inline: false },
              ],
            }),
          ],
        });
      }
    } catch (err) {
      logger.error('Starboard command error:', err);
      await handleInteractionError(interaction, err, { subtype: 'starboard_failed' });
    }
  },
};
