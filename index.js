const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const { YouTubePlugin } = require('@distube/youtube');
const { SpotifyPlugin } = require('@distube/spotify');
const ffmpeg = require('ffmpeg-static');
require('dotenv').config();

// Set environment variables to disable update checks
process.env.YTSR_NO_UPDATE = 'true';
process.env.YTDL_NO_UPDATE = 'true';

// Bot configuration
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Rate limiting and retry configuration
const RATE_LIMIT_CONFIG = {
    maxRetries: 3,
    baseDelay: 2000, // 2 seconds
    maxDelay: 30000, // 30 seconds
    backoffFactor: 2
};

// Queue for managing requests
const requestQueue = new Map();

// Helper function to add delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Enhanced retry function with exponential backoff
async function retryWithBackoff(fn, context = 'operation', maxRetries = RATE_LIMIT_CONFIG.maxRetries) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            const isRateLimit = error.statusCode === 429 || 
                               error.message?.includes('429') ||
                               error.message?.includes('Too Many Requests') ||
                               error.message?.toLowerCase().includes('rate limit');
            
            if (!isRateLimit || attempt === maxRetries) {
                throw error;
            }
            
            const delayTime = Math.min(
                RATE_LIMIT_CONFIG.baseDelay * Math.pow(RATE_LIMIT_CONFIG.backoffFactor, attempt - 1),
                RATE_LIMIT_CONFIG.maxDelay
            );
            
            console.log(`[${context}] Rate limited (attempt ${attempt}/${maxRetries}), retrying in ${delayTime}ms...`);
            await delay(delayTime);
        }
    }
    
    throw lastError;
}

// DisTube configuration with enhanced rate limiting protection
const distube = new DisTube(client, {
    emitNewSongOnly: true,
    emitAddSongWhenCreatingQueue: false,
    emitAddListWhenCreatingQueue: false,
    ffmpeg: {
        path: ffmpeg
    },
    plugins: [
        new YtDlpPlugin({
            update: false,
            retries: 3
        }),
        new YouTubePlugin({
            cookies: [], 
            ytdlOptions: {
                highWaterMark: 1 << 25,
                quality: 'highestaudio',
                filter: 'audioonly',
                format: 'bestaudio[ext=webm+acodec=opus+asr=48000]/bestaudio',
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-us,en;q=0.5',
                        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
                        'Sec-Ch-Ua-Mobile': '?0',
                        'Sec-Ch-Ua-Platform': '"Windows"',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Sec-Fetch-User': '?1',
                        'Upgrade-Insecure-Requests': '1'
                    },
                    timeout: 30000 // 30 second timeout
                },
                retries: 3,
                retry: {
                    retries: 3,
                    factor: 2,
                    minTimeout: 1000,
                    maxTimeout: 60000,
                    randomize: true
                }
            }
        }),
        new SpotifyPlugin()
    ],
    customFilters: {
        "8D": "apulsator=hz=0.125",
        "bassboost": "bass=g=20,dynaudnorm=f=200",
        "echo": "aecho=0.8:0.9:1000:0.3",
        "karaoke": "pan=mono|c0=0.5*c0+-0.5*c1",
        "nightcore": "aresample=48000,asetrate=48000*1.25",
        "reverse": "areverse",
        "vaporwave": "aresample=48000,asetrate=48000*0.8"
    }
});

// Helper function to safely get error message
function getErrorMessage(error) {
    if (typeof error === 'string') return error;
    if (error && error.message) return error.message;
    if (error && error.toString) return error.toString();
    return 'Unknown error occurred';
}

// Helper function to detect URLs
function isUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Helper function to detect common music platform URLs
function isMusicUrl(query) {
    const urlPatterns = [
        /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/i,
        /^https?:\/\/(www\.)?spotify\.com/i,
        /^https?:\/\/(www\.)?soundcloud\.com/i,
        /^https?:\/\/(www\.)?music\.apple\.com/i,
        /^https?:\/\/(www\.)?deezer\.com/i,
        /^https?:\/\/(www\.)?tidal\.com/i,
        /^https?:\/\/(www\.)?pandora\.com/i,
        /^https?:\/\//i
    ];
    
    return urlPatterns.some(pattern => pattern.test(query)) || isUrl(query);
}

