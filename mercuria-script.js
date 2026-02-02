const WEBHOOK_URL = 'https://powerfulkiwi-n8n.cloudfy.live/webhook/mercuria.sls-agnt'; 

async function sendMessage(event) {
    if (event) event.preventDefault();

    const input = document.getElementById('user-input');
    const message = input.value.trim();
    if (!message) return;

    addMessage(message, 'user');
    input.value = '';

    // Feedback visual
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

        // Busca multicampo para garantir que a resposta apareça
        const botReply = data.output || data.message || data.text || data.reply || 
                         (typeof data === 'string' ? data : "Success, but no text response found.");
        
        addMessage(botReply, 'bot');

    } catch (error) {
        console.error("Fail:", error);
        removeMessage(loadingId);
        addMessage("Communication failure. Please check if the workflow is ACTIVE in n8n.", 'bot error');
    }
}

// Ouvinte para o Botão Enviar
document.getElementById('send-btn').addEventListener('click', sendMessage);

// Ouvinte para a tecla Enter
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
    
    // MUDANÇA AQUI: de .innerText para .innerHTML
    // Isso permite que a IA envie o link com a classe do botão
    div.innerHTML = text; 
    
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return id;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}
