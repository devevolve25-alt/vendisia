// managementService.js - corr 5
// Lógica de negócios e acesso a dados para gestão de estabelecimento, serviços e profissionais.

import { supabaseClient } from './config.js';

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
    console.warn(`[managementService.js] Formato de hora inválido recebido: "${timeString}". Usando valor padrão: "${defaultValue}"`);
    return defaultValue;
}

/**
 * Busca os dados de um estabelecimento pelo seu slug.
 * @param {string} slug - O slug do estabelecimento.
 * @returns {Promise<Object>} Os dados do estabelecimento.
 * @throws {Error} Se ocorrer um erro ao buscar o estabelecimento.
 */
async function getEstabelecimentoBySlug(slug) {
    const { data: estab, error } = await supabaseClient.from('estabelecimentos').select('*').eq('slug', slug).single();
    if (error) {
        console.error("Erro ao buscar estabelecimento:", error.message);
        throw new Error("Erro ao buscar estabelecimento: " + error.message);
    }
    return estab;
}

/**
 * Atualiza os dados gerais do estabelecimento e do perfil do dono.
 * @param {string} estabelecimentoId - O ID do estabelecimento.
 * @param {Object} novosDadosEstab - Objeto com os novos dados do estabelecimento.
 * @param {string} donoId - O ID do dono do estabelecimento.
 * @param {Object} novosDadosPerfil - Objeto com os novos dados do perfil do dono.
 * @param {string} verifiedUserType - O tipo de usuário verificado (apenas 'dono' pode atualizar).
 * @throws {Error} Se o usuário não tiver permissão ou ocorrer um erro ao salvar os dados.
 */
async function updateDadosGerais(estabelecimentoId, novosDadosEstab, donoId, novosDadosPerfil, verifiedUserType) {
    if (verifiedUserType !== 'dono') {
        throw new Error("Você não tem permissão para atualizar essas configurações.");
    }
    
    // Adicionar validação de tempo para novosDadosEstab aqui também, se os campos estiverem presentes
    // Os dados já devem vir truncados para HH:MM do app.js, mas a validação final ainda é útil.
    if (novosDadosEstab.hora_abertura) {
        novosDadosEstab.hora_abertura = _validateTimeFormat(novosDadosEstab.hora_abertura, "08:00");
    }
    if (novosDadosEstab.hora_fechamento) {
        novosDadosEstab.hora_fechamento = _validateTimeFormat(novosDadosEstab.hora_fechamento, "18:00");
    }

    const { error: errorEstab } = await supabaseClient.from('estabelecimentos').update(novosDadosEstab).eq('id', estabelecimentoId);
    const { error: errorPerfil } = await supabaseClient.from('perfis').update(novosDadosPerfil).eq('id', donoId);
    if (errorEstab || errorPerfil) {
        console.error("Erro ao salvar dados do estabelecimento/perfil:", errorEstab?.message || errorPerfil?.message);
        throw new Error("Erro ao salvar dados.");
    }
}

// --- Funções para Serviços ---

/**
 * Cadastra um novo serviço no estabelecimento.
 * @param {string} estabelecimentoId - O ID do estabelecimento.
 * @param {string} nome - Nome do serviço.
 * @param {number} preco - Preço do serviço.
 * @param {number} duracao - Duração do serviço em minutos.
 * @param {string} descricao - Descrição do serviço.
 * @param {string} verifiedUserType - O tipo de usuário verificado (apenas 'dono' pode cadastrar).
 * @throws {Error} Se o usuário não tiver permissão ou ocorrer um erro ao cadastrar.
 */
async function createServico(estabelecimentoId, nome, preco, duracao, descricao, verifiedUserType) {
    if (verifiedUserType !== 'dono') {
        throw new Error("Você não tem permissão para cadastrar serviços.");
    }
    const { error } = await supabaseClient.from('servicos').insert([{
        estabelecimento_id: estabelecimentoId,
        nome: nome,
        preco: preco,
        descricao: descricao,
        duracao_minutos: duracao
    }]);
    if (error) {
        console.error("Erro ao cadastrar serviço:", error.message);
        throw new Error("Erro ao cadastrar serviço: " + error.message);
    }
}

