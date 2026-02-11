const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loader = document.getElementById('loader');
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
    if(loader) loader.style.display = 'flex';

    try {
        // 1. DADOS DO ESTABELECIMENTO (NOME E SAUDAÇÃO)
        const { data: estab } = await supabaseClient.from('estabelecimentos').select('nome_fantasia, ia_saudacao').eq('id', salaoId).single();
        if (estab) {
            document.getElementById('display-nome-fantasia').innerText = estab.nome_fantasia;
            document.getElementById('ia-saudacao-input').value = estab.ia_saudacao || "";
        }

        const agora = new Date();
        const hojeISO = agora.toLocaleDateString('sv-SE');
        const inicioMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`;

        // 2. BUSCA FINANCEIRA (Faturamento vem daqui agora)
        const { data: movs } = await supabaseClient
            .from('movimentacoes_financeiras')
            .select('valor, data_movimentacao')
            .eq('estabelecimento_id', salaoId)
            .gte('data_movimentacao', inicioMes);

        const fatHoje = movs?.filter(m => m.data_movimentacao.startsWith(hojeISO)).reduce((acc, c) => acc + Number(c.valor), 0) || 0;
        const fatMes = movs?.reduce((acc, c) => acc + Number(c.valor), 0) || 0;

        document.getElementById('fat-hoje').innerText = `R$ ${fatHoje.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        document.getElementById('fat-mes').innerText = `R$ ${fatMes.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

        // 3. BUSCA DE AGENDAMENTOS (IA vs Manual)
        const { data: ags } = await supabaseClient
            .from('agendamentos')
            .select('id, data_hora_inicio, status')
            .eq('estabelecimento_id', salaoId)
            .gte('data_hora_inicio', hojeISO + 'T00:00:00');

        // Contagem (IA vs Manual) - Nota: Se sua tabela agendamentos não tem coluna 'origem', 
        // todos serão contados como Manual até que a coluna seja criada. 
        // Se já existir, use: .filter(a => a.origem === 'IA')
        const totalAgsHoje = ags?.length || 0;
        document.getElementById('ag-ia-hoje').innerText = totalAgsHoje; // Placeholder enquanto não há filtro de origem

    } catch (err) {
        console.error("Erro Dashboard:", err);
    } finally {
        if(loader) loader.style.display = 'none';
    }
}

// SALVAR SAUDAÇÃO IA
document.getElementById('btn-salvar-ia').addEventListener('click', async () => {
    const salaoId = selectSalao.value;
    const novaSaudacao = document.getElementById('ia-saudacao-input').value;
    
    const { error } = await supabaseClient.from('estabelecimentos').update({ ia_saudacao: novaSaudacao }).eq('id', salaoId);
    
    if (error) alert("Erro ao salvar: " + error.message);
    else alert("Configuração da MercurIA salva!");
});

checkUser();
