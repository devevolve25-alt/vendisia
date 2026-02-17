// 1. Configuração (Sempre no topo) - agenda por profissional - 1
const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let dadosEstabelecimento = null;
let slotSelecionado = null; 

// NOVO: Adicione uma variável global para o tipo de usuário VERIFICADO
let verifiedUserType = 'cliente'; // Padrão seguro para 'cliente'

async function logout() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            console.error("Erro ao fazer logout:", error.message);
            alert("Erro ao sair: " + error.message);
        } else {
            console.log("Usuário desconectado.");
            // Redireciona o usuário para a página inicial após o logout
            window.location.href = 'https://vendisia.ia.br/'; 
        }
    } catch (err) {
        console.error("Exceção durante o logout:", err);
        alert("Ocorreu um erro inesperado ao tentar sair.");
    }
}

function gerarGradeHorarios(abertura, fechamento, agendados) {
    const intervalo = 30; // Intervalo de 30 minutos padronizado
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
                // Assumindo que 'servicos' e 'duracao_minutos' estão aninhados corretamente.
                // Se o serviço não estiver disponível ou a duração for zero, usa 30 minutos como padrão.
                const duracaoMs = (a.servicos?.duracao_minutos || 30) * 60 * 1000;
                const fimAgendamento = inicio + duracaoMs;
                // Um slot está ocupado se seu início estiver dentro de um agendamento existente
                // ou se o agendamento começar no slot atual.
                return (tempoSlot >= inicio && tempoSlot < fimAgendamento);
            });

            gradeTotal.push({
                data: dataISO,
                hora: horaAtual,
                dados: agendamentoNoSlot || null
            });

            let [h, m] = horaAtual.split(':').map(Number);
            m += intervalo; // Usa o intervalo hardcoded
            if (m >= 60) { h++; m -= 60; }
            horaAtual = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        }
    }
    return gradeTotal;
}

