// URL do seu Webhook do n8n (Substitua pela sua URL oficial)
const N8N_WEBHOOK_URL = 'https://powerfulkiwi-n8n.cloudfy.live/webhook/mercuria.sls-agnt';

const chatWindow = document.getElementById('chat-window');
const userInput = document.getElementById('user-input');
const plansContainer = document.getElementById('plans-container');

// Função para adicionar mensagens na tela
function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender === 'user' ? 'user-msg' : 'mercuria-msg');
    
    // Estilização rápida via JS ou use classes no seu style.css
    msgDiv.style.padding = "12px 18px";
    msgDiv.style.borderRadius = "10px";
    msgDiv.style.marginBottom = "10px";
    msgDiv.style.maxWidth = "80%";
    
    if (sender === 'user') {
        msgDiv.style.alignSelf = "flex-end";
        msgDiv.style.backgroundColor = "#00BFFF22";
        msgDiv.style.border = "1px solid #00BFFF";
    } else {
        msgDiv.style.alignSelf = "flex-start";
        msgDiv.style.backgroundColor = "#FFD70011";
        msgDiv.style.border = "1px solid #FFD700";
    }

    msgDiv.innerText = text;
    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Função para disparar a exibição do Carrossel
function triggerPlans() {
    plansContainer.style.display = 'block';
    plansContainer.scrollIntoView({ behavior: 'smooth' });
}

// Função Principal de Envio
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    // 1. Mostrar mensagem do usuário na tela
    addMessage(text, 'user');
    userInput.value = '';

    try {
        // 2. Enviar para o n8n
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: text,
                timestamp: new Date().toISOString(),
                sessao_id: "demo_landing_page" // Útil para manter o contexto no n8n
            })
        });

        const data = await response.json();
        
        // 3. Processar Resposta da MercurIA
        let botResponse = data.output || data.text || "Estou processando sua solicitação...";

        // 4. Checar se a IA enviou o comando de ativação de planos
        if (botResponse.includes('[EXIBIR_PLANOS]')) {
            botResponse = botResponse.replace('[EXIBIR_PLANOS]', '');
            triggerPlans();
        }

        addMessage(botResponse, 'mercuria');

    } catch (error) {
        addMessage("Ops, tive um probleminha na conexão. Pode tentar de novo?", 'mercuria');
        console.error("Erro no chat:", error);
    }
}

// Permitir enviar com a tecla ENTER
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
