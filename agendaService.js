// agendaService.js
// Lógica de negócios e acesso a dados para a funcionalidade de agenda.

import { supabaseClient } from './config.js';

/**
 * Gera uma grade de horários para um período específico.
 * @param {string} abertura - Hora de abertura do estabelecimento (ex: "08:00").
 * @param {string} fechamento - Hora de fechamento do estabelecimento (ex: "18:00").
 * @param {Array<Object>} agendados - Lista de agendamentos existentes.
 * @param {'dia'|'semana'} periodoAgenda - O período a ser gerado ('dia' ou 'semana').
 * @returns {Array<Object>} Uma grade de horários com slots e status de agendamento.
 */
function gerarGradeHorarios(abertura, fechamento, agendados, periodoAgenda) {
    const intervalo = 30; // Intervalo de 30 minutos padronizado
    const diasParaGerar = periodoAgenda === 'semana' ? 7 : 1;
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
                const duracaoMs = (a.servicos?.duracao_minutos || 30) * 60 * 1000;
                const fimAgendamento = inicio + duracaoMs;
                return (tempoSlot >= inicio && tempoSlot < fimAgendamento);
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

/**
 * Busca agendamentos para um estabelecimento em um determinado período.
 * @param {string} estabelecimentoId - O ID do estabelecimento.
 * @param {string} dataInicioISO - Data de início no formato ISO (YYYY-MM-DD).
 * @param {string} dataFimISO - Data de fim no formato ISO (YYYY-MM-DD).
 * @returns {Promise<Array<Object>>} Lista de agendamentos.
 */
async function getAgendamentosPorPeriodo(estabelecimentoId, dataInicioISO, dataFimISO) {
    const { data: agendamentos, error } = await supabaseClient.from('agendamentos')
        .select('id, cliente_nome, data_hora_inicio, servico_id, profissional_id, profissionais(nome), servicos(nome, duracao_minutos)')
        .eq('estabelecimento_id', estabelecimentoId)
        .gte('data_hora_inicio', dataInicioISO + 'T00:00:00')
        .lte('data_hora_inicio', dataFimISO + 'T23:59:59')
        .order('data_hora_inicio');
    if (error) {
        console.error("Erro ao buscar agendamentos:", error.message);
        throw new Error("Não foi possível carregar os agendamentos.");
    }
    return agendamentos;
}

/**
 * Busca profissionais disponíveis para um slot de agendamento específico,
 * considerando a nova coluna 'servicos_especializados'.
 * @param {string} servicoId - O ID do serviço.
 * @param {string} data - A data do slot (YYYY-MM-DD).
 * @param {string} hora - A hora do slot (HH:MM).
 * @param {number} duracaoServico - Duração estimada do serviço em minutos.
 * @param {string} estabelecimentoId - O ID do estabelecimento.
 * @returns {Promise<Array<Object>>} Lista de profissionais disponíveis.
 */
async function getProfissionaisDisponiveisNoSlot(servicoId, data, hora, duracaoServico, estabelecimentoId) {
    const { data: servicoDetalhes, error: servicoError } = await supabaseClient
        .from('servicos')
        .select('id, duracao_minutos')
        .eq('id', servicoId)
        .single();

    if (servicoError) {
        console.error("Erro ao buscar detalhes do serviço:", servicoError.message);
        return [];
    }
    if (!servicoDetalhes) return [];

    const inicioSlot = new Date(`${data}T${hora}:00`);
    const fimSlot = new Date(inicioSlot.getTime() + (servicoDetalhes.duracao_minutos || duracaoServico) * 60 * 1000);

    // Busca todos os serviços do estabelecimento para mapear IDs para nomes
    const { data: todosServicos, error: todosServicosError } = await supabaseClient
        .from('servicos')
        .select('id, nome')
        .eq('estabelecimento_id', estabelecimentoId);

    if (todosServicosError) {
        console.error("Erro ao buscar todos os serviços do estabelecimento para mapeamento:", todosServicosError.message);
        return []; // Erro crítico para mapeamento de nomes de serviço
    }
    const servicoMap = new Map(todosServicos.map(s => [s.id, s.nome]));

    const { data: profsDoEstabelecimento, error: profsError } = await supabaseClient
        .from('profissionais')
        .select('id, nome, servicos_especializados, horario_trabalho_inicio, horario_trabalho_fim, dias_trabalho_json') // Inclui a nova coluna
        .eq('estabelecimento_id', estabelecimentoId);

    if (profsError) {
        console.error("Erro ao buscar profissionais:", profsError.message);
        return [];
    }

    const profissionaisCandidatos = profsDoEstabelecimento.filter(p => {
        // Filtra baseando-se no array JSONB 'servicos_especializados'
        const isSpecialized = p.servicos_especializados && Array.isArray(p.servicos_especializados) && p.servicos_especializados.includes(servicoId);
        return isSpecialized;
    });

    const profissionaisDisponiveis = [];

    for (const prof of profissionaisCandidatos) {
        const diaSemana = inicioSlot.toLocaleDateString('pt-BR', { weekday: 'short' }).substring(0,3).toLowerCase();
        const diasTrabalho = prof.dias_trabalho_json;

        // Verifica se diasTrabalho é um array e inclui o dia da semana
        if (!diasTrabalho || !Array.isArray(diasTrabalho) || !diasTrabalho.includes(diaSemana)) {
            continue;
        }

        const inicioExpediente = new Date(`${data}T${prof.horario_trabalho_inicio}:00`);
        const fimExpediente = new Date(`${data}T${prof.horario_trabalho_fim}:00`);

        if (inicioSlot < inicioExpediente || fimSlot > fimExpediente) {
            continue;
        }

        const { data: agendamentosProfissional, error: agendProfError } = await supabaseClient
            .from('agendamentos')
            .select('data_hora_inicio, servicos(duracao_minutos)')
            .eq('profissional_id', prof.id)
            .gte('data_hora_inicio', new Date(inicioSlot.getFullYear(), inicioSlot.getMonth(), inicioSlot.getDate()).toISOString())
            .lte('data_hora_inicio', new Date(inicioSlot.getFullYear(), inicioSlot.getMonth(), inicioSlot.getDate(), 23, 59, 59).toISOString());

        if (agendProfError) {
            console.error("Erro ao buscar agendamentos do profissional:", agendProfError.message);
            continue;
        }

        let conflito = false;
        for (const agendamento of agendamentosProfissional) {
            const agInicio = new Date(agendamento.data_hora_inicio);
            const agDuracao = agendamento.servicos?.duracao_minutos || 30;
            const agFim = new Date(agInicio.getTime() + agDuracao * 60 * 1000);

            if (inicioSlot < agFim && fimSlot > agInicio) {
                conflito = true;
                break;
            }
        }

        if (!conflito) {
            profissionaisDisponiveis.push({
                ...prof,
                // Adiciona uma propriedade com os nomes dos serviços especializados para uso na UI
                servicos_especializados_nomes: prof.servicos_especializados
                    ? prof.servicos_especializados.map(id => servicoMap.get(id)).filter(Boolean) // Filtra `undefined` ou `null`
                    : []
            });
        }
    }
    return profissionaisDisponiveis;
}

/**
 * Confirma um novo agendamento e registra a movimentação financeira.
 * @param {Object} payload - Os dados do agendamento a ser criado.
 * @param {string} servicoId - O ID do serviço agendado.
 * @param {string} profId - O ID do profissional agendado.
 * @param {string} clienteNome - O nome do cliente.
 * @param {string} estabelecimentoId - O ID do estabelecimento.
 * @returns {Promise<Object>} O novo agendamento criado.
 * @throws {Error} Se ocorrer um erro ao agendar ou registrar a movimentação financeira.
 */
async function confirmarAgendamento(payload, servicoId, profId, clienteNome, estabelecimentoId) {
    const { data: novoAgendamento, error: errorAg } = await supabaseClient
        .from('agendamentos')
        .insert([payload])
        .select('id')
        .single();

    if (errorAg) {
        console.error("Erro ao agendar:", errorAg.message);
        throw new Error("Erro ao agendar: " + errorAg.message);
    }

    const { data: servicoInfo, error: servInfoError } = await supabaseClient
        .from('servicos')
        .select('preco, nome')
        .eq('id', servicoId)
        .single();

    if (servInfoError) {
        console.error("Erro ao buscar info do serviço para financeiro:", servInfoError.message);
        // Não é crítico, mas pode causar inconsistência financeira, talvez lançar um erro mais brando?
    }

    if (novoAgendamento && servicoInfo) {
        const { error: movFinError } = await supabaseClient.from('movimentacoes_financeiras').insert([{
            estabelecimento_id: estabelecimentoId,
            agendamento_id: novoAgendamento.id,
            profissional_id: profId,
            tipo: 'receita',
            valor: servicoInfo.preco,
            descricao: `Agendamento: ${servicoInfo.nome} - Cliente: ${clienteNome}`,
            data_movimentacao: new Date().toISOString()
        }]);
        if (movFinError) {
            console.error("Erro ao registrar movimentação financeira:", movFinError.message);
            // Considerar rollback do agendamento ou alerta crítico. Por agora, apenas log.
        }
    }
    return novoAgendamento;
}

/**
 * Cancela um agendamento e suas movimentações financeiras relacionadas.
 * @param {string} agendamentoId - O ID do agendamento a ser cancelado.
 * @param {string} verifiedUserType - O tipo de usuário verificado (apenas 'dono' pode cancelar).
 * @throws {Error} Se o usuário não tiver permissão ou ocorrer um erro ao cancelar.
 */
async function cancelarAgendamento(agendamentoId, verifiedUserType) {
    if (verifiedUserType !== 'dono') {
        throw new Error("Você não tem permissão para cancelar agendamentos.");
    }
    // Primeiro, tenta remover as movimentações financeiras relacionadas
    const { error: movFinError } = await supabaseClient.from('movimentacoes_financeiras').delete().eq('agendamento_id', agendamentoId);
    if (movFinError) {
        console.error("Erro ao excluir movimentações financeiras vinculadas:", movFinError.message);
        // Continuamos para tentar excluir o agendamento mesmo com erro no financeiro
    }

    const { error } = await supabaseClient.from('agendamentos').delete().eq('id', agendamentoId);
    if (error) {
        console.error("Erro ao cancelar agendamento:", error.message);
        throw new Error("Erro ao cancelar: " + error.message);
    }
}


export {
    gerarGradeHorarios,
    getAgendamentosPorPeriodo,
    getProfissionaisDisponiveisNoSlot,
    confirmarAgendamento,
    cancelarAgendamento
};
