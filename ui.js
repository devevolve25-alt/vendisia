// ui.js - 5
// Funções para manipulação da interface do usuário (DOM), modais e renderização de elementos.

import * as ManagementService from './managementService.js';
import * as AgendaService from './agendaService.js';
import { supabaseClient } from './config.js'; // Necessário para getSession() e popularCamposGestao

/**
 * Adiciona uma mensagem ao chat e interage com o webhook da MercurIA.
 * @param {string} input - A mensagem do usuário.
 * @param {HTMLElement} chatElement - O elemento DOM do container do chat.
 * @param {HTMLInputElement} inputElement - O elemento DOM do input de texto do chat.
 * @param {string} dadosEstabelecimentoId - O ID do estabelecimento.
 */
async function generateChatContent(input, chatElement, inputElement, dadosEstabelecimentoId) {
    if(!input) return;

    const divUser = document.createElement('div');
    divUser.className = 'msg-user';
    divUser.innerText = input;
    chatElement.appendChild(divUser);

    inputElement.value = "";
    chatElement.scrollTop = chatElement.scrollHeight;

    const divBot = document.createElement('div');
    divBot.className = 'msg-bot';
    divBot.innerText = "...";
    chatElement.appendChild(divBot);

    try {
        const response = await fetch('https://powerfulkiwi-n8n.cloudfy.live/webhook/3dd98c18-d95d-43b5-bafa-fcde2a305983', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mensagem: input,
                salao_id: dadosEstabelecimentoId,
                origem: "web_agenda"
            })
        });

        const data = await response.json();
        divBot.innerText = data.output || data.resposta || data.text || "Comando processado.";

    } catch (error) {
        console.error("Erro MercurIA:", error);
        divBot.innerText = "Desculpe, tive um problema de conexão.";
    }

    chatElement.scrollTop = chatElement.scrollHeight;
}

/**
 * Vincula eventos a botões e elementos de gestão.
 * Recebe callbacks para as ações que devem ser executadas.
 * @param {Object} callbacks - Objeto contendo funções de callback para os eventos.
 * @param {Function} callbacks.onUpdateConfig - Callback para atualização de configurações.
 * @param {Function} callbacks.onAddServico - Callback para adicionar serviço.
 * @param {Function} callbacks.onEditServico - Callback para editar serviço.
 * @param {Function} callbacks.onDeleteServico - Callback para excluir serviço.
 * @param {Function} callbacks.onAddProfissional - Callback para adicionar profissional.
 * @param {Function} callbacks.onEditProfissional - Callback para editar profissional.
 * @param {Function} callbacks.onDeleteProfissional - Callback para excluir profissional.
 * @param {Function} callbacks.onServicoSelectedForEdit - Callback quando um serviço é selecionado para edição.
 * @param {Function} callbacks.onProfissionalSelectedForEdit - Callback quando um profissional é selecionado para edição.
 */
function vincularEventosGestao({
    onUpdateConfig, onAddServico, onEditServico, onDeleteServico,
    onAddProfissional, onEditProfissional, onDeleteProfissional,
    onServicoSelectedForEdit, onProfissionalSelectedForEdit
}) {
    const btnUpdateConfig = document.getElementById('btn-atualizar-config');
    if(btnUpdateConfig) btnUpdateConfig.onclick = onUpdateConfig;

    const btnAddServico = document.getElementById('btn-salvar-servico');
    if(btnAddServico) btnAddServico.onclick = onAddServico;

    const selectServicoEdicao = document.getElementById('select-servico-para-editar');
    const btnEditarServico = document.getElementById('btn-editar-servico-selecionado');
    const btnExcluirServico = document.getElementById('btn-excluir-servico-selecionado');
    if (selectServicoEdicao && btnEditarServico && btnExcluirServico) {
        selectServicoEdicao.onchange = () => {
            const selectedValue = selectServicoEdicao.value;
            btnEditarServico.disabled = !selectedValue;
            btnExcluirServico.style.display = selectedValue ? 'block' : 'none';
            if (onServicoSelectedForEdit) onServicoSelectedForEdit(selectedValue);
        };
        btnEditarServico.onclick = () => onEditServico(selectServicoEdicao.value);
        btnExcluirServico.onclick = () => onDeleteServico(selectServicoEdicao.value);
        btnEditarServico.disabled = true;
    }

    const btnAddProf = document.getElementById('btn-salvar-prof');
    if(btnAddProf) btnAddProf.onclick = onAddProfissional;

    const selectProfEdicao = document.getElementById('select-prof-para-editar');
    const btnEditarProf = document.getElementById('btn-editar-prof-selecionado');
    const btnExcluirProf = document.getElementById('btn-excluir-prof-selecionado');
    if (selectProfEdicao && btnEditarProf && btnExcluirProf) {
        selectProfEdicao.onchange = () => {
            const selectedValue = selectProfEdicao.value;
            btnEditarProf.disabled = !selectedValue;
            btnExcluirProf.style.display = selectedValue ? 'block' : 'none';
            if (onProfissionalSelectedForEdit) onProfissionalSelectedForEdit(selectedValue);
        };
        btnEditarProf.onclick = () => onEditProfissional(selectProfEdicao.value);
        btnExcluirProf.onclick = () => onDeleteProfissional(selectProfEdicao.value);
        btnEditarProf.disabled = true;
    }
}


