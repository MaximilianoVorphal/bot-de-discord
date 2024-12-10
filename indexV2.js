require("dotenv").config();

const { Client, GatewayIntentBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require("discord.js");
const wol = require("wol");
const { NodeSSH } = require("node-ssh");
const { ping } = require("minecraft-ping");

// ----> Configuración del cliente Discord <----
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ----> Configuración de SSH <----
const ssh = new NodeSSH();

// ----> Constantes <----
const BUTTON_ENCENDER = "encender";
const BUTTON_APAGAR = "apagar";
const BUTTON_REINICIAR = "reiniciar";
const BUTTON_ACTUALIZAR = "actualizar";
const ROL_PERMITIDO = process.env.ROL_PERMITIDO; 

const MAC_ADDRESS = process.env.MAC_ADDRESS;
const SSH_CONFIG = {
    host: process.env.SSH_HOST,
    username: process.env.SSH_USER,
    password: process.env.SSH_PASSWORD, // Considera usar un sistema de gestión de secretos en lugar de guardar la contraseña aquí
    port: process.env.SSH_PORT || 22
};
const MINECRAFT_SERVER = { 
    host: process.env.MC_SERVER_HOST, 
    port: process.env.MC_SERVER_PORT || 25565 
};

// ----> Variables globales <----
let statusMessage; 

// ----> Funciones <----

/**
 * Crea un embed de Discord con el estado del PC y del servidor de Minecraft.
 * @param {string} pcStatus Estado del PC ("Encendido" o "Apagado").
 * @param {string} mcStatus Estado del servidor de Minecraft.
 * @returns {EmbedBuilder} Embed de Discord.
 */
function createStatusEmbed(pcStatus, mcStatus) {
    const embed = new EmbedBuilder()
        .setTitle("🎮 Control del servidor y Status servidor de Minecraft")
        .setDescription("La idea es apagar el servidor cuando no se esta en uso y asi ahorrando energia para no matar al arbolito. Usa los botones para manejar el servidor o consultar el estado del servidor de Minecraft.")
        .addFields(
            { name: "🖥️ Estado del Servidor", value: pcStatus, inline: true },
            { name: "🌐 Estado del Servidor de Minecraft", value: mcStatus, inline: true }
        )
        .setFooter({ text: "Control servidor thinkpad fedora", iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

    // Cambiar el color del embed según el estado del PC
    if (pcStatus === "Encendido") {
        embed.setColor(0x57f287); // Verde
    } else {
        embed.setColor(0xed4245); // Rojo
    }

    return embed;
}

/**
 * Obtiene el estado del PC mediante SSH.
 * @returns {Promise<string>} Estado del PC ("Encendido" o "Apagado").
 */
async function getPCStatus() {
    try {
        await ssh.connect(SSH_CONFIG);
        await ssh.execCommand("uptime"); // Ejecutar un comando simple para verificar la conexión
        ssh.dispose();
        return "Encendido"; 
    } catch (error) {
        console.error("Error al obtener el estado del PC:", error); 
        return "Apagado"; 
    }
}

/**
 * Obtiene el estado del servidor de Minecraft usando 'minecraft-ping'.
 * @returns {Promise<string>} Estado del servidor de Minecraft.
 */
async function getMinecraftStatus() {
    try {
        console.log(`⏳ Consultando el servidor de Minecraft en ${MINECRAFT_SERVER.host}:${MINECRAFT_SERVER.port}...`);

        return new Promise((resolve) => {
            ping(
                {
                    host: MINECRAFT_SERVER.host,
                    port: parseInt(MINECRAFT_SERVER.port),
                    timeout: 3000,
                },
                (err, response) => {
                    if (err) {
                        console.error("❌ Error al consultar el servidor de Minecraft:", err.message);
                        resolve("🔴 Fuera de línea");
                    } else if (response) {
                        console.log("✅ Respuesta completa del servidor de Minecraft:", response);
                        resolve(`🟢 En línea - Jugadores: ${response.playersOnline}/20`);
                    } else {
                        console.log(response);
                        console.warn("🔴 Servidor en línea, pero no se pudo obtener información de los jugadores.");
                        resolve("🔴 Servidor en línea, pero no se pudo obtener información de los jugadores.");
                    }
                }
            );
        });
    } catch (error) {
        console.error("❌ Error inesperado al consultar el servidor de Minecraft:", error);
        return "🔴 Fuera de línea";
    }
}

/**
 * Envía una solicitud WOL para encender el PC.
 * @param {Interaction} interaction Objeto de interacción de Discord.
 */
async function handleEncenderPC(interaction) {
    await interaction.reply({ content: "⏳ Encendiendo el PC...", ephemeral: true });
    try {
        wol.wake(MAC_ADDRESS, async (err) => {
            if (err) {
                console.error("Error al enviar el paquete WOL:", err);
                await interaction.editReply({ content: "❌ Error al encender el PC. Verifica la dirección MAC y la red.", ephemeral: true });
                return;
            }
            await interaction.editReply({ content: "✅ Solicitud de encendido enviada. El PC puede tardar unos 30 segundos en encenderse.", ephemeral: true });
        });
    } catch (error) {
        console.error("Error al encender el PC:", error);
        await interaction.editReply({ content: "❌ Error al encender el PC.", ephemeral: true });
    }
}

/**
 * Apaga el PC mediante SSH.
 * @param {Interaction} interaction Objeto de interacción de Discord.
 */
async function handleApagarPC(interaction) {
    await interaction.reply({ content: "⏳ Apagando el PC...", ephemeral: true });
    try {
        await ssh.connect(SSH_CONFIG);
        await ssh.execCommand("shutdown now");
        ssh.dispose();
        await interaction.editReply({ content: "✅ PC apagado.", ephemeral: true });
    } catch (error) {
        console.error("Error al apagar el PC:", error);
        await interaction.editReply({ content: "❌ Error al apagar el PC. Verifica la conexión SSH.", ephemeral: true });
    }
}

/**
 * Reinicia el PC mediante SSH.
 * @param {Interaction} interaction Objeto de interacción de Discord.
 */
async function handleReiniciarPC(interaction) {
    await interaction.reply({ content: "⏳ Reiniciando el PC...", ephemeral: true });
    try {
        await ssh.connect(SSH_CONFIG);
        await ssh.execCommand("reboot");
        ssh.dispose();
        await interaction.editReply({ content: "✅ PC reiniciado.", ephemeral: true });
    } catch (error) {
        console.error("Error al reiniciar el PC:", error);
        await interaction.editReply({ content: "❌ Error al reiniciar el PC. Verifica la conexión SSH.", ephemeral: true });
    }
}

/**
 * Actualiza el estado del PC y del servidor de Minecraft en el mensaje del bot.
 * @param {Interaction} interaction Objeto de interacción de Discord.
 */
async function handleActualizarEstado(interaction) {
    await interaction.deferReply({ ephemeral: true }); 
    try {
        const pcStatus = await getPCStatus();
        const mcStatus = await getMinecraftStatus();
        const embed = createStatusEmbed(pcStatus, mcStatus);
        await statusMessage.edit({ embeds: [embed] });
        await interaction.editReply({ content: "✅ Estado actualizado.", ephemeral: true });
    } catch (error) {
        console.error("Error al actualizar el estado:", error);
        await interaction.editReply({ content: "❌ Error al actualizar el estado.", ephemeral: true });
    }
}

// ----> Eventos del cliente Discord <----

/**
 * Evento que se ejecuta cuando el bot está listo.
 */
client.once("ready", async () => {
    console.log(`🤖 Bot iniciado como ${client.user.tag}`);

    const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
        console.error("El canal especificado no es válido o no es un canal de texto.");
        return;
    }

    try {
        const initialPCStatus = await getPCStatus();
        const initialMCStatus = await getMinecraftStatus();
        const embed = createStatusEmbed(initialPCStatus, initialMCStatus);

        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(BUTTON_ENCENDER)
                    .setLabel("🟢 Encender PC")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(BUTTON_APAGAR)
                    .setLabel("🔴 Apagar PC")
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(BUTTON_REINICIAR)
                    .setLabel("🔄 Reiniciar PC")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(BUTTON_ACTUALIZAR)
                    .setLabel("🔍 Actualizar Estado")
                    .setStyle(ButtonStyle.Secondary)
            );

        statusMessage = await channel.send({ embeds: [embed], components: [buttons] });
    } catch (error) {
        console.error("Error al iniciar el bot:", error);
    }

    setInterval(async () => {
        try {
            const mcStatus = await getMinecraftStatus();
            const pcStatus = await getPCStatus(); // Obtener también el estado del PC
            const embed = createStatusEmbed(pcStatus, mcStatus);
            await statusMessage.edit({ embeds: [embed] });
            console.log("✅ Estado del servidor de Minecraft actualizado.");
        } catch (error) {
            console.error("❌ Error al actualizar el estado del servidor de Minecraft:", error);
        }
    }, 5 * 60 * 1000); // 5 minutos en milisegundos

});

/**
 * Evento que se ejecuta cuando se interactúa con un botón.
 */
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    // Verificar si el usuario tiene el rol permitido
    const member = interaction.member;
    if (!member.roles.cache.has(ROL_PERMITIDO)) {
        await interaction.reply({ 
            content: "❌ No tienes permiso para usar estos botones.", 
            ephemeral: true 
        });
        return;
    }

    switch (interaction.customId) {
        case BUTTON_ENCENDER:
            handleEncenderPC(interaction);
            break;
        case BUTTON_APAGAR:
            handleApagarPC(interaction);
            break;
        case BUTTON_REINICIAR:
            handleReiniciarPC(interaction);
            break;
        case BUTTON_ACTUALIZAR:
            handleActualizarEstado(interaction);
            break;
    }
});

// ----> Manejo de errores globales <----
process.on("uncaughtException", (error) => {
    console.error("⚠️ Excepción no capturada:", error);
    // Considera registrar el error en un archivo o servicio externo
});

process.on("unhandledRejection", (reason) => {
    console.error("⚠️ Rechazo no manejado:", reason);
    // Considera registrar el error en un archivo o servicio externo
});

// ----> Iniciar el bot <----
client.login(process.env.DISCORD_TOKEN);