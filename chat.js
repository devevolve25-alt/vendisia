// 1. Configuração Supabase - corrigido iao
const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. Configuração n8n
const N8N_WEBHOOK_URL = 'https://powerfulkiwi-n8n.cloudfy.live/webhook/mercuria.sls-agnt';

// ALTERAÇÃO: Referência atualizada para o novo container das mensagens
const chatMessagesContainer = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const plansContainer = document.getElementById('plans-container');

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

    // ALTERAÇÃO: Removida estilização inline, agora gerenciada pelo chat.css
    // msgDiv.style.padding = "12px 18px";
    // msgDiv.style.borderRadius = "10px";
    // msgDiv.style.marginBottom = "10px";
    // msgDiv.style.maxWidth = "80%";
    // msgDiv.style.wordWrap = "break-word";

    // if (sender === 'user') {
    //     msgDiv.style.alignSelf = "flex-end";
    //     msgDiv.style.backgroundColor = "#00BFFF22";
    //     msgDiv.style.border = "1px solid #00BFFF";
    // } else {
    //     msgDiv.style.alignSelf = "flex-start";
    //     msgDiv.style.backgroundColor = "#FFD70011";
    //     msgDiv.style.border = "1px solid #FFD700";
    // }

    msgDiv.innerText = text;

    // ALTERAÇÃO: Agora anexamos ao NOVO container de mensagens
    chatMessagesContainer.appendChild(msgDiv);

    // Garante que o scroll acompanhe a nova mensagem no container de mensagens
    chatMessagesContainer.scrollTo({ top: chatMessagesContainer.scrollHeight, behavior: 'smooth' });
}

function triggerPlans() {
    // ALTERAÇÃO: Não é mais necessário mover o container de planos. Apenas o torna visível.
    plansContainer.style.display = 'block';

    // Opcional: Se desejar que a rolagem das mensagens vá para o final APÓS os planos aparecerem.
    // Isso pode não ser estritamente necessário, pois os planos estão fora da área de rolagem das mensagens.
    // setTimeout(() => {
    //     chatMessagesContainer.scrollTo({ top: chatMessagesContainer.scrollHeight, behavior: 'smooth' });
    // }, 150);
}

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    userInput.value = '';

    try {
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                timestamp: new Date().toISOString(),
                sessao_id: "demo_landing_page"
            })
        });

        const data = await response.json();
        let botResponse = data.output || data.text || "Estou processando sua solicitação...";

        if (botResponse.includes('[EXIBIR_PLANOS]')) {
            botResponse = botResponse.replace('[EXIBIR_PLANOS]', '').trim();
            // Primeiro exibe o texto da IA
            if (botResponse) addMessage(botResponse, 'mercuria');
            // Depois aciona os planos no fluxo correto
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
