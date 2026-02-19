// app.js - Ponto de entrada e orquestrador da aplicação - corr 3

// Importa todos os módulos necessários
import * as UI from './ui.js';
import * as ManagementService from './managementService.js';
import * as AgendaService from './agendaService.js';
import { supabaseClient } from './config.js';
import { verifyUser, logout } from './auth.js';

// Variáveis globais para armazenar o estado da aplicação
let _estabelecimentoId = null;
let _donoId = null;
let _verifiedUserType = 'publico'; // 'publico', 'funcionario', 'dono'
let _currentPeriodoAgenda = 'dia'; // 'dia' ou 'semana'
let _currentDataAgenda = null;
let _currentHoraAgenda = null;
let _currentServicoDuracao = 30; // Duração padrão do serviço

// --- Funções de Ajuda e Exposição Global ---
// Funções que são chamadas diretamente do HTML via onclick precisam ser expostas globalmente
window.logout = logout;
window.fecharModalAgendamento = UI.fecharModalAgendamento;
window.fecharModalEdicaoServico = UI.fecharModalEdicaoServico;
window.fecharModalEdicaoProfissional = UI.fecharModalEdicaoProfissional;

/**
 * Função auxiliar para validar e padronizar formatos de hora (HH:MM).
 * @param {string} timeString - A string de hora a ser validada.
 * @param {string} defaultValue - O valor padrão a ser retornado se a string for inválida.
 * @returns {string} A string de hora validada ou o valor padrão.
 */
function _validateTimeFormat(timeString, defaultValue) {
    const timeRegex = /^(?:2[0-3]|[01]?[0-9]):(?:[0-5]?[0-9])$/; // HH:MM (00:00 a 23:59)
    if (timeString && typeof timeString === 'string' && timeRegex.test(timeString)) {
        return timeString;
    }
    console.warn(`[app.js] Formato de hora inválido recebido: "${timeString}". Usando valor padrão: "${defaultValue}"`);
    return defaultValue;
}


/**
 * Lida com o clique no botão de enviar comando do chat.
 */
window.generateContent = async () => {
    const chatElement = document.getElementById('chat-criar');
    const inputElement = document.getElementById('cmd-input');
    if (_estabelecimentoId) {
        await UI.generateChatContent(inputElement.value, chatElement, inputElement, _estabelecimentoId);
    } else {
        alert("Erro: ID do estabelecimento não carregado.");
    }
};

/**
 * Lida com a confirmação de um novo agendamento.
 */
window.confirmarAgendamento = async () => {
    const clienteNome = document.getElementById('agend-nome').value;
    const clienteWhatsapp = document.getElementById('agend-whatsapp').value;
    const servicoId = document.getElementById('agend-servico').value;
    const profissionalId = document.getElementById('agend-profissional').value;

    if (!clienteNome || !clienteWhatsapp || !servicoId || !profissionalId || !_currentDataAgenda || !_currentHoraAgenda) {
        alert("Por favor, preencha todos os campos e selecione um profissional.");
        return;
    }

    // A string de data/hora é formatada aqui com 'Z' para ser explicitamente UTC.
    // A função createUTCDateFromLocalDateAndTime em agendaService fará a conversão correta
    // se for necessário interpretar data e hora locais antes de converter para UTC.
    const dataHoraInicioUTC = AgendaService.createUTCDateFromLocalDateAndTime(_currentDataAgenda, _currentHoraAgenda).toISOString();


    const payload = {
        estabelecimento_id: _estabelecimentoId,
        servico_id: servicoId,
        profissional_id: profissionalId,
        cliente_nome: clienteNome,
        cliente_whatsapp: clienteWhatsapp,
        data_hora_inicio: dataHoraInicioUTC, 
        status: 'agendado'
    };

    try {
        await AgendaService.confirmarAgendamento(payload, servicoId, profissionalId, clienteNome, _estabelecimentoId);
        alert("Agendamento confirmado com sucesso!");
        UI.fecharModalAgendamento();
        loadAndRenderAgenda(); // Recarregar a agenda
    } catch (error) {
        console.error("Erro ao confirmar agendamento:", error);
        alert(error.message || "Erro ao confirmar agendamento.");
    }
};