/**
 * Abre o modal de agendamento e popula os selects de serviço/profissional.
 * @param {string} data - A data do slot selecionado (YYYY-MM-DD).
 * @param {string} hora - A hora do slot selecionado (HH:MM).
 * @param {Object} dadosEstabelecimento - Dados do estabelecimento para buscar serviços.
 * @param {Function} onServicoChangeCallback - Callback para o evento de mudança do select de serviço.
 */
async function abrirModalAgendamento(data, hora, dadosEstabelecimento, onServicoChangeCallback) {
    document.getElementById('modal-agendamento').style.display = 'flex';
    document.getElementById('info-slot').innerText = `Agendando para: ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')} às ${hora}`;

    const servicos = await ManagementService.getServicos(dadosEstabelecimento.id);
    const sSelect = document.getElementById('agend-servico');
    sSelect.innerHTML = '<option value="">Selecione o Serviço...</option>';
    servicos?.forEach(s => sSelect.innerHTML += `<option value="${s.id}" data-duracao="${s.duracao_minutos || 30}">${s.nome}</option>`);

    const pSelect = document.getElementById('agend-profissional');
    pSelect.innerHTML = '<option value="">Selecione o Serviço Primeiro...</option>'; // Reseta o profissional
    pSelect.disabled = true; // Desabilita até um serviço ser selecionado
    const confirmButton = document.getElementById('btn-confirmar-agendamento'); // Referência ao botão pelo ID
    if (confirmButton) confirmButton.disabled = true; 

    sSelect.onchange = onServicoChangeCallback;
}

/**
 * Fecha o modal de agendamento e limpa seus campos.
 */
function fecharModalAgendamento() {
    document.getElementById('modal-agendamento').style.display = 'none';
    document.getElementById('agend-nome').value = "";
    document.getElementById('agend-whatsapp').value = "";
    document.getElementById('agend-servico').value = "";
    document.getElementById('agend-profissional').value = "";
    document.getElementById('agend-profissional').disabled = true;
}

/**
 * Popula o dropdown de serviços para edição na aba de gestão.
 * @param {string} estabelecimentoId - O ID do estabelecimento.
 */
async function popularServicosDropdownParaEdicao(estabelecimentoId) {
    const selectServico = document.getElementById('select-servico-para-editar');
    selectServico.innerHTML = '<option value="">Selecione um Serviço...</option>';

    try {
        const servicos = await ManagementService.getServicos(estabelecimentoId);
        servicos.forEach(s => {
            const option = document.createElement('option');
            option.value = s.id;
            option.innerText = s.nome;
            selectServico.appendChild(option);
        });
    } catch (error) {
        console.error("Erro ao popular dropdown de serviços:", error.message);
        // Exibir feedback ao usuário se necessário
    }
    document.getElementById('btn-editar-servico-selecionado').disabled = true;
    document.getElementById('btn-excluir-servico-selecionado').style.display = 'none';
}

/**
 * Popula as caixas de seleção de serviços para o formulário de cadastro de novo profissional.
 * @param {string} estabelecimentoId - O ID do estabelecimento.
 */
