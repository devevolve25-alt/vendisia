// agendaService.js - 7
// Lógica de negócios e acesso a dados para a funcionalidade de agenda.

import { supabaseClient } from './config.js';

/**
 * Helper to create a UTC Date object from an ISO date string (YYYY-MM-DD) and a local time string (HH:MM).
 * This function is crucial for consistently handling local times as UTC for comparison.
 *
 * @param {string} dateISO - Date in ISO format (YYYY-MM-DD).
 * @param {string} timeHHMM - Time in HH:MM format (local time).
 * @returns {Date} A Date object representing the given local date/time in UTC. Returns an invalid Date if inputs are malformed.
 */
function createUTCDateFromLocalDateAndTime(dateISO, timeHHMM) {
    // Basic validation for inputs
    if (!dateISO || !timeHHMM || typeof dateISO !== 'string' || typeof timeHHMM !== 'string') {
        console.error(`[agendaService.js] createUTCDateFromLocalDateAndTime received invalid input: dateISO='${dateISO}', timeHHMM='${timeHHMM}'`);
        return new Date(NaN); // Return invalid Date
    }

    // A more robust regex for HH:MM (00:00 to 23:59)
    const timeRegex = /^(?:2[0-3]|[01]?[0-9]):(?:[0-5]?[0-9])$/;
    if (!timeRegex.test(timeHHMM)) {
        console.error(`[agendaService.js] createUTCDateFromLocalDateAndTime received malformed time string: '${timeHHMM}'`);
        return new Date(NaN); // Return invalid Date
    }

    // Construct a local Date object first, so it correctly applies the local timezone offset.
    // Example: "2026-02-19T08:00:00" might be interpreted as 08:00 AM local time based on the browser's timezone.
    const localDateTimeString = `${dateISO}T${timeHHMM}:00`;
    const localDate = new Date(localDateTimeString);

    // If localDate is an "Invalid Date", it means the localDateTimeString was not parseable.
    if (isNaN(localDate.getTime())) {
        console.error(`[agendaService.js] createUTCDateFromLocalDateAndTime failed to parse local date string: '${localDateTimeString}'`);
        return new Date(NaN);
    }

    // Now convert this local Date object to its UTC equivalent.
    // toISOString() returns the UTC date and time in ISO format (e.g., "2026-02-19T11:00:00.000Z").
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
    // Ensure valid Date objects
    if (isNaN(slotStart.getTime()) || isNaN(slotEnd.getTime())) {
        console.warn("[agendaService.js] _checkProfissionalAvailabilityAtTime received invalid slotStart or slotEnd dates.");
        return false;
    }

    // 1. Verificar dias de trabalho
    // slotStart já é um objeto Date em UTC. toLocaleDateString usará o fuso horário local.
    // Isso é ok, pois estamos comparando o dia da semana local do slot com os dias de trabalho do profissional.
    const diaSemana = slotStart.toLocaleDateString('pt-BR', { weekday: 'short' }).substring(0, 3).toLowerCase();
    const diasTrabalho = prof.dias_trabalho_json;
    if (!diasTrabalho || !Array.isArray(diasTrabalho) || !diasTrabalho.includes(diaSemana)) {
        return false;
    }

    // 2. Verificar horário de expediente
    // CORREÇÃO: Usar createUTCDateFromLocalDateAndTime para interpretar horários locais do profissional como UTC.
    const inicioExpediente = createUTCDateFromLocalDateAndTime(dataISO, prof.horario_trabalho_inicio);
    const fimExpediente = createUTCDateFromLocalDateAndTime(dataISO, prof.horario_trabalho_fim);

    // Ensure valid Date objects for comparison
    if (isNaN(inicioExpediente.getTime()) || isNaN(fimExpediente.getTime())) {
        console.warn(`[agendaService.js] _checkProfissionalAvailabilityAtTime: Invalid expediente times for professional ${prof.id}.`);
        return false;
    }

    // O slot deve começar depois ou no início do expediente e terminar antes ou no fim do expediente
    if (slotStart < inicioExpediente || slotEnd > fimExpediente) {
        return false;
    }

    // 3. Verificar conflitos com agendamentos existentes
    const agendamentosDoProfissional = profAgendamentosMap.get(prof.id) || [];
    for (const agendamento of agendamentosDoProfissional) {
        // agendamento.data_hora_inicio já vem do Supabase (timestampz) e new Date() o interpreta como UTC
        const agInicio = new Date(agendamento.data_hora_inicio);
        if (isNaN(agInicio.getTime())) {
            console.warn(`[agendaService.js] _checkProfissionalAvailabilityAtTime: Invalid existing appointment start time for professional ${prof.id}.`);
            continue; // Skip this invalid appointment
        }

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
 * @param {Date} baseStartDateUTC - A data base para o início da geração da grade (objeto Date, já em UTC).
 * @returns {Array<Object>} Uma grade de horários com slots e status de agendamento detalhados.
 */
function gerarGradeHorarios(abertura, fechamento, agendados, periodoAgenda, allServices, allProfessionals, baseStartDateUTC) {
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
        // Derivar a data do dia a partir da baseStartDateUTC (já um Date objeto em UTC)
        const currentDateForDay = new Date(baseStartDateUTC);
        currentDateForDay.setUTCDate(baseStartDateUTC.getUTCDate() + i);
        
        // Obter dataISO no formato YYYY-MM-DD a partir desta data UTC
        const dataISO = currentDateForDay.toISOString().split('T')[0];

        let horaAtual = abertura;
        while (horaAtual < fechamento) {
            // Usar createUTCDateFromLocalDateAndTime para criar slotStart e fimExpedienteGlobal como UTC Date objects
            const slotStart = createUTCDateFromLocalDateAndTime(dataISO, horaAtual);
            const fimExpedienteGlobal = createUTCDateFromLocalDateAndTime(dataISO, fechamento);

            // Validação para garantir que as datas são válidas antes de continuar
            if (isNaN(slotStart.getTime()) || isNaN(fimExpedienteGlobal.getTime())) {
                console.error(`[agendaService.js] Invalid date/time generated for slot: dataISO=${dataISO}, horaAtual=${horaAtual}`);
                // Avança para o próximo slot padrão de exibição
                let [h, m] = horaAtual.split(':').map(Number);
                m += intervaloPadraoSlot;
                if (m >= 60) { h++; m -= 60; }
                horaAtual = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                continue;
            }

            let slotEntry = {
                data: dataISO,
                hora: horaAtual,
                isPast: false,            // Indica se o slot já passou
                isBooked: false,          // Indica se um agendamento *inicia* neste slot de exibição
                canBeBooked: false,       // Indica se um *novo* agendamento pode ser feito (considerando todos os pros/serviços)
                existingAppointments: [] // <--- ALTERAÇÃO AQUI: Agora é um array para múltiplos agendamentos
            };

            // 1. Verificar se o slot já passou
            if (slotStart < nowUTC) {
                slotEntry.isPast = true;
                // Não é agendável, mas pode ter sido agendado no passado.
                // Ainda verificamos por agendamentos existentes para fins de exibição.
            }

            // <--- ALTERAÇÃO AQUI: Coletar todos os agendamentos que iniciam no slot
            // 2. Coletar *todos* os agendamentos existentes que *iniciam* exatamente neste slot de exibição
            const agendamentosIniciandoNoSlot = agendados.filter(a => {
                const agInicio = new Date(a.data_hora_inicio);
                // Compara a data e hora do início do agendamento com a data e hora do início do slot.
                // Como slotStart é construído para ser exato (sem milissegundos), a comparação direta de getTime() é apropriada.
                return !isNaN(agInicio.getTime()) && agInicio.getTime() === slotStart.getTime();
            });

            if (agendamentosIniciandoNoSlot.length > 0) {
                slotEntry.isBooked = true;
                slotEntry.existingAppointments = agendamentosIniciandoNoSlot; // <--- ALTERAÇÃO AQUI: Atribui o array
            }
            // FIM DA ALTERAÇÃO

            // 3. Determinar se um *novo* agendamento PODE ser feito neste slot
            // (Esta é a lógica central para o problema de multi-profissional/serviço)
            let foundAvailableProfessionalForAnyService = false;
            if (!slotEntry.isPast) { // Só verifica agendabilidade para slots futuros
                for (const service of allServices) {
                    const serviceDuration = service.duracao_minutos || intervaloPadraoSlot; // Usa duração real do serviço
                    const slotEndPotentialForService = new Date(slotStart.getTime() + serviceDuration * 60 * 1000);

                    // Se o serviço for mais longo do que o tempo restante até o fechamento global do estabelecimento,
                    // ele não pode iniciar aqui.
                    if (slotEndPotentialForService > fimExpedienteGlobal) {
                        continue; // Tenta o próximo serviço (talvez um mais curto possa se encaixar)
                    }

                    for (const prof of allProfessionals) {
                        // Verifica se o profissional oferece este serviço
                        if (prof.servicos_especializados && Array.isArray(prof.servicos_especializados) && prof.servicos_especializados.includes(service.id)) {
                            // Verifica se o profissional está disponível no período necessário para este *serviço específico*
                            if (_checkProfissionalAvailabilityAtTime(prof, slotStart, slotEndPotentialForService, profAgendamentosMap, dataISO)) {
                                foundAvailableProfessionalForAnyService = true;
                                break; // Encontramos um profissional disponível para este serviço, então o slot é agendável.
                            }
                        }
                    }
                    if (foundAvailableProfessionalForAnyService) {
                        break; // O slot é agendável, não precisamos verificar outros serviços.
                    }
                }
            }

            slotEntry.canBeBooked = foundAvailableProfessionalForAnyService;
            
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
        // <--- ALTERAÇÃO AQUI: Adicionado 'cliente_id' e 'clientes(nome)'
        .select('id, data_hora_inicio, servico_id, profissional_id, cliente_id, clientes(nome), profissionais(id, nome), servicos(id, nome, duracao_minutos)')
        // FIM DA ALTERAÇÃO
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

    // Validação para garantir que as datas são válidas antes de continuar
    if (isNaN(inicioSlot.getTime()) || isNaN(fimSlot.getTime())) {
        console.error(`[agendaService.js] Invalid date/time generated for slot in getProfissionaisDisponiveisNoSlot: data=${data}, hora=${hora}`);
        return [];
    }

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
 * Encontra um cliente existente pelo WhatsApp e estabelecimento, ou cria um novo se não existir.
 * @param {string} estabelecimentoId - O ID do estabelecimento.
 * @param {string} nome - O nome completo do cliente.
 * @param {string} whatsapp - O número do WhatsApp do cliente.
 * @param {string | null} email - O e-mail do cliente (opcional).
 * @param {string | null} dataNascimento - A data de nascimento do cliente (YYYY-MM-DD, opcional).
 * @returns {Promise<Object>} O objeto do cliente (com id, nome, whatsapp, email, etc.).
 * @throws {Error} Se ocorrer um erro ao buscar ou criar o cliente.
 */
async function findOrCreateClient(estabelecimentoId, nome, whatsapp, email, dataNascimento) {
    // 1. Tentar encontrar o cliente pelo WhatsApp e ID do estabelecimento
    const { data: existingClients, error: searchError } = await supabaseClient
        .from('clientes')
        .select('id, nome, whatsapp, email, data_nascimento')
        .eq('estabelecimento_id', estabelecimentoId)
        .eq('whatsapp', whatsapp)
        .limit(1);

    if (searchError) {
        console.error("Erro ao buscar cliente existente:", searchError.message);
        throw new Error("Erro ao buscar cliente: " + searchError.message);
    }

    if (existingClients && existingClients.length > 0) {
        // Cliente encontrado, retorna o primeiro (assumindo WhatsApp único por estabelecimento)
        console.log("Cliente encontrado:", existingClients[0].id);
        return existingClients[0];
    } else {
        // Cliente não encontrado, criar um novo
        console.log("Cliente não encontrado, criando novo...");
        const clientPayload = {
            estabelecimento_id: estabelecimentoId,
            nome: nome,
            whatsapp: whatsapp,
            email: email || null, // Garante que seja null se vazio
            data_nascimento: dataNascimento || null // Garante que seja null se vazio
        };

        const { data: newClient, error: insertError } = await supabaseClient
            .from('clientes')
            .insert([clientPayload])
            .select('id, nome, whatsapp, email, data_nascimento') // Seleciona os campos para retornar
            .single();

        if (insertError) {
            console.error("Erro ao criar novo cliente:", insertError.message);
            throw new Error("Erro ao criar cliente: " + insertError.message);
        }
        console.log("Novo cliente criado:", newClient.id);
        return newClient;
    }
}


/**
 * Confirma um novo agendamento e registra a movimentação financeira,
 * agora associando ao ID do cliente e usando o nome para descrição.
 * @param {Object} payload - Os dados do agendamento a ser criado (incluindo cliente_id).
 * @param {string} servicoId - O ID do serviço agendado.
 * @param {string} profId - O ID do profissional agendado.
 * @param {string} clienteNomeParaDescricao - O nome do cliente para uso na descrição financeira.
 * @param {string} estabelecimentoId - O ID do estabelecimento.
 * @returns {Promise<Object>} O novo agendamento criado.
 * @throws {Error} Se ocorrer um erro ao agendar ou registrar a movimentação financeira.
 */
async function confirmarAgendamento(payload, servicoId, profId, clienteNomeParaDescricao, estabelecimentoId) {
    // Basic payload validation
    if (!payload || !payload.data_hora_inicio || isNaN(new Date(payload.data_hora_inicio).getTime())) {
        console.error("[agendaService.js] Invalid 'data_hora_inicio' in payload for confirmarAgendamento:", payload?.data_hora_inicio);
        throw new Error("Data e hora de início do agendamento inválidas.");
    }
    // Adicionar validação para cliente_id
    if (!payload.cliente_id) {
        console.error("[agendaService.js] Missing 'cliente_id' in payload for confirmarAgendamento.");
        throw new Error("ID do cliente não fornecido para o agendamento.");
    }
    
    // Inserir agendamento
    const { data: novoAgendamento, error: errorAg } = await supabaseClient
        .from('agendamentos')
        .insert([payload])
        .select('id')
        .single();

    if (errorAg) {
        console.error("Erro ao agendar:", errorAg.message);
        throw new Error("Erro ao agendar: " + errorAg.message);
    }

    // Buscar informações do serviço para a movimentação financeira
    const { data: servicoInfo, error: servInfoError } = await supabaseClient
        .from('servicos')
        .select('preco, nome')
        .eq('id', servicoId)
        .single();

    if (servInfoError) {
        console.error("Erro ao buscar info do serviço para financeiro:", servInfoError.message);
        // Não é crítico, mas pode causar inconsistência financeira, talvez lançar um erro mais brando?
        // Por agora, apenas logar.
    }

    if (novoAgendamento && servicoInfo) {
        const { error: movFinError } = await supabaseClient.from('movimentacoes_financeiras').insert([{
            estabelecimento_id: estabelecimentoId,
            agendamento_id: novoAgendamento.id,
            profissional_id: profId,
            tipo: 'receita',
            valor: servicoInfo.preco,
            descricao: `Agendamento: ${servicoInfo.nome} - Cliente: ${clienteNomeParaDescricao}`, // Usar o nome do cliente passado
            data_movimentacao: new Date().toISOString() // Data da movimentação em UTC
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
 * @param {string} verifiedUserType - O tipo de usuário verificado (apenas 'dono' ou 'funcionario' pode cancelar).
 * @throws {Error} Se o usuário não tiver permissão ou ocorrer um erro ao cancelar.
 */
async function cancelarAgendamento(agendamentoId, verifiedUserType) {
    if (verifiedUserType !== 'dono' && verifiedUserType !== 'funcionario') {
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
    cancelarAgendamento,
    createUTCDateFromLocalDateAndTime, // Exportar para uso em app.js para consistência
    findOrCreateClient // Exportar a nova função
};
