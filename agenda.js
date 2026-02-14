// 1. Configuração (Sempre no topo)
const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- CORREÇÃO: Mover a definição de PERFIS para o topo ---
const PERFIS = {
    cliente: [{ id: 'servicos', label: 'SERVIÇOS' }, { id: 'agenda', label: 'AGENDA' }],
    funcionario: [{ id: 'agenda', label: 'MINHA AGENDA' }],
    dono: [{ id: 'servicos', label: 'SERVIÇOS' }, { id: 'agenda', label: 'AGENDA GERAL' }, { id: 'dashboard', label: 'DASHBOARD' }]
};

let dadosEstabelecimento = null;
let slotSelecionado = null; 

function gerarGradeHorarios(abertura, fechamento, intervalo, agendados) {
    const diasParaGerar = window.periodoAgenda === 'semana' ? 7 : 1;
    const gradeTotal = [];

    for (let i = 0; i < diasParaGerar; i++) {
        const dataReferencia = new Date();
        dataReferencia.setHours(0, 0, 0, 0); 
        dataReferencia.setDate(dataReferencia.getDate() + i);
        const dataISO = dataReferencia.toLocaleDateString('sv-SE'); 

        let horaAtual = abertura;
        while (horaAtual < fechamento) {
            const tempoSlot = new Date(`${dataISO}T${horaAtual.substring(0, 5)}:00`).getTime();

            const agendamentoNoSlot = agendados.find(a => {
                const inicio = new Date(a.data_hora_inicio).getTime();
                return tempoSlot === inicio;
            });

            gradeTotal.push({
                data: dataISO,
                hora: horaAtual,
                dados: agendamentoNoSlot || null
            });

            let [h, m] = horaAtual.split(':').map(Number);
            m += intervalo;
            if (m >= 60) { h++; m -= 60; }
            horaAtual = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        }
    }
    return gradeTotal;
}

async function generateContent() {
    const inputElement = document.getElementById('cmd-input');
    const chat = document.getElementById('chat-criar');
    if(!inputElement || !chat) return;

    const input = inputElement.value.trim();
    if(!input) return;

    const divUser = document.createElement('div'); 
    divUser.className = 'msg-user'; 
    divUser.innerText = input;
    chat.appendChild(divUser);
    
    inputElement.value = "";
    chat.scrollTop = chat.scrollHeight;

    const divBot = document.createElement('div');
    divBot.className = 'msg-bot';
    divBot.innerText = "...";
    chat.appendChild(divBot);

    try {
        const response = await fetch('https://powerfulkiwi-n8n.cloudfy.live/webhook/3dd98c18-d95d-43b5-bafa-fcde2a305983', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mensagem: input,
                salao_id: dadosEstabelecimento?.id,
                origem: "web_agenda"
            })
        });

        const data = await response.json();
        divBot.innerText = data.output || data.resposta || data.text || "Comando processado.";

    } catch (error) {
        console.error("Erro MercurIA:", error);
        divBot.innerText = "Desculpe, tive um problema de conexão.";
    }

    chat.scrollTop = chat.scrollHeight;
}

async function init() {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('s');
    
    if (!slug) {
        const bodyView = document.getElementById('view-body');
        if(bodyView) bodyView.innerHTML = "<p style='text-align:center'>Slug ausente (?s=slug)</p>";
        return;
    }

    try {
        const { data: estab, error } = await supabaseClient.from('estabelecimentos').select('*').eq('slug', slug).single();
        
        if (estab) {
            const hoje = new Date();
            const dataExpiracao = estab.trial_expires_at ? new Date(estab.trial_expires_at) : null;

            // Proteção contra trial expirado
            if (estab.status_pagamento !== 'pago' && dataExpiracao && hoje > dataExpiracao) {
                document.body.innerHTML = `
                    <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#000; color:#fff; text-align:center; padding:20px; font-family:'Montserrat';">
                        <h1 style="color:#d4af37; font-family:'Bebas Neue'; font-size: 3rem;">PERÍODO DE TESTE ENCERRADO</h1>
                        <p style="opacity:0.8; margin-bottom: 25px;">Seus 7 dias gratuitos acabaram. Regularize sua assinatura.</p>
                        <a href="https://vendisia.ia.br" style="padding:15px 30px; background:#d4af37; color:#000; text-decoration:none; font-family:'Bebas Neue'; font-size:1.2rem; border-radius:5px;">ASSINAR AGORA</a>
                    </div>
                `;
                return;
            }

            dadosEstabelecimento = estab;
            const salonNameEl = document.getElementById('salon-name');
            if(salonNameEl) salonNameEl.innerText = estab.nome_fantasia;

            const btnDashboard = document.getElementById('container-link-dashboard');
            if (btnDashboard) {
                btnDashboard.style.display = (estab.plano_ativo === 'C') ? 'block' : 'none';
            }

            vincularEventosGestao();
            setupTabs(); 
        } else {
            const bodyView = document.getElementById('view-body');
            if(bodyView) bodyView.innerHTML = "<p style='text-align:center'>Salão não encontrado.</p>";
        }
    } catch (e) {
        console.error("Erro no Init:", e);
    }
}