// Enhanced error logging function
function logError(context, error) {
    console.error(`[${context}] Error:`, {
        message: error.message || error,
        stack: error.stack,
        name: error.name,
        code: error.code,
        statusCode: error.statusCode,
        timestamp: new Date().toISOString()
    });
}

// Enhanced queue management for rate limiting
function canMakeRequest(guildId) {
    const now = Date.now();
    const lastRequest = requestQueue.get(guildId);
    
    if (!lastRequest || now - lastRequest > 5000) { // 5 second cooldown per guild
        requestQueue.set(guildId, now);
        return true;
    }
    
    return false;
}

// DisTube Events with enhanced error handling
distube.on('playSong', (queue, song) => {
    try {
        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('🎵 Now Playing')
            .setDescription(`**[${song.name}](${song.url})**`)
            .addFields(
                { name: '⏱️ Duration', value: `\`${song.formattedDuration}\``, inline: true },
                { name: '👤 Requested by', value: song.user.toString(), inline: true },
                { name: '📍 Position', value: `\`${queue.songs.indexOf(song) + 1}/${queue.songs.length}\``, inline: true }
            )
            .setThumbnail(song.thumbnail)
            .setFooter({ 
                text: `🔊 Volume: ${queue.volume}% • 🎶 Queue: ${queue.songs.length} songs`,
                iconURL: client.user?.displayAvatarURL() || null
            })
            .setTimestamp();

        if (queue.textChannel && typeof queue.textChannel.send === 'function') {
            queue.textChannel.send({ embeds: [embed] }).catch(err => {
                logError('playSong message send', err);
            });
        }
    } catch (error) {
        logError('playSong event', error);
    }
});

distube.on('addSong', (queue, song) => {
    try {
        const embed = new EmbedBuilder()
            .setColor('#4ECDC4')
            .setTitle('✅ Song Added to Queue')
            .setDescription(`**[${song.name}](${song.url})**`)
            .addFields(
                { name: '⏱️ Duration', value: `\`${song.formattedDuration}\``, inline: true },
                { name: '👤 Requested by', value: song.user.toString(), inline: true },
                { name: '🔢 Position', value: `\`#${queue.songs.length}\``, inline: true }
            )
            .setThumbnail(song.thumbnail)
            .setFooter({ 
                text: `🎵 Total songs in queue: ${queue.songs.length}`,
                iconURL: client.user?.displayAvatarURL() || null
            })
            .setTimestamp();

        if (queue.textChannel && typeof queue.textChannel.send === 'function') {
            queue.textChannel.send({ embeds: [embed] }).catch(err => {
                logError('addSong message send', err);
            });
        }
    } catch (error) {
        logError('addSong event', error);
    }
});

distube.on('addList', (queue, playlist) => {
    try {
        const embed = new EmbedBuilder()
            .setColor('#A8E6CF')
            .setTitle('📋 Playlist Added to Queue')
            .setDescription(`**[${playlist.name}](${playlist.url})**`)
            .addFields(
                { name: '🎵 Songs', value: `\`${playlist.songs.length}\``, inline: true },
                { name: '⏱️ Duration', value: `\`${playlist.formattedDuration}\``, inline: true },
                { name: '👤 Requested by', value: playlist.user.toString(), inline: true }
            )
            .setThumbnail(playlist.thumbnail)
            .setFooter({ 
                text: `🎶 Added ${playlist.songs.length} songs to queue`,
                iconURL: client.user?.displayAvatarURL() || null
            })
            .setTimestamp();

        if (queue.textChannel && typeof queue.textChannel.send === 'function') {
            queue.textChannel.send({ embeds: [embed] }).catch(err => {
                logError('addList message send', err);
            });
        }
    } catch (error) {
        logError('addList event', error);
    }
});

