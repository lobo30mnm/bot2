const {
    Client,
    GatewayIntentBits,
    Partials
} = require("discord.js");

const {
    DisTube
} = require("distube");

const {
    YtDlpPlugin
} = require("@distube/yt-dlp");

const {
    execSync
} = require("child_process");

const TOKEN = process.env.TOKEN;
const PREFIX = process.env.PREFIX || "!";


// ===============================
// Verificar dependências
// ===============================

function findProgram(name) {
    try {
        return execSync(`which ${name}`)
            .toString()
            .trim();
    } catch {
        return null;
    }
}


const ffmpegPath = findProgram("ffmpeg");
const ytDlpPath = findProgram("yt-dlp");


if (ffmpegPath) {
    console.log("✅ FFmpeg:", ffmpegPath);
    process.env.FFMPEG_PATH = ffmpegPath;
} else {
    console.log("❌ FFmpeg não encontrado");
}


if (ytDlpPath) {
    console.log("✅ yt-dlp:", ytDlpPath);
} else {
    console.log("⚠️ yt-dlp não encontrado");
}


// ===============================
// Discord
// ===============================

const client = new Client({

    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ],

    partials:[
        Partials.Channel
    ]

});


// ===============================
// DisTube
// ===============================


const distube = new DisTube(client, {

    emitNewSongOnly:false,

    plugins:[
        new YtDlpPlugin({
            update:false
        })
    ]

});



// ===============================
// Eventos
// ===============================


client.once("ready",()=>{

    console.log(
        `🤖 Online como ${client.user.tag}`
    );

});



distube.on(
    "playSong",
    (queue,song)=>{

        queue.textChannel?.send(
`▶️ Tocando agora:
**${song.name}**
⏱️ ${song.formattedDuration}`
        );

    }
);



distube.on(
    "addSong",
    (queue,song)=>{

        queue.textChannel?.send(
`➕ Adicionado:
**${song.name}**`
        );

    }
);



distube.on(
    "error",
    (channel,error)=>{

        console.error(error);

        channel?.send(
`❌ Erro no player:
\`\`\`
${error.message}
\`\`\``
        ).catch(()=>{});

    }
);



// ===============================
// Comandos
// ===============================


client.on(
"messageCreate",
async message=>{


if(
message.author.bot ||
!message.guild ||
!message.content.startsWith(PREFIX)
)
return;


const args =
message.content
.slice(PREFIX.length)
.trim()
.split(/ +/);


const command =
args.shift().toLowerCase();


const query =
args.join(" ");



try{


if(
command==="play" ||
command==="p"
){

const voice =
message.member.voice.channel;


if(!voice)
return message.reply(
"❌ Entre em um canal de voz."
);



if(!query)
return message.reply(
"❌ Informe uma música."
);



await distube.play(
voice,
query,
{

textChannel:
message.channel,

member:
message.member

});

}



else if(
command==="skip"
){

const queue =
distube.getQueue(
message.guildId
);


if(!queue)
return;


await queue.skip();


message.reply(
"⏭️ Música pulada."
);

}



else if(
command==="stop"
){

const queue =
distube.getQueue(
message.guildId
);


if(!queue)
return;


queue.stop();


message.reply(
"⏹️ Player parado."
);

}



else if(
command==="pause"
){

const queue =
distube.getQueue(
message.guildId
);


if(queue){

queue.pause();

message.reply(
"⏸️ Pausado."
);

}

}



else if(
command==="resume"
){

const queue =
distube.getQueue(
message.guildId
);


if(queue){

queue.resume();

message.reply(
"▶️ Continuando."
);

}

}



else if(
command==="queue"
){

const queue =
distube.getQueue(
message.guildId
);


if(!queue)
return message.reply(
"❌ Fila vazia."
);



const list =
queue.songs
.slice(0,10)
.map(
(song,i)=>
`${i+1}. ${song.name}`
)
.join("\n");


message.reply(
`🎵 Fila:
${list}`
);

}



}catch(err){

console.error(err);


message.reply(
`❌ Erro geral:
\`\`\`
${err.message}
\`\`\``
).catch(()=>{});


}


});




// ===============================
// Login
// ===============================

if(!TOKEN){

console.log(
"❌ TOKEN não configurado"
);

process.exit(1);

}


client.login(TOKEN);
