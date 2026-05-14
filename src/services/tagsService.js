import { logger } from '../utils/logger.js';

function getTagKey(guildId, name) {
  return `guild:${guildId}:tags:${name.toLowerCase().trim()}`;
}
function getTagListKey(guildId) {
  return `guild:${guildId}:tags:_index`;
}

export async function getTag(client, guildId, name) {
  try {
    return await client.db.get(getTagKey(guildId, name), null);
  } catch { return null; }
}

export async function getAllTagNames(client, guildId) {
  try {
    const index = await client.db.get(getTagListKey(guildId), []);
    return Array.isArray(index) ? index : [];
  } catch { return []; }
}

export async function createTag(client, guildId, name, content, authorId) {
  const normalized = name.toLowerCase().trim();
  const existing = await getTag(client, guildId, normalized);
  if (existing) return { success: false, reason: 'Tag already exists.' };

  try {
    await client.db.set(getTagKey(guildId, normalized), {
      name: normalized,
      content,
      authorId,
      createdAt: Date.now(),
      uses: 0,
    });
    const index = await getAllTagNames(client, guildId);
    if (!index.includes(normalized)) {
      index.push(normalized);
      await client.db.set(getTagListKey(guildId), index);
    }
    return { success: true };
  } catch (err) {
    logger.error(`Error creating tag ${normalized} for ${guildId}:`, err);
    return { success: false, reason: 'Database error.' };
  }
}

export async function deleteTag(client, guildId, name, requesterId, isAdmin = false) {
  const normalized = name.toLowerCase().trim();
  const tag = await getTag(client, guildId, normalized);
  if (!tag) return { success: false, reason: 'Tag not found.' };
  if (!isAdmin && tag.authorId !== requesterId) return { success: false, reason: 'You can only delete your own tags.' };

  try {
    await client.db.delete(getTagKey(guildId, normalized));
    const index = await getAllTagNames(client, guildId);
    const filtered = index.filter(t => t !== normalized);
    await client.db.set(getTagListKey(guildId), filtered);
    return { success: true };
  } catch (err) {
    logger.error(`Error deleting tag ${normalized} for ${guildId}:`, err);
    return { success: false, reason: 'Database error.' };
  }
}

export async function useTag(client, guildId, name) {
  const normalized = name.toLowerCase().trim();
  const tag = await getTag(client, guildId, normalized);
  if (!tag) return null;
  try {
    await client.db.set(getTagKey(guildId, normalized), { ...tag, uses: (tag.uses || 0) + 1 });
  } catch { /* non-critical */ }
  return tag;
}