/**
 * Busca todos os serviços de um estabelecimento.
 * @param {string} estabelecimentoId - O ID do estabelecimento.
 * @returns {Promise<Array<Object>>} Lista de serviços.
 */
async function getServicos(estabelecimentoId) {
    const { data: servicos, error } = await supabaseClient.from('servicos').select('id, nome, duracao_minutos, preco, descricao').eq('estabelecimento_id', estabelecimentoId).order('nome');
    if (error) {
        console.error("Erro ao buscar serviços:", error.message);
        throw new Error("Não foi possível carregar os serviços.");
    }
    return servicos;
}

/**
 * Busca um serviço pelo seu ID.
 * @param {string} servicoId - O ID do serviço.
 * @param {string} verifiedUserType - O tipo de usuário verificado.
 * @returns {Promise<Object>} Os dados do serviço.
 * @throws {Error} Se o usuário não tiver permissão ou o serviço não for encontrado.
 */
async function getServicoById(servicoId, verifiedUserType) {
    if (verifiedUserType !== 'dono' || !servicoId) {
        throw new Error("Você não tem permissão para editar serviços ou nenhum serviço selecionado.");
    }
    const { data: servico, error } = await supabaseClient
        .from('servicos')
        .select('*')
        .eq('id', servicoId)
        .single();
    if (error) {
        console.error("Erro ao carregar serviço:", error.message);
        throw new Error("Erro ao carregar serviço: " + error.message);
    }
    return servico;
}

/**
 * Atualiza um serviço existente.
 * @param {string} servicoId - O ID do serviço a ser atualizado.
 * @param {Object} dadosServico - Objeto com os dados atualizados do serviço.
 * @param {string} verifiedUserType - O tipo de usuário verificado (apenas 'dono' pode atualizar).
 * @throws {Error} Se o usuário não tiver permissão ou ocorrer um erro ao salvar.\n
 */
async function updateServico(servicoId, dadosServico, verifiedUserType) {
    if (verifiedUserType !== 'dono') {
        throw new Error("Você não tem permissão para salvar alterações de serviços.");
    }
    const { error } = await supabaseClient
        .from('servicos')
        .update(dadosServico)
        .eq('id', servicoId);
    if (error) {
        console.error("Erro ao salvar serviço:", error.message);
        throw new Error("Erro ao salvar serviço: " + error.message);
    }
}

/**
 * Exclui um serviço e suas dependências (agendamentos e movimentações financeiras).
 * @param {string} servicoId - O ID do serviço a ser excluído.
 * @param {string} verifiedUserType - O tipo de usuário verificado (apenas 'dono' pode excluir).\n
 * @throws {Error} Se o usuário não tiver permissão ou ocorrer um erro ao excluir.\n
 */
async function deleteServico(servicoId, verifiedUserType) {
    if (verifiedUserType !== 'dono') {
        throw new Error("Você não tem permissão para excluir serviços.");
    }
    // As exclusões em cascata no banco de dados seriam ideais aqui,
    // mas se não houver, precisamos excluir manualmente as dependências.\n
    await supabaseClient.from('agendamentos').delete().eq('servico_id', servicoId);
    await supabaseClient.from('movimentacoes_financeiras').delete().eq('servico_id', servicoId);

    const { error } = await supabaseClient.from('servicos').delete().eq('id', servicoId);
    if (error) {
        console.error("Erro ao excluir serviço:", error.message);
        throw new Error("Erro ao excluir serviço: " + error.message);
    }
}

// --- Funções para Profissionais ---

/**
 * Cadastra um novo profissional.
 * @param {string} estabelecimentoId - O ID do estabelecimento.\n
 * @param {Object} dadosProfissional - Objeto com os dados do novo profissional.
 * @param {string} verifiedUserType - O tipo de usuário verificado (apenas 'dono' pode cadastrar).\n
 * @throws {Error} Se o usuário não tiver permissão ou ocorrer um erro ao cadastrar.\n
 */
