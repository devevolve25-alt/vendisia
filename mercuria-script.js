// 1. Captura dinâmica de parâmetros da URL
const urlParams = new URLSearchParams(window.location.search);
const clienteNome = urlParams.get('nome') || "";
const clienteEmpresa = urlParams.get('empresa') || "";

document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const initialMsg = document.getElementById('initial-message');

    // Inicialização personalizada baseada nos dados do link de e-mail
    if (clienteNome) {
        initialMsg.innerHTML = `Olá, <strong>${clienteNome}</strong>! Eu sou MercurIA. Já estou analisando o cenário da <strong>${clienteEmpresa || 'sua empresa'}</strong>. Como posso acelerar seu lucro hoje?`;
    } else {
        initialMsg.innerHTML = "Eu sou MercurIA. Estou pronta para transformar seu atendimento em uma máquina imparável de lucro. Como posso ajudar seu negócio hoje?";
    }

    // Ajuste automático de altura para o campo multiline
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // Envio por botão ou Enter (sem Shift)
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
});

// Função de exibição de mensagens com suporte a HTML (para botões/links)
function appendMessage(text, side) {
    const chatBox = document.getElementById('chat-box');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${side}`;
    
    // Usamos innerHTML para renderizar botões enviados pelo n8n
    msgDiv.innerHTML = text; 
    
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('user-input');
    const msgText = input.value.trim();
    if (!msgText) return;

    // Exibe mensagem do usuário
    appendMessage(msgText, 'user');
    input.value = "";
    input.style.height = 'auto';

    try {
        const response = await fetch('https://powerfulkiwi-n8n.cloudfy.live/webhook/02600645-55d0-49a8-9a66-db4d86aaa1e5', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: msgText, 
                entity: 'MercurIA',
                metadata: {
                    nome: clienteNome,
                    empresa: clienteEmpresa,
                    source: "mercuria_chat_page"
                }
            })
        });
        const data = await response.json();
        
        // Renderiza a resposta do bot (Texto + Link/Botão se houver)
        const botResponse = data.output || data.text || "MercurIA está processando sua solicitação...";
        appendMessage(botResponse, 'bot');
        
    } catch (error) {
        appendMessage('Falha na comunicação com o Panteão. Verifique sua conexão.', 'bot');
    }
}
