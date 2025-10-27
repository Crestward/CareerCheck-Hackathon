/**
 * MCP Client: Multi-Agent Coordination Protocol
 *
 * Handles communication between agents via Tiger MCP
 * Provides message passing, channel management, and coordination
 */

export class MCPClient {
  /**
   * Initialize MCP client
   *
   * @param {Object} config - MCP configuration
   * @param {string} config.apiKey - Tiger MCP API key
   * @param {string} config.workspace - Workspace name
   * @param {string} config.region - Region (default: us-east-1)
   */
  constructor(config) {
    this.apiKey = config.apiKey || process.env.TIGER_MCP_KEY;
    this.workspace = config.workspace || 'resume-analyzer';
    this.region = config.region || 'us-east-1';

    if (!this.apiKey) {
      console.warn('[MCP] No API key provided, running in fallback mode');
      this.fallbackMode = true;
    }

    this.channels = new Map();
    this.messages = new Map();
    this.agentRegistry = new Map();

    console.log(`[MCP] Initialized for workspace: ${this.workspace}`);
  }

  /**
   * Create a communication channel for an agent
   *
   * @param {Object} config - Channel configuration
   * @param {string} config.name - Channel name
   * @param {string} config.agentType - Type of agent
   * @param {string} config.priority - Channel priority
   * @returns {Promise<Object>} Channel information
   */
  async createChannel(config) {
    const channelId = this.generateChannelId(config.agentType);

    this.log(`Creating channel: ${channelId}`);

    try {
      const channel = {
        channelId,
        agentType: config.agentType,
        name: config.name,
        priority: config.priority || 'normal',
        status: 'open',
        createdAt: new Date(),
        messages: [],
        buffer: []
      };

      // Register channel
      this.channels.set(channelId, channel);
      this.messages.set(channelId, []);

      return {
        channelId,
        status: 'open',
        agentType: config.agentType
      };

    } catch (error) {
      this.log(`❌ Error creating channel: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send a message through a channel
   *
   * @param {string} channelId - Channel identifier
   * @param {Object} message - Message to send
   * @returns {Promise<Object>} Message acknowledgment
   */
  async send(channelId, message) {
    try {
      const channel = this.channels.get(channelId);
      if (!channel) {
        throw new Error(`Channel not found: ${channelId}`);
      }

      const messageObject = {
        messageId: this.generateMessageId(),
        channelId,
        timestamp: new Date(),
        type: message.type || 'request',
        payload: message.payload || message,
        status: 'sent'
      };

      // Store message
      const messages = this.messages.get(channelId) || [];
      messages.push(messageObject);
      this.messages.set(channelId, messages);

      // Add to channel buffer
      channel.buffer.push(messageObject);

      this.log(`Message sent on ${channelId}:`, messageObject.messageId);

      return {
        messageId: messageObject.messageId,
        status: 'sent'
      };

    } catch (error) {
      this.log(`❌ Error sending message: ${error.message}`);
      throw error;
    }
  }

  /**
   * Receive messages from a channel
   *
   * @param {string} channelId - Channel identifier
   * @param {Object} options - Options
   * @param {number} options.timeout - Wait timeout in ms
   * @returns {Promise<Object>} Received message
   */
  async receive(channelId, options = {}) {
    const timeout = options.timeout || 30000; // 30 second default
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        try {
          const channel = this.channels.get(channelId);
          if (!channel) {
            throw new Error(`Channel not found: ${channelId}`);
          }

          // Check for buffered messages
          if (channel.buffer.length > 0) {
            clearInterval(checkInterval);
            const message = channel.buffer.shift();
            this.log(`Message received on ${channelId}:`, message.messageId);
            resolve(message.payload);
            return;
          }

          // Check timeout
          if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval);
            reject(new Error(`Receive timeout on channel: ${channelId}`));
          }

        } catch (error) {
          clearInterval(checkInterval);
          reject(error);
        }
      }, 100); // Check every 100ms
    });
  }

  /**
   * Register an agent in the MCP registry
   *
   * @param {string} agentId - Unique agent identifier
   * @param {string} agentType - Type of agent
   * @param {Object} agentInfo - Agent metadata
   */
  registerAgent(agentId, agentType, agentInfo) {
    this.agentRegistry.set(agentId, {
      agentId,
      agentType,
      ...agentInfo,
      registeredAt: new Date(),
      status: 'registered'
    });

    this.log(`Agent registered: ${agentId} (${agentType})`);
  }

  /**
   * Unregister an agent
   *
   * @param {string} agentId - Agent identifier
   */
  unregisterAgent(agentId) {
    this.agentRegistry.delete(agentId);
    this.log(`Agent unregistered: ${agentId}`);
  }

  /**
   * Get registered agent
   *
   * @param {string} agentId - Agent identifier
   * @returns {Object} Agent information
   */
  getAgent(agentId) {
    return this.agentRegistry.get(agentId);
  }

  /**
   * Get all registered agents
   *
   * @returns {Map} All registered agents
   */
  getAllAgents() {
    return this.agentRegistry;
  }

  /**
   * Close a channel
   *
   * @param {string} channelId - Channel identifier
   */
  async closeChannel(channelId) {
    try {
      const channel = this.channels.get(channelId);
      if (!channel) {
        throw new Error(`Channel not found: ${channelId}`);
      }

      channel.status = 'closed';
      channel.closedAt = new Date();

      this.log(`Channel closed: ${channelId}`);

    } catch (error) {
      this.log(`❌ Error closing channel: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get channel status
   *
   * @param {string} channelId - Channel identifier
   * @returns {Object} Channel status
   */
  getChannelStatus(channelId) {
    const channel = this.channels.get(channelId);
    if (!channel) {
      return { status: 'not-found' };
    }

    return {
      channelId,
      status: channel.status,
      agentType: channel.agentType,
      messageCount: this.messages.get(channelId)?.length || 0,
      bufferedMessages: channel.buffer.length,
      createdAt: channel.createdAt
    };
  }

  /**
   * Broadcast message to all agents of a type
   *
   * @param {string} agentType - Agent type to broadcast to
   * @param {Object} message - Message to broadcast
   */
  async broadcast(agentType, message) {
    const agents = Array.from(this.agentRegistry.values())
      .filter(a => a.agentType === agentType);

    this.log(`Broadcasting to ${agents.length} ${agentType} agents`);

    const results = [];
    for (const agent of agents) {
      if (agent.channelId) {
        try {
          await this.send(agent.channelId, message);
          results.push({ agentId: agent.agentId, status: 'sent' });
        } catch (error) {
          results.push({ agentId: agent.agentId, status: 'failed', error: error.message });
        }
      }
    }

    return results;
  }

  /**
   * Collect responses from agents
   *
   * @param {Array<string>} agentIds - Agent identifiers
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Array>} Responses from agents
   */
  async collectResponses(agentIds, timeout = 30000) {
    const startTime = Date.now();
    const responses = [];

    for (const agentId of agentIds) {
      const agent = this.getAgent(agentId);
      if (!agent || !agent.channelId) {
        continue;
      }

      try {
        const remainingTimeout = timeout - (Date.now() - startTime);
        if (remainingTimeout <= 0) {
          break;
        }

        const response = await this.receive(agent.channelId, { timeout: remainingTimeout });
        responses.push({
          agentId,
          response,
          receivedAt: new Date()
        });

      } catch (error) {
        responses.push({
          agentId,
          error: error.message,
          status: 'timeout'
        });
      }
    }

    return responses;
  }

  /**
   * Get MCP health status
   *
   * @returns {Object} Health information
   */
  getHealthStatus() {
    return {
      status: this.fallbackMode ? 'fallback' : 'connected',
      workspace: this.workspace,
      activeChannels: this.channels.size,
      registeredAgents: this.agentRegistry.size,
      totalMessages: Array.from(this.messages.values()).reduce((sum, msgs) => sum + msgs.length, 0)
    };
  }

  /**
   * Generate unique channel ID
   *
   * @private
   */
  generateChannelId(agentType) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `channel_${agentType}_${timestamp}_${random}`;
  }

  /**
   * Generate unique message ID
   *
   * @private
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Logging utility
   *
   * @private
   */
  log(message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [MCP] ${message}`;

    if (data) {
      console.log(logMessage, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    } else {
      console.log(logMessage);
    }
  }

  /**
   * Shutdown MCP client
   */
  async shutdown() {
    this.log('Shutting down...');

    // Close all channels
    for (const [channelId] of this.channels) {
      try {
        await this.closeChannel(channelId);
      } catch (error) {
        this.log(`Error closing channel during shutdown: ${error.message}`);
      }
    }

    // Clear registries
    this.channels.clear();
    this.messages.clear();
    this.agentRegistry.clear();

    this.log('✅ Shutdown complete');
  }
}

export default MCPClient;
