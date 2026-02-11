//atualizado para calculo de comissoes - 2 (Versão Corrigida)
const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let salaoIdAtual = null;

async function checkUser() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'acesso.html';
        return;
    }
    await carregarDadosIniciais(session.user.id);
}

async function carregarDadosIniciais(donoId) {
    const { data: saloes } = await supabaseClient
        .from('estabelecimentos')
        .select('id')
        .eq('dono_id', donoId)
        .limit(1);

    if (saloes && saloes.length > 0) {
        salaoIdAtual = saloes[0].id;
        atualizarDashboard(salaoIdAtual);
    } else {
        console.error("Nenhum estabelecimento encontrado.");
        const displayNome = document.getElementById('salon-name-display');
        if (displayNome) displayNome.innerText = "SEM ESTABELECIMENTO";
    }
}

async function atualizarDashboard(salaoId) {
    try {
        const agora = new Date();
        const hojeISO = agora.toLocaleDateString('sv-SE'); 

        // 1. DADOS DO ESTABELECIMENTO
        const { data: estab } = await supabaseClient.from('estabelecimentos').select('nome_fantasia, ia_saudacao').eq('id', salaoId).single();
        if (estab) {
            const displayNome = document.getElementById('salon-name-display');
            if (displayNome) displayNome.innerText = estab.nome_fantasia;
            const inputIA = document.getElementById('ia-saudacao-input');
            if (inputIA) inputIA.value = estab.ia_saudacao || "";
        }

        // 2. BUSCA FINANCEIRA
        const { data: movs } = await supabaseClient
            .from('movimentacoes_financeiras')
            .select('valor, data_movimentacao, profissional_id')
            .eq('estabelecimento_id', salaoId);

        // 3. BUSCA AGENDAMENTOS
        const { data: agsMes } = await supabaseClient
            .from('agendamentos')
            .select('id, data_hora_inicio, cliente_nome, cliente_whatsapp, servico_id, profissional_id') 
            .eq('estabelecimento_id', salaoId);

        // 4. BUSCA PROFISSIONAIS
        const { data: profs } = await supabaseClient
            .from('profissionais')
            .select('id, nome, tipo_remuneracao, valor_comissao_porcentagem')
            .eq('estabelecimento_id', salaoId);

        // 5. BUSCA NOMES DOS SERVIÇOS
        const { data: servicos } = await supabaseClient
            .from('servicos')
            .select('id, nome')
            .eq('estabelecimento_id', salaoId);

        // --- CÁLCULOS FINANCEIROS ---
        const fatHoje = movs?.filter(m => 
            m.data_movimentacao && m.data_movimentacao.toString().includes(hojeISO)
        ).reduce((acc, c) => acc + Number(c.valor), 0) || 0;

        const fatTotal = movs?.reduce((acc, c) => acc + Number(c.valor), 0) || 0;

        if (document.getElementById('fat-hoje')) document.getElementById('fat-hoje').innerText = `R$ ${fatHoje.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        if (document.getElementById('fat-mes')) document.getElementById('fat-mes').innerText = `R$ ${fatTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        if (document.getElementById('fat-semana')) document.getElementById('fat-semana').innerText = `R$ ${fatTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

        // --- ATUALIZAÇÃO DOS CARDS DE AGENDAMENTOS ---
        const totalHoje = agsMes?.filter(a => a.data_hora_inicio && a.data_hora_inicio.toString().includes(hojeISO)).length || 0;
        const totalGeral = agsMes?.length || 0;

        if (document.getElementById('ag-hoje')) document.getElementById('ag-hoje').innerText = totalHoje;
        if (document.getElementById('ag-mes')) document.getElementById('ag-mes').innerText = totalGeral;
        if (document.getElementById('ag-semana')) document.getElementById('ag-semana').innerText = totalGeral; 

        // --- DETALHAMENTO DE CLIENTES ---
        let listaClientesHTML = '';
        const agendamentosOrdenados = agsMes?.sort((a, b) => new Date(a.data_hora_inicio) - new Date(b.data_hora_inicio)) || [];

        agendamentosOrdenados.forEach(a => {
            const dataFmt = a.data_hora_inicio ? new Date(a.data_hora_inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--/--';
            const whatsLink = `https://wa.me/${a.cliente_whatsapp?.replace(/\D/g, '')}`;
            
            const profEncontrado = profs?.find(p => p.id === a.profissional_id);
            const nomeProf = profEncontrado ? profEncontrado.nome : `Prof. ID: ${a.profissional_id}`;

            const servEncontrado = servicos?.find(s => s.id === a.servico_id);
            const nomeServico = servEncontrado ? servEncontrado.nome : `Serviço ID: ${a.servico_id}`;

            listaClientesHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #333; font-size: 0.85rem;">
                    <div>
                        <strong style="display:block; color:#2ecc71;">${a.cliente_nome || 'Cliente s/ nome'}</strong>
                        <span style="color:#ddd; display:block;">Profissional: ${nomeProf}</span>
                        <span style="color:#888;">${nomeServico} | ${dataFmt}</span>
                    </div>
                    <a href="${whatsLink}" target="_blank" style="background:#25d366; color:white; padding:5px 10px; border-radius:5px; text-decoration:none; font-size:0.75rem;">WhatsApp</a>
                </div>`;
        });

        const containerClientes = document.getElementById('lista-clientes-detalhe');
        if (containerClientes) {
            containerClientes.innerHTML = listaClientesHTML || '<div style="padding:10px; color:#888;">Nenhum cliente agendado.</div>';
        }

        // --- PERFORMANCE EQUIPE E CÁLCULO DE COMISSÕES ---
        let totalComissoesGeral = 0;
        let ranking = {};
        let listaComissoesHTML = '';

        if (profs && profs.length > 0) {
            profs.forEach(p => {
                const faturamentoBrutoProf = movs?.filter(m => m.profissional_id === p.id)
                    .reduce((acc, c) => acc + Number(c.valor), 0) || 0;

                let comissaoDevida = 0;
                const tipo = p.tipo_remuneracao?.toLowerCase();
                const valorRegra = Number(p.valor_comissao_porcentagem) || 0;

                if (tipo === 'comissao' || tipo === 'percentual' || tipo === 'comissão') {
                    comissaoDevida = faturamentoBrutoProf * (valorRegra / 100);
                } else {
                    const qtdAgendamentos = agsMes?.filter(a => a.profissional_id === p.id).length || 0;
                    comissaoDevida = qtdAgendamentos * valorRegra;
                }

                totalComissoesGeral += comissaoDevida;
                ranking[p.nome] = faturamentoBrutoProf;

                listaComissoesHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #333;">
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-weight:bold; color:#fff;">${p.nome}</span>
                            <small style="color:#888;">Faturamento: R$ ${faturamentoBrutoProf.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</small>
                        </div>
                        <div style="text-align:right;">
                            <span style="display:block; color:#2ecc71; font-weight:bold;">R$ ${comissaoDevida.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                            <small style="font-size:0.7rem; color:#666;">COMISSÃO</small>
                        </div>
                    </div>`;
            });
        }

        if (document.getElementById('top-barbeiro')) {
            const temRanking = Object.keys(ranking).length > 0;
            document.getElementById('top-barbeiro').innerText = temRanking 
                ? Object.keys(ranking).reduce((a, b) => ranking[a] > ranking[b] ? a : b) 
                : "---";
        }

        if (document.getElementById('total-comissao')) {
            document.getElementById('total-comissao').innerText = `R$ ${totalComissoesGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        }

        if (document.getElementById('lista-comissoes')) {
            document.getElementById('lista-comissoes').innerHTML = listaComissoesHTML || '<span style="color:#666; padding:10px; display:block;">Sem movimentações</span>';
        }

    } catch (err) {
        console.error("Erro Geral Dashboard:", err);
    }
}

const btnSalvarIA = document.getElementById('btn-salvar-ia');
if (btnSalvarIA) {
    btnSalvarIA.addEventListener('click', async () => {
        if (!salaoIdAtual) return;
        const novaSaudacao = document.getElementById('ia-saudacao-input').value;
        const { error } = await supabaseClient.from('estabelecimentos').update({ ia_saudacao: novaSaudacao }).eq('id', salaoIdAtual);
        if (error) alert("Erro: " + error.message);
        else alert("Saudação atualizada!");
    });
}

const monitorarMudancas = supabaseClient
    .channel('custom-all-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, () => {
        if (salaoIdAtual) atualizarDashboard(salaoIdAtual);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'movimentacoes_financeiras' }, () => {
        if (salaoIdAtual) atualizarDashboard(salaoIdAtual);
    })
    .subscribe();

checkUser();
