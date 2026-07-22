// index.js
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync, execSync } = require("child_process");

process.on("unhandledRejection", (reason) => {
  console.error("UnhandledRejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("UncaughtException:", error);
});

const TOKEN = process.env.TOKEN;
const PREFIX = process.env.PREFIX || "!";
const BOT_NAME = process.env.BOT_NAME || "Music Bot";

// Se quiser desligar a auto-instalação em runtime:
// AUTO_INSTALL_DEPS=false
// AUTO_INSTALL_YTDLP=false
const AUTO_INSTALL_DEPS = process.env.AUTO_INSTALL_DEPS !== "false";
const AUTO_INSTALL_YTDLP = process.env.AUTO_INSTALL_YTDLP !== "false";

if (!TOKEN) {
  console.error("❌ TOKEN não definido nas variáveis de ambiente.");
  process.exit(1);
}

function runCommand(command) {
  const result = spawnSync("sh", ["-lc", command], {
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Comando falhou: ${command}`);
  }
}

function moduleExists(name) {
  try {
    require.resolve(name);
    return true;
  } catch {
    return false;
  }
}

function ensureDependencies() {
  const deps = ["discord.js", "distube", "@distube/yt-dlp"];
  const missing = deps.filter((dep) => !moduleExists(dep));

  if (missing.length > 0) {
    console.log(`📦 Instalando dependências faltando: ${missing.join(", ")}`);
    runCommand(`npm install ${missing.map((d) => JSON.stringify(d)).join(" ")}`);
  }
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function findYtDlp() {
  const candidates = [
    process.env.YTDLP_PATH,
    "yt-dlp",
    "/root/.local/bin/yt-dlp",
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    "/app/.local/bin/yt-dlp",
    path.join(os.homedir(), ".local", "bin", "yt-dlp"),
    "/data/data/com.termux/files/usr/bin/yt-dlp",
  ].filter(Boolean);

  for (const item of candidates) {
    try {
      if (item.includes("/") && fileExists(item)) {
        return item;
      }

      const found = spawnSync("sh", ["-lc", `command -v ${item} || true`], {
        encoding: "utf8",
      }).stdout.trim();

      if (found) return found;
    } catch {
      // ignore
    }
  }

  return null;
}

function ensureYtDlp() {
  let ytDlpPath = findYtDlp();

  if (!ytDlpPath && AUTO_INSTALL_YTDLP) {
    console.log("📥 yt-dlp não encontrado. Tentando instalar...");

    const commands = [
      "python -m pip install --user -U yt-dlp",
      "python3 -m pip install --user -U yt-dlp",
    ];

    for (const cmd of commands) {
      try {
        runCommand(cmd);
        ytDlpPath = findYtDlp();
        if (ytDlpPath) break;
      } catch (err) {
        console.warn(`⚠️ Falha ao executar: ${cmd}`);
      }
    }
  }

  return ytDlpPath;
}

function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) return "00:00";

  const s = Math.floor(total % 60);
  const m = Math.floor((total / 60) % 60);
  const h = Math.floor(total / 3600);
  const pad = (n) => String(n).padStart(2, "0");

  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

async function safeSend(message, content) {
  try {
    if (message?.reply) {
      await message.reply({
        content,
        allowedMentions: { repliedUser: false },
      });
      return;
    }
  } catch {
    // fallback
  }

  try {
    if (message?.channel?.send) {
      await message.channel.send(content);
    }
  } catch (err) {
    console.error("Falha ao enviar mensagem:", err);
  }
}

(async () => {
  if (AUTO_INSTALL_DEPS) {
    try {
      ensureDependencies();
    } catch (err) {
      console.warn("⚠️ Não foi possível instalar dependências automaticamente.");
      console.warn(err?.message || err);
    }
  }

  const ytDlpPath = ensureYtDlp();

  if (ytDlpPath) {
    const ytDir = path.dirname(ytDlpPath);
    const currentPath = process.env.PATH || "";
    const parts = currentPath.split(path.delimiter);

    if (!parts.includes(ytDir)) {
      process.env.PATH = `${ytDir}${path.delimiter}${currentPath}`;
    }

    console.log(`✅ yt-dlp encontrado em: ${ytDlpPath}`);
  } else {
    console.log("⚠️ yt-dlp não encontrado. O bot vai tentar usar o PATH.");
  }

  const { Client, GatewayIntentBits, Partials, Events } = require("discord.js");
  const { DisTube } = require("distube");
  const { YtDlpPlugin } = require("@distube/yt-dlp");

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
    console.log(`🤖 ${BOT_NAME}`);
  });

  distube.on("playSong", async (queue, song) => {
    try {
      await queue.textChannel?.send(
        `▶️ Tocando agora: **${song.name}**\n⏱️ Duração: **${formatDuration(song.duration)}**`
      );
    } catch {
      // ignore
    }
  });

  distube.on("addSong", async (queue, song) => {
    try {
      await queue.textChannel?.send(`➕ Adicionado à fila: **${song.name}**`);
    } catch {
      // ignore
    }
  });

  distube.on("addList", async (queue, playlist) => {
    try {
      await queue.textChannel?.send(
        `📃 Playlist adicionada: **${playlist.name}** (${playlist.songs.length} músicas)`
      );
    } catch {
      // ignore
    }
  });

  distube.on("searchNoResult", async (message, query) => {
    await safeSend(message, `❌ Nenhum resultado para: **${query}**`);
  });

  distube.on("error", async (channel, error) => {
    console.error("❌ Erro no player:", error);

    const msg = `❌ Erro no player:\n\`\`\`${String(
      error?.message || error
    )}\`\`\``;

    try {
      if (channel?.send) {
        await channel.send(msg);
      }
    } catch {
      // ignore
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (!message.content.startsWith(PREFIX)) return;

      const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
      const cmd = (args.shift() || "").toLowerCase();
      const query = args.join(" ");
      const member = message.member;
      const voiceChannel = member?.voice?.channel;

      if (["play", "p", "tocar"].includes(cmd)) {
        if (!voiceChannel) {
          return await safeSend(message, "❌ Entre em um canal de voz primeiro.");
        }

        if (!query) {
          return await safeSend(message, `❌ Use: \`${PREFIX}play nome ou link\``);
        }

        await distube.play(voiceChannel, query, {
          textChannel: message.channel,
          member,
        });

        return;
      }

      const queue = distube.getQueue(message.guildId);

      if (cmd === "skip" || cmd === "s") {
        if (!queue) return await safeSend(message, "❌ Não tem nada tocando.");
        await queue.skip();
        return await safeSend(message, "⏭️ Música pulada.");
      }

      if (cmd === "stop") {
        if (!queue) return await safeSend(message, "❌ Não tem nada tocando.");
        await queue.stop();
        return await safeSend(message, "⏹️ Player parado.");
      }

      if (cmd === "pause") {
        if (!queue) return await safeSend(message, "❌ Não tem nada tocando.");
        if (typeof queue.pause === "function") await queue.pause();
        return await safeSend(message, "⏸️ Pausado.");
      }

      if (cmd === "resume") {
        if (!queue) return await safeSend(message, "❌ Não tem nada tocando.");
        if (typeof queue.resume === "function") await queue.resume();
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
          `🎶 **Tocando agora:** ${now.name} (${formatDuration(
            now.duration
          )})\n\n**Próximas:**\n${upcoming || "Sem próximas músicas."}`
        );
      }

      if (cmd === "leave" || cmd === "sair") {
        if (!queue) return await safeSend(message, "❌ Não estou em nenhum canal de voz.");
        await queue.stop();
        return await safeSend(message, "👋 Saí do canal.");
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
})();