distube.on('searchResult', (message, result) => {
    try {
        let i = 0;
        const embed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('🔍 Search Results')
            .setDescription(
                `${result.map(song => `**${++i}**. [${song.name}](${song.url}) - \`${song.formattedDuration}\``).join('\n')}`
            )
            .setFooter({ 
                text: 'Choose a number from 1-10 or type "cancel" to cancel',
                iconURL: client.user?.displayAvatarURL() || null
            })
            .setTimestamp();

        message.channel.send({ embeds: [embed] }).catch(err => {
            logError('searchResult message send', err);
        });
    } catch (error) {
        logError('searchResult event', error);
    }
});

distube.on('searchCancel', (message) => {
    try {
        const embed = new EmbedBuilder()
            .setColor('#FFD93D')
            .setTitle('❌ Search Cancelled')
            .setDescription('Search has been cancelled!')
            .setTimestamp();

        message.channel.send({ embeds: [embed] }).catch(err => {
            logError('searchCancel message send', err);
        });
    } catch (error) {
        logError('searchCancel event', error);
    }
});

distube.on('searchInvalidAnswer', (message) => {
    try {
        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('❌ Invalid Selection')
            .setDescription('Please choose a number from 1-10 or type "cancel"!')
            .setTimestamp();

        message.channel.send({ embeds: [embed] }).catch(err => {
            logError('searchInvalidAnswer message send', err);
        });
    } catch (error) {
        logError('searchInvalidAnswer event', error);
    }
});

distube.on('searchNoResult', (message) => {
    try {
        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('❌ No Results Found')
            .setDescription('No search results found! Please try a different search term.')
            .setTimestamp();

        message.channel.send({ embeds: [embed] }).catch(err => {
            logError('searchNoResult message send', err);
        });
    } catch (error) {
        logError('searchNoResult event', error);
    }
});

// Enhanced error handler with specific rate limit handling
distube.on('error', (channel, error) => {
    logError('DisTube', error);
    
    // Check if channel is valid and has a send method
    if (!channel || typeof channel.send !== 'function') {
        console.error('Invalid channel object in DisTube error event:', channel);
        return;
    }
    
    const errorMessage = getErrorMessage(error);
    const isRateLimit = error.statusCode === 429 || 
                       errorMessage.includes('429') ||
                       errorMessage.includes('Too Many Requests') ||
                       errorMessage.toLowerCase().includes('rate limit');
    
    // Handle specific error types
    let userFriendlyMessage = 'An error occurred while processing your request.';
    let troubleshootingTips = 'Please try again later.';
    
    if (isRateLimit) {
        userFriendlyMessage = '⏰ Service is temporarily busy due to high demand.';
        troubleshootingTips = 'Please wait a few minutes before trying again. This helps prevent overloading the music services.';
    } else if (errorMessage.includes('Sign in to confirm your age')) {
        userFriendlyMessage = 'This video is age-restricted and cannot be played.';
        troubleshootingTips = 'Try searching for a different version of the song.';
    } else if (errorMessage.includes('Video unavailable')) {
        userFriendlyMessage = 'The requested video is unavailable.';
        troubleshootingTips = 'The video may be private, deleted, or region-locked. Try a different search term.';
    } else if (errorMessage.includes('No suitable format found')) {
        userFriendlyMessage = 'Unable to extract audio from this source.';
        troubleshootingTips = 'Try searching for the song with different keywords.';
    } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('network')) {
        userFriendlyMessage = 'Network connection error.';
        troubleshootingTips = 'Check your internet connection and try again.';
    }
    
    const embed = new EmbedBuilder()
        .setColor(isRateLimit ? '#FFD93D' : '#FF6B6B')
        .setTitle(isRateLimit ? '⏰ Please Wait' : '❌ Error Occurred')
        .setDescription(userFriendlyMessage)
        .addFields({
            name: '💡 Troubleshooting',
            value: troubleshootingTips
        })
        .setFooter({ 
            text: isRateLimit ? 'This helps keep the service running smoothly for everyone!' : 'If this problem persists, contact support',
            iconURL: client.user?.displayAvatarURL() || null
        })
        .setTimestamp();

    // Only show detailed error in development
    if (process.env.NODE_ENV === 'development') {
        embed.addFields({
            name: '🔧 Debug Info',
            value: `\`\`\`${errorMessage.slice(0, 1000)}\`\`\``
        });
    }

    channel.send({ embeds: [embed] }).catch(err => {
        logError('DisTube error message send', err);
    });
});

