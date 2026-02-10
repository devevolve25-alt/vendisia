// 1. Configuração (Sempre no topo)
const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let dadosEstabelecimento = null;

function gerarGradeHorarios(abertura, fechamento, intervalo, agendados) {
    const diasParaGerar = window.periodoAgenda === 'semana' ? 7 : 1;
    const gradeCompleta = [];

    for (let i = 0; i < diasParaGerar; i++) {
        const dataReferencia = new Date();
        dataReferencia.setDate(dataReferencia.getDate() + i);
        const dataISO = dataReferencia.toISOString().split('T')[0];

        let horaAtual = abertura;
        while (horaAtual < fechamento) {
            const dataHoraSlot = `${dataISO}T${horaAtual}:00`;
            const agendamento = agendados.find(a => a.data_hora_inicio.startsWith(`${dataISO}T${horaAtual}`));

            gradeCompleta.push({
                data: dataISO,
                hora: horaAtual,
                dados: agendamento || null
            });

            let [h, m] = horaAtual.split(':').map(Number);
            m += intervalo;
            if (m >= 60) { h++; m -= 60; }
            horaAtual = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        }
    }
    return gradeCompleta;
}

function generateContent() {
    const input = document.getElementById('cmd-input').value;
    const chat = document.getElementById('chat-criar');
    if(!input) return;
    const div = document.createElement('div'); 
    div.className = 'msg-user'; 
    div.innerText = input;
    chat.appendChild(div);
    document.getElementById('cmd-input').value = "";
    chat.scrollTop = chat.scrollHeight;
}

async function init() {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('s');
    if (!slug) {
        document.getElementById('view-body').innerHTML = "<p style='text-align:center'>Slug ausente (?s=slug)</p>";
        return;
    }

    const { data: estab, error } = await supabaseClient.from('estabelecimentos').select('*').eq('slug', slug).single();
    
    if (estab) {
        const hoje = new Date();
        const dataExpiracao = estab.trial_expires_at ? new Date(estab.trial_expires_at) : null;

        if (estab.status_pagamento !== 'pago' && dataExpiracao && hoje > dataExpiracao) {
            document.body.innerHTML = `
                <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#000; color:#fff; text-align:center; padding:20px; font-family:'Montserrat';">
                    <h1 style="color:#d4af37; font-family:'Bebas Neue'; font-size: 3rem;">PERÍODO DE TESTE ENCERRADO</h1>
                    <p style="opacity:0.8; margin-bottom: 25px;">Seus 7 dias gratuitos acabaram. Para continuar usando a VENDISIA, regularize sua assinatura.</p>
                    <a href="https://vendisia.ia.br" style="padding:15px 30px; background:#d4af37; color:#000; text-decoration:none; font-family:'Bebas Neue'; font-size:1.2rem; border-radius:5px;">ASSINAR AGORA</a>
                </div>
            `;
            return;
        }

        dadosEstabelecimento = estab;
        document.getElementById('salon-name').innerText = estab.nome_fantasia;

        const btnDashboard = document.getElementById('container-link-dashboard');
        if (btnDashboard) {
            btnDashboard.style.display = (estab.plano_ativo === 'C') ? 'block' : 'none';
        }

        // Vincular eventos de clique aos botões de salvamento
        vincularEventosGestao();

        setupTabs(); 
    } else {
        document.getElementById('view-body').innerHTML = "<p style='text-align:center'>Salão não encontrado.</p>";
    }
}

// Conecta os botões do HTML às funções do JS
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
    const abasPermitidas = PERFIS[userType];
    tabsContainer.innerHTML = '';
    abasPermitidas.forEach((aba, index) => {
        const tabElement = document.createElement('div');
        tabElement.className = `tab ${index === 0 ? 'active' : ''}`;
        tabElement.innerText = aba.label;
        tabElement.onclick = () => switchTabLite(aba.id, tabElement);
        tabsContainer.appendChild(tabElement);
    });
    if(abasPermitidas.length > 0) switchTabLite(abasPermitidas[0].id, tabsContainer.firstChild);
}

async function switchTabLite(viewId, element) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    element.classList.add('active');
    
    const title = document.getElementById('view-title');
    const body = document.getElementById('view-body');
    const abaGestao = document.getElementById('aba-gestao');

    if (abaGestao) abaGestao.style.display = 'none';

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
            .select('*, profissionais(nome), servicos(nome)')
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
            const nomeExibido = estaOcupado ? (exibirPrivado ? slot.dados.cliente_nome : "INDISPONÍVEL") : "DISPONÍVEL";
            const servicoExibido = estaOcupado ? (exibirPrivado ? (slot.dados.servicos?.nome || 'Serviço') : "Horário reservado") : "Toque para agendar";
            const corStatus = estaOcupado ? "#e74c3c" : "#2ecc71";

            htmlAgenda += `
                <div class="agenda-item" style="border-left: 4px solid ${corStatus}; opacity: ${estaOcupado && !exibirPrivado ? '0.6' : '1'}">
                    <div class="agenda-time">${slot.hora}</div>
                    <div class="agenda-details">
                        <h4 style="color: ${estaOcupado ? '#fff' : corStatus}; margin:0;">${nomeExibido}</h4>
                        <span style="font-size: 0.85em; opacity: 0.7;">${servicoExibido}</span>
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
                <div class="servico-card" style="padding: 15px; border-radius: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
                    <div style="text-align: left;">
                        <h4 style="margin: 0; color: #fff;">${s.nome}</h4>
                        <span style="font-size: 0.9em; opacity: 0.6; color: #fff;">${s.duracao_minutos || 60} min</span>
                    </div>
                    <div style="font-weight: bold; color: #2ecc71;">R$ ${s.preco}</div>
                </div>`;
        });
        body.innerHTML = htmlServ + (listaServicos?.length ? '</div>' : '<p style="text-align:center; opacity:0.5">Nenhum serviço cadastrado.</p>');
    }
    else {
        title.innerText = viewId.toUpperCase();
        body.innerHTML = `<p style="text-align: center; opacity: 0.5; margin-top: 50px;">Módulo em desenvolvimento...</p>`;
    }
}

