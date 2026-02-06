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
  StreamType,
  NoSubscriberBehavior
} = require("@discordjs/voice");

const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// simpan koneksi & player per server
const connections = new Map();
const players = new Map();

/* ================= GLOBAL SLASH COMMAND ================= */
const commands = [
  new SlashCommandBuilder()
    .setName("join")
    .setDescription("Bot join voice (MIC ON, anti disconnect)"),
  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Bot keluar dari voice")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log("🌍 Global command registered");
  } catch (err) {
    console.error(err);
  }
})();

/* ================= SILENT AUDIO (MIC ON) ================= */
function playSilentMicOn(guildId, connection) {
  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play
    }
  });

  players.set(guildId, player);

  const ffmpeg = spawn(ffmpegPath, [
    "-f", "lavfi",
    "-i", "anullsrc=r=48000:cl=stereo",
    "-ac", "2",
    "-ar", "48000",
    "-f", "s16le",
    "-"
  ]);

  ffmpeg.on("error", (err) => {
    console.error("❌ FFmpeg error:", err);
  });

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Raw
  });

  player.play(resource);
  connection.subscribe(player);

  // loop terus biar Discord anggap aktif
  player.on(AudioPlayerStatus.Idle, () => {
    player.play(resource);
  });
}

/* ================= READY (V15) ================= */
client.once(Events.ClientReady, (c) => {
  console.log(`🤖 Online sebagai ${c.user.tag}`);
  c.user.setActivity("AFK Voice 24/7 🎤", {
    type: ActivityType.Playing
  });
});

/* ================= INTERACTION ================= */
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand()) return;

  /* ===== JOIN ===== */
  if (i.commandName === "join") {
    const vc = i.member.voice.channel;
    if (!vc)
      return i.reply({
        content: "❌ Masuk voice dulu",
        ephemeral: true
      });

    const connection = joinVoiceChannel({
      channelId: vc.id,
      guildId: i.guild.id,
      adapterCreator: i.guild.voiceAdapterCreator,
      selfMute: false, // 🎤 MIC ON
      selfDeaf: true
    });

    connections.set(i.guild.id, connection);
    playSilentMicOn(i.guild.id, connection);

    // 🔁 auto reconnect keras
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
        ]);
      } catch {
        console.log("🔁 Force rejoin voice...");
        const newConn = joinVoiceChannel({
          channelId: vc.id,
          guildId: i.guild.id,
          adapterCreator: i.guild.voiceAdapterCreator,
          selfMute: false,
          selfDeaf: true
        });
        connections.set(i.guild.id, newConn);
        playSilentMicOn(i.guild.id, newConn);
      }
    });

    i.reply("✅ Bot join voice (🎤 MIC ON • ANTI DISCONNECT)");
  }

  /* ===== LEAVE ===== */
  if (i.commandName === "leave") {
    const conn = connections.get(i.guild.id);
    if (!conn)
      return i.reply({
        content: "❌ Bot tidak di voice",
        ephemeral: true
      });

    conn.destroy();
    connections.delete(i.guild.id);
    players.delete(i.guild.id);

    i.reply("👋 Bot keluar dari voice");
  }
});

client.login(TOKEN);
