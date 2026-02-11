//atualizado para exibição de agendamentos - 4
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

if (selectSalao) {
    selectSalao.addEventListener('change', (e) => atualizarDashboard(e.target.value));
}

async function atualizarDashboard(salaoId) {
    try {
        const agora = new Date();
        const hojeISO = agora.toLocaleDateString('sv-SE'); 
        
        const ano = agora.getFullYear();
        const mes = agora.getMonth();
        
        const inicioMes = new Date(ano, mes, 1).toISOString().split('T')[0];
        const inicioProxMes = new Date(ano, mes + 1, 1).toISOString().split('T')[0];

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
            .eq('estabelecimento_id', salaoId)
            .gte('data_movimentacao', inicioMes)
            .lt('data_movimentacao', inicioProxMes);

        // 3. BUSCA AGENDAMENTOS (Unificada)
        const { data: agsMes } = await supabaseClient
            .from('agendamentos')
            .select('id, data_hora_inicio') 
            .eq('estabelecimento_id', salaoId)
            .gte('data_hora_inicio', inicioMes)
            .lt('data_hora_inicio', inicioProxMes);

        // 4. BUSCA PROFISSIONAIS
        const { data: profs } = await supabaseClient
            .from('profissionais')
            .select('id, nome, tipo_remuneracao, valor_comissao_porcentagem')
            .eq('estabelecimento_id', salaoId);

        // --- ATUALIZAÇÃO DOS CARDS DE FATURAMENTO ---
        const fatHoje = movs?.filter(m => m.data_movimentacao.includes(hojeISO)).reduce((acc, c) => acc + Number(c.valor), 0) || 0;
        const fatMes = movs?.reduce((acc, c) => acc + Number(c.valor), 0) || 0;

        // Verificando se os IDs existem antes de escrever
        if (document.getElementById('fat-hoje')) document.getElementById('fat-hoje').innerText = `R$ ${fatHoje.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        if (document.getElementById('fat-mes')) document.getElementById('fat-mes').innerText = `R$ ${fatMes.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        // O card de semana pode ser preenchido com o do mês ou lógica específica depois
        if (document.getElementById('fat-semana')) document.getElementById('fat-semana').innerText = `R$ ${fatMes.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

        // --- ATUALIZAÇÃO DOS CARDS DE AGENDAMENTOS ---
        const totalHoje = agsMes?.filter(a => a.data_hora_inicio && a.data_hora_inicio.includes(hojeISO)).length || 0;
        const totalMes = agsMes?.length || 0;

        if (document.getElementById('ag-hoje')) document.getElementById('ag-hoje').innerText = totalHoje;
        if (document.getElementById('ag-mes')) document.getElementById('ag-mes').innerText = totalMes;
        if (document.getElementById('ag-semana')) document.getElementById('ag-semana').innerText = totalMes; 

        // --- PERFORMANCE EQUIPE ---
        let totalComissoesGeral = 0;
        let ranking = {};
        let listaComissoesHTML = '';

        profs?.forEach(p => {
            const faturamentoProf = movs?.filter(m => m.profissional_id === p.id).reduce((acc, c) => acc + Number(c.valor), 0) || 0;
            let comissaoProf = (p.tipo_remuneracao === 'comissao' || p.tipo_remuneracao === 'Percentual' || p.tipo_remuneracao === 'comissão') 
                ? (faturamentoProf * (Number(p.valor_comissao_porcentagem) / 100)) 
                : Number(p.valor_comissao_porcentagem);

            totalComissoesGeral += comissaoProf;
            ranking[p.nome] = faturamentoProf;
            listaComissoesHTML += `<div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid #333;"><span>${p.nome}</span><strong>R$ ${comissaoProf.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong></div>`;
        });

        if (document.getElementById('top-barbeiro')) {
            document.getElementById('top-barbeiro').innerText = Object.keys(ranking).length > 0 ? Object.keys(ranking).reduce((a, b) => ranking[a] > ranking[b] ? a : b) : "---";
        }
        if (document.getElementById('total-comissao')) {
            document.getElementById('total-comissao').innerText = `R$ ${totalComissoesGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        }
        if (document.getElementById('lista-comissoes')) {
            document.getElementById('lista-comissoes').innerHTML = listaComissoesHTML || '<span>Sem dados</span>';
        }

    } catch (err) {
        console.error("Erro Geral Dashboard:", err);
    }
}

const btnSalvarIA = document.getElementById('btn-salvar-ia');
if (btnSalvarIA) {
    btnSalvarIA.addEventListener('click', async () => {
        const salaoId = selectSalao.value;
        const novaSaudacao = document.getElementById('ia-saudacao-input').value;
        const { error } = await supabaseClient.from('estabelecimentos').update({ ia_saudacao: novaSaudacao }).eq('id', salaoId);
        if (error) alert("Erro: " + error.message);
        else alert("Saudação atualizada!");
    });
}

checkUser();
