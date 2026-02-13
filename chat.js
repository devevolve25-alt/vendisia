// URL do seu Webhook do n8n (Substitua pela sua URL oficial)
const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const N8N_WEBHOOK_URL = 'https://powerfulkiwi-n8n.cloudfy.live/webhook/mercuria.sls-agnt';

const chatWindow = document.getElementById('chat-window');
const userInput = document.getElementById('user-input');
const plansContainer = document.getElementById('plans-container');

// Função para buscar preços reais do banco de dados
async function carregarPrecosDosPlanos() {
    try {
        const { data: planos, error } = await supabaseClient
            .from('planos')
            .select('nome, valor'); // Certifique-se que a coluna se chama 'valor'

        if (error) throw error;

        planos.forEach(plano => {
            // Normaliza o nome para encontrar o ID do elemento (Ex: 'CONECTA FÁCIL' -> 'price-conecta-facil')
            const idElemento = `price-${plano.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-')}`;
            const elementoPreco = document.getElementById(idElemento);
            
            if (elementoPreco) {
                // Formata para moeda brasileira
                elementoPreco.innerText = plano.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            }
        });
    } catch (err) {
        console.error("Erro ao carregar preços:", err);
    }
}

// Chama a função ao carregar a página
document.addEventListener('DOMContentLoaded', carregarPrecosDosPlanos);

// Função para adicionar mensagens na tela
function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender === 'user' ? 'user-msg' : 'mercuria-msg');
    
    // Estilização mantida conforme solicitado
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
    
    // ALTERAÇÃO PARA RESPONSIVIDADE: Insere a mensagem ANTES do container de planos
    // Isso garante que os cards fiquem sempre abaixo da última fala da IA
    chatWindow.insertBefore(msgDiv, plansContainer); 
    
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Função para disparar a exibição do Carrossel
function triggerPlans() {
    plansContainer.style.display = 'block';
    // ALTERAÇÃO PARA RESPONSIVIDADE: Scroll suave focado no fim do container
    setTimeout(() => {
        plansContainer.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
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
                sessao_id: "demo_landing_page" 
            })
        });

        const data = await response.json();
        
        // 3. Processar Resposta da MercurIA
        let botResponse = data.output || data.text || "Estou processando sua solicitação...";

        // 4. Checar se a IA enviou o comando de ativação de planos
        if (botResponse.includes('[EXIBIR_PLANOS]')) {
            botResponse = botResponse.replace('[EXIBIR_PLANOS]', '');
            // Adicionamos a mensagem primeiro, depois ativamos os planos
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

// Permitir enviar com a tecla ENTER
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// FUNÇÃO PARA REDIRECIONAMENTO TRIAL
function activateTrial(planSlug) {
    // Redireciona para a página de acesso passando o slug do plano na URL
    window.location.href = `acesso.html?plano=${planSlug}`;
}

// Garante que a função exista e seja acessível pelo clique do botão no HTML
window.activateTrial = function(planSlug) {
    // 1. (Opcional) Salva no navegador para garantir que o dado não se perca se a URL mudar
    localStorage.setItem('plano_selecionado', planSlug);
    
    // 2. Redireciona passando o parâmetro para a página de acesso
    window.location.href = `acesso.html?plano=${planSlug}`;
};

async function carregarPrecos() {
    const { data } = await supabaseClient.from('planos').select('nome, preco_mensal');
    
    data?.forEach(p => {
        // Converte o nome do banco (ex: "AGENDA PRO") para o ID (price-agenda-pro)
        const id = `price-${p.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-')}`;
        const elemento = document.getElementById(id);
        
        if (elemento) {
            elemento.innerText = p.preco_mensal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }
    });
}

// Executa a função
carregarPrecos();
