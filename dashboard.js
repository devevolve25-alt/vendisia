//atualizado para exibição de agendamentos - 2
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
        const hojeISO = agora.toLocaleDateString('sv-SE'); // "2026-02-11"
        const inicioMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`;
        const fimMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-31`;

        // 1. DADOS DO ESTABELECIMENTO
        const { data: estab } = await supabaseClient.from('estabelecimentos').select('nome_fantasia, ia_saudacao').eq('id', salaoId).single();
        if (estab) {
            document.querySelector('header h1').innerText = estab.nome_fantasia;
            document.getElementById('ia-saudacao-input').value = estab.ia_saudacao || "";
        }

        // 2. BUSCA FINANCEIRA (Usando comparadores de data estáveis)
        const { data: movs } = await supabaseClient
            .from('movimentacoes_financeiras')
            .select('valor, data_movimentacao, profissional_id')
            .eq('estabelecimento_id', salaoId)
            .gte('data_movimentacao', inicioMes)
            .lte('data_movimentacao', fimMes);

        // 3. BUSCA AGENDAMENTOS (Correção definitiva para Timestamp)
        const { data: agsMes } = await supabaseClient
            .from('agendamentos')
            .select('id, data_hora_inicio') 
            .eq('estabelecimento_id', salaoId)
            .gte('data_hora_inicio', inicioMes + 'T00:00:00')
            .lte('data_hora_inicio', fimMes + 'T23:59:59');

        // 4. BUSCA PROFISSIONAIS
        const { data: profs } = await supabaseClient
            .from('profissionais')
            .select('id, nome, tipo_remuneracao, valor_comissao_porcentagem')
            .eq('estabelecimento_id', salaoId);

        // --- CÁLCULOS NO CLIENTE (Mais seguro que filtros complexos no banco) ---
        
        // Faturamento
        const fatHoje = movs?.filter(m => m.data_movimentacao.includes(hojeISO)).reduce((acc, c) => acc + Number(c.valor), 0) || 0;
        const fatMes = movs?.reduce((acc, c) => acc + Number(c.valor), 0) || 0;

        // Agendamentos Hoje (Verifica se a string contém o dia de hoje)
        const agsHoje = agsMes?.filter(a => a.data_hora_inicio.includes(hojeISO)) || [];

        // --- ATUALIZAÇÃO DA INTERFACE ---
        const faturamentoCards = document.querySelectorAll('.pai-card:nth-child(1) .valor-central');
        if(faturamentoCards[0]) faturamentoCards[0].innerText = `R$ ${fatHoje.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        if(faturamentoCards[2]) faturamentoCards[2].innerText = `R$ ${fatMes.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

        document.getElementById('ag-ia-hoje').innerText = "0"; 
        document.getElementById('ag-man-hoje').innerText = agsHoje.length;
        document.getElementById('ag-ia-mes').innerText = agsMes?.length || 0;

        // --- PERFORMANCE EQUIPE ---
        let totalComissoesGeral = 0;
        let ranking = {};
        let listaComissoesHTML = '';

        profs?.forEach(p => {
            const faturamentoProf = movs?.filter(m => m.profissional_id === p.id).reduce((acc, c) => acc + Number(c.valor), 0) || 0;
            let comissaoProf = (p.tipo_remuneracao === 'comissao') ? (faturamentoProf * (Number(p.valor_comissao_porcentagem) / 100)) : Number(p.valor_comissao_porcentagem);

            totalComissoesGeral += comissaoProf;
            ranking[p.nome] = faturamentoProf;
            listaComissoesHTML += `<div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid #333;"><span>${p.nome}</span><strong>R$ ${comissaoProf.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong></div>`;
        });

        document.getElementById('top-barbeiro').innerText = Object.keys(ranking).length > 0 ? Object.keys(ranking).reduce((a, b) => ranking[a] > ranking[b] ? a : b) : "---";
        document.getElementById('total-comissao').innerText = `R$ ${totalComissoesGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        document.getElementById('lista-comissoes').innerHTML = listaComissoesHTML || '<span>Sem dados</span>';

    } catch (err) {
        console.error("Erro Dashboard:", err);
    }
}

document.getElementById('btn-salvar-ia').addEventListener('click', async () => {
    const salaoId = selectSalao.value;
    const { error } = await supabaseClient.from('estabelecimentos').update({ ia_saudacao: document.getElementById('ia-saudacao-input').value }).eq('id', salaoId);
    if (error) alert("Erro: " + error.message);
    else alert("Saudação atualizada!");
});

checkUser();