/**
 * Salva as edições de um serviço.
 */
window.salvarEdicaoServico = async () => {
    const servicoId = document.getElementById('edit-servico-id').value;
    const nome = document.getElementById('edit-servico-nome').value;
    const descricao = document.getElementById('edit-servico-desc').value;
    const preco = parseFloat(document.getElementById('edit-servico-preco').value);
    const duracao_minutos = parseInt(document.getElementById('edit-servico-duracao').value, 10);

    if (!servicoId || !nome || isNaN(preco) || isNaN(duracao_minutos)) {
        alert("Preencha todos os campos obrigatórios para o serviço.");
        return;
    }

    const dadosServico = { nome, descricao, preco, duracao_minutos };

    try {
        await ManagementService.updateServico(servicoId, dadosServico, _verifiedUserType);
        alert("Serviço atualizado com sucesso!");
        UI.fecharModalEdicaoServico();
        loadAndRenderGestao(); // Recarregar a aba de gestão para atualizar dropdowns
    } catch (error) {
        console.error("Erro ao salvar edição do serviço:", error);
        alert(error.message || "Erro ao salvar edição do serviço.");
    }
};

/**
 * Salva as edições de um profissional.
 */
window.salvarEdicaoProfissional = async () => {
    const profId = document.getElementById('edit-prof-id').value;
    const nome = document.getElementById('edit-prof-nome').value;
    const whatsapp = document.getElementById('edit-prof-whatsapp').value;
    const tipoRemuneracao = document.getElementById('edit-prof-tipo-remuneracao').value;
    const comissao = parseFloat(document.getElementById('edit-prof-comissao').value);
    const horaInicio = document.getElementById('edit-prof-hora-inicio').value;
    const horaFim = document.getElementById('edit-prof-hora-fim').value;

    // --- NOVA LÓGICA PARA SERVIÇOS ESPECIALIZADOS ---
    const selectMultiServicos = document.getElementById('edit-prof-servicos-especializados');
    const servicosEspecializados = Array.from(selectMultiServicos.selectedOptions).map(option => option.value);
    // --- FIM DA NOVA LÓGICA ---

    const diasTrabalho = Array.from(document.querySelectorAll('.edit-prof-dia-checkbox:checked')).map(cb => cb.value);

    if (!profId || !nome || !whatsapp || !tipoRemuneracao || isNaN(comissao) || !horaInicio || !horaFim || diasTrabalho.length === 0) {
        alert("Preencha todos os campos obrigatórios para o profissional e selecione os dias de trabalho.");
        return;
    }

    const dadosProfissional = {
        nome,
        whatsapp,
        tipo_remuneracao: tipoRemuneracao,
        valor_comissao_porcentagem: comissao,
        horario_trabalho_inicio: _validateTimeFormat(horaInicio, "08:00"), // Validação aqui
        horario_trabalho_fim: _validateTimeFormat(horaFim, "18:00"),     // Validação aqui
        dias_trabalho_json: diasTrabalho,
        servicos_especializados: servicosEspecializados // Envia o array de IDs
    };

    try {
        await ManagementService.updateProfissional(profId, dadosProfissional, _verifiedUserType);
        alert("Profissional atualizado com sucesso!");
        UI.fecharModalEdicaoProfissional();
        loadAndRenderGestao(); // Recarregar a aba de gestão
    } catch (error) {
        console.error("Erro ao salvar edição do profissional:", error);
        alert(error.message || "Erro ao salvar edição do profissional.");
    }
};


// --- Funções de Carregamento e Renderização de Conteúdo ---

/**
 * Carrega e renderiza o conteúdo da aba "Agenda".
 */