function vincularEventosGestao() {
    const btnUpdateConfig = document.getElementById('btn-atualizar-config');
    if(btnUpdateConfig) btnUpdateConfig.onclick = atualizarDadosGerais;

    const btnAddServico = document.getElementById('btn-salvar-servico');
    if(btnAddServico) btnAddServico.onclick = cadastrarServico;

    const btnAddProf = document.getElementById('btn-salvar-prof');
    if(btnAddProf) btnAddProf.onclick = cadastrarProfissional;
}

function setupTabs() {
    const params = new URLSearchParams(window.location.search);
    const userType = params.get('u') || 'cliente'; 
    const tabsContainer = document.getElementById('dynamic-tabs');
    
    if(!tabsContainer) return;

    const abasPermitidas = PERFIS[userType] || PERFIS['cliente'];
    tabsContainer.innerHTML = '';
    
    abasPermitidas.forEach((aba, index) => {
        const tabElement = document.createElement('div');
        tabElement.className = `tab ${index === 0 ? 'active' : ''}`;
        tabElement.innerText = aba.label;
        tabElement.onclick = () => switchTabLite(aba.id, tabElement);
        tabsContainer.appendChild(tabElement);
    });

    if(abasPermitidas.length > 0) {
        switchTabLite(abasPermitidas[0].id, tabsContainer.firstChild);
    }
}

