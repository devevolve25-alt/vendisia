// agendaService.js - 2
// Lógica de negócios e acesso a dados para a funcionalidade de agenda.

import { supabaseClient } from './config.js';

/**
 * Helper to create a UTC Date object from an ISO date string (YYYY-MM-DD) and a local time string (HH:MM).
 * This function is crucial for consistently handling local times as UTC for comparison.
 * @param {string} dateISO - Date in ISO format (YYYY-MM-DD).
 * @param {string} timeHHMM - Time in HH:MM format (local time).
 * @returns {Date} A Date object representing the given local date/time in UTC.
 */
function createUTCDateFromLocalDateAndTime(dateISO, timeHHMM) {
    // Construct a local Date object first, so it correctly applies the local timezone offset
    // Example: "2026-02-19T08:00:00" might be interpreted as 08:00 AM local time
    const localDateTimeString = `${dateISO}T${timeHHMM}:00`;
    const localDate = new Date(localDateTimeString);

    // Now convert this local Date object to its UTC equivalent.
    // toISOString() returns the UTC date and time in ISO format (e.g., "2026-02-19T11:00:00.000Z")
    // This is the desired UTC representation that matches Supabase's timestampz.
    return new Date(localDate.toISOString());
}


/**
 * Função auxiliar para verificar a disponibilidade de um profissional em um determinado período de tempo.
 * Considera dias de trabalho, horário de expediente e conflitos com agendamentos existentes.
 * @param {Object} prof - Objeto do profissional.
 * @param {Date} slotStart - Início do período a ser verificado (objeto Date, já em UTC).
 * @param {Date} slotEnd - Fim do período a ser verificado (objeto Date, já em UTC).
 * @param {Map<string, Array<Object>>} profAgendamentosMap - Mapa de agendamentos por profissional (para o dia em questão).
 * @param {string} dataISO - Data no formato ISO (YYYY-MM-DD) para construção de objetos Date de expediente.
 * @returns {boolean} True se o profissional estiver disponível, False caso contrário.
 */
function _checkProfissionalAvailabilityAtTime(prof, slotStart, slotEnd, profAgendamentosMap, dataISO) {
    // 1. Verificar dias de trabalho
    // slotStart já é um objeto Date em UTC. toLocaleDateString usará o fuso horário local.
    // Isso é ok, pois estamos comparando o dia da semana local do slot com os dias de trabalho do profissional.
    const diaSemana = slotStart.toLocaleDateString('pt-BR', { weekday: 'short' }).substring(0,3).toLowerCase();
    const diasTrabalho = prof.dias_trabalho_json;
    if (!diasTrabalho || !Array.isArray(diasTrabalho) || !diasTrabalho.includes(diaSemana)) {
        return false;
    }

    // 2. Verificar horário de expediente
    // CORREÇÃO: Usar createUTCDateFromLocalDateAndTime para interpretar horários locais do profissional como UTC.
    const inicioExpediente = createUTCDateFromLocalDateAndTime(dataISO, prof.horario_trabalho_inicio);
    const fimExpediente = createUTCDateFromLocalDateAndTime(dataISO, prof.horario_trabalho_fim);

    // O slot deve começar depois ou no início do expediente e terminar antes ou no fim do expediente
    if (slotStart < inicioExpediente || slotEnd > fimExpediente) {
        return false;
    }

    // 3. Verificar conflitos com agendamentos existentes
    const agendamentosDoProfissional = profAgendamentosMap.get(prof.id) || [];
    for (const agendamento of agendamentosDoProfissional) {
        // agendamento.data_hora_inicio já vem do Supabase (timestampz) e new Date() o interpreta como UTC
        const agInicio = new Date(agendamento.data_hora_inicio);
        const agDuracao = agendamento.servicos?.duracao_minutos || 30; // Usar duração real do serviço agendado
        const agFim = new Date(agInicio.getTime() + agDuracao * 60 * 1000);

        // Verifica sobreposição: [slotStart, slotEnd) vs [agInicio, agFim)
        if (slotStart < agFim && slotEnd > agInicio) {
            return false; // Conflito encontrado
        }
    }

    return true; // Profissional está disponível
}


