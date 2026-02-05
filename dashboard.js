// 1. Configuração do Cliente Supabase
let agendamentosCache = []; // Variável para guardar os dados do mês

const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. Elementos da Interface
const loader = document.getElementById('loader');
const btnLogout = document.getElementById('btn-logout');
const selectSalao = document.getElementById('select-salao');

// 3. Função de Inicialização (Proteção de Rota)
async function checkUser() {
    // Mostra o loader enquanto verifica
    if(loader) loader.style.display = 'flex';

    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
        // Se não houver sessão, manda para o login
        window.location.href = 'acesso.html';
        return;
    }

    console.log("Usuário autenticado:", session.user.email);
    
    // Se chegou aqui, está logado. Vamos buscar os salões do dono.
    await carregarSaloes(session.user.id);
    
    // Esconde o loader
    if(loader) loader.style.display = 'none';
}

// 4. Buscar os salões vinculados ao Dono
async function carregarSaloes(donoId) {
    const { data: saloes, error } = await supabase
        .from('estabelecimentos')
        .select('id, nome')
        .eq('dono_id', donoId);

    if (error) {
        console.error("Erro ao carregar salões:", error);
        return;
    }

    if (saloes && saloes.length > 0) {
        // Popula o Dropdown de seleção
        selectSalao.innerHTML = saloes.map(s => 
            `<option value="${s.id}">${s.nome}</option>`
        ).join('');
        
        // Carrega os dados do primeiro salão por padrão
        atualizarDashboard(saloes[0].id);
    } else {
        alert("Nenhum salão encontrado. Cadastre seu primeiro estabelecimento.");
    }
}

// 5. Função de Logout
btnLogout.addEventListener('click', async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signOut();
    if (!error) window.location.href = 'acesso.html';
});

// 6. Listener para troca de salão
selectSalao.addEventListener('change', (e) => {
    atualizarDashboard(e.target.value);
});

// Inicia a verificação ao carregar a página
checkUser();

// Função placeholder para o próximo passo (Dados dos Cards)
async function atualizarDashboard(salaoId) {
    if(loader) loader.style.display = 'flex'; // Opcional: mostrar que está carregando

    try {
        // --- BUSCA DA SAUDAÇÃO DA IA ---
        const { data: estab, error: errEstab } = await supabase
            .from('estabelecimentos')
            .select('ia_saudacao')
            .eq('id', salaoId)
            .single();

        if (!errEstab && estab) {
            const inputIA = document.getElementById('ia-saudacao-input');
            // Só atualiza o campo se o usuário não estiver com o cursor focado nele (evita apagar o que ele digita)
            if (document.activeElement !== inputIA) {
                inputIA.value = estab.ia_saudacao || "";
            }
        }

        // ... resto das suas buscas (faturamento, equipe, etc) ...

    } catch (error) {
        console.error("Erro ao atualizar:", error.message);
    } finally {
        if(loader) loader.style.display = 'none';
    }
}
    
    // 1. Definição de Períodos (Hoje, Início da Semana, Início do Mês)
    const agora = new Date();
    const hoje = agora.toISOString().split('T')[0];
    
    const inicioSemana = new Date(agora);
    inicioSemana.setDate(agora.getDate() - agora.getDay());
    const dataSemana = inicioSemana.toISOString().split('T')[0];
    
    const dataMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`;

    try {
        // 2. BUSCA DE FATURAMENTO E AGENDAMENTOS (Tudo em uma tacada só)
        const { data: agendamentos, error: errAg } = await supabase
            .from('agendamentos')
            .select(`
                id, 
                data, 
                origem, 
                valor,
                status,
                profissionais ( nome )
            `)
            .eq('estabelecimento_id', salaoId)
            .gte('data', dataMes); // Pega tudo do mês para filtrar no JS

        if (errAg) throw errAg;
        
        // ADICIONE ESTA LINHA AQUI ABAIXO:
	agendamentosCache = agendamentos;

        // --- PROCESSAMENTO DE DADOS NO CLIENTE (Mais rápido que várias queries) ---
        
        // Faturamento
        const fatHoje = agendamentos.filter(a => a.data === hoje && a.status === 'concluido')
                                    .reduce((acc, curr) => acc + (curr.valor || 0), 0);
        
        const fatSemana = agendamentos.filter(a => a.data >= dataSemana && a.status === 'concluido')
                                      .reduce((acc, curr) => acc + (curr.valor || 0), 0);
        
        const fatMes = agendamentos.filter(a => a.status === 'concluido')
                                   .reduce((acc, curr) => acc + (curr.valor || 0), 0);

        // Agendamentos (IA vs Manual) - Hoje
        const agIA = agendamentos.filter(a => a.data === hoje && a.origem === 'IA').length;
        const agManual = agendamentos.filter(a => a.data === hoje && a.origem === 'Manual').length;

        // 3. BUSCA DE EQUIPE E COMISSÕES
        const { data: profissionais, error: errProf } = await supabase
            .from('profissionais')
            .select('id, nome, tipo_remuneracao, valor_comissao_porcentagem') // Certifique-se de buscar as colunas novas
            .eq('estabelecimento_id', salaoId);

        if (errProf) throw errProf;

        let totalComissoesGeral = 0;
        let listaComissoesHTML = '';
        let ranking = {};

        profissionais.forEach(p => {
            // Filtra agendamentos concluídos do mês para este profissional específico
            const vendasProf = agendamentos.filter(a => a.profissionais?.nome === p.nome && a.status === 'concluido');
            const totalVendas = vendasProf.reduce((acc, curr) => acc + (curr.valor || 0), 0);
            
            let valorFinalRemuneracao = 0;
            let rotuloRemuneracao = "";

            // LÓGICA CONDICIONAL DE REMUNERAÇÃO (A que você analisou)
            if (p.tipo_remuneracao === 'percentual' || p.tipo_remuneracao === 'Percentual') {
                valorFinalRemuneracao = totalVendas * (p.valor_comissao_porcentagem / 100);
                rotuloRemuneracao = "Comissão";
            } else if (p.tipo_remuneracao === 'fixo' || p.tipo_remuneracao === 'Fixo') {
                valorFinalRemuneracao = p.valor_comissao_porcentagem; // Valor do salário fixo
                rotuloRemuneracao = "Salário Fixo";
            }

            totalComissoesGeral += valorFinalRemuneracao;
            ranking[p.nome] = totalVendas;

            // Monta a lista visual
            listaComissoesHTML += `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #333;">
                    <div style="display: flex; flex-direction: column;">
                        <span>${p.nome}</span>
                        <small style="font-size: 0.65rem; color: var(--text-dim);">${rotuloRemuneracao}</small>
                    </div>
                    <strong>R$ ${valorFinalRemuneracao.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>
                </div>
            `;
        });

        // Identificar Destaque (Quem mais faturou no mês)
        const topNome = Object.keys(ranking).reduce((a, b) => ranking[a] > ranking[b] ? a : b, "---");

        // 4. ATUALIZAÇÃO DA INTERFACE (DOM)
        document.getElementById('fat-hoje').innerText = `R$ ${fatHoje.toLocaleString('pt-BR')}`;
        document.getElementById('fat-semana').innerText = `R$ ${fatSemana.toLocaleString('pt-BR')}`;
        document.getElementById('fat-mes').innerText = `R$ ${fatMes.toLocaleString('pt-BR')}`;
        
        document.getElementById('ag-ia-hoje').innerText = agIA;
        document.getElementById('ag-manual-hoje').innerText = agManual;
        
        document.getElementById('top-barbeiro').innerText = topNome;
        document.getElementById('total-comissao').innerText = `R$ ${totalComissoesGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        document.getElementById('lista-comissoes').innerHTML = listaComissoesHTML || '<span>Sem dados no período</span>';

    } catch (error) {
        console.error("Erro geral ao atualizar Dashboard:", error.message);
    }
}