distube.on('empty', (queue) => {
    try {
        const embed = new EmbedBuilder()
            .setColor('#FFD93D')
            .setTitle('📭 Voice Channel Empty')
            .setDescription('The voice channel is empty! Leaving in 30 seconds...')
            .setFooter({ 
                text: 'Join the voice channel to continue listening',
                iconURL: client.user?.displayAvatarURL() || null
            })
            .setTimestamp();

        if (queue.textChannel && typeof queue.textChannel.send === 'function') {
            queue.textChannel.send({ embeds: [embed] }).catch(err => {
                logError('empty message send', err);
            });
        }
    } catch (error) {
        logError('empty event', error);
    }
});

distube.on('finish', (queue) => {
    try {
        const embed = new EmbedBuilder()
            .setColor('#A8E6CF')
            .setTitle('🎉 Queue Finished')
            .setDescription('All songs have been played! Add more songs to continue the party!')
            .setFooter({ 
                text: 'Use w!play to add more music',
                iconURL: client.user?.displayAvatarURL() || null
            })
            .setTimestamp();

        if (queue.textChannel && typeof queue.textChannel.send === 'function') {
            queue.textChannel.send({ embeds: [embed] }).catch(err => {
                logError('finish message send', err);
            });
        }
    } catch (error) {
        logError('finish event', error);
    }
});

distube.on('disconnect', (queue) => {
    try {
        const embed = new EmbedBuilder()
            .setColor('#95A5A6')
            .setTitle('👋 Disconnected')
            .setDescription('Successfully disconnected from the voice channel!')
            .setFooter({ 
                text: 'Thanks for using the music bot!',
                iconURL: client.user?.displayAvatarURL() || null
            })
            .setTimestamp();

        if (queue.textChannel && typeof queue.textChannel.send === 'function') {
            queue.textChannel.send({ embeds: [embed] }).catch(err => {
                logError('disconnect message send', err);
            });
        }
    } catch (error) {
        logError('disconnect event', error);
    }
});

distube.on('initQueue', (queue) => {
    try {
        queue.autoplay = false;
        queue.volume = 50;
    } catch (error) {
        logError('initQueue event', error);
    }
});

// Bot ready event
client.once('ready', () => {
    console.log(`✅ ${client.user.tag} is online and ready!`);
    console.log(`📊 Serving ${client.guilds.cache.size} guilds`);
    
    try {
        client.user.setActivity('to w!help | Music Bot', { type: ActivityType.Listening });
    } catch (error) {
        logError('setActivity', error);
    }
});

