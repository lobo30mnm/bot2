const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { DisTube } = require("distube");
const { YtDlpPlugin } = require("@distube/yt-dlp");
const { execSync } = require("child_process");

const TOKEN = process.env.TOKEN;
const PREFIX = process.env.PREFIX || "!";

function checkProgram(name) {
    try {
        const path = execSync(`which ${name}`).toString().trim();
        console.log(`✅ ${name}: ${path}`);
        return path;
    } catch {
        console.log(`❌ ${name} não encontrado`);
        return null;
    }
}

// Verificações do ambiente
checkProgram("ffmpeg");
checkProgram("yt-dlp");


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.Channel
    ]
});


const distube = new DisTube(client, {
    plugins: [
        new YtDlpPlugin({
            update: false
        })
    ]
});


// Eventos

client.once("ready", () => {
    console.log(`🤖 Online como ${client.user.tag}`);
});


distube.on("playSong", (queue, song) => {
    queue.textChannel?.send(
        `▶️ Tocando: **${song.name}**\n⏱️ ${song.formattedDuration}`
    );
});


distube.on("addSong", (queue, song) => {
    queue.textChannel?.send(
        `➕ Adicionado: **${song.name}**`
    );
});


distube.on("error", (channel, error) => {
    console.error("Erro DisTube:", error);

    channel?.send(
        `❌ Erro:
\`\`\`
${error.message}
\`\`\``
    ).catch(()=>{});
});


// Comandos

client.on("messageCreate", async message => {

    if (
        message.author.bot ||
        !message.guild ||
        !message.content.startsWith(PREFIX)
    ) return;


    const args = message.content
        .slice(PREFIX.length)
        .trim()
        .split(/ +/);

    const command = args.shift().toLowerCase();
    const query = args.join(" ");


    const voice = message.member.voice.channel;


    try {


        if(command === "play" || command === "p"){

            if(!voice)
                return message.reply("❌ Entre em um canal de voz.");

            if(!query)
                return message.reply("❌ Digite uma música.");

            await distube.play(
                voice,
                query,
                {
                    textChannel: message.channel,
                    member: message.member
                }
            );
        }


        if(command === "skip"){

            const queue = distube.getQueue(message.guildId);

            if(!queue)
                return message.reply("❌ Nada tocando.");

            await queue.skip();

            message.reply("⏭️ Pulado.");
        }



        if(command === "stop"){

            const queue = distube.getQueue(message.guildId);

            if(!queue)
                return message.reply("❌ Nada tocando.");

            queue.stop();

            message.reply("⏹️ Parado.");
        }



        if(command === "pause"){

            const queue = distube.getQueue(message.guildId);

            if(!queue)
                return;

            queue.pause();

            message.reply("⏸️ Pausado.");
        }



        if(command === "resume"){

            const queue = distube.getQueue(message.guildId);

            if(!queue)
                return;

            queue.resume();

            message.reply("▶️ Continuando.");
        }



        if(command === "queue"){

            const queue = distube.getQueue(message.guildId);

            if(!queue)
                return message.reply("❌ Fila vazia.");

            const songs = queue.songs
            .slice(0,10)
            .map((s,i)=>
                `${i+1}. ${s.name}`
            )
            .join("\n");


            message.reply(
                `🎵 Fila:\n${songs}`
            );
        }


    } catch(err){

        console.error(err);

        message.reply(
            `❌ Erro geral:
\`\`\`
${err.message}
\`\`\``
        ).catch(()=>{});

    }

});


client.login(TOKEN);
