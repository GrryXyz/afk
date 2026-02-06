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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const connections = new Map();
const players = new Map();

/* ===== GLOBAL COMMAND ===== */
const commands = [
  new SlashCommandBuilder().setName("join").setDescription("Bot join voice (MIC ON)"),
  new SlashCommandBuilder().setName("leave").setDescription("Bot keluar dari voice")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("🌍 Global command registered");
})();

/* ===== MIC ON SILENT AUDIO ===== */
function playSilentMicOn(guildId, connection) {
  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play
    }
  });

  players.set(guildId, player);

  const ffmpeg = spawn("ffmpeg-static", [
    "-f", "lavfi",
    "-i", "anullsrc=r=48000:cl=stereo",
    "-ac", "2",
    "-ar", "48000",
    "-f", "s16le",
    "-"
  ]);

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Raw,
    inlineVolume: false
  });

  player.play(resource);
  connection.subscribe(player);

  player.on(AudioPlayerStatus.Idle, () => {
    player.play(resource); // loop forever
  });
}

/* ===== READY ===== */
client.once(Events.ClientReady, (c) => {
  console.log(`🤖 Online sebagai ${c.user.tag}`);
  c.user.setActivity("AFK Voice 24/7 🎤", {
    type: ActivityType.Playing
  });
});

/* ===== INTERACTION ===== */
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

    // 🔁 AUTO REJOIN PALING KERAS
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
        ]);
      } catch {
        console.log("🔁 Force rejoin voice");
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