async function popularServicosCheckboxesParaNovoProfissional(estabelecimentoId) {
    const servicosContainer = document.getElementById('new-prof-servicos-especializados');
    if (!servicosContainer) {
        console.error("Contêiner de checkboxes de serviços 'new-prof-servicos-especializados' não encontrado.");
        return;
    }
    servicosContainer.innerHTML = ''; // Limpa as opções existentes

    try {
        const servicos = await ManagementService.getServicos(estabelecimentoId);
        if (servicos && servicos.length > 0) {
            servicos.forEach(servico => {
                const label = document.createElement('label');
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.gap = '5px';
                label.style.fontSize = '0.85rem';
                label.style.color = '#fff';
                label.style.cursor = 'pointer';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'new-prof-servico-checkbox'; // Nova classe para fácil seleção
                checkbox.value = servico.id;
                checkbox.style.accentColor = 'var(--creative-color)'; // Estilo para o checkbox

                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(servico.nome));
                servicosContainer.appendChild(label);
            });
        } else {
            servicosContainer.innerHTML = '<span style="color: #888; font-size: 0.8rem;">Nenhum serviço cadastrado para seleção.</span>';
        }
    } catch (error) {
        console.error("Erro ao popular checkboxes de serviços:", error.message);
        servicosContainer.innerHTML = '<span style="color: #e74c3c; font-size: 0.8rem;">Erro ao carregar serviços.</span>';
    }
}


/**
 * Popula o dropdown de profissionais para edição na aba de gestão.
 * @param {string} estabelecimentoId - O ID do estabelecimento.
 */
async function popularDropdownProfissionaisParaEdicao(estabelecimentoId) {
    const selectProfissional = document.getElementById('select-prof-para-editar');
    selectProfissional.innerHTML = '<option value="">Selecione um Profissional...</option>';

    try {
        const profissionais = await ManagementService.getProfissionais(estabelecimentoId);
        profissionais.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.innerText = p.nome;
            selectProfissional.appendChild(option);
        });
    } catch (error) {
        console.error("Erro ao popular dropdown de profissionais:", error.message);
        // Exibir feedback ao usuário se necessário
    }
    document.getElementById('btn-editar-prof-selecionado').disabled = true;
    document.getElementById('btn-excluir-prof-selecionado').style.display = 'none';
}

/**
 * Popula os campos do formulário de gestão com os dados do estabelecimento e do perfil do dono.
 * @param {Object} dadosEstabelecimento - Os dados do estabelecimento.
 * @param {string} donoId - O ID do dono para buscar o perfil.
 */
async function popularCamposGestao(dadosEstabelecimento, donoId) {
    document.getElementById('edit-nome-fantasia').value = dadosEstabelecimento.nome_fantasia || "";
    document.getElementById('edit-razao-social').value = dadosEstabelecimento.razao_social || "";
    document.getElementById('edit-cnpj').value = dadosEstabelecimento.cnpj || "";
    document.getElementById('edit-whatsapp').value = dadosEstabelecimento.whatsapp || "";
    document.getElementById('edit-endereco-completo').value = dadosEstabelecimento.endereco_completo || "";
    document.getElementById('edit-hora-abertura').value = dadosEstabelecimento.hora_abertura || "08:00";
    document.getElementById('edit-hora-fechamento').value = dadosEstabelecimento.hora_fechamento || "18:00";
    document.getElementById('edit-intervalo-slot').value = dadosEstabelecimento.intervalo_slot || 30;

    const { data: perfil } = await supabaseClient.from('perfis').select('*').eq('id', donoId).single();
    if (perfil) {
        document.getElementById('perf-nome-completo').value = perfil.nome_completo || "";
        document.getElementById('perf-cpf').value = perfil.cpf || "";
        document.getElementById('perf-email-contato').value = perfil.email_contato || "";
    }
}

/**
 * Abre o modal de edição de serviço e preenche seus campos.
 * @param {Object} servico - Os dados do serviço a ser editado.
 */
function abrirModalEdicaoServico(servico) {
    document.getElementById('edit-servico-id').value = servico.id;
    document.getElementById('edit-servico-nome').value = servico.nome;
    document.getElementById('edit-servico-desc').value = servico.descricao || '';
    document.getElementById('edit-servico-preco').value = servico.preco;
    document.getElementById('edit-servico-duracao').value = servico.duracao_minutos;
    document.getElementById('modal-edicao-servico').style.display = 'flex';
}

/**
 * Fecha o modal de edição de serviço.
 */
function fecharModalEdicaoServico() {
    document.getElementById('modal-edicao-servico').style.display = 'none';
}