/**
 * Gera uma grade de horários para um período específico, considerando a disponibilidade combinada de profissionais e serviços.
 * @param {string} abertura - Hora de abertura do estabelecimento (ex: "08:00" - hora local).
 * @param {string} fechamento - Hora de fechamento do estabelecimento (ex: "18:00" - hora local).
 * @param {Array<Object>} agendados - Lista de agendamentos existentes no período (já em UTC).
 * @param {'dia'|'semana'} periodoAgenda - O período a ser gerado ('dia' ou 'semana').
 * @param {Array<Object>} allServices - Todos os serviços oferecidos pelo estabelecimento.
 * @param {Array<Object>} allProfessionals - Todos os profissionais do estabelecimento.
 * @returns {Array<Object>} Uma grade de horários com slots e status de agendamento.
 */
function gerarGradeHorarios(abertura, fechamento, agendados, periodoAgenda, allServices, allProfessionals) {
    console.log("gerarGradeHorarios - Services:", allServices, "Professionals:", allProfessionals);
    const intervaloPadraoSlot = 30; // Intervalo de 30 minutos para exibição na agenda
    const diasParaGerar = periodoAgenda === 'semana' ? 7 : 1;
    const gradeTotal = [];

    // Obter o momento atual em UTC para comparações
    const nowUTC = new Date(new Date().toISOString());

    // Pré-processar agendamentos para acesso rápido por profissional
    const profAgendamentosMap = new Map();
    agendados.forEach(ag => {
        if (!profAgendamentosMap.has(ag.profissional_id)) {
            profAgendamentosMap.set(ag.profissional_id, []);
        }
        profAgendamentosMap.get(ag.profissional_id).push(ag);
    });

    for (let i = 0; i < diasParaGerar; i++) {
        const today = new Date();
        const futureDate = new Date(today);
        futureDate.setDate(today.getDate() + i);
        // CORREÇÃO: Obter dataISO no formato YYYY-MM-DD a partir de uma data UTC
        const dataISO = futureDate.toISOString().split('T')[0];

        let horaAtual = abertura;
        while (horaAtual < fechamento) {
            // CORREÇÃO: Usar createUTCDateFromLocalDateAndTime para criar slotStart e fimExpedienteGlobal como UTC Date objects
            const slotStart = createUTCDateFromLocalDateAndTime(dataISO, horaAtual);
            const fimExpedienteGlobal = createUTCDateFromLocalDateAndTime(dataISO, fechamento);

            // CORREÇÃO: Adicionar verificação de horário no passado
            if (slotStart < nowUTC) {
                // Se o slot já passou, marque-o como indisponível e avance.
                gradeTotal.push({
                    data: dataISO,
                    hora: horaAtual,
                    dados: { status: 'passado' } // ou { status: 'indisponível' }
                });
                // Avança para o próximo slot padrão de exibição
                let [h, m] = horaAtual.split(':').map(Number);
                m += intervaloPadraoSlot;
                if (m >= 60) { h++; m -= 60; }
                horaAtual = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                continue; // Pula o restante do loop para este slot
            }

            let slotEntry = {
                data: dataISO,
                hora: horaAtual,
                dados: null // Padrão: disponível
            };

            // --- Fase 1: Verificar agendamentos que *iniciam* neste slot ---
            // Se um agendamento existente inicia exatamente neste slot de exibição (ex: 09:00),
            // ele "ocupa" este slot para fins de exibição da agenda.
            const agendamentoIniciandoNoSlot = agendados.find(a => {
                const agInicio = new Date(a.data_hora_inicio);
                return agInicio.getTime() === slotStart.getTime();
            });

            if (agendamentoIniciandoNoSlot) {
                slotEntry.dados = agendamentoIniciandoNoSlot;
            } else {
                // --- Fase 2: Se nenhum agendamento inicia aqui, verificar disponibilidade global de profissionais/serviços ---
                let isSlotGloballyAvailable = false;

                // Itera sobre *todos* os serviços para ver se ALGUM pode ser atendido
                for (const service of allServices) {
                    const serviceDuration = service.duracao_minutos || intervaloPadraoSlot; // Usa duração real do serviço
                    // slotStart já é UTC, então a adição de minutos mantém a consistência
                    const slotEndPotentialForService = new Date(slotStart.getTime() + serviceDuration * 60 * 1000);

                    // Se o serviço for mais longo do que o tempo restante até o fechamento global do estabelecimento, ele não pode iniciar aqui
                    if (slotEndPotentialForService > fimExpedienteGlobal) {
                        continue; // Tenta o próximo serviço (talvez um mais curto possa se encaixar)
                    }

                    // Itera sobre todos os profissionais para ver se ALGUM pode realizar este serviço
                    for (const prof of allProfessionals) {
                        // Verifica se o profissional oferece este serviço
                        if (prof.servicos_especializados && Array.isArray(prof.servicos_especializados) && prof.servicos_especializados.includes(service.id)) {
                            // Verifica se o profissional está disponível no período necessário para este *serviço específico*
                            if (_checkProfissionalAvailabilityAtTime(prof, slotStart, slotEndPotentialForService, profAgendamentosMap, dataISO)) {
                                isSlotGloballyAvailable = true;
                                break; // Encontramos um profissional disponível para este serviço, então o slot é globalmente disponível.
                            }
                        }
                    }
                    if (isSlotGloballyAvailable) {
                        break; // O slot é globalmente disponível, não precisamos verificar outros serviços.
                    }
                }

                if (!isSlotGloballyAvailable) {
                    // Se, após verificar todos os serviços e profissionais, ninguém estiver disponível, o slot está indisponível.
                    slotEntry.dados = { status: 'indisponível' }; // Marcação customizada para slot indisponível
                }
            }

            gradeTotal.push(slotEntry);

            // Avança para o próximo slot padrão de exibição (intervaloPadraoSlot)
            let [h, m] = horaAtual.split(':').map(Number);
            m += intervaloPadraoSlot;
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
        .select('id, cliente_nome, data_hora_inicio, servico_id, profissional_id, profissionais(id, nome), servicos(id, nome, duracao_minutos)')
        .eq('estabelecimento_id', estabelecimentoId)
        // CORREÇÃO: Adicionar 'Z' para garantir que os filtros sejam interpretados como UTC
        .gte('data_hora_inicio', dataInicioISO + 'T00:00:00Z')
        .lte('data_hora_inicio', dataFimISO + 'T23:59:59Z')
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

    // CORREÇÃO: Usar createUTCDateFromLocalDateAndTime para criar inicioSlot como UTC Date object
    const inicioSlot = createUTCDateFromLocalDateAndTime(data, hora);
    const fimSlot = new Date(inicioSlot.getTime() + (servicoDetalhes.duracao_minutos || duracaoServico) * 60 * 1000);

    // CORREÇÃO: Adicionar verificação de horário no passado
    const nowUTC = new Date(new Date().toISOString());
    if (inicioSlot < nowUTC) {
        console.log("Slot no passado, retornando profissionais vazios.");
        return []; // Slot está no passado, nenhum profissional disponível.
    }

    // Busca todos os serviços do estabelecimento para mapear IDs para nomes (para a exibição no modal)
    const { data: todosServicos, error: todosServicosError } = await supabaseClient
        .from('servicos')
        .select('id, nome')
        .eq('estabelecimento_id', estabelecimentoId);

    if (todosServicosError) {
        console.error("Erro ao buscar todos os serviços do estabelecimento para mapeamento:", todosServicosError.message);
        return [];
    }
    const servicoMap = new Map(todosServicos.map(s => [s.id, s.nome]));

    const { data: profsDoEstabelecimento, error: profsError } = await supabaseClient
        .from('profissionais')
        .select('id, nome, servicos_especializados, horario_trabalho_inicio, horario_trabalho_fim, dias_trabalho_json')
        .eq('estabelecimento_id', estabelecimentoId);

    if (profsError) {
        console.error("Erro ao buscar profissionais:", profsError.message);
        return [];
    }

    const profissionaisCandidatos = profsDoEstabelecimento.filter(p => {
        // Filtra baseando-se no array JSONB 'servicos_especializados' para garantir que o profissional oferece o serviço
        const isSpecialized = p.servicos_especializados && Array.isArray(p.servicos_especializados) && p.servicos_especializados.includes(servicoId);
        return isSpecialized;
    });

    const profissionaisDisponiveis = [];

    // Para evitar múltiplas chamadas de DB dentro do loop, busca todos os agendamentos dos profissionais candidatos de uma vez para o dia
    const profIds = profissionaisCandidatos.map(p => p.id);
    let agendamentosDosCandidatosNoDia = [];
    if (profIds.length > 0) {
        // CORREÇÃO: Construir as strings de data/hora de início e fim do dia diretamente em UTC para o filtro do Supabase
        const dataInicioDoDiaISOString = `${data}T00:00:00Z`;
        const dataFimDoDiaISOString = `${data}T23:59:59Z`;

        const { data: ags, error: agsError } = await supabaseClient
            .from('agendamentos')
            .select('profissional_id, data_hora_inicio, servicos(duracao_minutos)')
            .in('profissional_id', profIds)
            // CORREÇÃO: Usar as strings ISO de datas UTC nos filtros
            .gte('data_hora_inicio', dataInicioDoDiaISOString)
            .lte('data_hora_inicio', dataFimDoDiaISOString);
        
        if (agsError) {
            console.error("Erro ao buscar agendamentos dos profissionais candidatos:", agsError.message);
        } else {
            agendamentosDosCandidatosNoDia = ags;
        }
    }
    
    // Constrói um mapa de agendamentos por profissional para a função auxiliar
    const profAgendamentosMapParaSlot = new Map();
    agendamentosDosCandidatosNoDia.forEach(ag => {
        if (!profAgendamentosMapParaSlot.has(ag.profissional_id)) {
            profAgendamentosMapParaSlot.set(ag.profissional_id, []);
        }
        profAgendamentosMapParaSlot.get(ag.profissional_id).push(ag);
    });

    for (const prof of profissionaisCandidatos) {
        // Usa a função auxiliar para verificar a disponibilidade do profissional neste slot
        // passando a duração do serviço selecionado.
        if (_checkProfissionalAvailabilityAtTime(prof, inicioSlot, fimSlot, profAgendamentosMapParaSlot, data)) {
            profissionaisDisponiveis.push({
                ...prof,
                // Adiciona uma propriedade com os nomes dos serviços especializados para uso na UI
                servicos_especializados_nomes: prof.servicos_especializados
                    ? prof.servicos_especializados.map(id => servicoMap.get(id)).filter(Boolean)
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
    if (verifiedUserType !== 'dono' && verifiedUserType !== 'funcionario') { // Adicionado funcionário para cancelar
        throw new Error("Você não tem permissão para cancelar agendamentos.");
    }
    // Primeiro, tenta remover as movimentações financeiras relacionadas
    const { error: movFinError } = await supabaseClient.from('movimentacoes_financeiras').delete().eq('agendamento_id', agendamentoId);
    if (movFinError) {
        console.warn("Aviso: Erro ao excluir movimentações financeiras vinculadas ao agendamento:", movFinError.message);
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