async function generateContent() {
    const inputElement = document.getElementById('cmd-input');
    const chat = document.getElementById('chat-criar');
    const input = inputElement.value.trim();
    
    if(!input) return;

    // Adiciona mensagem do usuário
    const divUser = document.createElement('div'); 
    divUser.className = 'msg-user'; 
    divUser.innerText = input;
    chat.appendChild(divUser);
    
    inputElement.value = "";
    chat.scrollTop = chat.scrollHeight;

    // Adiciona balão de "carregando" para a IA
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
        // Exibe a resposta do n8n (ajuste 'data.output' se o retorno for em outro campo)
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
        document.getElementById('view-body').innerHTML = "<p style='text-align:center'>Slug ausente (?s=slug)</p>";
        return;
    }

    const { data: estab, error } = await supabaseClient.from('estabelecimentos').select('*').eq('slug', slug).single();
    
    // NOVO: Obter a sessão do usuário
    const { data: { session } } = await supabaseClient.auth.getSession();
    let currentUser = session?.user || null;

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

        // NOVO: Determinar o tipo de usuário com base na autenticação e no dono_id
        if (currentUser && currentUser.id === estab.dono_id) {
            verifiedUserType = 'dono';
        } 
        // Você pode adicionar lógica aqui para 'funcionario' se tiver uma tabela de relacionamento
        // Exemplo: else if (currentUser && await isFuncionario(currentUser.id, estab.id)) { verifiedUserType = 'funcionario'; }
        else {
            verifiedUserType = 'cliente';
        }
        
        // NOVO: Atualizar a lógica de exibição do dashboard para usar o plano_ativo 'gestao-total'
        const btnDashboard = document.getElementById('container-link-dashboard');
        if (btnDashboard) {
            // Exibir o botão do dashboard apenas se for dono E o plano for 'gestao-total'
            btnDashboard.style.display = (verifiedUserType === 'dono' && estab.plano_ativo === 'gestao-total') ? 'block' : 'none';
        }

        vincularEventosGestao();
        setupTabs(verifiedUserType); // NOVO: Passar o userType verificado para setupTabs
    } else {
        document.getElementById('view-body').innerHTML = "<p style='text-align:center'>Salão não encontrado.</p>";
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

// NOVO: setupTabs agora aceita o userType como argumento
function setupTabs(userType) {
    // const params = new URLSearchParams(window.location.search); // LINHA REMOVIDA
    // const userType = params.get('u') || 'cliente'; // LINHA REMOVIDA - userType vem do argumento
    
    const tabsContainer = document.getElementById('dynamic-tabs');
    const abasPermitidas = PERFIS[userType];
    tabsContainer.innerHTML = '';
    abasPermitidas.forEach((aba, index) => {
        const tabElement = document.createElement('div');
        tabElement.className = `tab ${index === 0 ? 'active' : ''}`;
        tabElement.innerText = aba.label;
        // NOVO: Passar o userType para switchTabLite para consistência
        tabElement.onclick = () => switchTabLite(aba.id, tabElement, userType); 
        tabsContainer.appendChild(tabElement);
    });
    if(abasPermitidas.length > 0) switchTabLite(abasPermitidas[0].id, tabsContainer.firstChild, userType); // NOVO: Passar userType
}

// NOVO: switchTabLite agora aceita o userType como argumento
async function switchTabLite(viewId, element, userType) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    element.classList.add('active');
    
    const title = document.getElementById('view-title');
    const body = document.getElementById('view-body');
    const abaGestao = document.getElementById('aba-gestao');

    // NOVO: Ocultar abaGestao se o usuário NÃO for 'dono'
    if (abaGestao) {
        abaGestao.style.display = (userType === 'dono' && viewId === 'dashboard') ? 'block' : 'none';
    }

    if (viewId === 'dashboard') {
        // NOVO: Se o usuário tentar acessar 'dashboard' e não for 'dono', redirecionar ou mostrar erro
        if (userType !== 'dono') {
            title.innerText = "ACESSO NEGADO";
            body.innerHTML = "<p style='text-align:center; opacity:0.5; color: #e74c3c;'>Você não tem permissão para acessar esta área.</p>";
            return;
        }
        title.innerText = "CONFIGURAÇÕES DE GESTÃO";
        body.innerHTML = ""; 
        // abaGestao.style.display já é controlado acima
        popularCamposGestao();
        return; 
    }

    body.innerHTML = "<p style='text-align:center; opacity:0.5'>Buscando...</p>";
    let dataSelecionada = new Date().toISOString().split('T')[0];
    window.periodoAgenda = window.periodoAgenda || 'dia';

    let htmlFiltros = `
        <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 20px;">
            <button onclick="window.periodoAgenda='dia'; switchTabLite('agenda', document.querySelector('.tab.active'), '${userType}')" 
                style="padding: 8px 15px; border-radius: 20px; border: 1px solid #2ecc71; background: ${window.periodoAgenda === 'dia' ? '#2ecc71' : 'transparent'}; color: white; cursor: pointer;">Dia</button>
            <button onclick="window.periodoAgenda='semana'; switchTabLite('agenda', document.querySelector('.tab.active'), '${userType}')" 
                style="padding: 8px 15px; border-radius: 20px; border: 1px solid #2ecc71; background: ${window.periodoAgenda === 'semana' ? '#2ecc71' : 'transparent'}; color: white; cursor: pointer;">Semana</button>
        </div>`;

    if (viewId === 'agenda') {
        title.innerText = "AGENDA";
        // const userType = new URLSearchParams(window.location.search).get('u') || 'cliente'; // LINHA REMOVIDA
        const diasRange = window.periodoAgenda === 'semana' ? 7 : 0;
        const dataFim = new Date();
        dataFim.setDate(new Date().getDate() + diasRange);
        const dataFimISO = dataFim.toISOString().split('T')[0];

        const { data: agendamentos } = await supabaseClient.from('agendamentos')
            .select('id, cliente_nome, data_hora_inicio, servico_id, profissional_id, profissionais(nome), servicos(nome, duracao_minutos)')
            .eq('estabelecimento_id', dadosEstabelecimento.id)
            .gte('data_hora_inicio', dataSelecionada + 'T00:00:00')
            .lte('data_hora_inicio', dataFimISO + 'T23:59:59')
            .order('data_hora_inicio');       
        
        const grade = gerarGradeHorarios(dadosEstabelecimento.hora_abertura, dadosEstabelecimento.hora_fechamento, agendamentos || []);        
        let htmlAgenda = '<div class="agenda-list">';
        let ultimaData = "";

        grade.forEach(slot => {
            if (window.periodoAgenda === 'semana' && slot.data !== ultimaData) {
                const dataFormatada = new Date(slot.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
                htmlAgenda += `<div style="grid-column: 1/-1; background: rgba(255,255,255,0.1); padding: 8px; margin-top: 15px; border-radius: 5px; font-size: 0.8em; text-transform: uppercase; color: #2ecc71;">${dataFormatada}</div>`;
                ultimaData = slot.data;
            }

            const exibirPrivado = (userType === 'dono' || userType === 'funcionario'); // Continua usando userType do argumento
            const estaOcupado = slot.dados !== null;

            if (!exibirPrivado && estaOcupado) return;

            const nomeExibido = estaOcupado ? slot.dados.cliente_nome : "DISPONÍVEL";
            const servicoExibido = estaOcupado ? (slot.dados.servicos?.nome || 'Serviço') : "Toque para agendar";
            const profExibido = estaOcupado ? ` | Prof: ${slot.dados.profissionais?.nome || '---'}` : "";
            const corStatus = estaOcupado ? "#e74c3c" : "#2ecc71";
            
            // --- AJUSTE NO CLIQUE DA AGENDA ---
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
    else {
        title.innerText = viewId.toUpperCase();
        body.innerHTML = `<p style="text-align: center; opacity: 0.5; margin-top: 50px;">Módulo em desenvolvimento...</p>`;
    }
}

// --- FUNÇÃO PARA CANCELAR AGENDAMENTO (DONO) ---
async function cancelarAgendamento(agendamentoId) {
    const confirmar = confirm("Deseja realmente CANCELAR este agendamento? Isso removerá os dados financeiros vinculados.");
    if (confirmar) {
        await supabaseClient.from('movimentacoes_financeiras').delete().eq('agendamento_id', agendamentoId);
        const { error } = await supabaseClient.from('agendamentos').delete().eq('id', agendamentoId);
        if (error) {
            alert("Erro ao cancelar: " + error.message);
        } else {
            alert("Agendamento cancelado com sucesso!");
            const tabAtiva = document.querySelector('.tab.active');
            // NOVO: Usar verifiedUserType ao chamar switchTabLite novamente
            switchTabLite('agenda', tabAtiva, verifiedUserType); 
        }
    }
}

async function abrirModalAgendamento(data, hora) {
    slotSelecionado = { data, hora };
    document.getElementById('modal-agendamento').style.display = 'flex';
    document.getElementById('info-slot').innerText = `Agendando para: ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')} às ${hora}`;

    const { data: servicos } = await supabaseClient.from('servicos').select('id, nome, duracao_minutos').eq('estabelecimento_id', dadosEstabelecimento.id).order('nome');
    const sSelect = document.getElementById('agend-servico');
    sSelect.innerHTML = '<option value="">Selecione o Serviço...</option>';
    servicos?.forEach(s => sSelect.innerHTML += `<option value="${s.id}" data-duracao="${s.duracao_minutos || 30}">${s.nome}</option>`);
    
    const pSelect = document.getElementById('agend-profissional');
    pSelect.innerHTML = '<option value="">Selecione o Serviço Primeiro...</option>';

    sSelect.onchange = async function() {
        const servicoId = this.value;
        const duracaoServico = parseInt(this.options[this.selectedIndex].dataset.duracao);
        
        if (!servicoId) {
            pSelect.innerHTML = '<option value="">Selecione o Serviço Primeiro...</option>';
            return;
        }

        pSelect.innerHTML = '<option value="">Buscando profissionais...</option>';

        // NOVO: Chama a função para buscar profissionais disponíveis para o slot
        const profissionaisDisponiveis = await getProfissionaisDisponiveisNoSlot(servicoId, slotSelecionado.data, slotSelecionado.hora, duracaoServico);

        pSelect.innerHTML = '<option value="">Selecione o Profissional...</option>';
        
        if (profissionaisDisponiveis.length === 0) {
            pSelect.innerHTML = '<option value="">Nenhum profissional disponível para este serviço/horário.</option>';
            pSelect.disabled = true;
            document.querySelector('#modal-agendamento button:last-child').disabled = true; // Desabilita o botão de confirmar
        } else {
            profissionaisDisponiveis.forEach(p => pSelect.innerHTML += `<option value="${p.id}">${p.nome} (${p.especialidade})</option>`);
            pSelect.disabled = false;
            document.querySelector('#modal-agendamento button:last-child').disabled = false;
        }
    };
}

// NOVO: Função para buscar profissionais disponíveis para um slot específico
async function getProfissionaisDisponiveisNoSlot(servicoId, data, hora, duracaoServico) {
    const { data: servico } = await supabaseClient
        .from('servicos')
        .select('id, duracao_minutos')
        .eq('id', servicoId)
        .single();

    if (!servico) return [];

    const inicioSlot = new Date(`${data}T${hora}:00`);
    const fimSlot = new Date(inicioSlot.getTime() + (servico.duracao_minutos || duracaoServico) * 60 * 1000); // Usa a duração real do serviço

    // Obter todos os profissionais que podem realizar este serviço
    // Nota: Assumindo que 'servico_profissional' é uma tabela de junção.
    // Se a especialidade do profissional no campo 'especialidade' for usada para isso, ajuste a query.
    const { data: profsParaServico } = await supabaseClient
        .from('profissionais')
        .select('id, nome, especialidade, horario_trabalho_inicio, horario_trabalho_fim, dias_trabalho_json')
        .eq('estabelecimento_id', dadosEstabelecimento.id);

    // Filtrar os profissionais para os que realmente podem fazer o serviço (via especialidade ou tabela de junção)
    // Para simplificar, vou manter a lógica de especialidade vs nome do serviço, mas o ideal é a tabela de junção.
    const { data: servicoInfoParaProf } = await supabaseClient.from('servicos').select('nome').eq('id', servicoId).single();
    const nomeServico = servicoInfoParaProf?.nome.toLowerCase();

    const profissionaisCandidatos = profsParaServico.filter(p => {
        const especialidadeProf = p.especialidade?.toLowerCase();
        return especialidadeProf && nomeServico && (nomeServico.includes(especialidadeProf) || especialidadeProf.includes(nomeServico));
    });

    const profissionaisDisponiveis = [];

    for (const prof of profissionaisCandidatos) {
        const diaSemana = inicioSlot.toLocaleDateString('pt-BR', { weekday: 'short' }).substring(0,3).toLowerCase(); // ex: seg, ter
        const diasTrabalho = prof.dias_trabalho_json;

        // Verifica se o profissional trabalha neste dia da semana
        if (!diasTrabalho || !diasTrabalho.includes(diaSemana)) {
            continue;
        }

        // Verifica o horário de trabalho do profissional
        const inicioExpediente = new Date(`${data}T${prof.horario_trabalho_inicio}:00`);
        const fimExpediente = new Date(`${data}T${prof.horario_trabalho_fim}:00`);

        if (inicioSlot < inicioExpediente || fimSlot > fimExpediente) {
            continue; // Fora do horário de expediente do profissional
        }

        // Verifica se há conflito com outros agendamentos do profissional
        const { data: agendamentosProfissional } = await supabaseClient
            .from('agendamentos')
            .select('data_hora_inicio, servicos(duracao_minutos)')
            .eq('profissional_id', prof.id)
            .gte('data_hora_inicio', new Date(inicioSlot.getFullYear(), inicioSlot.getMonth(), inicioSlot.getDate()).toISOString()) // Começo do dia
            .lte('data_hora_inicio', new Date(inicioSlot.getFullYear(), inicioSlot.getMonth(), inicioSlot.getDate(), 23, 59, 59).toISOString()); // Fim do dia

        let conflito = false;
        for (const agendamento of agendamentosProfissional) {
            const agInicio = new Date(agendamento.data_hora_inicio);
            const agDuracao = agendamento.servicos?.duracao_minutos || 30; // Pega a duração do serviço agendado
            const agFim = new Date(agInicio.getTime() + agDuracao * 60 * 1000);

            // Verifica se os intervalos se sobrepõem
            if (inicioSlot < agFim && fimSlot > agInicio) {
                conflito = true;
                break;
            }
        }

        if (!conflito) {
            profissionaisDisponiveis.push(prof);
        }
    }

    return profissionaisDisponiveis;
}


function fecharModal() {
    document.getElementById('modal-agendamento').style.display = 'none';
    document.getElementById('agend-nome').value = "";
    document.getElementById('agend-whatsapp').value = "";
    document.getElementById('agend-servico').value = ""; // Limpa seleção de serviço
    document.getElementById('agend-profissional').value = ""; // Limpa seleção de profissional
}

async function confirmarAgendamento() {
    const nome = document.getElementById('agend-nome').value;
    const whatsapp = document.getElementById('agend-whatsapp').value;
    const servicoId = document.getElementById('agend-servico').value;
    const profId = document.getElementById('agend-profissional').value;

    if (!nome || !whatsapp || !servicoId || !profId) {
        return alert("Por favor, preencha todos os campos.");
    }

    const dataObjeto = new Date(`${slotSelecionado.data}T${slotSelecionado.hora.substring(0, 5)}:00`);

    // NOVA VALIDAÇÃO: Confirma a disponibilidade do profissional novamente antes de agendar
    const { data: servicoParaConfirmar } = await supabaseClient
        .from('servicos')
        .select('duracao_minutos')
        .eq('id', servicoId)
        .single();
    
    if (!servicoParaConfirmar) {
        return alert("Erro: Serviço não encontrado.");
    }

    const profissionaisDisponiveis = await getProfissionaisDisponiveisNoSlot(servicoId, slotSelecionado.data, slotSelecionado.hora, servicoParaConfirmar.duracao_minutos);
    const profissionalAindaDisponivel = profissionaisDisponiveis.some(p => p.id === profId);

    if (!profissionalAindaDisponivel) {
        return alert("O profissional selecionado não está mais disponível para este horário. Por favor, escolha outro slot ou profissional.");
    }


    const payload = {
        estabelecimento_id: dadosEstabelecimento.id,
        profissional_id: profId,
        servico_id: servicoId,
        cliente_nome: nome,
        cliente_whatsapp: whatsapp,
        data_hora_inicio: dataObjeto.toISOString(),
        status: 'confirmado'
    };

    const { data: novoAgendamento, error: errorAg } = await supabaseClient
        .from('agendamentos')
        .insert([payload])
        .select('id')
        .single();

    if (errorAg) {
        return alert("Erro ao agendar: " + errorAg.message);
    }

    const { data: servicoInfo } = await supabaseClient
        .from('servicos')
        .select('preco, nome')
        .eq('id', servicoId)
        .single();

    if (novoAgendamento && servicoInfo) {
        await supabaseClient.from('movimentacoes_financeiras').insert([{
            estabelecimento_id: dadosEstabelecimento.id,
            agendamento_id: novoAgendamento.id,
            profissional_id: profId,
            tipo: 'receita',
            valor: servicoInfo.preco,
            descricao: `Agendamento: ${servicoInfo.nome} - Cliente: ${nome}`,
            data_movimentacao: new Date().toISOString()
        }]);
    }

    alert("Agendamento realizado com sucesso!");
    fecharModal();
    setTimeout(() => {
        const tabAtiva = document.querySelector('.tab.active');
        // NOVO: Usar verifiedUserType ao chamar switchTabLite novamente
        switchTabLite('agenda', tabAtiva, verifiedUserType);
    }, 600);
}

async function popularCamposGestao() {
    if (!dadosEstabelecimento) return;

    // NOVO: Proteção adicional: Somente popular se o usuário for um 'dono'
    if (verifiedUserType !== 'dono') {
        console.warn("Tentativa de popular campos de gestão por usuário não-dono.");
        document.getElementById('aba-gestao').innerHTML = "<p style='text-align:center; opacity:0.5; color: #e74c3c;'>Acesso não autorizado aos dados de gestão.</p>";
        return;
    }

    document.getElementById('edit-nome-fantasia').value = dadosEstabelecimento.nome_fantasia || "";
    document.getElementById('edit-razao-social').value = dadosEstabelecimento.razao_social || "";
    document.getElementById('edit-cnpj').value = dadosEstabelecimento.cnpj || "";
    document.getElementById('edit-whatsapp').value = dadosEstabelecimento.whatsapp || "";
    document.getElementById('edit-endereco-completo').value = dadosEstabelecimento.endereco_completo || "";
    document.getElementById('edit-hora-abertura').value = dadosEstabelecimento.hora_abertura || "08:00";
    document.getElementById('edit-hora-fechamento').value = dadosEstabelecimento.hora_fechamento || "18:00";
    document.getElementById('edit-intervalo-slot').value = dadosEstabelecimento.intervalo_slot || 30;

    const { data: perfil } = await supabaseClient.from('perfis').select('*').eq('id', dadosEstabelecimento.dono_id).single();
    if (perfil) {
        document.getElementById('perf-nome-completo').value = perfil.nome_completo || "";
        document.getElementById('perf-cpf').value = perfil.cpf || "";
        document.getElementById('perf-email-contato').value = perfil.email_contato || "";
    }
}

async function atualizarDadosGerais() {
    // NOVO: Proteção adicional: Somente permitir atualização se o usuário for um 'dono'
    if (verifiedUserType !== 'dono') {
        alert("Você não tem permissão para atualizar essas configurações.");
        return;
    }

    const novosDadosEstab = {
        nome_fantasia: document.getElementById('edit-nome-fantasia').value,
        razao_social: document.getElementById('edit-razao-social').value,
        cnpj: document.getElementById('edit-cnpj').value,
        whatsapp: document.getElementById('edit-whatsapp').value,
        endereco_completo: document.getElementById('edit-endereco-completo').value,
        hora_abertura: document.getElementById('edit-hora-abertura').value,
        hora_fechamento: document.getElementById('edit-hora-fechamento').value,
        intervalo_slot: parseInt(document.getElementById('edit-intervalo-slot').value)
    };

    const novosDadosPerfil = {
        nome_completo: document.getElementById('perf-nome-completo').value,
        cpf: document.getElementById('perf-cpf').value,
        email_contato: document.getElementById('perf-email-contato').value
    };

    const { error: errorEstab } = await supabaseClient.from('estabelecimentos').update(novosDadosEstab).eq('id', dadosEstabelecimento.id);
    const { error: errorPerfil } = await supabaseClient.from('perfis').update(novosDadosPerfil).eq('id', dadosEstabelecimento.dono_id);

    if (errorEstab || errorPerfil) {
        alert("Erro ao salvar dados.");
    } else {
        alert("Configurações salvas com sucesso!");
        dadosEstabelecimento = { ...dadosEstabelecimento, ...novosDadosEstab };
        document.getElementById('salon-name').innerText = novosDadosEstab.nome_fantasia;
    }
}

async function cadastrarServico() {
    // NOVO: Proteção adicional: Somente permitir cadastro se o usuário for um 'dono'
    if (verifiedUserType !== 'dono') {
        alert("Você não tem permissão para cadastrar serviços.");
        return;
    }

    const nome = document.getElementById('new-servico-nome').value;
    const preco = parseFloat(document.getElementById('new-servico-preco').value);
    const duracao = parseInt(document.getElementById('new-servico-duracao').value);
    const descricao = document.getElementById('new-servico-desc').value;

    if (!nome || isNaN(preco) || isNaN(duracao)) return alert("Preencha Nome, Preço e Duração corretamente.");

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
    // NOVO: Proteção adicional: Somente permitir cadastro se o usuário for um 'dono'
    if (verifiedUserType !== 'dono') {
        alert("Você não tem permissão para cadastrar profissionais.");
        return;
    }

    const nome = document.getElementById('new-prof-nome').value;
    const especialidade = document.getElementById('new-prof-especialidade').value;
    const whatsapp = document.getElementById('new-prof-whatsapp').value;
    
    // CAPTURANDO OS DADOS DE REMUNERAÇÃO DO HTML (PARA CÁLCULO DE COMISSÕES)
    const tipoRemun = document.getElementById('new-prof-tipo-remuneracao').value;
    const valorComissao = document.getElementById('new-prof-comissao').value;

    // NOVOS CAMPOS: Horário de trabalho e dias da semana
    const horarioInicio = document.getElementById('new-prof-hora-inicio').value;
    const horarioFim = document.getElementById('new-prof-hora-fim').value;
    const diasTrabalhoCheckboxes = document.querySelectorAll('.new-prof-dia-checkbox:checked');
    const diasTrabalho = Array.from(diasTrabalhoCheckboxes).map(cb => cb.value);


    if (!nome) return alert("Nome é obrigatório.");

    const { error } = await supabaseClient.from('profissionais').insert([{
        estabelecimento_id: dadosEstabelecimento.id,
        nome: nome,
        especialidade: especialidade,
        whatsapp: whatsapp,
        tipo_remuneracao: tipoRemun,
        valor_comissao_porcentagem: parseFloat(valorComissao) || 0,
        // INSERÇÃO DOS NOVOS CAMPOS
        horario_trabalho_inicio: horarioInicio,
        horario_trabalho_fim: horarioFim,
        dias_trabalho_json: diasTrabalho // Supabase aceitará um array JS e converterá para JSONB
    }]);

    if (error) {
        alert("Erro: " + error.message);
    } else {
        alert("Profissional adicionado!");
        // LIMPANDO OS CAMPOS APÓS O SUCESSO
        document.getElementById('new-prof-nome').value = "";
        document.getElementById('new-prof-especialidade').value = "";
        document.getElementById('new-prof-whatsapp').value = "";
        document.getElementById('new-prof-comissao').value = "";
        document.getElementById('new-prof-hora-inicio').value = "09:00"; // Reset para o valor padrão
        document.getElementById('new-prof-hora-fim').value = "18:00"; // Reset para o valor padrão
        document.querySelectorAll('.new-prof-dia-checkbox').forEach(cb => { cb.checked = true; }); // Marca todos novamente
    }
}

const PERFIS = {
    cliente: [{ id: 'servicos', label: 'SERVIÇOS' }, { id: 'agenda', label: 'AGENDA' }],
    funcionario: [{ id: 'agenda', label: 'MINHA AGENDA' }], // Manter esta opção se for implementar funcionários no futuro
    dono: [{ id: 'servicos', label: 'SERVIÇOS' }, { id: 'agenda', label: 'AGENDA GERAL' }, { id: 'dashboard', label: 'DASHBOARD' }]
};

const monitorarAgenda = supabaseClient
    .channel('agenda-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, () => {
        const tabAtiva = document.querySelector('.tab.active');
        // NOVO: Passar verifiedUserType ao chamar switchTabLite no monitoramento
        if (tabAtiva && tabAtiva.innerText.includes('AGENDA')) {
            switchTabLite('agenda', tabAtiva, verifiedUserType);
        }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'movimentacoes_financeiras' }, () => {
        const tabAtiva = document.querySelector('.tab.active');
        // NOVO: Passar verifiedUserType ao chamar switchTabLite no monitoramento
        if (tabAtiva && tabAtiva.innerText.includes('AGENDA')) {
            switchTabLite('agenda', tabAtiva, verifiedUserType);
        }
    })
    .subscribe();

window.onload = init;