/**
 * Abre o modal de edição de profissional e preenche seus campos.
 * Adicionado lógica para múltiplas especialidades.
 * @param {Object} profissional - Os dados do profissional a ser editado.
 * @param {string} estabelecimentoId - O ID do estabelecimento para buscar todos os serviços.
 */
async function abrirModalEdicaoProfissional(profissional, estabelecimentoId) {
    document.getElementById('edit-prof-id').value = profissional.id;
    document.getElementById('edit-prof-nome').value = profissional.nome;
    document.getElementById('edit-prof-whatsapp').value = profissional.whatsapp || '';
    document.getElementById('edit-prof-tipo-remuneracao').value = profissional.tipo_remuneracao || 'comissao';
    document.getElementById('edit-prof-comissao').value = profissional.valor_comissao_porcentagem || 0;
    document.getElementById('edit-prof-hora-inicio').value = profissional.horario_trabalho_inicio || '09:00';
    document.getElementById('edit-prof-hora-fim').value = profissional.horario_trabalho_fim || '18:00';

    const diasTrabalho = profissional.dias_trabalho_json || [];
    document.querySelectorAll('.edit-prof-dia-checkbox').forEach(checkbox => {
        checkbox.checked = diasTrabalho.includes(checkbox.value);
    });

    // --- MODIFICAÇÃO PARA MÚLTIPLAS ESPECIALIDADES (select multiple) ---
    const servicosProfissional = profissional.servicos_especializados || []; // O campo JSONB
    const todosServicos = await ManagementService.getServicos(estabelecimentoId); // Busca todos os serviços
    const selectMultiServicos = document.getElementById('edit-prof-servicos-especializados'); // ID do select múltiplo

    if (selectMultiServicos) {
        selectMultiServicos.innerHTML = ''; // Limpa opções existentes
        todosServicos.forEach(s => {
            const option = document.createElement('option');
            option.value = s.id;
            option.innerText = s.nome;
            if (servicosProfissional.includes(s.id)) {
                option.selected = true; // Pré-seleciona os serviços que o profissional já tem
            }
            selectMultiServicos.appendChild(option);
        });
    }
    // --- FIM DA MODIFICAÇÃO ---

    document.getElementById('modal-edicao-profissional').style.display = 'flex';
}

/**
 * Fecha o modal de edição de profissional.
 */
function fecharModalEdicaoProfissional() {
    document.getElementById('modal-edicao-profissional').style.display = 'none';
}

/**
 * Configura as abas dinâmicas da interface.
 * @param {Array<Object>} abasPermitidas - Lista de abas permitidas para o usuário.
 * @param {Function} onTabClickCallback - Callback a ser executado quando uma aba é clicada.
 */
function setupTabsUI(abasPermitidas, onTabClickCallback) {
    const tabsContainer = document.getElementById('dynamic-tabs');
    tabsContainer.innerHTML = '';
    abasPermitidas.forEach((aba, index) => {
        const tabElement = document.createElement('div');
        tabElement.className = `tab ${index === 0 ? 'active' : ''}`;
        tabElement.innerText = aba.label;
        tabElement.setAttribute('data-view-id', aba.id); // Adiciona um atributo para identificar a aba
        tabElement.onclick = () => onTabClickCallback(aba.id, tabElement);
        tabsContainer.appendChild(tabElement);
    });
    if(abasPermitidas.length > 0 && tabsContainer.firstChild) {
        onTabClickCallback(abasPermitidas[0].id, tabsContainer.firstChild); // Ativa a primeira aba
    }
}

/**
 * Renderiza o conteúdo da aba "Agenda".
 * @param {Array<Object>} grade - Grade de horários a ser exibida.
 * @param {string} periodoAgenda - Período da agenda ('dia' ou 'semana').
 * @param {string} verifiedUserType - Tipo de usuário verificado.
 * @param {Function} onSetPeriodoAgenda - Callback para mudar o período da agenda.
 * @param {Function} onSlotClickForAgendamento - Callback para clique em slot disponível.
 * @param {Function} onSlotClickForCancelamento - Callback para clique em agendamento existente (cancelamento).
 */
/**
 * Renderiza o conteúdo da aba "Agenda".
 * @param {Array<Object>} grade - Grade de horários a ser exibida.
 * @param {string} periodoAgenda - Período da agenda ('dia' ou 'semana').
 * @param {string} verifiedUserType - Tipo de usuário verificado.
 * @param {Function} onSetPeriodoAgenda - Callback para mudar o período da agenda.
 * @param {Function} onSlotClickForAgendamento - Callback para clique em slot disponível.
 * @param {Function} onSlotClickForCancelamento - Callback para clique em agendamento existente (cancelamento).
 */