async function loadAndRenderAgenda() {
    UI.showLoadingState();
    try {
        // CORREÇÃO: Usar a data atual em UTC para consistência
        const hojeUTC = new Date(new Date().toISOString());
        let dataInicio = new Date(hojeUTC);
        let dataFim = new Date(hojeUTC);

        if (_currentPeriodoAgenda === 'semana') {
            dataFim.setDate(hojeUTC.getDate() + 6); // Próximos 7 dias
        }

        // CORREÇÃO: Usar toISOString().split('T')[0] para obter YYYY-MM-DD em UTC
        const dataInicioISO = dataInicio.toISOString().split('T')[0];
        const dataFimISO = dataFim.toISOString().split('T')[0];


        const agendamentos = await AgendaService.getAgendamentosPorPeriodo(_estabelecimentoId, dataInicioISO, dataFimISO);
        // NOVO: Buscar todos os serviços e profissionais para passar para gerarGradeHorarios
        const allServices = await ManagementService.getServicos(_estabelecimentoId);
        const allProfessionals = await ManagementService.getProfissionais(_estabelecimentoId);

        const grade = AgendaService.gerarGradeHorarios(
            localStorage.getItem('hora_abertura') || "08:00",
            localStorage.getItem('hora_fechamento') || "18:00",
            agendamentos,
            _currentPeriodoAgenda,
            allServices, // Novo argumento
            allProfessionals // Novo argumento
        );

        UI.renderAgendaContent(
            grade,
            _currentPeriodoAgenda,
            _verifiedUserType,
            (periodo) => `_app.setPeriodoAgenda('${periodo}')`, // Função exposta globalmente
            (data, hora) => `_app.handleSlotClickForAgendamento('${data}', '${hora}')`, // Função exposta globalmente
            (agendamentoId) => `_app.handleSlotClickForCancelamento('${agendamentoId}')` // Função exposta globalmente
        );

    } catch (error) {
        console.error("Erro ao carregar agenda:", error);
        alert("Erro ao carregar agenda: " + error.message);
        document.getElementById('view-body').innerHTML = `<p style='text-align:center; opacity:0.5; color: #e74c3c;'>Erro ao carregar agenda.</p>`;
    }
}

/**
 * Setter para o período da agenda, recarrega a agenda.
 * Exposta globalmente para `onclick`.
 */
window._app = window._app || {}; // Garante que _app exista
window._app.setPeriodoAgenda = (periodo) => {
    _currentPeriodoAgenda = periodo;
    loadAndRenderAgenda();
};

/**
 * Lida com o clique em um slot de horário disponível.
 * Exposta globalmente para `onclick`.
 */
window._app.handleSlotClickForAgendamento = async (data, hora) => {
    _currentDataAgenda = data;
    _currentHoraAgenda = hora;

    const onServicoChangeCallback = async () => {
        const sSelect = document.getElementById('agend-servico');
        const servicoId = sSelect.value;
        const duracao = sSelect.options[sSelect.selectedIndex]?.dataset.duracao;
        _currentServicoDuracao = parseInt(duracao, 10) || 30; // Atualiza a duração
        await UI.handleProfissionalDropdownUpdate(servicoId, _currentDataAgenda, _currentHoraAgenda, _currentServicoDuracao, _estabelecimentoId);
    };

    await UI.abrirModalAgendamento(data, hora, { id: _estabelecimentoId }, onServicoChangeCallback);

    // Se houver um serviço pré-selecionado (útil se o usuário já tinha preenchido antes)
    const servicoInicial = document.getElementById('agend-servico').value;
    if (servicoInicial) {
        await onServicoChangeCallback(); // Chama a lógica de atualização do profissional
    }
};

/**
 * Lida com o clique em um agendamento existente para cancelamento.
 * Exposta globalmente para `onclick`.
 */