async function createProfissional(estabelecimentoId, dadosProfissional, verifiedUserType) {
    if (verifiedUserType !== 'dono') {
        throw new Error("Você não tem permissão para cadastrar profissionais.");
    }
    
    // CORREÇÃO: Truncar e validar o formato das horas antes de inserir
    const profissionalPayload = {
        ...dadosProfissional,
        horario_trabalho_inicio: _validateTimeFormat(dadosProfissional.horario_trabalho_inicio.substring(0, 5), "08:00"),
        horario_trabalho_fim: _validateTimeFormat(dadosProfissional.horario_trabalho_fim.substring(0, 5), "18:00")
    };

    const { error } = await supabaseClient.from('profissionais').insert([{
        estabelecimento_id: estabelecimentoId,
        ...profissionalPayload
    }]);
    if (error) {
        console.error("Erro ao cadastrar profissional:", error.message);
        throw new Error("Erro ao cadastrar profissional: " + error.message);
    }
}

/**
 * Busca todos os profissionais de um estabelecimento.
 * @param {string} estabelecimentoId - O ID do estabelecimento.
 * @returns {Promise<Array<Object>>} Lista de profissionais.
 */
async function getProfissionais(estabelecimentoId) {
    // CORREÇÃO: Adicionando todas as colunas necessárias para a lógica da agenda
    const { data: profissionais, error } = await supabaseClient.from('profissionais').select('id, nome, servicos_especializados, horario_trabalho_inicio, horario_trabalho_fim, dias_trabalho_json').eq('estabelecimento_id', estabelecimentoId).order('nome');
    if (error) {
        console.error("Erro ao buscar profissionais:", error.message);
        throw new Error("Não foi possível carregar os profissionais.");
    }
    
    // CORREÇÃO: Truncar os horários de trabalho para HH:MM antes de retornar
    return profissionais.map(prof => ({
        ...prof,
        horario_trabalho_inicio: prof.horario_trabalho_inicio ? prof.horario_trabalho_inicio.substring(0, 5) : "08:00",
        horario_trabalho_fim: prof.horario_trabalho_fim ? prof.horario_trabalho_fim.substring(0, 5) : "18:00"
    }));
}

/**
 * Busca um profissional pelo seu ID.
 * @param {string} profId - O ID do profissional.
 * @param {string} verifiedUserType - O tipo de usuário verificado.\n
 * @returns {Promise<Object>} Os dados do profissional.\n
 * @throws {Error} Se o usuário não tiver permissão ou o profissional não for encontrado.\n
 */
async function getProfissionalById(profId, verifiedUserType) {
    if (verifiedUserType !== 'dono' || !profId) {
        throw new Error("Você não tem permissão para editar profissionais ou nenhum profissional selecionado.");
    }
    const { data: profissional, error } = await supabaseClient
        .from('profissionais')
        .select('*')
        .eq('id', profId)
        .single();
    if (error) {
        console.error("Erro ao carregar profissional:", error.message);
        throw new Error("Erro ao carregar profissional: " + error.message);
    }

    // CORREÇÃO: Truncar os horários de trabalho para HH:MM antes de retornar
    return {
        ...profissional,
        horario_trabalho_inicio: profissional.horario_trabalho_inicio ? profissional.horario_trabalho_inicio.substring(0, 5) : "08:00",
        horario_trabalho_fim: profissional.horario_trabalho_fim ? profissional.horario_trabalho_fim.substring(0, 5) : "18:00"
    };
}

/**
 * Atualiza um profissional existente.
 * @param {string} profId - O ID do profissional a ser atualizado.
 * @param {Object} dadosProfissional - Objeto com os dados atualizados do profissional.
 * @param {string} verifiedUserType - O tipo de usuário verificado (apenas 'dono' pode atualizar).\n
 * @throws {Error} Se o usuário não tiver permissão ou ocorrer um erro ao salvar.\n
 */
