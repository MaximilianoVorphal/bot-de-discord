require("dotenv").config();
const { Client, GatewayIntentBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require("discord.js");
const wol = require("wol");
const { NodeSSH } = require("node-ssh");
//const ping = require("mc-ping-updated"); // Nueva librería para verificar el estado de Minecraft

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const ssh = new NodeSSH();

const MAC_ADDRESS = process.env.MAC_ADDRESS;
const SSH_CONFIG = {
    host: process.env.SSH_HOST,
    username: process.env.SSH_USER,
    password: process.env.SSH_PASSWORD,
    port: process.env.SSH_PORT || 22
};
const MINECRAFT_SERVER = { host: process.env.MC_SERVER_HOST, port: process.env.MC_SERVER_PORT || 25565 };

let statusMessage; // Variable para guardar el mensaje a actualizar

// Función para crear el embed estilizado
function createStatusEmbed(pcStatus, mcStatus) {
    return new EmbedBuilder()
        .setTitle("🎮 Control del PC y Servidor de Minecraft")
        .setDescription("Usa los botones para manejar el Servidor o consultar el estado del servidor-minecraft.")
        .addFields(
            { name: "🖥️ Estado del PC", value: pcStatus, inline: true },
            { name: "🌐 Estado del Servidor de Minecraft", value: mcStatus, inline: true }
        )
        .setColor(pcStatus === "Encendido" ? 0x57f287 : 0xed4245)
        .setFooter({ text: "Control Servidor fedora thinkpad", iconURL: client.user.displayAvatarURL() })
        .setTimestamp();
}

// Función para ejecutar comandos SSH y obtener el estado del PC
async function getPCStatus() {
    try {
        await ssh.connect(SSH_CONFIG);
        const result = await ssh.execCommand("uptime");
        ssh.dispose();
        return "Encendido"; // Si responde, el PC está encendido
    } catch (error) {
        return "Apagado"; // Si no se puede conectar, asumimos que está apagado
    }
}

// Función para obtener el estado del servidor de Minecraft
const { ping } = require("minecraft-ping");

async function getMinecraftStatus() {
    try {
        console.log(`⏳ Consultando el servidor de Minecraft en ${MINECRAFT_SERVER.host}:${MINECRAFT_SERVER.port}...`);

        return new Promise((resolve, reject) => {
            // Configurar los parámetros del ping
            ping(
                {
                    host: MINECRAFT_SERVER.host, // Dirección del servidor
                    port: parseInt(MINECRAFT_SERVER.port), // Puerto del servidor
                    timeout: 3000, // Timeout en milisegundos
                },
                (err, response) => {
                    if (err) {
                        console.error("❌ Error al consultar el servidor de Minecraft:", err.message);
                        resolve("🔴 Fuera de línea");
                    } else {
                        console.log("✅ Respuesta completa del servidor de Minecraft:", response);

                        // Verificar y devolver el estado
                        if (response && response.players) {
                            resolve(`🟢 En línea - Jugadores: ${response.players.online}/${response.players.max}`);
                        } else {
                            resolve("🔴 Servidor en línea, pero no se pudo obtener información de los jugadores.");
                        }
                    }
                }
            );
        });
    } catch (error) {
        console.error("❌ Error inesperado al consultar el servidor de Minecraft:", error.message);
        return "🔴 Fuera de línea";
    }
}


// Evento: Bot listo
client.once("ready", async () => {
    console.log(`🤖 Bot iniciado como ${client.user.tag}`);

    const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
        console.error("El canal especificado no es válido o no es un canal de texto.");
        return;
    }

    // Obtener el estado inicial del PC y el servidor de Minecraft
    const initialPCStatus = await getPCStatus();
    const initialMCStatus = await getMinecraftStatus();

    // Crear el mensaje con los botones y el embed inicial
    const embed = createStatusEmbed(initialPCStatus, initialMCStatus);
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("encender")
                .setLabel("🟢 Encender PC")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("apagar")
                .setLabel("🔴 Apagar PC")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId("reiniciar")
                .setLabel("🔄 Reiniciar PC")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("status")
                .setLabel("🔍 Actualizar Estado")
                .setStyle(ButtonStyle.Secondary)
        );

    // Enviar el mensaje inicial y guardar la referencia
    statusMessage = await channel.send({ embeds: [embed], components: [buttons] });
});

// Interacciones con los botones
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    await interaction.reply({ content: "⏳ Procesando la solicitud...", ephemeral: true });

    let pcStatus;
    let mcStatus;
    try {
        if (interaction.customId === "encender") {
            wol.wake(MAC_ADDRESS, async (err) => {
                if (err) {
                    throw new Error("Error al enviar el paquete WOL.");
                }
            });
            pcStatus = "Encendiendo...";
        } else if (interaction.customId === "apagar") {
            await ssh.connect(SSH_CONFIG);
            await ssh.execCommand("shutdown now");
            ssh.dispose();
            pcStatus = "Apagado";
        } else if (interaction.customId === "reiniciar") {
            await ssh.connect(SSH_CONFIG);
            await ssh.execCommand("reboot");
            ssh.dispose();
            pcStatus = "Apagado";
        }

        pcStatus = await getPCStatus();
        mcStatus = await getMinecraftStatus();
    } catch (error) {
        console.error("Error en la operación:", error.message);

        pcStatus = "Apagado";
        mcStatus = "🔴 Fuera de línea";
    }

    const embed = createStatusEmbed(pcStatus, mcStatus);

    if (statusMessage) {
        await statusMessage.edit({ embeds: [embed] });
    } else {
        console.error("El mensaje de estado no existe.");
    }

    setTimeout(() => {
        interaction.deleteReply();
    }, 5000);
});

process.on("uncaughtException", (error) => {
    console.error("⚠️ Excepción no capturada:", error.message);
});

process.on("unhandledRejection", (reason) => {
    console.error("⚠️ Rechazo no manejado:", reason);
});

client.login(process.env.DISCORD_TOKEN);
