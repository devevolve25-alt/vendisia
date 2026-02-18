// 1. Configuração Supabase - corrigido iao - extração
const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. Configuração n8n
const N8N_WEBHOOK_URL = 'https://powerfulkiwi-n8n.cloudfy.live/webhook/mercuria.sls-agnt';

// ALTERAÇÃO: Referência atualizada para o novo container das mensagens
const chatMessagesContainer = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const plansContainer = document.getElementById('plans-container');


// ===============================================
// NOVO: Função para extrair parâmetros da URL
// ===============================================
function getUrlParameters() {
    const params = {};
    // Pega a string de consulta (ex: "?param1=valor1&param2=valor2") e remove o '?' inicial
    const queryString = window.location.search.substring(1);

    if (queryString) {
        queryString.split('&').forEach(pair => {
            const parts = pair.split('=');
            if (parts.length === 2) {
                const key = decodeURIComponent(parts[0]);
                const value = decodeURIComponent(parts[1]);
                params[key] = value;
            }
        });
    }
    return params;
}

// NOVO: Armazena os parâmetros da URL assim que o script é carregado
const urlParams = getUrlParameters();
console.log("Parâmetros da URL detectados:", urlParams); // Para depuração

// ===============================================


async function carregarPrecos() {
    try {
        const { data: planos, error } = await supabaseClient
            .from('planos')
            .select('nome, preco_mensal');

        if (error) throw error;

        planos.forEach(p => {
            const id = `price-${p.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-')}`;
            const elemento = document.getElementById(id);
            if (elemento) {
                elemento.innerText = p.preco_mensal.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                });
            }
        });
    } catch (err) {
        console.error("Erro ao carregar preços:", err);
    }
}

document.addEventListener('DOMContentLoaded', carregarPrecos);

// --- LÓGICA DO CHAT ATUALIZADA ---

function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender === 'user' ? 'user-msg' : 'mercuria-msg');
    msgDiv.innerText = text;
    chatMessagesContainer.appendChild(msgDiv);
    chatMessagesContainer.scrollTo({ top: chatMessagesContainer.scrollHeight, behavior: 'smooth' });
}

function triggerPlans() {
    plansContainer.style.display = 'block';
}

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    userInput.value = '';

    try {
        // ===============================================
        // ALTERAÇÃO: Incluindo os parâmetros da URL no corpo da requisição POST
        // ===============================================
        const payload = {
            message: text,
            timestamp: new Date().toISOString(),
            sessao_id: "demo_landing_page",
            ...urlParams // Espalha os parâmetros da URL aqui
        };

        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload) // Envia o payload completo
        });
        // ===============================================

        const data = await response.json();
        let botResponse = data.output || data.text || "Estou processando sua solicitação...";

        if (botResponse.includes('[EXIBIR_PLANOS]')) {
            botResponse = botResponse.replace('[EXIBIR_PLANOS]', '').trim();
            if (botResponse) addMessage(botResponse, 'mercuria');
            triggerPlans();
        } else {
            addMessage(botResponse, 'mercuria');
        }

    } catch (error) {
        addMessage("Ops, tive um probleminha na conexão. Pode tentar de novo?", 'mercuria');
        console.error("Erro no chat:", error);
    }
}

userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// --- REDIRECIONAMENTO ---

window.activateTrial = function(planSlug) {
    localStorage.setItem('plano_selecionado', planSlug);
    window.location.href = `acesso.html?plano=${planSlug}`;
};
```


---

**Como usar:**

1.  **Salve os arquivos:** Mantenha seu `index.html` e `chat.js` atualizados com os códigos acima.
2.  **Teste a URL:** Acesse sua página de chat com parâmetros na URL, por exemplo: `suaurl.com/index.html?lead_id=12345&origem=google_ads`.
3.  **Envie uma mensagem:** Quando o usuário digitar e enviar uma mensagem no chat, o objeto `payload` enviado ao seu webhook do n8n agora incluirá:
    
```json
    {
      "message": "Mensagem do usuário",
      "timestamp": "2026-02-18T13:56:00.000Z",
      "sessao_id": "demo_landing_page",
      "lead_id": "12345", // Capturado da URL
      "origem": "google_ads" // Capturado da URL
    }
