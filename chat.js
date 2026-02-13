const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. Configuração n8n
const N8N_WEBHOOK_URL = 'https://powerfulkiwi-n8n.cloudfy.live/webhook/mercuria.sls-agnt';

const chatWindow = document.getElementById('chat-window');
const userInput = document.getElementById('user-input');
const plansContainer = document.getElementById('plans-container');

/**
 * FUNÇÃO ÚNICA PARA CARREGAR PREÇOS
 * Busca 'preco_mensal' do Supabase e preenche os cards
 */
async function carregarPrecos() {
    try {
        const { data: planos, error } = await supabaseClient
            .from('planos')
            .select('nome, preco_mensal'); // Nome da coluna corrigido aqui

        if (error) throw error;

        planos.forEach(p => {
            // Converte "AGENDA PRO" para "price-agenda-pro"
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
        console.error("Erro ao carregar preços do Supabase:", err);
    }
}

// Executa ao carregar a página
document.addEventListener('DOMContentLoaded', carregarPrecos);

// --- LÓGICA DO CHAT ---

function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender === 'user' ? 'user-msg' : 'mercuria-msg');
    
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
    chatWindow.insertBefore(msgDiv, plansContainer); 
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function triggerPlans() {
    plansContainer.style.display = 'block';
    setTimeout(() => {
        plansContainer.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
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
            botResponse = botResponse.replace('[EXIBIR_PLANOS]', '');
            addMessage(botResponse, 'mercuria');
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