// Enhanced message handler with rate limiting protection
client.on('messageCreate', async (message) => {
    // Early returns for invalid messages
    if (message.author.bot || !message.content.startsWith('w!')) return;

    try {
        const args = message.content.slice(2).trim().split(/\s+/);
        const command = args.shift().toLowerCase();

        const voiceChannel = message.member?.voice?.channel;
        const queue = distube.getQueue(message.guild.id);

        // Check bot permissions
        if (voiceChannel) {
            const permissions = voiceChannel.permissionsFor(client.user);
            if (!permissions.has(['Connect', 'Speak'])) {
                const embed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Missing Permissions')
                    .setDescription('I need permission to connect and speak in your voice channel!')
                    .setFooter({ 
                        text: 'Please check my permissions and try again',
                        iconURL: client.user?.displayAvatarURL() || null
                    })
                    .setTimestamp();
                
                return message.reply({ embeds: [embed] });
            }
        }

        switch (command) {
            case 'play':
            case 'p': {
                if (!voiceChannel) {
                    const embed = new EmbedBuilder()
                        .setColor('#FF6B6B')
                        .setTitle('❌ Voice Channel Required')
                        .setDescription('You need to be in a voice channel to play music!')
                        .setFooter({ 
                            text: 'Join a voice channel and try again',
                            iconURL: client.user?.displayAvatarURL() || null
                        })
                        .setTimestamp();
                    
                    return message.reply({ embeds: [embed] });
                }

                if (!args.length) {
                    const embed = new EmbedBuilder()
                        .setColor('#FFD93D')
                        .setTitle('🎵 Song Required')
                        .setDescription('Please provide a song name and artist!')
                        .addFields({
                            name: '✅ Correct Usage',
                            value: '`w!play Never Gonna Give You Up - Rick Astley`\n`w!play Bohemian Rhapsody Queen`\n`w!play Despacito`'
                        })
                        .setFooter({ 
                            text: 'Song titles only - No URLs allowed!',
                            iconURL: client.user?.displayAvatarURL() || null
                        })
                        .setTimestamp();
                    
                    return message.reply({ embeds: [embed] });
                }

                const query = args.join(' ');
                
                // Check if the query contains a URL
                if (isMusicUrl(query)) {
                    const embed = new EmbedBuilder()
                        .setColor('#FF6B6B')
                        .setTitle('🚫 URLs Not Allowed')
                        .setDescription('Please do not use URLs! Only provide the song title and artist name.')
                        .addFields(
                            {
                                name: '❌ What NOT to do',
                                value: '`w!play https://youtube.com/watch?v=...`\n`w!play https://spotify.com/track/...`\n`w!play youtu.be/...`',
                                inline: false
                            },
                            {
                                name: '✅ What TO do instead',
                                value: '`w!play Never Gonna Give You Up - Rick Astley`\n`w!play Bohemian Rhapsody Queen`\n`w!play Shape of You Ed Sheeran`',
                                inline: false
                            },
                            {
                                name: '💡 Why?',
                                value: 'Using song titles ensures better search results and prevents broken links!',
                                inline: false
                            }
                        )
                        .setFooter({ 
                            text: 'Try again with just the song title and artist name',
                            iconURL: client.user?.displayAvatarURL() || null
                        })
                        .setTimestamp();
                    
                    return message.reply({ embeds: [embed] });
                }

                // Check rate limiting
                if (!canMakeRequest(message.guild.id)) {
                    const embed = new EmbedBuilder()
                        .setColor('#FFD93D')
                        .setTitle('⏰ Please Wait')
                        .setDescription('Please wait a moment before making another request.')
                        .addFields({
                            name: '💡 Why the wait?',
                            value: 'This helps prevent rate limiting and keeps the bot running smoothly for everyone!'
                        })
                        .setFooter({ 
                            text: 'Try again in a few seconds',
                            iconURL: client.user?.displayAvatarURL() || null
                        })
                        .setTimestamp();
                    
                    return message.reply({ embeds: [embed] });
                }
                
                try {
                    // Send a "searching" message
                    const searchEmbed = new EmbedBuilder()
                        .setColor('#FFD93D')
                        .setTitle('🔍 Searching...')
                        .setDescription(`Looking for: **${query}**\n\n*Please wait, this may take a moment due to service limits...*`)
                        .setTimestamp();
                    
                    const searchMessage = await message.channel.send({ embeds: [searchEmbed] });
                    
                    // Use retry mechanism for the play function
                    await retryWithBackoff(
                        () => distube.play(voiceChannel, query, {
                            textChannel: message.channel,
                            member: message.member
                        }),
                        `Play command for "${query}"`
                    );
                    
                    // Delete the searching message after successful play
                    searchMessage.delete().catch(() => {});
                    
                } catch (error) {
                    logError('Play command', error);
                    
                    const errorMessage = getErrorMessage(error);
                    const isRateLimit = error.statusCode === 429 || 
                                       errorMessage.includes('429') ||
                                       errorMessage.includes('Too Many Requests');
                    
                    const embed = new EmbedBuilder()
                        .setColor(isRateLimit ? '#FFD93D' : '#FF6B6B')
                        .setTitle(isRateLimit ? '⏰ Service Busy' : '❌ Playback Error')
                        .setDescription(
                            isRateLimit 
                                ? 'The music service is currently busy. Please try again in a few minutes.'
                                : `Unable to find or play the requested song.`
                        )
                        .addFields({
                            name: '💡 Troubleshooting Tips',
                            value: isRateLimit 
                                ? '• Wait 2-3 minutes before trying again\n• Try a different song\n• This helps prevent overloading the service'
                                : '• Check your spelling\n• Try adding the artist name\n• Use more specific search terms\n• Make sure the song exists on YouTube'
                        })
                        .setFooter({ 
                            text: isRateLimit 
                                ? 'Thanks for your patience!' 
                                : 'Example: w!play Despacito Luis Fonsi',
                            iconURL: client.user?.displayAvatarURL() || null
                        })
                        .setTimestamp();
                    
                    // Add debug info in development
                    if (process.env.NODE_ENV === 'development') {
                        embed.addFields({
                            name: '🔧 Debug Info',
                            value: `\`\`\`${errorMessage.slice(0, 500)}\`\`\``
                        });
                    }
                    
                    message.channel.send({ embeds: [embed] }).catch(err => {
                        logError('Play error message send', err);
                    });
                }
                break;
            }

            case 'stop': {
                if (!queue) {
                    const embed = new EmbedBuilder()
                        .setColor('#FFD93D')
                        .setTitle('❌ Nothing Playing')
                        .setDescription('There\'s no music currently playing!')
                        .setFooter({ 
                            text: 'Use w!play to start playing music',
                            iconURL: client.user?.displayAvatarURL() || null
                        })
                        .setTimestamp();
                    
                    return message.reply({ embeds: [embed] });
                }

                try {
                    distube.stop(message.guild.id);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#4ECDC4')
                        .setTitle('⏹️ Music Stopped')
                        .setDescription('Music has been stopped and queue cleared!')
                        .setFooter({ 
                            text: 'Use w!play to start playing music again',
                            iconURL: client.user?.displayAvatarURL() || null
                        })
                        .setTimestamp();
                    
                    message.channel.send({ embeds: [embed] });
                } catch (error) {
                    logError('Stop command', error);
                }
                break;
            }

            case 'skip':
            case 's': {
                if (!queue) {
                    const embed = new EmbedBuilder()
                        .setColor('#FFD93D')
                        .setTitle('❌ Nothing Playing')
                        .setDescription('There\'s no music currently playing!')
                        .setFooter({ 
                            text: 'Use w!play to start playing music',
                            iconURL: client.user?.displayAvatarURL() || null
                        })
                        .setTimestamp();
                    
                    return message.reply({ embeds: [embed] });
                }

                if (queue.songs.length === 1) {
                    const embed = new EmbedBuilder()
                        .setColor('#FFD93D')
                        .setTitle('❌ No Next Song')
                        .setDescription('There are no more songs in the queue to skip to!')
                        .setFooter({ 
                            text: 'Add more songs with w!play',
                            iconURL: client.user?.displayAvatarURL() || null
                        })
                        .setTimestamp();
                    
                    return message.reply({ embeds: [embed] });
                }

                try {
                    const skipped = await distube.skip(message.guild.id);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#4ECDC4')
                        .setTitle('⏭️ Song Skipped')
                        .setDescription(`Skipped **[${skipped.name}](${skipped.url})**`)
                        .setThumbnail(skipped.thumbnail)
                        .setFooter({ 
                            text: `${queue.songs.length - 1} songs remaining in queue`,
                            iconURL: client.user?.displayAvatarURL() || null
                        })
                        .setTimestamp();
                    
                    message.channel.send({ embeds: [embed] });
                } catch (error) {
                    logError('Skip command', error);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FF6B6B')
                        .setTitle('❌ Skip Error')
                        .setDescription('Unable to skip the current song!')
                        .setFooter({ 
                            text: 'Please try again',
                            iconURL: client.user?.displayAvatarURL() || null
                        })
                        .setTimestamp();
                    
                    message.channel.send({ embeds: [embed] });
                }
                break;
            }

            case 'queue':
            case 'q': {
                if (!queue || !queue.songs.length) {
                    const embed = new EmbedBuilder()
                        .setColor('#FFD93D')
                        .setTitle('📭 Empty Queue')
                        .setDescription('The music queue is currently empty!')
                        .addFields({
                            name: '💡 Get Started',
                            value: 'Use `w!play <song name>` to add songs to the queue!'
                        })
                        .setFooter({ 
                            text: 'Add some music to get the party started!',
                            iconURL: client.user?.displayAvatarURL() || null
                        })
                        .setTimestamp();
                    
                    return message.reply({ embeds: [embed] });
                }

                const embed = new EmbedBuilder()
                    .setColor('#9B59B6')
                    .setTitle('🎵 Music Queue')
                    .setTimestamp();

                const currentSong = queue.songs[0];
                embed.addFields({
                    name: '🎵 Now Playing',
                    value: `**[${currentSong.name}](${currentSong.url})**\n` +
                           `⏱️ Duration: \`${currentSong.formattedDuration}\` | 👤 ${currentSong.user}`,
                    inline: false
                });

                if (queue.songs.length > 1) {
                    const upcoming = queue.songs.slice(1, 11).map((song, index) => 
                        `**${index + 1}.** [${song.name}](${song.url})\n` +
                        `⏱️ \`${song.formattedDuration}\` | 👤 ${song.user}`
                    ).join('\n\n');

                    embed.addFields({
                        name: '📋 Up Next',
                        value: upcoming,
                        inline: false
                    });

                    if (queue.songs.length > 11) {
                        embed.setFooter({ 
                            text: `And ${queue.songs.length - 11} more songs... | Total: ${queue.songs.length} songs`,
                            iconURL: client.user?.displayAvatarURL() || null
                        });
                    } else {
                        embed.setFooter({ 
                            text: `Total: ${queue.songs.length} songs in queue`,
                            iconURL: client.user?.displayAvatarURL() || null
                        });
                    }
                } else {
                    embed.setFooter({ 
                        text: 'Add more songs with w!play',
                        iconURL: client.user?.displayAvatarURL() || null
                    });
                }

                embed.addFields(
                    { name: '🔊 Volume', value: `\`${queue.volume}%\``, inline: true },
                    { name: '🔁 Loop', value: queue.repeatMode ? (queue.repeatMode === 2 ? '`Queue`' : '`Song`') : '`Off`', inline: true },
                    { name: '🎲 Autoplay', value: queue.autoplay ? '`On`' : '`Off`', inline: true }
                );

                message.channel.send({ embeds: [embed] });
                break;
            }

            case 'loop':
            case 'repeat': {
                if (!queue) {
                    const embed = new EmbedBuilder()
                        .setColor('#FFD93D')
                        .setTitle('❌ Nothing Playing')
                        .setDescription('There\'s no music currently playing!')
                        .setFooter({ 
                            text: 'Use w!play to start playing music',
                            iconURL: client.user?.displayAvatarURL() || null
                        })
                        .setTimestamp();
                    
                    return message.reply({ embeds: [embed] });
                }

                const mode = args[0];
            let repeatMode;

            if (!mode) {
                const modes = ['Off', 'Song', 'Queue'];
                const embed = new EmbedBuilder()
                    .setColor('#9B59B6')
                    .setTitle('🔁 Loop Status')
                    .setDescription(`Current loop mode: **${modes[queue.repeatMode]}**`)
                    .addFields({
                        name: '💡 Usage',
                        value: '`w!loop [off/song/queue]`'
                    })
                    .setFooter({ 
                        text: 'Choose your preferred loop mode',
                        iconURL: client.user.displayAvatarURL()
                    })
                    .setTimestamp();
                
                return message.reply({ embeds: [embed] });
            }

            switch (mode.toLowerCase()) {
                case 'off':
                case '0':
                    repeatMode = 0;
                    break;
                case 'song':
                case '1':
                    repeatMode = 1;
                    break;
                case 'queue':
                case '2':
                    repeatMode = 2;
                    break;
                default:
                    const embed = new EmbedBuilder()
                        .setColor('#FF6B6B')
                        .setTitle('❌ Invalid Loop Mode')
                        .setDescription('Please use a valid loop mode!')
                        .addFields({
                            name: '✅ Valid Options',
                            value: '`off` • `song` • `queue`'
                        })
                        .setFooter({ 
                            text: 'Example: w!loop song',
                            iconURL: client.user.displayAvatarURL()
                        })
                        .setTimestamp();
                    
                    return message.reply({ embeds: [embed] });
            }

            const modes = ['Off', 'Song', 'Queue'];
            distube.setRepeatMode(message.guild.id, repeatMode);
            
            const embed = new EmbedBuilder()
                .setColor('#4ECDC4')
                .setTitle('🔁 Loop Mode Updated')
                .setDescription(`Loop mode set to: **${modes[repeatMode]}**`)
                .setFooter({ 
                    text: 'Enjoy your music!',
                    iconURL: client.user.displayAvatarURL()
                })
                .setTimestamp();
            
            message.channel.send({ embeds: [embed] });
            break;
        }

        case 'nowplaying':
        case 'np': {
            if (!queue) {
                const embed = new EmbedBuilder()
                    .setColor('#FFD93D')
                    .setTitle('❌ Nothing Playing')
                    .setDescription('There\'s no music currently playing!')
                    .setFooter({ 
                        text: 'Use w!play to start playing music',
                        iconURL: client.user.displayAvatarURL()
                    })
                    .setTimestamp();
                
                return message.reply({ embeds: [embed] });
            }

            const song = queue.songs[0];
            const embed = new EmbedBuilder()
                .setColor('#E74C3C')
                .setTitle('🎵 Now Playing')
                .setDescription(`**[${song.name}](${song.url})**`)
                .addFields(
                    { name: '⏱️ Duration', value: `\`${song.formattedDuration}\``, inline: true },
                    { name: '👤 Requested by', value: song.user.toString(), inline: true },
                    { name: '🔊 Volume', value: `\`${queue.volume}%\``, inline: true }
                )
                .setThumbnail(song.thumbnail)
                .setFooter({ 
                    text: `Queue: ${queue.songs.length} songs • Loop: ${queue.repeatMode ? (queue.repeatMode === 2 ? 'Queue' : 'Song') : 'Off'}`,
                    iconURL: client.user.displayAvatarURL()
                })
                .setTimestamp();

            message.channel.send({ embeds: [embed] });
            break;
        }

        case 'help': {
            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('🎵 Music Bot Commands')
                .setDescription('Here are all the available commands to control your music experience!')
                .addFields(
                    { 
                        name: '🎵 Music Controls', 
                        value: '`w!play <song_title>` - Play a song from YouTube\n`w!stop` - Stop music and clear queue\n`w!skip` - Skip the current song', 
                        inline: false 
                    },
                    { 
                        name: '📋 Queue Management', 
                        value: '`w!queue` - Show the current queue\n`w!nowplaying` - Show current song info', 
                        inline: false 
                    },
                    { 
                        name: '🔁 Playback Options', 
                        value: '`w!loop <off/song/queue>` - Set loop mode', 
                        inline: false 
                    },
                    { 
                        name: '💡 Tips', 
                        value: '• You can use `w!p` as a shortcut for `w!play`\n• You can use `w!s` as a shortcut for `w!skip`\n• You can use `w!q` as a shortcut for `w!queue`\n• You can use `w!np` as a shortcut for `w!nowplaying`', 
                        inline: false 
                    }
                )
                .setFooter({ 
                    text: 'Made by @developer_vanny() | Join a voice channel to get started!',
                    iconURL: client.user.displayAvatarURL()
                })
                .setTimestamp();

            message.channel.send({ embeds: [embed] });
            break;
        }

        default: {
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Unknown Command')
                .setDescription('That command doesn\'t exist!')
                .addFields({
                    name: '💡 Need Help?',
                    value: 'Use `w!help` to see all available commands'
                })
                .setFooter({ 
                    text: 'Check your spelling and try again',
                    iconURL: client.user.displayAvatarURL()
                })
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
            break;
        }
    }
}catch (error) {
    logError('messageCreate event', error);
}
})

// Login with your bot token
client.login(process.env.DISCORD_TOKEN);

// Handle process termination
process.on('SIGINT', () => {
    console.log('Shutting down...');
    client.destroy();
    process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});