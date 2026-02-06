
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType
} = require("@discordjs/voice");

const { spawn } = require("child_process");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

let connection;
let player;

const commands = [
  new SlashCommandBuilder().setName("join").setDescription("Bot join voice (AFK 24/7)"),
  new SlashCommandBuilder().setName("leave").setDescription("Bot keluar dari voice")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("Global command ready");
})();

function playSilent(conn) {
  if (!player) player = createAudioPlayer();

  const ffmpeg = spawn("ffmpeg-static", [
    "-f", "lavfi",
    "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-ar", "48000",
    "-ac", "2",
    "-f", "s16le",
    "-"
  ]);

  const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw });
  player.play(resource);
  conn.subscribe(player);

  player.on(AudioPlayerStatus.Idle, () => player.play(resource));
}

client.once("ready", () => {
  console.log(`Online sebagai ${client.user.tag}`);
});

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === "join") {
    const vc = i.member.voice.channel;
    if (!vc) return i.reply({ content: "Masuk voice dulu", ephemeral: true });

    connection = joinVoiceChannel({
      channelId: vc.id,
      guildId: i.guild.id,
      adapterCreator: i.guild.voiceAdapterCreator,
      selfMute: false,
      selfDeaf: true
    });

    playSilent(connection);
    i.reply("Bot join voice (anti disconnect aktif)");
  }

  if (i.commandName === "leave") {
    if (!connection) return i.reply({ content: "Bot tidak di voice", ephemeral: true });
    connection.destroy();
    connection = null;
    player = null;
    i.reply("Bot keluar voice");
  }
});

client.login(TOKEN);
