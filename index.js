require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  Events,
  ActivityType
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

let connections = new Map(); // multi-server ready
let player = createAudioPlayer();

/* ================= GLOBAL SLASH COMMAND ================= */
const commands = [
  new SlashCommandBuilder()
    .setName("join")
    .setDescription("Bot join voice (AFK 24/7 anti disconnect)"),
  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Bot keluar dari voice")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("🌍 Global slash command registered (v15)");
  } catch (e) {
    console.error(e);
  }
})();

/* ================= SILENT AUDIO ================= */
function playSilent(connection) {
  const ffmpeg = spawn("ffmpeg-static", [
    "-f", "lavfi",
    "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-ar", "48000",
    "-ac", "2",
    "-f", "s16le",
    "-"
  ]);

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Raw
  });

  player.play(resource);
  connection.subscribe(player);

  player.on(AudioPlayerStatus.Idle, () => {
    player.play(resource);
  });
}

/* ================= READY (V15 STYLE) ================= */
client.once(Events.ClientReady, (c) => {
  console.log(`🤖 Online sebagai ${c.user.tag}`);
  c.user.setActivity("AFK Voice 24/7", { type: ActivityType.Watching });
});

/* ================= INTERACTION ================= */
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  /* ---- JOIN ---- */
  if (interaction.commandName === "join") {
    const vc = interaction.member.voice.channel;
    if (!vc)
      return interaction.reply({
        content: "❌ Masuk voice dulu",
        ephemeral: true
      });

    const connection = joinVoiceChannel({
      channelId: vc.id,
      guildId: interaction.guild.id,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfMute: false,
      selfDeaf: true
    });

    connections.set(interaction.guild.id, connection);
    playSilent(connection);

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
        ]);
      } catch {
        connections.delete(interaction.guild.id);
      }
    });

    interaction.reply("✅ Bot join voice (anti disconnect aktif)");
  }

  /* ---- LEAVE ---- */
  if (interaction.commandName === "leave") {
    const connection = connections.get(interaction.guild.id);
    if (!connection)
      return interaction.reply({
        content: "❌ Bot tidak di voice",
        ephemeral: true
      });

    connection.destroy();
    connections.delete(interaction.guild.id);

    interaction.reply("👋 Bot keluar dari voice");
  }
});

client.login(TOKEN);