window._app.handleSlotClickForCancelamento = async (agendamentoId) => {
    if (_verifiedUserType !== 'dono' && _verifiedUserType !== 'funcionario') {
        alert("Você não tem permissão para cancelar agendamentos.");
        return;
    }
    if (confirm("Tem certeza que deseja cancelar este agendamento?")) {
        try {
            await AgendaService.cancelarAgendamento(agendamentoId, _verifiedUserType);
            alert("Agendamento cancelado com sucesso!");
            loadAndRenderAgenda();
        } catch (error) {
            console.error("Erro ao cancelar agendamento:", error);
            alert(error.message || "Erro ao cancelar agendamento.");
        }
    }
};


/**
 * Carrega e renderiza o conteúdo da aba "Serviços".
 */
async function loadAndRenderServicos() {
    UI.showLoadingState();
    try {
        const servicos = await ManagementService.getServicos(_estabelecimentoId);
        UI.renderServicosContent(servicos);
    } catch (error) {
        console.error("Erro ao carregar serviços:", error);
        alert("Erro ao carregar serviços: " + error.message);
        document.getElementById('view-body').innerHTML = `<p style='text-align:center; opacity:0.5; color: #e74c3c;'>Erro ao carregar serviços.</p>`;
    }
}

/**
 * Carrega e renderiza o conteúdo da aba "Gestão".
 */
