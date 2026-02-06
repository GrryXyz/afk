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
  NoSubscriberBehavior,
  StreamType
} = require("@discordjs/voice");

const { Readable } = require("stream");

/* ================= CLIENT ================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

/* ================= STORAGE ================= */
const connections = new Map();
const players = new Map();

/* ================= GLOBAL COMMAND ================= */
const commands = [
  new SlashCommandBuilder()
    .setName("join")
    .setDescription("Bot join voice (AFK 24/7, mic ON)"),
  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Bot keluar dari voice")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("🌍 Global command ready");
})();

/* ================= INFINITE SILENT STREAM ================= */
function createInfiniteSilentStream() {
  return new Readable({
    read() {
      this.push(Buffer.alloc(3840)); // 20ms silent PCM (48kHz stereo)
    }
  });
}

/* ================= PLAY SILENT (ANTI IDLE) ================= */
function keepAliveVoice(guildId, connection) {
  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play
    }
  });

  players.set(guildId, player);

  const stream = createInfiniteSilentStream();
  const resource = createAudioResource(stream, {
    inputType: StreamType.Raw,
    inlineVolume: false
  });

  player.play(resource);
  connection.subscribe(player);

  player.on(AudioPlayerStatus.Idle, () => {
    player.play(resource);
  });
}

/* ================= READY ================= */
client.once(Events.ClientReady, (c) => {
  console.log(`🤖 Online sebagai ${c.user.tag}`);
  c.user.setActivity("AFK Voice 24/7 🎤", {
    type: ActivityType.Playing
  });
});

/* ================= COMMAND HANDLER ================= */
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand()) return;

  /* ===== JOIN ===== */
  if (i.commandName === "join") {
    const vc = i.member.voice.channel;
    if (!vc)
      return i.reply({ content: "❌ Masuk voice dulu", ephemeral: true });

    const connection = joinVoiceChannel({
      channelId: vc.id,
      guildId: i.guild.id,
      adapterCreator: i.guild.voiceAdapterCreator,
      selfMute: false, // 🎤 MIC ON
      selfDeaf: true,
      preferredEncryptionMode: "aead_xchacha20_poly1305_rtpsize"
    });

    connections.set(i.guild.id, connection);
    keepAliveVoice(i.guild.id, connection);

    /* ===== STRONG RECONNECT ===== */
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
        ]);
      } catch {
        const newConn = joinVoiceChannel({
          channelId: vc.id,
          guildId: i.guild.id,
          adapterCreator: i.guild.voiceAdapterCreator,
          selfMute: false,
          selfDeaf: true,
          preferredEncryptionMode: "aead_xchacha20_poly1305_rtpsize"
        });

        connections.set(i.guild.id, newConn);
        keepAliveVoice(i.guild.id, newConn);
      }
    });

    return i.reply("✅ Bot join voice (AFK 24/7 • MIC ON • ANTI KELUAR)");
  }

  /* ===== LEAVE ===== */
  if (i.commandName === "leave") {
    const conn = connections.get(i.guild.id);
    if (!conn)
      return i.reply({ content: "❌ Bot tidak di voice", ephemeral: true });

    conn.destroy();
    connections.delete(i.guild.id);
    players.delete(i.guild.id);

    return i.reply("👋 Bot keluar dari voice");
  }
});

/* ================= LOGIN ================= */
client.login(TOKEN);

