const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

class UpdateAnnouncements {
    constructor(sqlInstance, api) {
        this.sql = sqlInstance;
        this.api = api;
        this.discordClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
            ],
        });
        this.discordToken = process.env.DISCORD_TOKEN; 
        this.discordClient.login(this.discordToken);

        // Ensure the client is ready before proceeding
        this.readyPromise = new Promise((resolve) => {
            this.discordClient.once('ready', () => {
                console.log('updateAnnouncements Discord client is ready.');
                resolve();
            });
        });

        // Set up message listener
        this.setupMessageListener();
    }

    setupMessageListener() {
        this.discordClient.on('messageCreate', async (message) => {
            // Ignore bot messages
            if (message.author.bot) return;

            try {
                await this.readyPromise;
                await this.handleAnnouncementMessage(message);
            } catch (error) {
                console.error('Error handling announcement message:', error);
            }
        });
    }

    async handleAnnouncementMessage(message) {
        // Get all announcement channels
        const announcementChannels = await this.sql.getAllAnnouncementChannels();
        
        // Check if the message is from an announcement channel
        const isAnnouncementChannel = announcementChannels.some(
            channel => channel.announcement_channel === message.channel.id
        );

        if (!isAnnouncementChannel) return;

        // Find the guild ID for this announcement channel
        const channelInfo = announcementChannels.find(
            channel => channel.announcement_channel === message.channel.id
        );

        if (!channelInfo) return;

        const guildId = channelInfo.guild_id;
        console.log(`Processing announcement from guild ${guildId}`);

        // Clean the message content (remove markdown, emojis, etc.)
        const cleanedContent = this.cleanMarkdown(message.content);
        
        // Forward the announcement to all alliance members in this guild
        await this.forwardAnnouncementToGuild(cleanedContent, guildId);
    }

    async forwardAnnouncementToGuild(content, guildId) {
        try {
            // Get all alliances for this guild
            const guildAlliances = await this.sql.getAllGuildAlliances(guildId);
            
            if (guildAlliances.length === 0) {
                console.log(`No alliances found for guild ${guildId}`);
                return;
            }

            console.log(`Found ${guildAlliances.length} alliances for guild ${guildId}`);

            // Send announcement to all alliance members using their specific manager tokens
            for (const alliance of guildAlliances) {
                try {
                    // Get the manager token for this specific alliance
                    const managerTokenResult = await this.sql.getManagerToken(alliance.allianceId);
                    
                    if (managerTokenResult.length === 0) {
                        console.log(`No manager token found for alliance ${alliance.tag} (${alliance.allianceId})`);
                        continue;
                    }

                    const managerToken = managerTokenResult[0].token;
                    await this.sendAnnouncementMail(content, managerToken, alliance.allianceId);
                    console.log(`Sent announcement to alliance ${alliance.tag} (${alliance.allianceId})`);
                    
                    // Add a small delay between requests to avoid rate limiting
                    await this.delay(500);
                } catch (error) {
                    console.error(`Failed to send announcement to alliance ${alliance.tag} (${alliance.allianceId}):`, error.message);
                }
            }
        } catch (error) {
            console.error(`Error forwarding announcement to guild ${guildId}:`, error);
        }
    }

    async sendAnnouncementMail(content, token, allianceId) {
        const url = "https://api-lok-live.leagueofkingdoms.com/api/mail/send";
        const body = new URLSearchParams({
            json: JSON.stringify({
                allianceId,
                subject: "Discord Announcement",
                content,
            })
        });
        const headers = { 
            "x-access-token": token,
            "Content-Type": "application/x-www-form-urlencoded"
        };

        const response = await this.api.request(url, body, headers);
        return response;
    }

    cleanMarkdown(content) {
        // Remove Discord mentions, emojis, and convert markdown to HTML
        content = content.replace(/<a?:\w+:\d+>|[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}-\u{2B55}\u{231A}-\u{231B}\u{2328}-\u{2328}\u{23CF}-\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}]/gu, '');
        content = content.replace(/<[@#]!?&?\d+>/g, '');
        
        // Handle combined bold and italic
        content = content.replace(/\*\*\*(.*?)\*\*\*/g, '<b><i>$1</i></b>');

        // Replace markdown with HTML tags
        content = content
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') // Bold
            .replace(/__(.*?)__/g, '<u>$1</u>') // Underline
            .replace(/\*(.*?)\*/g, '<i>$1</i>') // Italic
            .replace(/_(.*?)_/g, '<i>$1</i>') // Italic
            .replace(/~~(.*?)~~/g, '<del>$1</del>'); // Strikethrough

        // Remove other markdown
        content = content
            .replace(/`([^`]+)`/g, '$1') // Inline code
            .replace(/```[\s\S]+?```/g, '') // Code block
            .replace(/> (.+)/g, '$1') // Blockquote
            .replace(/(?:\*\s|\d+\.\s)(.+)/g, '$1'); // Lists

        return content.trim();
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async start() {
        await this.readyPromise;
        console.log('UpdateAnnouncements service is ready and listening for announcements.');
    }

    async stop() {
        if (this.discordClient) {
            await this.discordClient.destroy();
            console.log('UpdateAnnouncements Discord client disconnected.');
        }
    }
}

module.exports = UpdateAnnouncements;