async function loadAndRenderGestao() {
    // A visibilidade do 'aba-gestao' e 'view-body' já é gerenciada por handleTabClick.
    // Nenhuma mensagem de "loading" no 'view-body' é necessária aqui,
    // pois o conteúdo da gestão já está no HTML e será preenchido.
    try {
        const dadosEstabelecimento = await ManagementService.getEstabelecimentoBySlug(localStorage.getItem('slug'));
        await UI.popularCamposGestao(dadosEstabelecimento, _donoId);
        // CORREÇÃO: Usar o nome correto da função popularServicosDropdownParaEdicao
        await UI.popularServicosDropdownParaEdicao(_estabelecimentoId);
        // NOVO: Chamar a função para popular os checkboxes de serviços para o novo profissional
        await UI.popularServicosCheckboxesParaNovoProfissional(_estabelecimentoId);
        await UI.popularDropdownProfissionaisParaEdicao(_estabelecimentoId);

        // Vincula os eventos da UI de gestão
        UI.vincularEventosGestao({
            onUpdateConfig: async () => {
                const novosDadosEstab = {
                    nome_fantasia: document.getElementById('edit-nome-fantasia').value,
                    razao_social: document.getElementById('edit-razao-social').value,
                    cnpj: document.getElementById('edit-cnpj').value,
                    whatsapp: document.getElementById('edit-whatsapp').value,
                    endereco_completo: document.getElementById('edit-endereco-completo').value,
                    hora_abertura: _validateTimeFormat(document.getElementById('edit-hora-abertura').value, "08:00"), // Validação aqui
                    hora_fechamento: _validateTimeFormat(document.getElementById('edit-hora-fechamento').value, "18:00"), // Validação aqui
                    intervalo_slot: parseInt(document.getElementById('edit-intervalo-slot').value, 10),
                };
                const novosDadosPerfil = {
                    nome_completo: document.getElementById('perf-nome-completo').value,
                    cpf: document.getElementById('perf-cpf').value,
                    email_contato: document.getElementById('perf-email-contato').value,
                };
                try {
                    await ManagementService.updateDadosGerais(_estabelecimentoId, novosDadosEstab, _donoId, novosDadosPerfil, _verifiedUserType);
                    alert("Configurações atualizadas com sucesso!");
                    localStorage.setItem('hora_abertura', novosDadosEstab.hora_abertura);
                    localStorage.setItem('hora_fechamento', novosDadosEstab.hora_fechamento);
                    loadAndRenderGestao(); // Recarrega
                } catch (error) {
                    alert(error.message || "Erro ao atualizar configurações.");
                }
            },
            onAddServico: async () => {
                const nome = document.getElementById('new-servico-nome').value;
                const descricao = document.getElementById('new-servico-desc').value;
                const preco = parseFloat(document.getElementById('new-servico-preco').value);
                const duracao = parseInt(document.getElementById('new-servico-duracao').value, 10);

                if (!nome || isNaN(preco) || isNaN(duracao)) {
                    alert("Preencha todos os campos do novo serviço.");
                    return;
                }

                try {
                    await ManagementService.createServico(_estabelecimentoId, nome, preco, duracao, descricao, _verifiedUserType);
                    alert("Serviço cadastrado com sucesso!");
                    document.getElementById('new-servico-nome').value = '';
                    document.getElementById('new-servico-desc').value = '';
                    document.getElementById('new-servico-preco').value = '';
                    document.getElementById('new-servico-duracao').value = '';
                    loadAndRenderGestao();
                } catch (error) {
                    alert(error.message || "Erro ao cadastrar serviço.");
                }
            },
            onEditServico: async (servicoId) => {
                try {
                    const servico = await ManagementService.getServicoById(servicoId, _verifiedUserType);
                    UI.abrirModalEdicaoServico(servico);
                } catch (error) {
                    alert(error.message || "Erro ao carregar serviço para edição.");
                }
            },
            onDeleteServico: async (servicoId) => {
                if (confirm("Tem certeza que deseja excluir este serviço? Isso removerá agendamentos e movimentações financeiras relacionadas.")) {
                    try {
                        await ManagementService.deleteServico(servicoId, _verifiedUserType);
                        alert("Serviço excluído com sucesso!");
                        loadAndRenderGestao();
                    } catch (error) {
                        alert(error.message || "Erro ao excluir serviço.");
                    }
                }
            },
            onAddProfissional: async () => {
                const nome = document.getElementById('new-prof-nome').value;
                const whatsapp = document.getElementById('new-prof-whatsapp').value;
                const tipoRemuneracao = document.getElementById('new-prof-tipo-remuneracao').value;
                const comissao = parseFloat(document.getElementById('new-prof-comissao').value);
                const horaInicio = document.getElementById('new-prof-hora-inicio').value;
                const horaFim = document.getElementById('new-prof-hora-fim').value;
                const diasTrabalho = Array.from(document.querySelectorAll('.new-prof-dia-checkbox:checked')).map(cb => cb.value);

                // --- NOVA LÓGICA PARA SERVIÇOS ESPECIALIZADOS (CADASTRO) ---
                // Coleta os IDs dos serviços selecionados nos checkboxes
                const servicosEspecializados = Array.from(document.querySelectorAll('#new-prof-servicos-especializados input[type="checkbox"]:checked')).map(checkbox => checkbox.value);
                // --- FIM DA NOVA LÓGICA ---

                if (!nome || !whatsapp || !tipoRemuneracao || isNaN(comissao) || !horaInicio || !horaFim || diasTrabalho.length === 0) {
                    alert("Preencha todos os campos do novo profissional e selecione os dias de trabalho.");
                    return;
                }

                const dadosProfissional = {
                    nome,
                    whatsapp,
                    tipo_remuneracao: tipoRemuneracao,
                    valor_comissao_porcentagem: comissao,
                    horario_trabalho_inicio: _validateTimeFormat(horaInicio, "08:00"), // Validação aqui
                    horario_trabalho_fim: _validateTimeFormat(horaFim, "18:00"),     // Validação aqui
                    dias_trabalho_json: diasTrabalho,
                    servicos_especializados: servicosEspecializados // Envia o array de IDs (JSONB)
                };

                try {
                    await ManagementService.createProfissional(_estabelecimentoId, dadosProfissional, _verifiedUserType);
                    alert("Profissional cadastrado com sucesso!");
                    document.getElementById('new-prof-nome').value = '';
                    document.getElementById('new-prof-whatsapp').value = '';
                    // Limpar outros campos do formulário se necessário (incluindo desmarcar checkboxes)
                    document.querySelectorAll('#new-prof-servicos-especializados input[type="checkbox"]').forEach(checkbox => checkbox.checked = false);
                    loadAndRenderGestao();
                } catch (error) {
                    alert(error.message || "Erro ao cadastrar profissional.");
                }
            },
            onEditProfissional: async (profId) => {
                try {
                    const profissional = await ManagementService.getProfissionalById(profId, _verifiedUserType);
                    await UI.abrirModalEdicaoProfissional(profissional, _estabelecimentoId); // Passa estabelecimentoId
                } catch (error) {
                    alert(error.message || "Erro ao carregar profissional para edição.");
                }
            },
            onDeleteProfissional: async (profId) => {
                if (confirm("Tem certeza que deseja excluir este profissional? Isso removerá agendamentos e movimentações financeiras relacionadas a ele.")) {
                    try {
                        await ManagementService.deleteProfissional(profId, _verifiedUserType);
                        alert("Profissional excluído com sucesso!");
                        loadAndRenderGestao();
                    } catch (error) {
                        alert(error.message || "Erro ao excluir profissional.");
                    }
                }
            },
            onServicoSelectedForEdit: async (servicoId) => {
                // A lógica de preencher o modal já está em onEditServico, que é chamada pelo botão.
                // Esta callback apenas habilita os botões.
            },
            onProfissionalSelectedForEdit: async (profId) => {
                // A lógica de preencher o modal já está em onEditProfissional, que é chamada pelo botão.
                // Esta callback apenas habilita os botões.
            }
        });
        // Remova o estado de loading depois que tudo for carregado
        // document.getElementById('view-body').innerHTML = ''; // Ou exiba uma mensagem de boas-vindas na aba de gestão
    } catch (error) {
        console.error("Erro ao carregar gestão:", error);
        alert("Erro ao carregar gestão: " + error.message);
        // Exibe o erro no view-body, já que 'aba-gestao' está visível, mas o erro pode ser global
        // e o 'view-body' é onde as outras abas exibem seu conteúdo.
        document.getElementById('view-body').style.display = 'block'; // Garante que view-body esteja visível
        document.getElementById('aba-gestao').style.display = 'none'; // Oculta aba-gestao em caso de erro
        document.getElementById('view-body').innerHTML = `<p style='text-align:center; opacity:0.5; color: #e74c3c;'>Erro ao carregar gestão.</p>`;
    }
}


