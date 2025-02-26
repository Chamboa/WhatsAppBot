const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const axios = require("axios");
const moment = require("moment");
const http = require("http");

const client = new Client({
    authStrategy: new LocalAuth(),
});

client.on("qr", (qr) => {
    console.log("Escanea el código QR con tu teléfono:");
    qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
    console.log("¡Sesión iniciada correctamente!");
    console.log("Tu ID de WhatsApp es:", client.info.wid._serialized);
});

// Usar variables de entorno
const myChatId = process.env.MY_CHAT_ID;
const webhookUrl = process.env.WEBHOOK_URL;

function extraerInformacion(texto) {
    // Expresión regular con más palabras clave y variantes
    const eventoRegex = /(evento|tarea|recordatorio|cita|reunión|cumpleaños|alarma|compromiso|junta|encuentro|sesión|conferencia|seminario|taller|actividad|plan|aviso|notificación|anuncio)\s+([^\d]+)?/i;
    const fechaRegex = /(\d{1,2})\s*(?:de)?\s*(\w+)\s*(?:de\s*(\d{4}))?/i;
    const horaRegex = /(\d{1,2}[:h]\d{2})\s*(am|pm)?/i;

    const eventoMatch = texto.match(eventoRegex);
    const fechaMatch = texto.match(fechaRegex);
    const horaMatch = texto.match(horaRegex);

    if (eventoMatch && fechaMatch && horaMatch) {
        const descripcion = eventoMatch[2] ? eventoMatch[2].trim() : "Sin descripción";
        const dia = fechaMatch[1].padStart(2, "0");
        const anoActual = new Date().getFullYear();
        let ano = fechaMatch[3] || anoActual;
        let mesTexto = fechaMatch[2].toLowerCase();

        const meses = {
            "enero": "01", "febrero": "02", "marzo": "03", "abril": "04", "mayo": "05", "junio": "06",
            "julio": "07", "agosto": "08", "septiembre": "09", "octubre": "10", "noviembre": "11", "diciembre": "12"
        };

        let mes = meses[mesTexto] || "00";

        if (mes === "00") {
            console.error("Mes no válido en el mensaje:", texto);
            return null;
        }

        const fechaActual = new Date();
        const fechaEvento = new Date(`${ano}-${mes}-${dia}`);

        if (fechaEvento < fechaActual) {
            ano = parseInt(ano) + 1;
        }

        const fechaFormato = `${mes}/${dia}/${ano}`;
        let horaFormato = horaMatch[1].replace("h", ":");

        if (horaMatch[2]) {
            horaFormato = moment(horaFormato + " " + horaMatch[2], "hh:mm a").format("HH:mm");
        }

        return {
            descripcion,
            fecha: fechaFormato,
            hora: horaFormato,
        };
    } else {
        return null;
    }
}

client.on("message_create", async (message) => {
    try {
        const chat = await message.getChat();
        if (chat.id._serialized === myChatId) {
            console.log(`Mensaje detectado en el chat privado: ${message.body}`);

            const mensajeInterpretado = extraerInformacion(message.body);

            if (mensajeInterpretado) {
                console.log("Mensaje interpretado como evento:", mensajeInterpretado);

                try {
                    console.log("Enviando datos a Make.com...");
                    const response = await axios.post(webhookUrl, mensajeInterpretado, {
                        headers: {
                            "Content-Type": "application/json",
                        },
                    });
                    console.log("Datos enviados a Make.com:", response.data);
                } catch (error) {
                    console.error("Error al enviar datos a Make.com:", error.message);
                    if (error.response) {
                        console.error("Respuesta del servidor:", error.response.data);
                    }
                }
            } else {
                console.log("El mensaje no es para agregar un evento y será ignorado.");
            }
        } else {
            console.log(`Mensaje ignorado de otro chat (${chat.id._serialized}): ${message.body}`);
        }
    } catch (error) {
        console.error("Error al procesar el mensaje:", error);
    }
});

client.on("auth_failure", (msg) => {
    console.error("Error de autenticación:", msg);
});

client.on("disconnected", (reason) => {
    console.error("Sesión desconectada:", reason);
});

client.initialize();

// Servidor HTTP básico para Render
const server = http.createServer((req, res) => {
    if (req.url === "/ping") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("pong");
    } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("WhatsApp Bot is running...");
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});

// Función para hacer ping al servidor cada 10 minutos
function keepAlive() {
    const url = `http://localhost:${PORT}/ping`; // Usa la URL de tu aplicación en Render si es diferente
    axios.get(url)
        .then(response => {
            console.log("Ping exitoso:", response.data);
        })
        .catch(error => {
            console.error("Error al hacer ping:", error.message);
        });
}

// Ejecutar keepAlive cada 10 minutos (600,000 milisegundos)
setInterval(keepAlive, 600000); // 10 minutos
