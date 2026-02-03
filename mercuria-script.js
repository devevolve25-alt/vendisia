const WEBHOOK_URL = 'https://powerfulkiwi-n8n.cloudfy.live/webhook/mercuria.sls-agnt'; 

// --- NOVO: Gatilho de entrada automática ---
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const nome = params.get('nome');
    
    if (nome) {
        // Pequeno delay para o cliente ver o chat carregar antes da IA falar
        setTimeout(() => {
            // Enviamos um comando oculto para a IA saber que deve saudar o cliente
            sendAutomatedTrigger(`AÇÃO_GATILHO: O cliente ${nome} acabou de chegar pelo link do e-mail. Saude-o pelo nome.`);
        }, 1500);
    }
});

// Função para disparar a mensagem automática sem o usuário digitar
async function sendAutomatedTrigger(triggerText) {
    const loadingId = addMessage("MercurIA is thinking...", 'bot loading');
    
    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: 'cors',
            body: JSON.stringify({ 
                content: triggerText,
                user_name: new URLSearchParams(window.location.search).get('nome') || 'Guest',
                user_company: new URLSearchParams(window.location.search).get('empresa') || 'Company',
                is_trigger: true // Informa ao n8n que é um gatilho de sistema
            })
        });

        const data = await response.json();
        removeMessage(loadingId);

        const botReply = data.output || data.message || data.text || data.reply || 
                         (typeof data === 'string' ? data : "Olá! Como posso ajudar?");
        
        addMessage(botReply, 'bot');
    } catch (error) {
        removeMessage(loadingId);
        console.error("Trigger Fail:", error);
    }
}

async function sendMessage(event) {
    if (event) event.preventDefault();

    const input = document.getElementById('user-input');
    const message = input.value.trim();
    if (!message) return;

    addMessage(message, 'user');
    input.value = '';

    const loadingId = addMessage("MercurIA is thinking...", 'bot loading');

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: 'cors',
            body: JSON.stringify({ 
                content: message,
                user_name: new URLSearchParams(window.location.search).get('nome') || 'Guest',
                user_company: new URLSearchParams(window.location.search).get('empresa') || 'Company'
            })
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const data = await response.json();
        removeMessage(loadingId);

        const botReply = data.output || data.message || data.text || data.reply || 
                         (typeof data === 'string' ? data : "Success, but no text response found.");
        
        addMessage(botReply, 'bot');

    } catch (error) {
        console.error("Fail:", error);
        removeMessage(loadingId);
        addMessage("Communication failure. Please check if the workflow is ACTIVE in n8n.", 'bot error');
    }
}

// Ouvintes permanecem iguais
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('user-input').addEventListener('keypress', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(e);
    }
});

function addMessage(text, type) {
    const chat = document.getElementById('chat-box');
    const div = document.createElement('div');
    const id = 'msg-' + Date.now();
    div.id = id;
    div.className = `message ${type}`;
    div.innerHTML = text; 
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return id;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

/* --- GATILHO DE ENTRADA PROATIVA (CONEXÃO SUPABASE) --- */
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const nome = params.get('nome');
    const empresa = params.get('empresa');
    const email = params.get('email');
    
    // Só dispara se tiver pelo menos nome e email para a busca ser precisa
    if (nome && email) {
        setTimeout(() => {
            const mensagemGatilho = `Olá Mercuria, sou ${nome} da empresa ${empresa || 'minha clínica'}, meu email é ${email} - CODIGO_LEAD_01`;
            
            // Chama a função que envia ao n8n sem mostrar o balão do usuário
            if (typeof sendAutomatedTrigger === "function") {
                sendAutomatedTrigger(mensagemGatilho);
            }
        }, 1500); // 1.5s para o cliente se situar na página antes da IA "atacar"
    }
});