/**
 * Manipula o clique nas abas dinâmicas.
 * @param {string} viewId - O ID da view a ser carregada.
 * @param {HTMLElement} clickedTabElement - O elemento da aba clicada.
 */
async function handleTabClick(viewId, clickedTabElement) {
    // Remove 'active' de todas as abas e adiciona à clicada
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    clickedTabElement.classList.add('active');

    // Oculta a aba de gestão por padrão (será mostrada se a viewId for 'gestao')
    document.getElementById('view-title').innerText = clickedTabElement.innerText.toUpperCase();

    const viewBody = document.getElementById('view-body');
    const abaGestao = document.getElementById('aba-gestao');

    // Gerenciar a visibilidade das áreas de conteúdo
    if (viewId === 'gestao') {
        viewBody.style.display = 'none'; // Oculta a área de conteúdo genérica
        abaGestao.style.display = 'block'; // Mostra a área de gestão dedicada
    } else {
        abaGestao.style.display = 'none'; // Oculta a área de gestão
        viewBody.style.display = 'block'; // Mostra a área de conteúdo genérica
    }

    if (_verifiedUserType === 'dono' || _verifiedUserType === 'funcionario') {
        switch (viewId) {
            case 'agenda':
                await loadAndRenderAgenda();
                break;
            case 'servicos':
                await loadAndRenderServicos();
                break;
            case 'gestao':
                await loadAndRenderGestao();
                break;
            case 'dashboard':
                UI.renderModuleUnderDevelopment('Dashboard');
                break;
            case 'financeiro':
                UI.renderModuleUnderDevelopment('Financeiro');
                break;
            default:
                UI.renderModuleUnderDevelopment(viewId);
                break;
        }
    } else { // Usuário público
        switch (viewId) {
            case 'agenda':
                await loadAndRenderAgenda();
                break;
            case 'servicos':
                await loadAndRenderServicos();
                break;
            default:
                UI.renderAccessDenied();
                break;
        }
    }
}


