import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { getTag, getAllTagNames, createTag, deleteTag, useTag } from '../../services/tagsService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('tag')
    .setDescription('Manage and use saved tags (custom commands)')
    .addSubcommand(s =>
      s.setName('show')
        .setDescription('Show a tag')
        .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true))
        .addUserOption(o => o.setName('user').setDescription('Mention a user with the tag'))
    )
    .addSubcommand(s =>
      s.setName('create')
        .setDescription('Create a new tag')
        .addStringOption(o => o.setName('name').setDescription('Tag name (one word)').setRequired(true))
        .addStringOption(o => o.setName('content').setDescription('Tag content').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('delete')
        .setDescription('Delete a tag (admins can delete any tag)')
        .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('list')
        .setDescription('List all tags in this server')
    )
    .addSubcommand(s =>
      s.setName('info')
        .setDescription('View info about a specific tag')
        .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true))
    ),

  category: 'Tags',

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    try {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;

      if (sub === 'show') {
        const name = interaction.options.getString('name', true);
        const mentionUser = interaction.options.getUser('user');
        const tag = await useTag(client, guildId, name);
        if (!tag) {
          await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(`Tag \`${name}\` not found. Use \`/tag list\` to see all tags.`)],
          });
          return;
        }
        const prefix = mentionUser ? `${mentionUser}, ` : '';
        await InteractionHelper.safeEditReply(interaction, {
          content: `${prefix}${tag.content}`,
          allowedMentions: { users: mentionUser ? [mentionUser.id] : [] },
        });
        return;
      }

      if (sub === 'create') {
        const name = interaction.options.getString('name', true).toLowerCase().trim().replace(/\s+/g, '-');
        const content = interaction.options.getString('content', true);
        if (name.length > 32) {
          await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed('Tag name must be 32 characters or less.')],
          });
          return;
        }
        const result = await createTag(client, guildId, name, content, interaction.user.id);
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            result.success
              ? successEmbed(`Tag \`${name}\` created! Use \`/tag show name:${name}\` to use it.`, '✅ Tag Created')
              : errorEmbed(result.reason),
          ],
        });
        return;
      }

      if (sub === 'delete') {
        const name = interaction.options.getString('name', true);
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
        const result = await deleteTag(client, guildId, name, interaction.user.id, isAdmin);
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            result.success
              ? successEmbed(`Tag \`${name}\` deleted.`, '✅ Tag Deleted')
              : errorEmbed(result.reason),
          ],
        });
        return;
      }

      if (sub === 'list') {
        const names = await getAllTagNames(client, guildId);
        if (!names.length) {
          await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({ title: '🏷️ Tags', description: 'No tags yet. Use `/tag create` to make one!', color: 'info' })],
          });
          return;
        }
        const sorted = [...names].sort();
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: `🏷️ Tags (${sorted.length})`,
              description: sorted.map(n => `\`${n}\``).join(', '),
              color: 'primary',
              footer: 'Use /tag show name:<tag> to use a tag',
            }),
          ],
        });
        return;
      }

      if (sub === 'info') {
        const name = interaction.options.getString('name', true);
        const tag = await getTag(client, guildId, name);
        if (!tag) {
          await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(`Tag \`${name}\` not found.`)],
          });
          return;
        }
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: `🏷️ Tag: ${tag.name}`,
              color: 'primary',
              fields: [
                { name: 'Content', value: tag.content.substring(0, 1024), inline: false },
                { name: 'Created by', value: `<@${tag.authorId}>`, inline: true },
                { name: 'Uses', value: String(tag.uses ?? 0), inline: true },
                { name: 'Created', value: `<t:${Math.floor(tag.createdAt / 1000)}:R>`, inline: true },
              ],
            }),
          ],
        });
      }
    } catch (err) {
      logger.error('Tags command error:', err);
      await handleInteractionError(interaction, err, { subtype: 'tags_failed' });
    }
  },
};
