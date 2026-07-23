const { execSync } = require("child_process");

try {
  console.log("PATH =", process.env.PATH);
  console.log("FFMPEG =", execSync("which ffmpeg").toString());
  console.log(execSync("ffmpeg -version").toString());
} catch (e) {
  console.error("FFmpeg não encontrado:", e.message);
}

try {
  console.log("YTDLP =", execSync("which yt-dlp").toString());
} catch (e) {
  console.error("yt-dlp não encontrado:", e.message);
}

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { Client, GatewayIntentBits, Partials, Events } = require("discord.js");
const { DisTube } = require("distube");
const { YtDlpPlugin } = require("@distube/yt-dlp");

const TOKEN = process.env.TOKEN;
const PREFIX = process.env.PREFIX || "!";
const BOT_NAME = process.env.BOT_NAME || "Music Bot";

if (!TOKEN) {
  console.error("❌ TOKEN não definido nas variáveis de ambiente.");
  process.exit(1);
}

process.on("unhandledRejection", (reason) => {
  console.error("UnhandledRejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("UncaughtException:", error);
});

function commandExists(cmd) {
  try {
    const out = execSync(`command -v ${cmd}`, { encoding: "utf8" }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function firstExisting(paths) {
  for (const p of paths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }

  try {
    const ffmpegStatic = require("ffmpeg-static");
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
  } catch {}

  try {
    const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
    if (ffmpegInstaller?.path && fs.existsSync(ffmpegInstaller.path)) {
      return ffmpegInstaller.path;
    }
  } catch {}

  return commandExists("ffmpeg");
}

function resolveYtDlp() {
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
    return process.env.YTDLP_PATH;
  }

  const direct = firstExisting([
    "/usr/bin/yt-dlp",
    "/usr/local/bin/yt-dlp",
    "/root/.local/bin/yt-dlp",
    path.join(process.env.HOME || "", ".local", "bin", "yt-dlp"),
  ]);
  if (direct) return direct;

  return commandExists("yt-dlp");
}

function appendBinaryPath(binPath) {
  if (!binPath) return;
  const dir = path.dirname(binPath);
  const current = process.env.PATH || "";
  const parts = current.split(path.delimiter);
  if (!parts.includes(dir)) {
    process.env.PATH = `${dir}${path.delimiter}${current}`;
  }
}

function formatDuration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return "00:00";

  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);
  const pad = (v) => String(v).padStart(2, "0");

  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

async function safeSend(message, content) {
  try {
    await message.reply({
      content,
      allowedMentions: { repliedUser: false },
    });
  } catch {
    try {
      await message.channel.send(content);
    } catch (err) {
      console.error("Falha ao enviar mensagem:", err);
    }
  }
}

const ffmpegPath = resolveFfmpeg();
const ytDlpPath = resolveYtDlp();

if (ffmpegPath) {
  process.env.FFMPEG_PATH = ffmpegPath;
  appendBinaryPath(ffmpegPath);
  console.log(`✅ FFmpeg: ${ffmpegPath}`);
} else {
  console.log("⚠️ FFmpeg não encontrado no ambiente.");
}

if (ytDlpPath) {
  process.env.YTDLP_PATH = ytDlpPath;
  appendBinaryPath(ytDlpPath);
  console.log(`✅ yt-dlp: ${ytDlpPath}`);
} else {
  console.log("⚠️ yt-dlp não encontrado no ambiente.");
}

console.log("====================================");
console.log(`🤖 ${BOT_NAME}`);
console.log("====================================");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const distube = new DisTube(client, {
  plugins: [
    new YtDlpPlugin({
      update: false,
    }),
  ],
});

client.once(Events.ClientReady, () => {
  console.log(`✅ Logado como ${client.user.tag}`);
});

distube.on("playSong", async (queue, song) => {
  try {
    await queue.textChannel?.send(
      `▶️ Tocando agora: **${song.name}**\n⏱️ Duração: **${formatDuration(song.duration)}**`
    );
  } catch {}
});

distube.on("addSong", async (queue, song) => {
  try {
    await queue.textChannel?.send(`➕ Adicionado à fila: **${song.name}**`);
  } catch {}
});

distube.on("addList", async (queue, playlist) => {
  try {
    await queue.textChannel?.send(
      `📃 Playlist adicionada: **${playlist.name}** (${playlist.songs.length} músicas)`
    );
  } catch {}
});

distube.on("searchNoResult", async (message, query) => {
  await safeSend(message, `❌ Nenhum resultado para: **${query}**`);
});

distube.on("error", async (channel, error) => {
  console.error("❌ Erro no player:", error);

  const content = `❌ Erro no player:\n\`\`\`${String(
    error?.message || error
  )}\`\`\``;

  try {
    if (channel?.send) {
      await channel.send(content);
    }
  } catch {}
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.guild || message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = (args.shift() || "").toLowerCase();
    const query = args.join(" ");
    const voiceChannel = message.member?.voice?.channel;

    if (["play", "p", "tocar"].includes(cmd)) {
      if (!voiceChannel) {
        return await safeSend(message, "❌ Entre em um canal de voz primeiro.");
      }

      if (!query) {
        return await safeSend(message, `❌ Use: \`${PREFIX}play nome ou link\``);
      }

      await distube.play(voiceChannel, query, {
        textChannel: message.channel,
        member: message.member,
        message,
      });

      return;
    }

    const queue = distube.getQueue(message.guildId);

    if (cmd === "skip" || cmd === "s") {
      if (!queue) return await safeSend(message, "❌ Não tem nada tocando.");
      await queue.skip();
      return await safeSend(message, "⏭️ Música pulada.");
    }

    if (cmd === "stop" || cmd === "leave" || cmd === "sair") {
      if (!queue) return await safeSend(message, "❌ Não tem nada tocando.");
      await queue.stop();
      return await safeSend(message, "⏹️ Player parado.");
    }

    if (cmd === "pause") {
      if (!queue) return await safeSend(message, "❌ Não tem nada tocando.");
      await queue.pause();
      return await safeSend(message, "⏸️ Pausado.");
    }

    if (cmd === "resume") {
      if (!queue) return await safeSend(message, "❌ Não tem nada tocando.");
      await queue.resume();
      return await safeSend(message, "▶️ Retomado.");
    }

    if (cmd === "volume" || cmd === "vol") {
      if (!queue) return await safeSend(message, "❌ Não tem nada tocando.");

      const vol = Number(args[0]);
      if (!Number.isInteger(vol) || vol < 1 || vol > 100) {
        return await safeSend(message, `❌ Use: \`${PREFIX}volume 1-100\``);
      }

      if (typeof queue.setVolume === "function") {
        await queue.setVolume(vol);
      } else {
        queue.volume = vol;
      }

      return await safeSend(message, `🔊 Volume ajustado para **${vol}%**.`);
    }

    if (cmd === "queue" || cmd === "fila") {
      if (!queue || !queue.songs?.length) {
        return await safeSend(message, "❌ A fila está vazia.");
      }

      const now = queue.songs[0];
      const upcoming = queue.songs
        .slice(1, 11)
        .map(
          (song, i) =>
            `${i + 1}. ${song.name} (${formatDuration(song.duration)})`
        )
        .join("\n");

      return await safeSend(
        message,
        `🎶 **Tocando agora:** ${now.name} (${formatDuration(now.duration)})\n\n**Próximas:**\n${upcoming || "Sem próximas músicas."}`
      );
    }

    if (cmd === "help" || cmd === "ajuda") {
      return await safeSend(
        message,
        [
          `**Comandos:**`,
          `\`${PREFIX}play <nome ou link>\``,
          `\`${PREFIX}skip\``,
          `\`${PREFIX}stop\``,
          `\`${PREFIX}pause\``,
          `\`${PREFIX}resume\``,
          `\`${PREFIX}volume <1-100>\``,
          `\`${PREFIX}queue\``,
          `\`${PREFIX}leave\``,
        ].join("\n")
      );
    }
  } catch (error) {
    console.error("Erro no MessageCreate:", error);
    await safeSend(
      message,
      `❌ Erro geral:\n\`\`\`${String(error?.message || error)}\`\`\``
    );
  }
});

client.login(TOKEN);
