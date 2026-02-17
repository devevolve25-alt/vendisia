// managementService.js
// Lógica de negócios e acesso a dados para gestão de estabelecimento, serviços e profissionais.

import { supabaseClient } from './config.js';

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
 * @throws {Error} Se o usuário não tiver permissão ou ocorrer um erro ao salvar.
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
 * @param {string} verifiedUserType - O tipo de usuário verificado (apenas 'dono' pode excluir).
 * @throws {Error} Se o usuário não tiver permissão ou ocorrer um erro ao excluir.
 */
async function deleteServico(servicoId, verifiedUserType) {
    if (verifiedUserType !== 'dono') {
        throw new Error("Você não tem permissão para excluir serviços.");
    }
    // As exclusões em cascata no banco de dados seriam ideais aqui,
    // mas se não houver, precisamos excluir manualmente as dependências.
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
 * @param {string} estabelecimentoId - O ID do estabelecimento.
 * @param {Object} dadosProfissional - Objeto com os dados do novo profissional.
 * @param {string} verifiedUserType - O tipo de usuário verificado (apenas 'dono' pode cadastrar).
 * @throws {Error} Se o usuário não tiver permissão ou ocorrer um erro ao cadastrar.
 */
async function createProfissional(estabelecimentoId, dadosProfissional, verifiedUserType) {
    if (verifiedUserType !== 'dono') {
        throw new Error("Você não tem permissão para cadastrar profissionais.");
    }
    const { error } = await supabaseClient.from('profissionais').insert([{
        estabelecimento_id: estabelecimentoId,
        ...dadosProfissional
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
    const { data: profissionais, error } = await supabaseClient.from('profissionais').select('id, nome').eq('estabelecimento_id', estabelecimentoId).order('nome');
    if (error) {
        console.error("Erro ao buscar profissionais:", error.message);
        throw new Error("Não foi possível carregar os profissionais.");
    }
    return profissionais;
}

/**
 * Busca um profissional pelo seu ID.
 * @param {string} profId - O ID do profissional.
 * @param {string} verifiedUserType - O tipo de usuário verificado.
 * @returns {Promise<Object>} Os dados do profissional.
 * @throws {Error} Se o usuário não tiver permissão ou o profissional não for encontrado.
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
    return profissional;
}

/**
 * Atualiza um profissional existente.
 * @param {string} profId - O ID do profissional a ser atualizado.
 * @param {Object} dadosProfissional - Objeto com os dados atualizados do profissional.
 * @param {string} verifiedUserType - O tipo de usuário verificado (apenas 'dono' pode atualizar).
 * @throws {Error} Se o usuário não tiver permissão ou ocorrer um erro ao salvar.
 */
async function updateProfissional(profId, dadosProfissional, verifiedUserType) {
    if (verifiedUserType !== 'dono') {
        throw new Error("Você não tem permissão para salvar alterações de profissionais.");
    }
    const { error } = await supabaseClient
        .from('profissionais')
        .update(dadosProfissional)
        .eq('id', profId);
    if (error) {
        console.error("Erro ao salvar profissional:", error.message);
        throw new Error("Erro ao salvar profissional: " + error.message);
    }
}

/**
 * Exclui um profissional e suas dependências (agendamentos e movimentações financeiras).
 * @param {string} profId - O ID do profissional a ser excluído.
 * @param {string} verifiedUserType - O tipo de usuário verificado (apenas 'dono' pode excluir).
 * @throws {Error} Se o usuário não tiver permissão ou ocorrer um erro ao excluir.
 */
async function deleteProfissional(profId, verifiedUserType) {
    if (verifiedUserType !== 'dono') {
        throw new Error("Você não tem permissão para excluir profissionais.");
    }
    // As exclusões em cascata no banco de dados seriam ideais aqui,
    // mas se não houver, precisamos excluir manualmente as dependências.
    await supabaseClient.from('agendamentos').delete().eq('profissional_id', profId);
    await supabaseClient.from('movimentacoes_financeiras').delete().eq('profissional_id', profId);

    const { error } = await supabaseClient.from('profissionais').delete().eq('id', profId);
    if (error) {
        console.error("Erro ao excluir profissional:", error.message);
        throw new Error("Erro ao excluir profissional: " + error.message);
    }
}

export {
    getEstabelecimentoBySlug,
    updateDadosGerais,
    createServico,
    getServicos,
    getServicoById,
    updateServico,
    deleteServico,
    createProfissional,
    getProfissionais,
    getProfissionalById,
    updateProfissional,
    deleteProfissional
};
