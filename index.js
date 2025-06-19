const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const { YouTubePlugin } = require('@distube/youtube');
const { SpotifyPlugin } = require('@distube/spotify');
const ffmpeg = require('ffmpeg-static');
require('./app.js');
require('dotenv').config();

// Bot configuration
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// DisTube configuration with improved settings
const distube = new DisTube(client, {
    emitNewSongOnly: true,
    emitAddSongWhenCreatingQueue: false,
    emitAddListWhenCreatingQueue: false,
    ffmpeg: {
        path: ffmpeg
    },
    plugins: [
        new YtDlpPlugin({
            update: false
        }),
        new YouTubePlugin({
            cookies: [] // Add cookies if needed for age-restricted content
        }),
        new SpotifyPlugin()
    ]
});

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
        /^https?:\/\//i // Generic URL pattern
    ];
    
    return urlPatterns.some(pattern => pattern.test(query)) || isUrl(query);
}

// DisTube Events
distube.on('playSong', (queue, song) => {
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
            iconURL: client.user.displayAvatarURL()
        })
        .setTimestamp();

    queue.textChannel.send({ embeds: [embed] });
});

distube.on('addSong', (queue, song) => {
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
            iconURL: client.user.displayAvatarURL()
        })
        .setTimestamp();

    queue.textChannel.send({ embeds: [embed] });
});

distube.on('addList', (queue, playlist) => {
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
            iconURL: client.user.displayAvatarURL()
        })
        .setTimestamp();

    queue.textChannel.send({ embeds: [embed] });
});

distube.on('searchResult', (message, result) => {
    let i = 0;
    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('🔍 Search Results')
        .setDescription(
            `${result.map(song => `**${++i}**. [${song.name}](${song.url}) - \`${song.formattedDuration}\``).join('\n')}`
        )
        .setFooter({ 
            text: 'Choose a number from 1-10 or type "cancel" to cancel',
            iconURL: client.user.displayAvatarURL()
        })
        .setTimestamp();

    message.channel.send({ embeds: [embed] });
});

distube.on('searchCancel', (message) => {
    const embed = new EmbedBuilder()
        .setColor('#FFD93D')
        .setTitle('❌ Search Cancelled')
        .setDescription('Search has been cancelled!')
        .setTimestamp();

    message.channel.send({ embeds: [embed] });
});

distube.on('searchInvalidAnswer', (message) => {
    const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('❌ Invalid Selection')
        .setDescription('Please choose a number from 1-10 or type "cancel"!')
        .setTimestamp();

    message.channel.send({ embeds: [embed] });
});

distube.on('searchNoResult', (message) => {
    const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('❌ No Results Found')
        .setDescription('No search results found! Please try a different search term.')
        .setTimestamp();

    message.channel.send({ embeds: [embed] });
});

distube.on('error', (channel, error) => {
    console.error('DisTube Error:', error);
    
    const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('❌ Error Occurred')
        .setDescription(`\`\`\`${error.message.slice(0, 1900)}\`\`\``)
        .setFooter({ 
            text: 'Please try again or contact support if the issue persists',
            iconURL: client.user.displayAvatarURL()
        })
        .setTimestamp();

    channel.send({ embeds: [embed] });
});

distube.on('empty', (queue) => {
    const embed = new EmbedBuilder()
        .setColor('#FFD93D')
        .setTitle('📭 Voice Channel Empty')
        .setDescription('The voice channel is empty! I\'ll leave in 30 seconds...')
        .setFooter({ 
            text: 'Join the voice channel to continue listening',
            iconURL: client.user.displayAvatarURL()
        })
        .setTimestamp();

    queue.textChannel.send({ embeds: [embed] });
});

distube.on('finish', (queue) => {
    const embed = new EmbedBuilder()
        .setColor('#A8E6CF')
        .setTitle('🎉 Queue Finished')
        .setDescription('All songs have been played! Add more songs to continue the party!')
        .setFooter({ 
            text: 'Use w!play to add more music',
            iconURL: client.user.displayAvatarURL()
        })
        .setTimestamp();

    queue.textChannel.send({ embeds: [embed] });
});

distube.on('disconnect', (queue) => {
    const embed = new EmbedBuilder()
        .setColor('#95A5A6')
        .setTitle('👋 Disconnected')
        .setDescription('Successfully disconnected from the voice channel!')
        .setFooter({ 
            text: 'Thanks for using the music bot!',
            iconURL: client.user.displayAvatarURL()
        })
        .setTimestamp();

    queue.textChannel.send({ embeds: [embed] });
});

distube.on('initQueue', (queue) => {
    queue.autoplay = false;
    queue.volume = 50;
});

// Format duration helper (for manual formatting if needed)
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Helper function to validate YouTube playlist URL
function isValidPlaylistUrl(url) {
    const playlistRegex = /^https?:\/\/(www\.)?(youtube\.com\/playlist\?list=|youtu\.be\/playlist\?list=)/i;
    return playlistRegex.test(url);
}

// Bot ready event
client.once('ready', () => {
    console.log(`${client.user.tag} is online!`);
    client.user.setActivity('to w!help', { type: ActivityType.Playing });
});

// Message handler
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('w!')) return;

    const args = message.content.slice(2).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    const voiceChannel = message.member?.voice?.channel;
    const queue = distube.getQueue(message.guild.id);

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
                        iconURL: client.user.displayAvatarURL()
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
                        iconURL: client.user.displayAvatarURL()
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
                        iconURL: client.user.displayAvatarURL()
                    })
                    .setTimestamp();
                
                return message.reply({ embeds: [embed] });
            }
            
            try {
                await distube.play(voiceChannel, query, {
                    textChannel: message.channel,
                    member: message.member
                });
            } catch (error) {
                console.error('Play error:', error);
                
                const embed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Playback Error')
                    .setDescription(`Unable to find or play the requested song: \`${error.message.slice(0, 100)}...\``)
                    .addFields({
                        name: '💡 Troubleshooting Tips',
                        value: '• Check your spelling\n• Try adding the artist name\n• Use more specific search terms\n• Make sure the song exists on YouTube'
                    })
                    .setFooter({ 
                        text: 'Example: w!play Despacito Luis Fonsi',
                        iconURL: client.user.displayAvatarURL()
                    })
                    .setTimestamp();
                
                message.channel.send({ embeds: [embed] });
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
                        iconURL: client.user.displayAvatarURL()
                    })
                    .setTimestamp();
                
                return message.reply({ embeds: [embed] });
            }

            distube.voices.leave(message.guild.id);
            
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
                        iconURL: client.user.displayAvatarURL()
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
                        iconURL: client.user.displayAvatarURL()
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
                        iconURL: client.user.displayAvatarURL()
                    })
                    .setTimestamp();
                
                message.channel.send({ embeds: [embed] });
            } catch (error) {
                const embed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Skip Error')
                    .setDescription('Unable to skip the current song!')
                    .setFooter({ 
                        text: 'Please try again',
                        iconURL: client.user.displayAvatarURL()
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
                        iconURL: client.user.displayAvatarURL()
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
                        iconURL: client.user.displayAvatarURL()
                    });
                } else {
                    embed.setFooter({ 
                        text: `Total: ${queue.songs.length} songs in queue`,
                        iconURL: client.user.displayAvatarURL()
                    });
                }
            } else {
                embed.setFooter({ 
                    text: 'Add more songs with w!play',
                    iconURL: client.user.displayAvatarURL()
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
                        iconURL: client.user.displayAvatarURL()
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
});

// Login with your bot token
client.login(process.env.DISCORD_TOKEN); // Replace with your actual bot token

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