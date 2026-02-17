// app.js - Ponto de entrada e orquestrador da aplicação

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

    const payload = {
        estabelecimento_id: _estabelecimentoId,
        servico_id: servicoId,
        profissional_id: profissionalId,
        cliente_nome: clienteNome,
        cliente_whatsapp: clienteWhatsapp,
        data_hora_inicio: `${_currentDataAgenda}T${_currentHoraAgenda}:00.000Z`, // Formato ISO para Supabase
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
        horario_trabalho_inicio: horaInicio,
        horario_trabalho_fim: horaFim,
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
        const hoje = new Date();
        let dataInicio = new Date(hoje);
        let dataFim = new Date(hoje);

        if (_currentPeriodoAgenda === 'semana') {
            dataFim.setDate(hoje.getDate() + 6); // Próximos 7 dias
        }

        const dataInicioISO = dataInicio.toLocaleDateString('sv-SE');
        const dataFimISO = dataFim.toLocaleDateString('sv-SE');

        const agendamentos = await AgendaService.getAgendamentosPorPeriodo(_estabelecimentoId, dataInicioISO, dataFimISO);
        const grade = AgendaService.gerarGradeHorarios(
            localStorage.getItem('hora_abertura') || "08:00",
            localStorage.getItem('hora_fechamento') || "18:00",
            agendamentos,
            _currentPeriodoAgenda
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
    UI.showLoadingState();
    document.getElementById('aba-gestao').style.display = 'block'; // Mostra a aba de gestão
    try {
        const dadosEstabelecimento = await ManagementService.getEstabelecimentoBySlug(localStorage.getItem('slug'));
        await UI.popularCamposGestao(dadosEstabelecimento, _donoId);
        await UI.popularDropdownServicosParaEdicao(_estabelecimentoId);
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
                    hora_abertura: document.getElementById('edit-hora-abertura').value,
                    hora_fechamento: document.getElementById('edit-hora-fechamento').value,
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
                const selectMultiServicos = document.getElementById('new-prof-servicos-especializados');
                const servicosEspecializados = Array.from(selectMultiServicos.selectedOptions).map(option => option.value);
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
                    horario_trabalho_inicio: horaInicio,
                    horario_trabalho_fim: horaFim,
                    dias_trabalho_json: diasTrabalho,
                    servicos_especializados: servicosEspecializados // Envia o array de IDs
                };

                try {
                    await ManagementService.createProfissional(_estabelecimentoId, dadosProfissional, _verifiedUserType);
                    alert("Profissional cadastrado com sucesso!");
                    document.getElementById('new-prof-nome').value = '';
                    document.getElementById('new-prof-whatsapp').value = '';
                    // Limpar outros campos do formulário se necessário
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
        document.getElementById('view-body').innerHTML = ''; // Ou exiba uma mensagem de boas-vindas na aba de gestão
    } catch (error) {
        console.error("Erro ao carregar gestão:", error);
        alert("Erro ao carregar gestão: " + error.message);
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
    document.getElementById('aba-gestao').style.display = 'none';

    document.getElementById('view-title').innerText = clickedTabElement.innerText.toUpperCase();

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
    const slug = urlParams.get('slug');

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
        localStorage.setItem('hora_abertura', estabelecimento.hora_abertura || "08:00");
        localStorage.setItem('hora_fechamento', estabelecimento.hora_fechamento || "18:00");


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
        UI.toggleDashboardButton(_verifiedUserType === 'dono'); // Botão do dashboard visível apenas para donos

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
