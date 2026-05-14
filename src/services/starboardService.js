import { logger } from '../utils/logger.js';

function getSettingsKey(guildId) {
  return `guild:${guildId}:starboard:settings`;
}
function getEntryKey(guildId, messageId) {
  return `guild:${guildId}:starboard:entry:${messageId}`;
}

const defaultSettings = {
  enabled: false,
  channelId: null,
  threshold: 3,
  emoji: '⭐',
  selfStar: false,
  ignoreBots: true,
  ignoredChannels: [],
};

export async function getStarboardSettings(client, guildId) {
  try {
    const data = await client.db.get(getSettingsKey(guildId), {});
    return { ...defaultSettings, ...(data || {}) };
  } catch (err) {
    logger.error(`Error getting starboard settings for ${guildId}:`, err);
    return { ...defaultSettings };
  }
}

export async function saveStarboardSettings(client, guildId, patch) {
  try {
    const current = await getStarboardSettings(client, guildId);
    await client.db.set(getSettingsKey(guildId), { ...current, ...patch });
    return true;
  } catch (err) {
    logger.error(`Error saving starboard settings for ${guildId}:`, err);
    return false;
  }
}

export async function getStarboardEntry(client, guildId, messageId) {
  try {
    return await client.db.get(getEntryKey(guildId, messageId), null);
  } catch { return null; }
}

export async function saveStarboardEntry(client, guildId, messageId, entry) {
  try {
    await client.db.set(getEntryKey(guildId, messageId), entry);
  } catch (err) {
    logger.error(`Error saving starboard entry:`, err);
  }
}

export async function handleStarReaction(client, reaction, user) {
  try {
    if (reaction.partial) await reaction.fetch().catch(() => {});
    if (reaction.message.partial) await reaction.message.fetch().catch(() => {});

    const message = reaction.message;
    if (!message.guild) return;

    const settings = await getStarboardSettings(client, message.guild.id);
    if (!settings.enabled || !settings.channelId) return;
    if (reaction.emoji.name !== settings.emoji) return;
    if (settings.ignoredChannels.includes(message.channel.id)) return;
    if (message.channel.id === settings.channelId) return;
    if (settings.ignoreBots && message.author?.bot) return;
    if (!settings.selfStar && message.author?.id === user.id) {
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }

    const starCount = reaction.count ?? 0;

    const starCh = await message.guild.channels.fetch(settings.channelId).catch(() => null);
    if (!starCh || !starCh.isTextBased() || !('send' in starCh)) return;

    const existing = await getStarboardEntry(client, message.guild.id, message.id);
    const { EmbedBuilder } = await import('discord.js');

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setAuthor({ name: message.author?.tag ?? 'Unknown', iconURL: message.author?.displayAvatarURL() })
      .setDescription(message.content || null)
      .addFields({ name: 'Source', value: `[Jump to message](${message.url})`, inline: true })
      .setTimestamp(message.createdAt);

    if (message.attachments.size > 0) {
      const img = message.attachments.find(a => a.contentType?.startsWith('image/'));
      if (img) embed.setImage(img.url);
    }

    const content = `${settings.emoji} **${starCount}** <#${message.channel.id}>`;

    if (existing?.starboardMessageId) {
      // Update existing starboard post
      const starMsg = await starCh.messages.fetch(existing.starboardMessageId).catch(() => null);
      if (starMsg) {
        await starMsg.edit({ content, embeds: [embed] }).catch(() => {});
      }
      await saveStarboardEntry(client, message.guild.id, message.id, { ...existing, starCount });
    } else if (starCount >= settings.threshold) {
      // Post for the first time
      const sent = await starCh.send({ content, embeds: [embed] }).catch(() => null);
      if (sent) {
        await saveStarboardEntry(client, message.guild.id, message.id, {
          originalMessageId: message.id,
          starboardMessageId: sent.id,
          authorId: message.author?.id,
          channelId: message.channel.id,
          starCount,
          postedAt: Date.now(),
        });
      }
    }
  } catch (err) {
    logger.error('[starboard] handleStarReaction error:', err);
  }
}
