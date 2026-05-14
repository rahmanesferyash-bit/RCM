import { Events } from 'discord.js';
import { handleStarReaction } from '../services/starboardService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageReactionAdd,
  async execute(reaction, user, client) {
    try {
      if (user.bot) return;
      await handleStarReaction(client, reaction, user);
    } catch (err) {
      logger.error('Error in messageReactionAdd event:', err);
    }
  },
};