// --- FUNÇÕES DO DASHBOARD (PERSISTÊNCIA) ---

function popularCamposGestao() {
    if (!dadosEstabelecimento) return;
    document.getElementById('edit-nome-fantasia').value = dadosEstabelecimento.nome_fantasia || "";
    document.getElementById('edit-razao-social').value = dadosEstabelecimento.razao_social || "";
    document.getElementById('edit-cnpj').value = dadosEstabelecimento.cnpj || "";
    document.getElementById('edit-whatsapp').value = dadosEstabelecimento.whatsapp || "";
    document.getElementById('edit-endereco-completo').value = dadosEstabelecimento.endereco_completo || "";
    document.getElementById('edit-hora-abertura').value = dadosEstabelecimento.hora_abertura || "08:00";
    document.getElementById('edit-hora-fechamento').value = dadosEstabelecimento.hora_fechamento || "18:00";
    document.getElementById('edit-intervalo-slot').value = dadosEstabelecimento.intervalo_slot || 30;
}

async function atualizarDadosGerais() {
    const novosDados = {
        nome_fantasia: document.getElementById('edit-nome-fantasia').value,
        razao_social: document.getElementById('edit-razao-social').value,
        cnpj: document.getElementById('edit-cnpj').value,
        whatsapp: document.getElementById('edit-whatsapp').value,
        endereco_completo: document.getElementById('edit-endereco-completo').value,
        hora_abertura: document.getElementById('edit-hora-abertura').value,
        hora_fechamento: document.getElementById('edit-hora-fechamento').value,
        intervalo_slot: parseInt(document.getElementById('edit-intervalo-slot').value)
    };

    const { error } = await supabaseClient
        .from('estabelecimentos')
        .update(novosDados)
        .eq('id', dadosEstabelecimento.id);

    if (error) alert("Erro: " + error.message);
    else {
        alert("Configurações salvas!");
        dadosEstabelecimento = { ...dadosEstabelecimento, ...novosDados };
        document.getElementById('salon-name').innerText = novosDados.nome_fantasia;
    }
}

async function cadastrarServico() {
    const nome = document.getElementById('new-servico-nome').value;
    const preco = parseFloat(document.getElementById('new-servico-preco').value);
    const duracao = parseInt(document.getElementById('new-servico-duracao').value);
    const descricao = document.getElementById('new-servico-desc').value;

    if (!nome || !preco) return alert("Preencha Nome e Preço.");

    const { error } = await supabaseClient.from('servicos').insert([{
        estabelecimento_id: dadosEstabelecimento.id,
        nome: nome,
        preco: preco,
        descricao: descricao,
        duracao_minutos: duracao 
    }]);

    if (error) alert("Erro: " + error.message);
    else {
        alert("Serviço adicionado!");
        document.getElementById('new-servico-nome').value = "";
        document.getElementById('new-servico-preco').value = "";
        document.getElementById('new-servico-duracao').value = "";
        document.getElementById('new-servico-desc').value = "";
    }
}

async function cadastrarProfissional() {
    const nome = document.getElementById('new-prof-nome').value;
    const especialidade = document.getElementById('new-prof-especialidade').value;
    const whatsapp = document.getElementById('new-prof-whatsapp').value;

    if (!nome) return alert("Nome é obrigatório.");

    const { error } = await supabaseClient.from('profissionais').insert([{
        estabelecimento_id: dadosEstabelecimento.id,
        nome, especialidade, whatsapp
    }]);

    if (error) alert("Erro: " + error.message);
    else {
        alert("Profissional adicionado!");
        document.getElementById('new-prof-nome').value = "";
        document.getElementById('new-prof-especialidade').value = "";
        document.getElementById('new-prof-whatsapp').value = "";
    }
}

const PERFIS = {
    cliente: [{ id: 'servicos', label: 'SERVIÇOS' }, { id: 'agenda', label: 'AGENDA' }],
    funcionario: [{ id: 'agenda', label: 'MINHA AGENDA' }],
    dono: [{ id: 'servicos', label: 'SERVIÇOS' }, { id: 'agenda', label: 'AGENDA GERAL' }, { id: 'dashboard', label: 'DASHBOARD' }]
};

window.onload = init;