// Lógica para Salvar a Saudação da IA
document.getElementById('btn-salvar-ia').addEventListener('click', async () => {
    const novaSaudacao = document.getElementById('ia-saudacao-input').value;
    const salaoId = document.getElementById('select-salao').value;

    if (!salaoId) return alert("Selecione um salão primeiro.");

    // Mostra feedback de carregamento no botão
    const btn = document.getElementById('btn-salvar-ia');
    const originalText = btn.innerText;
    btn.innerText = "Salvando...";
    btn.disabled = true;

    const { error } = await supabase
        .from('estabelecimentos')
        .update({ ia_saudacao: novaSaudacao })
        .eq('id', salaoId);

    if (error) {
        alert("Erro ao salvar: " + error.message);
    } else {
        alert("Saudação da IA atualizada com sucesso!");
    }

    btn.innerText = originalText;
    btn.disabled = false;
});

function filtrarPeriodo(periodo, botao) {
    // 1. Visual: Troca o botão ativo
    document.querySelectorAll('.btn-filtro').forEach(b => b.classList.remove('active'));
    botao.classList.add('active');

    const agora = new Date();
    const hoje = agora.toISOString().split('T')[0];
    
    const inicioSemana = new Date(agora);
    inicioSemana.setDate(agora.getDate() - agora.getDay());
    const dataSemana = inicioSemana.toISOString().split('T')[0];

    let filtrados = [];

    // 2. Lógica de Filtro
    if (periodo === 'hoje') {
        filtrados = agendamentosCache.filter(a => a.data === hoje);
    } else if (periodo === 'semana') {
        filtrados = agendamentosCache.filter(a => a.data >= dataSemana);
    } else {
        filtrados = agendamentosCache; // Mês já é o padrão do cache
    }

    // 3. Atualiza apenas os números de faturamento e agendamentos na tela
    const totalFat = filtrados.filter(a => a.status === 'concluido')
                              .reduce((acc, curr) => acc + (curr.valor || 0), 0);
    
    const totalIA = filtrados.filter(a => a.origem === 'IA').length;
    const totalManual = filtrados.filter(a => a.origem === 'Manual').length;

    // Atualiza o card de faturamento principal (Mês Atual no seu HTML original)
    // Dica: Você pode adaptar para atualizar o valor que desejar destacar
    document.getElementById('fat-mes').innerText = `R$ ${totalFat.toLocaleString('pt-BR')}`;
    document.getElementById('ag-ia-hoje').innerText = totalIA;
    document.getElementById('ag-manual-hoje').innerText = totalManual;
}

// Função de Logout (Sair)
document.getElementById('btn-logout').addEventListener('click', async (e) => {
    e.preventDefault();
    
    // 1. Comando oficial do Supabase para encerrar sessão
    const { error } = await supabase.auth.signOut();
    
    if (error) {
        alert("Erro ao sair: " + error.message);
    } else {
        // 2. Redireciona para a página de login
        window.location.href = 'acesso.html';
    }
});
