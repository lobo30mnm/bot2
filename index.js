const { execSync } = require("child_process");

try {
  console.log("FFmpeg:", execSync("ffmpeg -version").toString().split("\n")[0]);
  console.log("yt-dlp:", execSync("yt-dlp --version").toString().trim());
} catch (e) {
  console.log("Dependências não encontradas");
}
