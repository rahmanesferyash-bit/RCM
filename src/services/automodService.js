import { logger } from '../utils/logger.js';

function getAutomodKey(guildId) {
  return `guild:${guildId}:automod:settings`;
}

const defaultSettings = {
  enabled: false,
  filterLinks: false,
  filterInvites: false,
  filterProfanity: false,
  bannedWords: [],
  exemptRoles: [],
  exemptChannels: [],
  logChannelId: null,
  warnOnViolation: true,
  deleteOnViolation: true,
};

export async function getAutomodSettings(client, guildId) {
  try {
    const data = await client.db.get(getAutomodKey(guildId), {});
    return { ...defaultSettings, ...(data || {}) };
  } catch (err) {
    logger.error(`Error getting automod settings for ${guildId}:`, err);
    return { ...defaultSettings };
  }
}

export async function saveAutomodSettings(client, guildId, settings) {
  try {
    const current = await getAutomodSettings(client, guildId);
    await client.db.set(getAutomodKey(guildId), { ...current, ...settings });
    return true;
  } catch (err) {
    logger.error(`Error saving automod settings for ${guildId}:`, err);
    return false;
  }
}

export async function addBannedWord(client, guildId, word) {
  const settings = await getAutomodSettings(client, guildId);
  const normalized = word.toLowerCase().trim();
  if (settings.bannedWords.includes(normalized)) return false;
  settings.bannedWords.push(normalized);
  await saveAutomodSettings(client, guildId, { bannedWords: settings.bannedWords });
  return true;
}

export async function removeBannedWord(client, guildId, word) {
  const settings = await getAutomodSettings(client, guildId);
  const normalized = word.toLowerCase().trim();
  const idx = settings.bannedWords.indexOf(normalized);
  if (idx === -1) return false;
  settings.bannedWords.splice(idx, 1);
  await saveAutomodSettings(client, guildId, { bannedWords: settings.bannedWords });
  return true;
}

const URL_REGEX = /https?:\/\/[^\s]+/i;
const INVITE_REGEX = /(discord\.gg|discord\.com\/invite)\/[^\s]+/i;

export async function checkMessage(client, message) {
  if (!message.guild || message.author.bot) return null;

  const settings = await getAutomodSettings(client, message.guild.id);
  if (!settings.enabled) return null;

  // Check exempt roles
  if (settings.exemptRoles.length > 0) {
    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    if (member && member.roles.cache.some(r => settings.exemptRoles.includes(r.id))) return null;
  }

  // Check exempt channels
  if (settings.exemptChannels.includes(message.channel.id)) return null;

  const content = message.content.toLowerCase();
  let reason = null;

  if (settings.filterInvites && INVITE_REGEX.test(message.content)) {
    reason = 'Discord invite link';
  } else if (settings.filterLinks && URL_REGEX.test(message.content)) {
    reason = 'Unauthorized link';
  } else if (settings.filterProfanity || settings.bannedWords.length > 0) {
    const hit = settings.bannedWords.find(w => content.includes(w));
    if (hit) reason = `Banned word: \`${hit}\``;
  }

  if (!reason) return null;

  // Delete the message
  if (settings.deleteOnViolation) {
    await message.delete().catch(() => {});
  }

  // Warn the user
  if (settings.warnOnViolation) {
    message.channel
      .send({ content: `⚠️ ${message.author}, your message was removed: **${reason}**.` })
      .then(m => setTimeout(() => m.delete().catch(() => {}), 8000))
      .catch(() => {});
  }

  // Log it
  if (settings.logChannelId) {
    const logCh = await message.guild.channels.fetch(settings.logChannelId).catch(() => null);
    if (logCh && logCh.isTextBased() && 'send' in logCh) {
      const { createEmbed } = await import('../utils/embeds.js');
      logCh.send({
        embeds: [
          createEmbed({
            title: '🛡️ Automod Action',
            color: 'warning',
            fields: [
              { name: 'User', value: `${message.author.tag} (${message.author.id})`, inline: true },
              { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
              { name: 'Reason', value: reason, inline: false },
              { name: 'Message', value: message.content.substring(0, 500) || '(empty)', inline: false },
            ],
          }),
        ],
      }).catch(() => {});
    }
  }

  return reason;
}