async function switchTabLite(viewId, element) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if(element) element.classList.add('active');
    
    const title = document.getElementById('view-title');
    const body = document.getElementById('view-body');
    const abaGestao = document.getElementById('aba-gestao');

    if (abaGestao) abaGestao.style.display = 'none';
    if (!body || !title) return;

    if (viewId === 'dashboard') {
        title.innerText = "CONFIGURAÇÕES DE GESTÃO";
        body.innerHTML = ""; 
        if (abaGestao) {
            abaGestao.style.display = 'block';
            popularCamposGestao();
        }
        return; 
    }

    body.innerHTML = "<p style='text-align:center; opacity:0.5'>Buscando...</p>";
    let dataSelecionada = new Date().toISOString().split('T')[0];
    window.periodoAgenda = window.periodoAgenda || 'dia';

    let htmlFiltros = `
        <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 20px;">
            <button onclick="window.periodoAgenda='dia'; switchTabLite('agenda', document.querySelector('.tab.active'))" 
                style="padding: 8px 15px; border-radius: 20px; border: 1px solid #2ecc71; background: ${window.periodoAgenda === 'dia' ? '#2ecc71' : 'transparent'}; color: white; cursor: pointer;">Dia</button>
            <button onclick="window.periodoAgenda='semana'; switchTabLite('agenda', document.querySelector('.tab.active'))" 
                style="padding: 8px 15px; border-radius: 20px; border: 1px solid #2ecc71; background: ${window.periodoAgenda === 'semana' ? '#2ecc71' : 'transparent'}; color: white; cursor: pointer;">Semana</button>
        </div>`;

    if (viewId === 'agenda') {
        title.innerText = "AGENDA";
        const userType = new URLSearchParams(window.location.search).get('u') || 'cliente';
        const diasRange = window.periodoAgenda === 'semana' ? 7 : 0;
        const dataFim = new Date();
        dataFim.setDate(new Date().getDate() + diasRange);
        const dataFimISO = dataFim.toISOString().split('T')[0];

        const { data: agendamentos } = await supabaseClient.from('agendamentos')
            .select('id, data_hora_inicio, servico_id, profissional_id, cliente_id, clientes(nome), profissionais(nome), servicos(nome, duracao_minutos)')
            .eq('estabelecimento_id', dadosEstabelecimento.id)
            .gte('data_hora_inicio', dataSelecionada + 'T00:00:00')
            .lte('data_hora_inicio', dataFimISO + 'T23:59:59')
            .order('data_hora_inicio');       
        
        const grade = gerarGradeHorarios(dadosEstabelecimento.hora_abertura, dadosEstabelecimento.hora_fechamento, dadosEstabelecimento.intervalo_slot, agendamentos || []);
        
        let htmlAgenda = '<div class="agenda-list">';
        let ultimaData = "";

        grade.forEach(slot => {
            if (window.periodoAgenda === 'semana' && slot.data !== ultimaData) {
                const dataFormatada = new Date(slot.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
                htmlAgenda += `<div style="grid-column: 1/-1; background: rgba(255,255,255,0.1); padding: 8px; margin-top: 15px; border-radius: 5px; font-size: 0.8em; text-transform: uppercase; color: #2ecc71;">${dataFormatada}</div>`;
                ultimaData = slot.data;
            }

            const exibirPrivado = (userType === 'dono' || userType === 'funcionario');
            const estaOcupado = slot.dados !== null;

            if (!exibirPrivado && estaOcupado) return;

            const nomeExibido = estaOcupado ? (slot.dados.clientes?.nome || "CLIENTE") : "DISPONÍVEL";
            const servicoExibido = estaOcupado ? (slot.dados.servicos?.nome || 'Serviço') : "Toque para agendar";
            const profExibido = estaOcupado ? ` | Prof: ${slot.dados.profissionais?.nome || '---'}` : "";
            const corStatus = estaOcupado ? "#e74c3c" : "#2ecc71";
            
            let acaoClique = "";
            if (!estaOcupado) {
                acaoClique = `onclick="abrirModalAgendamento('${slot.data}', '${slot.hora}')"`;
            } else if (exibirPrivado) {
                acaoClique = `onclick="cancelarAgendamento('${slot.dados.id}')"`;
            }

            htmlAgenda += `
                <div class="agenda-item" ${acaoClique} style="border-left: 4px solid ${corStatus}; cursor: pointer;">
                    <div class="agenda-time">${slot.hora}</div>
                    <div class="agenda-details">
                        <h4 style="color: ${estaOcupado ? '#fff' : corStatus}; margin:0;">${nomeExibido}</h4>
                        <span style="font-size: 0.85em; opacity: 0.7;">${servicoExibido}${profExibido}</span>
                    </div>
                </div>`;
        });
        body.innerHTML = htmlFiltros + htmlAgenda + '</div>';
    }

    else if (viewId === 'servicos') {
        title.innerText = "SERVIÇOS";
        const { data: listaServicos } = await supabaseClient.from('servicos').select('*').eq('estabelecimento_id', dadosEstabelecimento.id).order('nome');
        
        let htmlServ = '<div class="servicos-list" style="padding: 15px;">'; 
        listaServicos?.forEach(s => {
            htmlServ += `
                <div class="servico-card" style="padding: 15px; border-radius: 10px; margin-bottom: 15px; display: flex; flex-direction: column; gap: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="text-align: left;">
                            <h4 style="margin: 0; color: #fff;">${s.nome}</h4>
                            <span style="font-size: 0.9em; opacity: 0.6; color: #fff;">${s.duracao_minutos || 60} min</span>
                        </div>
                        <div style="font-weight: bold; color: #2ecc71;">R$ ${s.preco}</div>
                    </div>
                    ${s.descricao ? `<div style="font-size: 0.85rem; color: #ccc; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px; margin-top: 4px; font-style: italic;">${s.descricao}</div>` : ''}
                </div>`;
        });
        body.innerHTML = htmlServ + (listaServicos?.length ? '</div>' : '<p style="text-align:center; opacity:0.5">Nenhum serviço cadastrado.</p>');
    }
}

async function cancelarAgendamento(agendamentoId) {
    const confirmar = confirm("Deseja realmente CANCELAR este agendamento?");
    if (confirmar) {
        await supabaseClient.from('movimentacoes_financeiras').delete().eq('agendamento_id', agendamentoId);
        const { error } = await supabaseClient.from('agendamentos').delete().eq('id', agendamentoId);
        if (error) alert("Erro: " + error.message);
        else {
            alert("Cancelado!");
            switchTabLite('agenda', document.querySelector('.tab.active'));
        }
    }
}