unction renderAgendaContent(grade, periodoAgenda, verifiedUserType, onSetPeriodoAgenda, onSlotClickForAgendamento, onSlotClickForCancelamento) {
    const body = document.getElementById('view-body');
    const title = document.getElementById('view-title');
    title.innerText = "AGENDA";

    let htmlFiltros = `
        <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 20px;">
            <button onclick="${onSetPeriodoAgenda('dia')}"
                style="padding: 8px 15px; border-radius: 20px; border: 1px solid #2ecc71; background: ${periodoAgenda === 'dia' ? '#2ecc71' : 'transparent'}; color: white; cursor: pointer;">Dia</button>
            <button onclick="${onSetPeriodoAgenda('semana')}"
                style="padding: 8px 15px; border-radius: 20px; border: 1px solid #2ecc71; background: ${periodoAgenda === 'semana' ? '#2ecc71' : 'transparent'}; color: white; cursor: pointer;">Semana</button>
        </div>`;

    let htmlAgenda = '<div class="agenda-list">';
    let ultimaData = "";

    grade.forEach(slot => {
        if (periodoAgenda === 'semana' && slot.data !== ultimaData) {
            const dataFormatada = new Date(slot.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
            htmlAgenda += `<div style="grid-column: 1/-1; background: rgba(255,255,255,0.1); padding: 8px; margin-top: 15px; border-radius: 5px; font-size: 0.8em; text-transform: uppercase; color: #2ecc71;">${dataFormatada}</div>`;
            ultimaData = slot.data;
        }

        const exibirPrivado = (verifiedUserType === 'dono' || verifiedUserType === 'funcionario');
        
        let nomeExibido, servicoExibido, profExibido, corStatus, acaoClique, tooltipText = '';

        if (slot.isPast) {
            nomeExibido = "PASSADO";
            servicoExibido = "Não disponível para agendamento";
            profExibido = "";
            corStatus = "#555"; // Cinza escuro para slots passados
            acaoClique = ""; // Nenhuma ação para slots passados
            tooltipText = "Este horário já passou.";
        } else if (slot.isBooked) {
            // Se já está agendado por um cliente
            corStatus = slot.canBeBooked ? "#d4af37" : "#e74c3c"; // Ouro se ainda puder ser agendado, Vermelho se totalmente ocupado
            acaoClique = ""; // Mantém o cancelamento por clique desativado

            if (exibirPrivado) { // Se for dono ou funcionário, exibe detalhes completos
                nomeExibido = slot.existingAppointment.cliente_nome || `Cliente (ID: ${slot.existingAppointment.cliente_id || 'Desconhecido'})`;
                servicoExibido = slot.existingAppointment.servicos?.nome || 'Serviço';
                profExibido = ` | Prof: ${slot.existingAppointment.profissionais?.nome || '---'}`;
                tooltipText = slot.canBeBooked ? `Agendado por: ${nomeExibido}. ${servicoExibido} ${profExibido}. Há outros horários/profissionais.` : `Agendado por: ${nomeExibido}. ${servicoExibido} ${profExibido}.`;
            } else { // Se for público (visitante), exibe informações genéricas
                nomeExibido = "AGENDADO";
                servicoExibido = "Toque para agendar"; // Para visitantes, se o slot tem disponibilidade restante, permite agendar
                profExibido = ""; // Não exibe o nome do profissional para visitantes
                tooltipText = slot.canBeBooked ? "Este horário está parcialmente agendado. Toque para agendar." : "Este horário está ocupado.";
                // Para visitantes, se o slot está agendado mas ainda pode ser agendado, a ação deve ser de agendamento.
                // Se totalmente ocupado, sem ação.
                if (slot.canBeBooked) {
                    acaoClique = `onclick="${onSlotClickForAgendamento(slot.data, slot.hora)}"`;
                } else {
                    acaoClique = "";
                }
            }
        } else if (slot.canBeBooked) {
            // Se está livre e pode ser agendado
            nomeExibido = "DISPONÍVEL";
            servicoExibido = "Toque para agendar";
            profExibido = "";
            corStatus = "#2ecc71"; // Verde para disponível
            acaoClique = `onclick="${onSlotClickForAgendamento(slot.data, slot.hora)}"`;
            tooltipText = "Este horário está aberto para agendamento.";
        } else {
            // Se não está agendado, não está no passado e não pode ser agendado (totalmente indisponível)
            nomeExibido = "INDISPONÍVEL";
            servicoExibido = "Nenhum profissional disponível";
            profExibido = "";
            corStatus = "#7f8c8d"; // Cinza para globalmente indisponível
            acaoClique = ""; // Sem ação de clique
            tooltipText = "Todos os profissionais estão ocupados ou não atendem neste horário.";
        }

        // Para usuários públicos, slots totalmente indisponíveis ou passados não são exibidos (ou podem ser exibidos de forma diferente).
        // Manter a exibição para todos, mas com as cores e ações corretas.
        // Se a política é não mostrar slots INDISPONÍVEIS (cinza) para clientes, podemos adicionar um 'if' aqui.
        // Por enquanto, vamos mostrar tudo com o status correto.
        // if (!exibirPrivado && (slot.isPast || (!slot.canBeBooked && !slot.isBooked))) return; // Descomente para esconder slots totalmente indisponíveis de clientes.

        htmlAgenda += `
            <div class="agenda-item" ${acaoClique} title="${tooltipText}" style="border-left: 4px solid ${corStatus}; cursor: ${acaoClique ? 'pointer' : 'default'};">
                <div class="agenda-time">${slot.hora}</div>
                <div class="agenda-details">
                    <h4 style="color: ${corStatus === "#e74c3c" ? '#fff' : corStatus}; margin:0;">${nomeExibido}</h4>
                    <span style="font-size: 0.85em; opacity: 0.7;">${servicoExibido}${profExibido}</span>
                </div>
            </div>`;
    });
    body.innerHTML = htmlFiltros + htmlAgenda + '</div>';
}

/**
 * Renderiza o conteúdo da aba "Serviços".
 * @param {Array<Object>} listaServicos - Lista de serviços a ser exibida.
 */
function renderServicosContent(listaServicos) {
    const body = document.getElementById('view-body');
    const title = document.getElementById('view-title');
    title.innerText = "SERVIÇOS";

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

/**
 * Exibe uma mensagem de "módulo em desenvolvimento".
 * @param {string} viewId - O ID da view (ex: 'dashboard').
 */
function renderModuleUnderDevelopment(viewId) {
    const body = document.getElementById('view-body');
    const title = document.getElementById('view-title');
    title.innerText = viewId.toUpperCase();
    body.innerHTML = `<p style="text-align: center; opacity: 0.5; margin-top: 50px;">Módulo em desenvolvimento...</p>`;
}

/**
 * Exibe uma mensagem de acesso negado.
 */
function renderAccessDenied() {
    const title = document.getElementById('view-title');
    const body = document.getElementById('view-body');
    title.innerText = "ACESSO NEGADO";
    body.innerHTML = "<p style='text-align:center; opacity:0.5; color: #e74c3c;'>Você não tem permissão para acessar esta área.</p>";
}

/**
 * Exibe uma tela de expiração de teste.
 */
function renderTrialExpired() {
    document.body.innerHTML = `
        <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#000; color:#fff; text-align:center; padding:20px; font-family:'Montserrat';">
            <h1 style="color:#d4af37; font-family:'Bebas Neue'; font-size: 3rem;">PERÍODO DE TESTE ENCERRADO</h1>
            <p style="opacity:0.8; margin-bottom: 25px;">Seus 7 dias gratuitos acabaram. Para continuar usando a VENDISIA, regularize sua assinatura.</p>
            <a href="https://vendisia.ia.br" style="padding:15px 30px; background:#d4af37; color:#000; text-decoration:none; font-family:'Bebas Neue'; font-size:1.2rem; border-radius:5px;">ASSINAR AGORA</a>
        </div>
    `;
}

/**
 * Atualiza o nome do salão na interface.
 * @param {string} nome - O nome fantasia do salão.
 */
function updateSalonNameUI(nome) {
    document.getElementById('salon-name').innerText = nome;
}

/**
 * Controla a visibilidade do botão do dashboard com base no tipo de usuário e plano ativo.
 * @param {string} userType - O tipo de usuário (e.g., 'dono', 'cliente').
 * @param {string} planoAtivo - O plano ativo do estabelecimento (e.g., 'gestao-total').
 */
function toggleDashboardButton(userType, planoAtivo) {
    const btnDashboard = document.getElementById('container-link-dashboard');
    if (btnDashboard) {
        // O botão é visível apenas se o usuário for 'dono' E o plano for 'gestao-total'
        const isVisible = (userType === 'dono' && planoAtivo === 'gestao-total');
        btnDashboard.style.display = isVisible ? 'block' : 'none';
    }
}

/**
 * Define o conteúdo do corpo da view como uma mensagem de carregamento.
 */
function showLoadingState() {
    document.getElementById('view-body').innerHTML = "<p style='text-align:center; opacity:0.5'>Buscando...</p>";
}

/**
 * Define o conteúdo do corpo da view como uma mensagem de salão não encontrado.
 */
function renderSalonNotFound() {
    document.getElementById('view-body').innerHTML = "<p style='text-align:center'>Salão não encontrado.</p>";
}

/**
 * Lida com a atualização do dropdown de profissionais no modal de agendamento.
 * @param {string} servicoId - O ID do serviço selecionado.
 * @param {string} data - A data do slot.
 * @param {string} hora - A hora do slot.
 * @param {number} duracaoServico - Duração do serviço.
 * @param {string} estabelecimentoId - ID do estabelecimento.
 */
async function handleProfissionalDropdownUpdate(servicoId, data, hora, duracaoServico, estabelecimentoId) {
    const pSelect = document.getElementById('agend-profissional');
    const confirmButton = document.getElementById('btn-confirmar-agendamento'); 

    if (!servicoId) {
        pSelect.innerHTML = '<option value="">Selecione o Serviço Primeiro...</option>';
        pSelect.disabled = true;
        if (confirmButton) confirmButton.disabled = true;
        return;
    }

    pSelect.innerHTML = '<option value="">Buscando profissionais...</option>';
    pSelect.disabled = true;
    if (confirmButton) confirmButton.disabled = true;


    try {
        // A lógica principal para buscar profissionais disponíveis agora está em AgendaService
        const profissionaisDisponiveis = await AgendaService.getProfissionaisDisponiveisNoSlot(servicoId, data, hora, duracaoServico, estabelecimentoId);

        pSelect.innerHTML = '<option value="">Selecione o Profissional...</option>';

        if (profissionaisDisponiveis.length === 0) {
            pSelect.innerHTML = '<option value="">Nenhum profissional disponível para este serviço/horário.</option>';
            pSelect.disabled = true;
            if (confirmButton) confirmButton.disabled = true;
        } else {
            profissionaisDisponiveis.forEach(p => {
                // Adaptação para exibir as múltiplas especialidades (se houver)
                const servicosNomes = p.servicos_especializados_nomes && p.servicos_especializados_nomes.length > 0
                    ? ` (${p.servicos_especializados_nomes.join(', ')})`
                    : '';
                pSelect.innerHTML += `<option value="${p.id}">${p.nome}${servicosNomes}</option>`;
            });
            pSelect.disabled = false;
            // Habilita o botão de confirmar se houver profissionais disponíveis,
            // ou se um profissional for selecionado (se houver um evento 'onchange' para pSelect).
            // Para simplificar, habilitamos se houver opções.
            if (confirmButton) confirmButton.disabled = false;
        }
    } catch (error) {
        console.error("Erro ao carregar profissionais disponíveis:", error.message);
        pSelect.innerHTML = '<option value="">Erro ao carregar profissionais.</option>';
        pSelect.disabled = true;
        if (confirmButton) confirmButton.disabled = true;
    }
}


export {
    generateChatContent,
    vincularEventosGestao,
    abrirModalAgendamento,
    fecharModalAgendamento,
    popularServicosDropdownParaEdicao, // Nome ajustado
    popularServicosCheckboxesParaNovoProfissional, // Nova função exportada
    popularDropdownProfissionaisParaEdicao,
    popularCamposGestao,
    abrirModalEdicaoServico,
    fecharModalEdicaoServico,
    abrirModalEdicaoProfissional,
    fecharModalEdicaoProfissional,
    setupTabsUI,
    renderAgendaContent,
    renderServicosContent,
    renderModuleUnderDevelopment,
    renderAccessDenied,
    renderTrialExpired,
    updateSalonNameUI,
    toggleDashboardButton,
    showLoadingState,
    renderSalonNotFound,
    handleProfissionalDropdownUpdate
};