// --- Inicialização da Aplicação ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("App.js carregado. Iniciando verificação de usuário e carregamento de dados.");

    const user = await verifyUser();
    if (!user) {
        console.log("Usuário não autenticado. Redirecionando para login.");
        window.location.href = 'login.html'; // Redireciona para a página de login
        return;
    }

    _donoId = user.id;

    // Tenta obter o slug da URL
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('s');

    if (!slug) {
        console.error("Slug do estabelecimento não encontrado na URL.");
        UI.renderSalonNotFound();
        return;
    }
    localStorage.setItem('slug', slug); // Armazena o slug para uso futuro

    try {
        const estabelecimento = await ManagementService.getEstabelecimentoBySlug(slug);
        if (!estabelecimento) {
            UI.renderSalonNotFound();
            return;
        }

        _estabelecimentoId = estabelecimento.id;
        localStorage.setItem('estabelecimentoId', estabelecimento.id);
        // CORREÇÃO: Usar a função de validação ao salvar no localStorage
        localStorage.setItem('hora_abertura', _validateTimeFormat(estabelecimento.hora_abertura, "08:00"));
        localStorage.setItem('hora_fechamento', _validateTimeFormat(estabelecimento.hora_fechamento, "18:00"));


        // Determina o tipo de usuário com base no ID do dono
        if (user.id === estabelecimento.dono_id) {
            _verifiedUserType = 'dono';
        } else {
            // Lógica para verificar se é funcionário (assumindo que há uma tabela de 'funcionarios' ou 'perfis' com `cargo`)
            const { data: perfilDono, error: perfilError } = await supabaseClient.from('perfis').select('cargo').eq('id', user.id).single();
            if (perfilError) console.warn("Erro ao buscar perfil para determinar cargo:", perfilError.message);

            if (perfilDono?.cargo === 'funcionario') { // Exemplo de verificação de cargo
                _verifiedUserType = 'funcionario';
            } else {
                _verifiedUserType = 'publico';
            }
        }

        // Verifica o período de teste
        const dataFimTrial = estabelecimento.data_fim_trial ? new Date(estabelecimento.data_fim_trial) : null;
        if (dataFimTrial && new Date() > dataFimTrial) {
            UI.renderTrialExpired();
            return;
        }

        UI.updateSalonNameUI(estabelecimento.nome_fantasia);
        // CORREÇÃO: Passando _verifiedUserType e o plano_ativo do estabelecimento
        UI.toggleDashboardButton(_verifiedUserType, estabelecimento.plano_ativo);

        // Define as abas permitidas com base no tipo de usuário
        let abasPermitidas = [
            { id: 'agenda', label: 'Agenda' },
            { id: 'servicos', label: 'Serviços' }
        ];

        if (_verifiedUserType === 'dono' || _verifiedUserType === 'funcionario') {
            abasPermitidas.push({ id: 'gestao', label: 'Gestão' });
            // Outras abas para dono/funcionário, se existirem
            // abasPermitidas.push({ id: 'financeiro', label: 'Financeiro' });
            // abasPermitidas.push({ id: 'dashboard', label: 'Dashboard' });
        }

        UI.setupTabsUI(abasPermitidas, handleTabClick);

    } catch (error) {
        console.error("Erro na inicialização da aplicação:", error);
        UI.renderSalonNotFound(); // Pode ser qualquer erro, tratamos como não encontrado por simplicidade
    }
});