async function updateProfissional(profId, dadosProfissional, verifiedUserType) {
    if (verifiedUserType !== 'dono') {
        throw new Error("Você não tem permissão para salvar alterações de profissionais.");
    }

    // CORREÇÃO: Truncar e validar o formato das horas antes de atualizar
    const profissionalPayload = { ...dadosProfissional };
    if (profissionalPayload.horario_trabalho_inicio) {
        profissionalPayload.horario_trabalho_inicio = _validateTimeFormat(profissionalPayload.horario_trabalho_inicio.substring(0, 5), "08:00");
    }
    if (profissionalPayload.horario_trabalho_fim) {
        profissionalPayload.horario_trabalho_fim = _validateTimeFormat(profissionalPayload.horario_trabalho_fim.substring(0, 5), "18:00");
    }

    const { error } = await supabaseClient
        .from('profissionais')
        .update(profissionalPayload)
        .eq('id', profId);
    if (error) {
        console.error("Erro ao salvar profissional:", error.message);
        throw new Error("Erro ao salvar profissional: " + error.message);
    }
}

/**
 * Exclui um profissional e suas dependências (agendamentos e movimentações financeiras).\n
 * @param {string} profId - O ID do profissional a ser excluído.
 * @param {string} verifiedUserType - O tipo de usuário verificado (apenas 'dono' pode excluir).\n
 * @throws {Error} Se o usuário não tiver permissão ou ocorrer um erro ao excluir.\n
 */
async function deleteProfissional(profId, verifiedUserType) {
    if (verifiedUserType !== 'dono') {
        throw new Error("Você não tem permissão para excluir profissionais.");
    }
    // As exclusões em cascata no banco de dados seriam ideais aqui,
    // mas se não houver, precisamos excluir manualmente as dependências.\n
    await supabaseClient.from('agendamentos').delete().eq('profissional_id', profId);
    await supabaseClient.from('movimentacoes_financeiras').delete().eq('profissional_id', profId);

    const { error } = await supabaseClient.from('profissionais').delete().eq('id', profId);
    if (error) {
        console.error("Erro ao excluir profissional:", error.message);
        throw new Error("Erro ao excluir profissional: " + error.message);
    }
}

/**
 * Faz upload de um arquivo para o Supabase Storage.
 * @param {File} file - O arquivo de imagem a ser enviado.
 * @param {string} bucketName - O nome do bucket no Storage (ex: 'logos-estabelecimentos').
 * @param {string} filePath - O caminho do arquivo no bucket (ex: 'estabelecimento_id/logo.png').
 * @returns {Promise<string>} A URL pública do arquivo enviado.
 */
export async function uploadLogoToStorage(file, bucketName, filePath) {
    if (!file) {
        throw new Error("Nenhum arquivo selecionado para upload.");
    }

    const fileExtension = file.name.split('.').pop();
    const fileNameInStorage = `${filePath}.${fileExtension}`; // Ex: 'logos/seu_id.png'

    const { data, error } = await supabaseClient.storage
        .from(bucketName)
        .upload(fileNameInStorage, file, {
            cacheControl: '3600', // Cache por 1 hora
            upsert: true         // Se o arquivo já existe, sobrescreve
        });

    if (error) {
        console.error("Erro no upload para o Storage:", error);
        throw new Error(`Erro ao fazer upload do logo: ${error.message}`);
    }

    // Obter a URL pública do arquivo
    const { data: publicUrlData } = supabaseClient.storage
        .from(bucketName)
        .getPublicUrl(fileNameInStorage);

    if (!publicUrlData || !publicUrlData.publicUrl) {
        throw new Error("Não foi possível obter a URL pública do logo após o upload.");
    }

    return publicUrlData.publicUrl;
}

/**
 * Atualiza a URL do logo no registro do estabelecimento.
 * @param {string} estabelecimentoId - O ID do estabelecimento.
 * @param {string} logoUrl - A nova URL do logo.
 * @param {string} verifiedUserType - O tipo de usuário logado (para verificação de permissão).
 */
export async function updateEstabelecimentoLogoUrl(estabelecimentoId, logoUrl, verifiedUserType) {
    if (verifiedUserType !== 'dono') {
        throw new Error("Permissão negada. Somente o dono pode atualizar o logo.");
    }

    const { error } = await supabaseClient
        .from('estabelecimentos')
        .update({ logo_url: logoUrl })
        .eq('id', estabelecimentoId);

    if (error) {
        console.error("Erro ao atualizar logo_url no DB:", error);
        throw new Error(`Erro ao salvar URL do logo no banco de dados: ${error.message}`);
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
    // A função updateEstablishmentLogoUI já é exportada na sua declaração, não precisa ser aqui novamente.
};
