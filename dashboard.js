//ATUALIZADO
const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const selectSalao = document.getElementById('select-salao');

async function checkUser() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'acesso.html';
        return;
    }
    await carregarSaloes(session.user.id);
}

async function carregarSaloes(donoId) {
    const { data: saloes } = await supabaseClient
        .from('estabelecimentos')
        .select('id, nome_fantasia')
        .eq('dono_id', donoId);

    if (saloes && saloes.length > 0) {
        selectSalao.innerHTML = saloes.map(s => `<option value="${s.id}">${s.nome_fantasia}</option>`).join('');
        atualizarDashboard(saloes[0].id);
    }
}

selectSalao.addEventListener('change', (e) => atualizarDashboard(e.target.value));

async function atualizarDashboard(salaoId) {
    try {
        const agora = new Date();
        const hojeISO = agora.toLocaleDateString('sv-SE'); // YYYY-MM-DD
        const inicioMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`;

        // 1. BUSCA DADOS DO ESTABELECIMENTO (NOME E SAUDAÇÃO IA)
        const { data: estab } = await supabaseClient.from('estabelecimentos').select('nome_fantasia, ia_saudacao').eq('id', salaoId).single();
        if (estab) {
            document.querySelector('header h1').innerText = estab.nome_fantasia;
            document.getElementById('ia-saudacao-input').value = estab.ia_saudacao || "";
        }

        // 2. BUSCA FINANCEIRA (Faturamento e Comissões)
        const { data: movs } = await supabaseClient
            .from('movimentacoes_financeiras')
            .select('valor, data_movimentacao, profissional_id')
            .eq('estabelecimento_id', salaoId)
            .gte('data_movimentacao', inicioMes);

        // 3. BUSCA AGENDAMENTOS (Usando comparadores nativos do Supabase)
        const { data: ags, error: errAg } = await supabaseClient
            .from('agendamentos')
            .select('id, data_hora_inicio, status') 
            .eq('estabelecimento_id', salaoId)
            .gte('data_hora_inicio', `${hojeISO}T00:00:00.000Z`)
            .lte('data_hora_inicio', `${hojeISO}T23:59:59.999Z`);

        if (errAg) console.error("Erro na busca:", errAg);

        // --- CÁLCULOS DE AGENDAMENTOS ---
        // Como o banco já filtrou por hoje, o ags.length é o total do dia
        const totalHoje = ags?.length || 0;
        
        document.getElementById('ag-ia-hoje').innerText = "0"; 
        document.getElementById('ag-man-hoje').innerText = totalHoje;
        
        // Para o Mês, faremos uma busca rápida separada apenas se o total do dia funcionar
        const { count: totalMes } = await supabaseClient
            .from('agendamentos')
            .select('*', { count: 'exact', head: true })
            .eq('estabelecimento_id', salaoId)
            .gte('data_hora_inicio', inicioMes);

        document.getElementById('ag-ia-mes').innerText = totalMes || 0;

        // 4. BUSCA PROFISSIONAIS (Para nomes e regras de comissão)
        const { data: profs } = await supabaseClient
            .from('profissionais')
            .select('id, nome, tipo_remuneracao, valor_comissao_porcentagem')
            .eq('estabelecimento_id', salaoId);

        // --- CÁLCULOS DE FATURAMENTO ---
        const fatHoje = movs?.filter(m => m.data_movimentacao.startsWith(hojeISO)).reduce((acc, c) => acc + Number(c.valor), 0) || 0;
        const fatMes = movs?.reduce((acc, c) => acc + Number(c.valor), 0) || 0;

        const faturamentoCards = document.querySelectorAll('.pai-card:nth-child(1) .valor-central');
        if(faturamentoCards[0]) faturamentoCards[0].innerText = `R$ ${fatHoje.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        if(faturamentoCards[2]) faturamentoCards[2].innerText = `R$ ${fatMes.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

        // --- CÁLCULOS DE AGENDAMENTOS (Correção na filtragem de exibição) ---
        const agsHoje = ags?.filter(a => a.data_hora_inicio && a.data_hora_inicio.includes(hojeISO)) || [];
        
        // Atualiza IA e Manual (Considerando total em manual por falta de coluna 'origem')
        document.getElementById('ag-ia-hoje').innerText = "0"; 
        document.getElementById('ag-man-hoje').innerText = agsHoje.length;
        document.getElementById('ag-ia-mes').innerText = ags?.length || 0;

        // --- PERFORMANCE DE EQUIPE E COMISSÕES ---
        let totalComissoesGeral = 0;
        let ranking = {};
        let listaComissoesHTML = '';

        profs?.forEach(p => {
            const movsProf = movs?.filter(m => m.profissional_id === p.id) || [];
            const faturamentoProf = movsProf.reduce((acc, c) => acc + Number(c.valor), 0);
            
            let comissaoProf = 0;
            if (p.tipo_remuneracao === 'comissao') {
                comissaoProf = faturamentoProf * (Number(p.valor_comissao_porcentagem) / 100);
            } else {
                comissaoProf = Number(p.valor_comissao_porcentagem);
            }

            totalComissoesGeral += comissaoProf;
            ranking[p.nome] = faturamentoProf;

            listaComissoesHTML += `
                <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #333;">
                    <span>${p.nome}</span>
                    <strong>R$ ${comissaoProf.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>
                </div>`;
        });

        const topNome = Object.keys(ranking).reduce((a, b) => ranking[a] > ranking[b] ? a : b, "---");
        
        document.getElementById('top-barbeiro').innerText = topNome;
        document.getElementById('total-comissao').innerText = `R$ ${totalComissoesGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        document.getElementById('lista-comissoes').innerHTML = listaComissoesHTML || '<span>Sem dados</span>';

    } catch (err) {
        console.error("Erro ao carregar Dashboard:", err);
    }
}

// SALVAR SAUDAÇÃO IA
document.getElementById('btn-salvar-ia').addEventListener('click', async () => {
    const salaoId = selectSalao.value;
    const novaSaudacao = document.getElementById('ia-saudacao-input').value;
    const btn = document.getElementById('btn-salvar-ia');
    
    btn.innerText = "Salvando...";
    const { error } = await supabaseClient.from('estabelecimentos').update({ ia_saudacao: novaSaudacao }).eq('id', salaoId);
    btn.innerText = "Salvar Saudação";

    if (error) alert("Erro: " + error.message);
    else alert("Saudação atualizada!");
});

checkUser();
