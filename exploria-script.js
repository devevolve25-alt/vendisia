// 1. Captura dinâmica de parâmetros da URL
const urlParams = new URLSearchParams(window.location.search);
const clienteNome = urlParams.get('nome') || "";
const clienteEmpresa = urlParams.get('empresa') || "";

document.addEventListener('DOMContentLoaded', () => {
    const initialMsg = document.getElementById('initial-message');
    const userInput = document.getElementById('user-target');

    // Personalização do protocolo de varredura
    if (clienteNome) {
        initialMsg.innerHTML = `<b>Protocolo ativo, ${clienteNome}.</b> Vínculo detectado: <strong>${clienteEmpresa || 'Análise Corporativa'}</strong>. Insira a URL ou @alvo para iniciarmos a varredura.`;
    }

    // Ajuste de altura do textarea
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // Envio no Enter
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            processAudit();
        }
    });
});

// Função unificada para exibição de balões (Suporta HTML para Botões de Relatório)
function appendMessage(text, side) {
    const chatBox = document.getElementById('chat-output');
    const msgDiv = document.createElement('div');
    msgDiv.className = side === 'bot' ? 'msg-bot' : 'msg-user';
    
    // Renderiza HTML para que links de agendamento ou PDFs funcionem como botões
    msgDiv.innerHTML = text; 
    
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function processAudit() {
    const inputField = document.getElementById('user-target');
    const target = inputField.value.trim();
    const sweep = document.getElementById('sweep');

    if (!target) return;

    // Efeito Visual de Radar
    sweep.style.display = "block";

    // Exibe comando do usuário
    appendMessage(`Executar perícia em: <strong>${target}</strong>`, 'user');
    inputField.value = "";
    inputField.style.height = 'auto';

    // Feedback de processamento
    appendMessage(`<b>[EXPLORIA]:</b> Alvo ${target} identificado. Escaneando infraestrutura, SEO e latência...`, 'bot');

    try {
        const response = await fetch("https://powerfulkiwi-n8n.cloudfy.live/webhook/21abc95d-7b3c-4cc6-b2b8-e33a696d6f96", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                target: target,
                entity: "ExplorIA",
                metadata: {
                    nome: clienteNome,
                    empresa: clienteEmpresa
                }
            })
        });

        const data = await response.json();

        // Resposta final que pode conter o botão de CTA enviado pelo n8n
        const result = data.output || "Varredura concluída. O diagnóstico foi processado.";
        appendMessage(`<b>[STATUS]:</b> ${result}`, 'bot');

    } catch (error) {
        appendMessage('<b>[ERRO]:</b> Perda de sinal com o radar central. Tente novamente.', 'bot');
    } finally {
        sweep.style.display = "none";
    }
}
