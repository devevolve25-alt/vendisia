// Cole sua URL real aqui entre as aspas
const WEBHOOK_URL = 'https://powerfulkiwi-n8n.cloudfy.live/webhook/mercuria.sls-agnt'; 

async function sendMessage(event) {
    // IMPORTANTE: Previne que o formulário recarregue a página via GET
    if (event) {
        event.preventDefault();
    }

    const input = document.getElementById('user-input');
    const message = input.value.trim();
    if (!message) return;

    addMessage(message, 'user');
    input.value = '';

    const loadingId = addMessage("Typing...", 'bot loading');

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST', // Forçando explicitamente o POST
            headers: { 
                'Content-Type': 'application/json' 
            },
            mode: 'cors', // Garante que o navegador lide com cross-origin
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
                         (typeof data === 'string' ? data : "Check response format.");
        
        addMessage(botReply, 'bot');

    } catch (error) {
        console.error("Fail:", error);
        removeMessage(loadingId);
        addMessage("Communication failure. Please check if the workflow is ACTIVE in n8n.", 'bot error');
    }
}

// Garanta que o evento seja passado para a função
document.getElementById('user-input').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        sendMessage(e);
    }
});

function addMessage(text, type) {
    const chat = document.getElementById('chat-container');
    const div = document.createElement('div');
    const id = 'msg-' + Date.now();
    div.id = id;
    div.className = `message ${type}`;
    div.innerText = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return id;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}
