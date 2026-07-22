const fs = require('fs');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActivityType,
} = require('discord.js');
const { Player, useQueue, useHistory } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const {
  YouTubeDlpExtractor,
  setFFmpegPath,
  setYtDlpPath,
} = require('discord-player-youtubedlp');
const config = require('./config.js');

const PREFIX = config.prefix || '!';

function resolveBinary(candidates, fallback) {
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return filePath;
  }
  return fallback;
}

const ytDlpPath = resolveBinary(
  [
    '/data/data/com.termux/files/usr/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
  ],
  'yt-dlp'
);

const ffmpegPath = resolveBinary(
  [
    '/data/data/com.termux/files/usr/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  ],
  'ffmpeg'
);

try {
  setYtDlpPath(ytDlpPath);
  setFFmpegPath(ffmpegPath);
  console.log(`✅ yt-dlp: ${ytDlpPath}`);
  console.log(`✅ ffmpeg: ${ffmpegPath}`);
} catch (err) {
  console.warn('⚠️ Não foi possível configurar yt-dlp/ffmpeg:', err?.message || err);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const player = new Player(client);

function toTrackArray(queueTracks) {
  if (!queueTracks) return [];
  if (typeof queueTracks.toArray === 'function') return queueTracks.toArray();
  if (Array.isArray(queueTracks)) return queueTracks;
  if (Array.isArray(queueTracks.data)) return queueTracks.data;
  return [];
}

function parseDuration(duration) {
  if (!duration || duration === 'LIVE') return 0;

  const parts = String(duration).trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  return 0;
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return [h, m, s]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

function getQueueDuration(queue) {
  if (!queue) return '00:00:00';

  const tracks = [queue.currentTrack, ...toTrackArray(queue.tracks)].filter(Boolean);
  const totalSeconds = tracks.reduce((acc, track) => {
    const d = track?.duration || track?.durationFormatted || '0:00';
    return acc + parseDuration(d);
  }, 0);

  return formatDuration(totalSeconds);
}

function getTrackTitle(track) {
  return track?.title || track?.name || 'Sem título';
}

function getTrackDuration(track) {
  return track?.durationFormatted || track?.duration || 'LIVE';
}

function buildTrackEmbed(track, color = '#57F287') {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('Tocando agora')
    .setDescription(`**[${getTrackTitle(track)}](${track?.url || '#'})**`)
    .addFields(
      { name: 'Duração', value: `\`${getTrackDuration(track)}\``, inline: true },
      { name: 'Autor', value: `${track?.author || 'Desconhecido'}`, inline: true },
    );

  if (track?.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
}

async function main() {
  await player.extractors.loadMulti(DefaultExtractors);

  await player.extractors.register(YouTubeDlpExtractor, {
    debug: false,
  });

  console.log('✅ YouTubeDlpExtractor carregado.');

  player.events.on('playerStart', (queue, track) => {
    const channel = queue?.metadata;
    if (!channel?.send) return;

    channel.send({
      embeds: [buildTrackEmbed(track, '#57F287')],
    }).catch(() => {});
  });

  player.events.on('error', (queue, error) => {
    console.error('⚠️ [Player error]:', error?.message || error || 'erro desconhecido');
    if (queue?.metadata?.send) {
      queue.metadata
        .send(`❌ Erro no player:\n\`\`\`${error?.message || String(error)}\`\`\``)
        .catch(() => {});
    }
  });

  player.events.on('playerError', (queue, error) => {
    console.error('⚠️ [Player stream error]:', error?.message || error || 'erro desconhecido');
    if (queue?.metadata?.send) {
      queue.metadata
        .send(`❌ Erro no áudio:\n\`\`\`${error?.message || String(error)}\`\`\``)
        .catch(() => {});
    }
  });

  client.once('clientReady', (readyClient) => {
    console.log(`🤖 Bot de Música Online como ${readyClient.user.tag}!`);
    readyClient.user.setActivity(`${PREFIX}help | Músicas 🎵`, {
      type: ActivityType.Listening,
    });
  });

  client.on('messageCreate', async (message) => {
    try {
      if (!message.guild || message.author.bot || !message.content.startsWith(PREFIX)) return;

      const args = message.content.slice(PREFIX.length).trim().split(/ +/);
      const command = (args.shift() || '').toLowerCase();

      if (command === 'help' || command === 'ajuda' || command === 'h') {
        const helpEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🎵 Central de Comandos - E.Music')
          .setDescription(`Use os comandos abaixo com o prefixo \`${PREFIX}\`:`)
          .addFields(
            { name: '▶️ play / p <nome/url>', value: 'Toca música ou playlist.' },
            { name: '⏭️ skip / s', value: 'Pula para a próxima faixa.' },
            { name: '⏮️ previous / voltar', value: 'Volta para a faixa anterior.' },
            { name: '⏹️ stop / parar', value: 'Para a reprodução e limpa a fila.' },
            { name: '📜 queue / fila / q', value: 'Mostra a fila atual.' },
            { name: '🔊 volume / vol <1-100>', value: 'Ajusta o volume.' },
            { name: '🔁 loop / repeat <off/song/queue/auto>', value: 'Altera o modo de repetição.' },
            { name: '⏯️ pause / resume', value: 'Pausa ou volta a tocar.' },
            { name: '🔀 shuffle', value: 'Embaralha a fila.' },
            { name: 'ℹ️ nowplaying / np', value: 'Mostra a música atual.' },
          )
          .setFooter({ text: 'E.Music System', iconURL: client.user.displayAvatarURL() });

        return message.reply({ embeds: [helpEmbed] });
      }

      if (command === 'play' || command === 'p') {
        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) return message.reply('❌ Você precisa estar em um canal de voz!');

        const query = args.join(' ');
        if (!query) return message.reply('❌ Digite o nome ou o link da música/playlist!');

        const searchingEmbed = new EmbedBuilder()
          .setColor('#FEE75C')
          .setDescription(`🔎 **Buscando no acervo:** \`${query}\`...`);

        const searchingMsg = await message.reply({ embeds: [searchingEmbed] });

        await player.play(voiceChannel, query, {
          nodeOptions: {
            metadata: message.channel,
            bufferingTimeout: 30000,
            leaveOnStop: false,
            leaveOnStopCooldown: 5000,
            leaveOnEnd: false,
            leaveOnEndCooldown: 15000,
            leaveOnEmpty: false,
            leaveOnEmptyCooldown: 300000,
            skipOnNoStream: true,
          },
        });

        await searchingMsg.delete().catch(() => {});

        const queue = useQueue(message.guild.id);
        const currentTrack = queue?.currentTrack;
        const upcomingTracks = toTrackArray(queue?.tracks);

        if (currentTrack?.playlist && upcomingTracks.length > 0) {
          const playlistName =
            currentTrack.playlist?.title ||
            currentTrack.playlist?.name ||
            currentTrack.playlist?.author ||
            'Playlist';

          const totalDuration = getQueueDuration(queue);
          const songCount = upcomingTracks.length + 1;

          const playlistEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🎶 Playlist adicionada')
            .setDescription(`**${playlistName}**`)
            .addFields(
              { name: '🎵 Músicas', value: `${songCount}`, inline: true },
              { name: '⏱️ Duração total', value: totalDuration, inline: true },
            );

          if (currentTrack.thumbnail) playlistEmbed.setThumbnail(currentTrack.thumbnail);

          await message.channel.send({ embeds: [playlistEmbed] }).catch(() => {});
        }

        return;
      }

      if (command === 'skip' || command === 's') {
        const queue = useQueue(message.guild.id);
        if (!queue) return message.reply('❌ Não há nenhuma música na fila!');

        queue.node.skip();
        return message.reply('⏭️ **Música pulada!**');
      }

      if (command === 'previous' || command === 'voltar') {
        const history = useHistory(message.guild.id);
        if (!history) return message.reply('❌ Não há histórico de músicas!');

        await history.previous();
        return message.reply('⏮️ **Voltando para a faixa anterior!**');
      }

      if (command === 'stop' || command === 'parar') {
        const queue = useQueue(message.guild.id);
        if (!queue) return message.reply('❌ Nenhuma música tocando no momento.');

        queue.delete();
        return message.reply('⏹️ **A reprodução foi encerrada e a fila limpa!**');
      }

      if (command === 'queue' || command === 'fila' || command === 'q') {
        const queue = useQueue(message.guild.id);
        if (!queue) return message.reply('❌ A fila está vazia no momento!');

        const currentTrack = queue.currentTrack;
        const upcomingTracks = toTrackArray(queue.tracks).slice(0, 10);

        const lines = [];
        if (currentTrack) {
          lines.push(`▶️ **Tocando agora:** ${getTrackTitle(currentTrack)} - \`${getTrackDuration(currentTrack)}\``);
        }

        upcomingTracks.forEach((track, index) => {
          lines.push(`\`${index + 1}.\` ${getTrackTitle(track)} - \`${getTrackDuration(track)}\``);
        });

        const queueEmbed = new EmbedBuilder()
          .setColor('#2F3136')
          .setTitle('🎶 Fila de Reprodução')
          .setDescription(lines.join('\n') || 'Fila vazia.')
          .setFooter({
            text: `Total de músicas: ${toTrackArray(queue.tracks).length + (currentTrack ? 1 : 0)} | Duração: ${getQueueDuration(queue)}`,
          });

        return message.reply({ embeds: [queueEmbed] });
      }

      if (command === 'volume' || command === 'vol') {
        const queue = useQueue(message.guild.id);
        if (!queue) return message.reply('❌ Nenhuma música tocando.');

        const volume = parseInt(args[0], 10);
        if (Number.isNaN(volume) || volume < 1 || volume > 100) {
          return message.reply('❌ Informe um número entre **1 e 100**.');
        }

        queue.node.setVolume(volume);
        return message.reply(`🔊 Volume ajustado para **${volume}%**!`);
      }

      if (command === 'loop' || command === 'repeat') {
        const queue = useQueue(message.guild.id);
        if (!queue) return message.reply('❌ Nenhuma música tocando.');

        const modeStr = (args[0] || '').toLowerCase();
        let mode = queue.repeatMode ?? 0;

        if (modeStr === 'off' || modeStr === 'desativar' || modeStr === '0') mode = 0;
        else if (modeStr === 'song' || modeStr === 'music' || modeStr === 'musica' || modeStr === 'música' || modeStr === '1') mode = 1;
        else if (modeStr === 'queue' || modeStr === 'fila' || modeStr === '2') mode = 2;
        else if (modeStr === 'auto' || modeStr === 'autoplay' || modeStr === '3') mode = 3;
        else mode = ((queue.repeatMode ?? 0) + 1) % 4;

        queue.setRepeatMode(mode);

        const modeName =
          mode === 3 ? '🔁 **Autoplay**' :
          mode === 2 ? '🔁 **Fila Inteira**' :
          mode === 1 ? '🔂 **Música Atual**' :
          '➡️ **Desativado**';

        return message.reply(`Modo de repetição: ${modeName}`);
      }

      if (command === 'pause' || command === 'resume' || command === 'pausar') {
        const queue = useQueue(message.guild.id);
        if (!queue) return message.reply('❌ Nenhuma música tocando.');

        queue.node.setPaused(!queue.node.isPaused());
        return message.reply(queue.node.isPaused() ? '⏸️ **Pausado!**' : '▶️ **Continuando!**');
      }

      if (command === 'shuffle' || command === 'embaralhar') {
        const queue = useQueue(message.guild.id);
        if (!queue) return message.reply('❌ Nenhuma música tocando.');

        if (toTrackArray(queue.tracks).length < 2) {
          return message.reply('❌ Não há músicas suficientes para embaralhar.');
        }

        queue.tracks.shuffle();
        return message.reply('🔀 **Fila embaralhada!**');
      }

      if (command === 'nowplaying' || command === 'np') {
        const queue = useQueue(message.guild.id);
        if (!queue || !queue.currentTrack) return message.reply('❌ Nenhuma música tocando.');

        return message.reply({
          embeds: [buildTrackEmbed(queue.currentTrack, '#57F287')],
        });
      }
    } catch (err) {
      console.error('Erro ao processar comando:', err);
      return message.channel
        .send(`❌ Ocorreu um erro ao executar o comando.\n\`\`\`${err?.message || String(err)}\`\`\``)
        .catch(() => {});
    }
  });

  process.on('unhandledRejection', (error) => {
    console.error('⚠️ [Unhandled Rejection]:', error);
  });

  process.on('uncaughtException', (error) => {
    console.error('⚠️ [Uncaught Exception]:', error);
  });

  await client.login(process.env.TOKEN);
}

main().catch((err) => {
  console.error('Falha ao iniciar o bot:', err);
});