async function abrirModalAgendamento(data, hora) {
    slotSelecionado = { data, hora };
    document.getElementById('modal-agendamento').style.display = 'flex';
    document.getElementById('info-slot').innerText = `Agendando para: ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')} às ${hora}`;

    const { data: servicos } = await supabaseClient.from('servicos').select('id, nome').eq('estabelecimento_id', dadosEstabelecimento.id).order('nome');
    const sSelect = document.getElementById('agend-servico');
    if(sSelect) {
        sSelect.innerHTML = '<option value="">Selecione o Serviço...</option>';
        servicos?.forEach(s => sSelect.innerHTML += `<option value="${s.id}">${s.nome}</option>`);
    
        sSelect.onchange = async function() {
            const servicoSelecionadoNome = this.options[this.selectedIndex].text;
            const pSelect = document.getElementById('agend-profissional');
            if(!pSelect) return;

            pSelect.innerHTML = '<option value="">Buscando...</option>';
            const { data: profs } = await supabaseClient.from('profissionais').select('id, nome, especialidade').eq('estabelecimento_id', dadosEstabelecimento.id);
            
            pSelect.innerHTML = '<option value="">Selecione o Profissional...</option>';
            profs?.forEach(p => pSelect.innerHTML += `<option value="${p.id}">${p.nome}</option>`);
        };
    }
}

function fecharModal() {
    document.getElementById('modal-agendamento').style.display = 'none';
}

async function confirmarAgendamento() {
    const nome = document.getElementById('agend-nome').value;
    const whatsapp = document.getElementById('agend-whatsapp').value;
    const servicoId = document.getElementById('agend-servico').value;
    const profId = document.getElementById('agend-profissional').value;

    if (!nome || !whatsapp || !servicoId || !profId) return alert("Preencha tudo.");

    const { data: cliente, error: errorCli } = await supabaseClient
        .from('clientes')
        .upsert([{ estabelecimento_id: dadosEstabelecimento.id, nome, whatsapp }], { onConflict: 'estabelecimento_id, whatsapp' })
        .select('id').single();

    if (errorCli) return alert("Erro Cliente: " + errorCli.message);

    const dataObjeto = new Date(`${slotSelecionado.data}T${slotSelecionado.hora.substring(0, 5)}:00`);

    const { data: novoAg, error: errorAg } = await supabaseClient
        .from('agendamentos')
        .insert([{
            estabelecimento_id: dadosEstabelecimento.id,
            profissional_id: profId,
            servico_id: servicoId,
            cliente_id: cliente.id,
            data_hora_inicio: dataObjeto.toISOString(),
            status: 'confirmado'
        }]).select('id').single();

    if (errorAg) return alert("Erro: " + errorAg.message);
    
    alert("Sucesso!");
    fecharModal();
    switchTabLite('agenda', document.querySelector('.tab.active'));
}

async function popularCamposGestao() {
    if (!dadosEstabelecimento) return;
    document.getElementById('edit-nome-fantasia').value = dadosEstabelecimento.nome_fantasia || "";
    const { data: perfil } = await supabaseClient.from('perfis').select('*').eq('id', dadosEstabelecimento.dono_id).single();
    if (perfil) {
        document.getElementById('perf-nome-completo').value = perfil.nome_completo || "";
    }
}

async function atualizarDadosGerais() {
    const novosDados = { nome_fantasia: document.getElementById('edit-nome-fantasia').value };
    await supabaseClient.from('estabelecimentos').update(novosDados).eq('id', dadosEstabelecimento.id);
    alert("Salvo!");
}

async function cadastrarServico() {
    const nome = document.getElementById('new-servico-nome').value;
    const preco = parseFloat(document.getElementById('new-servico-preco').value);
    await supabaseClient.from('servicos').insert([{ estabelecimento_id: dadosEstabelecimento.id, nome, preco }]);
    alert("Serviço adicionado!");
}

async function cadastrarProfissional() {
    const nome = document.getElementById('new-prof-nome').value;
    await supabaseClient.from('profissionais').insert([{ estabelecimento_id: dadosEstabelecimento.id, nome }]);
    alert("Profissional adicionado!");
}

// Inicialização segura
window.addEventListener('DOMContentLoaded', init);

async function logout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        alert("Erro ao sair: " + error.message);
    } else {
        // Limpa dados sensíveis do localStorage e redireciona para a home
        localStorage.removeItem('plano_mercuria');
        window.location.href = 'index.html';
    }
}
